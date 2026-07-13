import type { VercelRequest, VercelResponse } from '../_lib/vercel'
import { authenticate, getAdminClient } from '../_lib/supabase'
import { ApiError, methodNotAllowed, requireString, sendError, setJsonHeaders } from '../_lib/http'
import { enforceRateLimit } from '../_lib/rate-limit'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const { user } = await authenticate(req)
    await enforceRateLimit(req, 'password_change', 10, 3600, user.id)
    const password = requireString(req.body?.password, 'password', 4096)
    if (password.length < 8) throw new ApiError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'weak_password')

    const admin = getAdminClient()
    const { error } = await admin.auth.admin.updateUserById(user.id, { password })
    if (error) throw new ApiError(400, error.message, 'password_update_failed')

    await admin.from('profiles').update({ must_change_password: false, updated_at: new Date().toISOString() }).eq('id', user.id)
    await admin.from('audit_logs').insert({ actor_id: user.id, target_user_id: user.id, action: 'PASSWORD_CHANGED', details: {} })

    return res.status(200).json({ success: true })
  } catch (error) {
    return sendError(res, error)
  }
}
