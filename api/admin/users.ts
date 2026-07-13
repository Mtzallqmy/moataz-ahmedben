import type { VercelRequest, VercelResponse } from '../_lib/vercel'
import { getServerEnv } from '../_lib/env'
import { ApiError, methodNotAllowed, normalizeEmail, optionalString, requireString, sendError, setJsonHeaders } from '../_lib/http'
import { getAdminClient, getProfile, requireRoles, type AppRole, type ProfileRow } from '../_lib/supabase'
import { ALL_ROLES, adminUserView, generateTemporaryPassword, listAllAuthUsers, normalizeUsername, validateUsername } from '../_lib/users'
import { enforceRateLimit } from '../_lib/rate-limit'

async function countActiveOwners() {
  const { count, error } = await getAdminClient()
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'owner')
    .eq('is_active', true)
  if (error) throw new ApiError(500, 'تعذر التحقق من عدد المالكين', 'owner_count_failed')
  return count || 0
}

function ensureAssignableRole(actorRole: AppRole, requestedRole: AppRole) {
  if (!ALL_ROLES.includes(requestedRole)) throw new ApiError(400, 'الدور المطلوب غير صالح', 'invalid_role')
  if (requestedRole === 'owner' && actorRole !== 'owner') {
    throw new ApiError(403, 'المالك فقط يستطيع منح دور المالك', 'owner_role_required')
  }
  if (requestedRole === 'admin' && actorRole !== 'owner') {
    throw new ApiError(403, 'المالك فقط يستطيع منح دور المدير', 'owner_role_required')
  }
}

