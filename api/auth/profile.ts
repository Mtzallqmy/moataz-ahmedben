import type { VercelRequest, VercelResponse } from '../_lib/vercel'
import { authenticate, getAdminClient, publicUser } from '../_lib/supabase'
import { ApiError, methodNotAllowed, optionalString, sendError, setJsonHeaders } from '../_lib/http'
import { enforceRateLimit } from '../_lib/rate-limit'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH'])

  try {
    const { user, profile } = await authenticate(req)
    await enforceRateLimit(req, 'profile_update', 30, 3600, user.id)
    const displayName = optionalString(req.body?.name, 100)
    const avatarUrl = optionalString(req.body?.avatar, 1000)
    if (!displayName && avatarUrl === undefined) throw new ApiError(400, 'لا توجد تغييرات صالحة', 'empty_update')

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (displayName) patch.display_name = displayName
    if (avatarUrl !== undefined) patch.avatar_url = avatarUrl || null

    const admin = getAdminClient()
    const { data, error } = await admin.from('profiles').update(patch).eq('id', user.id).select('*').single()
    if (error) throw new ApiError(500, 'تعذر تحديث الملف الشخصي', 'profile_update_failed')

    return res.status(200).json({ user: publicUser(user, { ...profile, ...data }) })
  } catch (error) {
    return sendError(res, error)
  }
}
