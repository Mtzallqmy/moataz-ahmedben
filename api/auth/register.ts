import type { VercelRequest, VercelResponse } from '../_lib/vercel'
import { getServerEnv } from '../_lib/env'
import { ApiError, methodNotAllowed, normalizeEmail, optionalString, requireString, sendError, setJsonHeaders } from '../_lib/http'
import { getAdminClient, getPublicAuthClient, publicUser } from '../_lib/supabase'
import { enforceRateLimit } from '../_lib/rate-limit'

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, 'auth_register', 5, 3600)
    const env = getServerEnv()
    if (!env.ALLOW_PUBLIC_SIGNUP) {
      throw new ApiError(403, 'التسجيل العام متوقف. اطلب حسابًا من إدارة الموقع.', 'public_signup_disabled')
    }

    const name = requireString(req.body?.name, 'name', 100)
    const email = normalizeEmail(requireString(req.body?.email, 'email', 254))
    const password = requireString(req.body?.password, 'password', 4096)
    const username = optionalString(req.body?.username, 32)?.toLowerCase()

    if (password.length < 8) throw new ApiError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'weak_password')
    if (username && !usernamePattern.test(username)) {
      throw new ApiError(400, 'اسم المستخدم يجب أن يكون 3–32 حرفًا إنجليزيًا أو رقمًا، ويسمح بالنقطة والشرطة', 'invalid_username')
    }

    const admin = getAdminClient()
    if (username) {
      const { data } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
      if (data) throw new ApiError(409, 'اسم المستخدم مستخدم بالفعل', 'username_taken')
    }

    const authClient = getPublicAuthClient()
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, username } },
    })
    if (error || !data.user) throw new ApiError(400, error?.message || 'تعذر إنشاء الحساب', 'signup_failed')

    const now = new Date().toISOString()
    const { data: profile, error: profileError } = await admin.from('profiles').upsert({
      id: data.user.id,
      username: username || null,
      display_name: name,
      role: 'user',
      is_active: true,
      must_change_password: false,
      is_internal_email: false,
      updated_at: now,
    }).select('*').single()
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined)
      throw new ApiError(500, 'تعذر إنشاء الملف الشخصي وتم التراجع عن إنشاء الحساب', 'profile_create_failed')
    }

    return res.status(201).json({
      session: data.session ? {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
      } : null,
      user: publicUser(data.user, profile),
      requiresEmailConfirmation: !data.session,
    })
  } catch (error) {
    return sendError(res, error)
  }
}