async function audit(actorId: string, targetUserId: string | null, action: string, details: Record<string, unknown>) {
  const { error } = await getAdminClient().from('audit_logs').insert({
    actor_id: actorId,
    target_user_id: targetUserId,
    action,
    details,
  })
  if (error) console.error('[audit-log-failed]', error)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method || '')) {
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])
  }

  try {
    const actor = await requireRoles(req, ['owner', 'admin'])
    await enforceRateLimit(req, req.method === 'GET' ? 'admin_users_read' : 'admin_users_write', req.method === 'GET' ? 120 : 60, req.method === 'GET' ? 60 : 300, actor.user.id)
    const admin = getAdminClient()

    if (req.method === 'GET') {
      const [{ data: profiles, error }, authUsers] = await Promise.all([
        admin.from('profiles').select('*').order('created_at', { ascending: false }),
        listAllAuthUsers(),
      ])
      if (error) throw new ApiError(500, 'تعذر تحميل المستخدمين', 'users_read_failed')
      const authById = new Map(authUsers.map((user) => [user.id, user]))
      return res.status(200).json({ users: ((profiles || []) as ProfileRow[]).map((profile) => adminUserView(profile, authById.get(profile.id))) })
    }

    if (req.method === 'POST') {
      const env = getServerEnv()
      const name = requireString(req.body?.name, 'name', 100)
      const username = normalizeUsername(requireString(req.body?.username, 'username', 32))
      validateUsername(username)
      const requestedRole = (optionalString(req.body?.role, 20) || 'user') as AppRole
      ensureAssignableRole(actor.profile.role, requestedRole)

      const providedEmail = optionalString(req.body?.email, 254)
      const isInternalEmail = !providedEmail
      const email = providedEmail
        ? normalizeEmail(providedEmail)
        : `${username}@${env.USERNAME_EMAIL_DOMAIN}`.toLowerCase()

      const suppliedPassword = optionalString(req.body?.password, 4096)
      const password = suppliedPassword || generateTemporaryPassword()
      if (password.length < 8) throw new ApiError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'weak_password')

      const { data: usernameRow } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
      if (usernameRow) throw new ApiError(409, 'اسم المستخدم مستخدم بالفعل', 'username_taken')

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
        app_metadata: { app_role: requestedRole, managed_by: 'moataz-ai' },
      })
      if (error || !data.user) {
        const message = error?.message || 'تعذر إنشاء مستخدم المصادقة'
        throw new ApiError(400, message, message.toLowerCase().includes('already') ? 'email_taken' : 'auth_user_create_failed')
      }

      const now = new Date().toISOString()
      const { data: profile, error: profileError } = await admin.from('profiles').upsert({
        id: data.user.id,
        username,
        display_name: name,
        role: requestedRole,
        is_active: true,
        must_change_password: true,
        is_internal_email: isInternalEmail,
        created_by: actor.user.id,
        updated_at: now,
      }).select('*').single()

      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id)
        throw new ApiError(500, 'تعذر إنشاء ملف المستخدم وتم التراجع عن إنشاء الحساب', 'profile_create_failed')
      }

      await audit(actor.user.id, data.user.id, 'USER_CREATED', { username, role: requestedRole, isInternalEmail })
      return res.status(201).json({
        user: adminUserView(profile, data.user),
        credentials: { username, email: isInternalEmail ? null : email, temporaryPassword: password },
      })
    }

    const targetId = requireString(req.body?.id, 'id', 100)
    const targetProfile = await getProfile(targetId)
    if (actor.profile.role === 'admin' && ['owner', 'admin'].includes(targetProfile.role)) {
      throw new ApiError(403, 'المدير لا يستطيع تعديل مالك أو مدير آخر', 'role_hierarchy_violation')
    }

    if (req.method === 'DELETE') {
      if (actor.profile.role !== 'owner') throw new ApiError(403, 'المالك فقط يستطيع حذف المستخدمين', 'owner_role_required')
      if (targetId === actor.user.id) throw new ApiError(400, 'لا يمكنك حذف حسابك الحالي', 'cannot_delete_self')
      if (targetProfile.role === 'owner' && await countActiveOwners() <= 1) {
        throw new ApiError(409, 'لا يمكن حذف آخر مالك نشط', 'last_owner_protected')
      }

      await audit(actor.user.id, targetId, 'USER_DELETE_REQUESTED', { username: targetProfile.username, role: targetProfile.role })
      const { error } = await admin.auth.admin.deleteUser(targetId)
      if (error) throw new ApiError(400, error.message, 'user_delete_failed')
      return res.status(204).end()
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const requestedRole = optionalString(req.body?.role, 20) as AppRole | undefined
    const usernameInput = optionalString(req.body?.username, 32)
    const displayName = optionalString(req.body?.name, 100)
    const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined

    if (requestedRole) {
      ensureAssignableRole(actor.profile.role, requestedRole)
      if (targetProfile.role === 'owner' && requestedRole !== 'owner' && await countActiveOwners() <= 1) {
        throw new ApiError(409, 'لا يمكن تخفيض صلاحيات آخر مالك نشط', 'last_owner_protected')
      }
      patch.role = requestedRole
    }

    if (isActive !== undefined) {
      if (!isActive && targetId === actor.user.id) throw new ApiError(400, 'لا يمكنك إيقاف حسابك الحالي', 'cannot_disable_self')
      if (!isActive && targetProfile.role === 'owner' && await countActiveOwners() <= 1) {
        throw new ApiError(409, 'لا يمكن إيقاف آخر مالك نشط', 'last_owner_protected')
      }
      patch.is_active = isActive
    }

    if (usernameInput) {
      const username = normalizeUsername(usernameInput)
      validateUsername(username)
      const { data: duplicate } = await admin.from('profiles').select('id').eq('username', username).neq('id', targetId).maybeSingle()
      if (duplicate) throw new ApiError(409, 'اسم المستخدم مستخدم بالفعل', 'username_taken')
      patch.username = username
    }
    if (displayName) patch.display_name = displayName

    let temporaryPassword: string | undefined
    if (req.body?.resetPassword === true || typeof req.body?.password === 'string') {
      const nextPassword = typeof req.body?.password === 'string' && req.body.password.trim()
        ? req.body.password
        : generateTemporaryPassword()
      temporaryPassword = nextPassword
      if (nextPassword.length < 8) throw new ApiError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'weak_password')
      const { error } = await admin.auth.admin.updateUserById(targetId, { password: nextPassword })
      if (error) throw new ApiError(400, error.message, 'password_reset_failed')
      patch.must_change_password = true
    }

    const { data: updated, error } = await admin.from('profiles').update(patch).eq('id', targetId).select('*').single()
    if (error) throw new ApiError(500, 'تعذر تحديث المستخدم', 'user_update_failed')

    const { data: authData, error: authReadError } = await admin.auth.admin.getUserById(targetId)
    if (authReadError || !authData.user) throw new ApiError(404, 'مستخدم المصادقة غير موجود', 'auth_user_missing')
    if (requestedRole) {
      const { error: metadataError } = await admin.auth.admin.updateUserById(targetId, {
        app_metadata: { ...authData.user.app_metadata, app_role: requestedRole, managed_by: 'moataz-ai' },
      })
      if (metadataError) console.error('[auth-metadata-update-failed]', metadataError)
    }

    await audit(actor.user.id, targetId, 'USER_UPDATED', {
      fields: Object.keys(patch).filter((key) => key !== 'updated_at'),
      role: requestedRole,
      isActive,
      passwordReset: Boolean(temporaryPassword),
    })

    return res.status(200).json({
      user: adminUserView(updated, authData.user || undefined),
      credentials: temporaryPassword ? { temporaryPassword } : undefined,
    })
  } catch (error) {
    return sendError(res, error)
  }
}
