import type { VercelRequest, VercelResponse } from '../_lib/vercel'
import { ApiError, methodNotAllowed, normalizeEmail, requireString, sendError, setJsonHeaders } from '../_lib/http'
import { getAdminClient, getProfile, getPublicAuthClient, publicUser } from '../_lib/supabase'
import { enforceRateLimit } from '../_lib/rate-limit'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const identifier = requireString(req.body?.identifier, 'identifier', 254).toLowerCase()
    const password = requireString(req.body?.password, 'password', 4096)
    await enforceRateLimit(req, 'auth_login', 10, 900, identifier)
    const admin = getAdminClient()

    let email = identifier
    let profileId: string | undefined

    if (!emailPattern.test(identifier)) {
      const { data: profile, error } = await admin
        .from('profiles')
        .select('id,is_active')
        .eq('username', identifier)
        .maybeSingle()

      if (error) throw new ApiError(500, 'تعذر التحقق من اسم المستخدم', 'username_lookup_failed')
      if (!profile) throw new ApiError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة', 'invalid_credentials')

      const { data, error: userError } = await admin.auth.admin.getUserById(profile.id)
      if (userError || !data.user?.email) throw new ApiError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة', 'invalid_credentials')
      email = normalizeEmail(data.user.email)
      profileId = profile.id
    } else {
      email = normalizeEmail(identifier)
    }

    const authClient = getPublicAuthClient()
    const { data, error } = await authClient.auth.signInWithPassword({ email, password })
    if (error || !data.session || !data.user) {
      throw new ApiError(401, 'اسم المستخدم/البريد أو كلمة المرور غير صحيحة', 'invalid_credentials')
    }

    const profile = await getProfile(profileId || data.user.id)
    if (!profile.is_active) {
      throw new ApiError(403, 'تم إيقاف هذا الحساب. تواصل مع إدارة الموقع.', 'account_disabled')
    }

    await admin.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.user.id)

    return res.status(200).json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
      },
      user: publicUser(data.user, { ...profile, last_login_at: new Date().toISOString() }),
    })
  } catch (error) {
    return sendError(res, error)
  }
}
