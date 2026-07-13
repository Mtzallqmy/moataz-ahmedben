import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '../_lib/vercel'
import { getServerEnv } from '../_lib/env'
import { ApiError, methodNotAllowed, normalizeEmail, optionalString, sendError, setJsonHeaders } from '../_lib/http'
import { getAdminClient } from '../_lib/supabase'
import { findAuthUserByEmail } from '../_lib/users'
import { enforceRateLimit } from '../_lib/rate-limit'

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, 'owner_bootstrap', 5, 3600)
    const env = getServerEnv()
    if (!env.BOOTSTRAP_TOKEN) throw new ApiError(404, 'مسار التهيئة غير مفعّل', 'bootstrap_disabled')

    const suppliedToken = String(req.headers['x-bootstrap-token'] || req.body?.token || '')
    if (!safeEqual(suppliedToken, env.BOOTSTRAP_TOKEN)) {
      throw new ApiError(401, 'رمز التهيئة غير صحيح', 'invalid_bootstrap_token')
    }

    const admin = getAdminClient()
    const { count, error: countError } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner').eq('is_active', true)
    if (countError) throw new ApiError(500, 'تعذر التحقق من حالة التهيئة', 'bootstrap_check_failed')
    if ((count || 0) > 0) throw new ApiError(409, 'يوجد مالك نشط بالفعل؛ تم تعطيل التهيئة الأولى', 'already_bootstrapped')

    const email = normalizeEmail(optionalString(req.body?.email, 254) || env.BOOTSTRAP_OWNER_EMAIL)
    const password = optionalString(req.body?.password, 4096) || env.BOOTSTRAP_OWNER_PASSWORD
    if (!password || password.length < 8) {
      throw new ApiError(400, 'اضبط BOOTSTRAP_OWNER_PASSWORD أو أرسل كلمة مرور بطول 8 أحرف على الأقل', 'bootstrap_password_required')
    }

    let authUser = await findAuthUserByEmail(email)
    if (authUser) {
      const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        app_metadata: { ...authUser.app_metadata, app_role: 'owner', managed_by: 'moataz-ai' },
      })
      if (error || !data.user) throw new ApiError(400, error?.message || 'تعذر تحديث حساب المالك', 'owner_update_failed')
      authUser = data.user
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Moataz Alalqami' },
        app_metadata: { app_role: 'owner', managed_by: 'moataz-ai' },
      })
      if (error || !data.user) throw new ApiError(400, error?.message || 'تعذر إنشاء حساب المالك', 'owner_create_failed')
      authUser = data.user
    }

    const requestedUsername = optionalString(req.body?.username, 32)?.toLowerCase() || 'moataz'
    const { data: conflictingUsername, error: usernameError } = await admin
      .from('profiles')
      .select('id')
      .eq('username', requestedUsername)
      .neq('id', authUser.id)
      .maybeSingle()
    if (usernameError) throw new ApiError(500, 'تعذر التحقق من اسم مستخدم المالك', 'owner_username_check_failed')
    const username = conflictingUsername ? `moataz-${authUser.id.slice(0, 8)}` : requestedUsername
    const { error: profileError } = await admin.from('profiles').upsert({
      id: authUser.id,
      username,
      display_name: 'Moataz Alalqami',
      role: 'owner',
      is_active: true,
      must_change_password: true,
      is_internal_email: false,
      updated_at: new Date().toISOString(),
    })
    if (profileError) throw new ApiError(500, 'تم إنشاء حساب المصادقة لكن تعذر تهيئة دور المالك', 'owner_profile_failed')

    await admin.from('audit_logs').insert({
      actor_id: authUser.id,
      target_user_id: authUser.id,
      action: 'OWNER_BOOTSTRAPPED',
      details: { email, username },
    })

    return res.status(201).json({
      success: true,
      email,
      username,
      message: 'تم تهيئة المالك رسميًا. احذف BOOTSTRAP_TOKEN وBOOTSTRAP_OWNER_PASSWORD من بيئة الإنتاج ثم أعد النشر.',
    })
  } catch (error) {
    return sendError(res, error)
  }
}
