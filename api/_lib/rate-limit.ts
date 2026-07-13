import { createHash } from 'node:crypto'
import type { VercelRequest } from './vercel'
import { ApiError } from './http'
import { getAdminClient } from './supabase'

function clientIp(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return value?.split(',')[0]?.trim() || String(req.headers['x-real-ip'] || 'unknown')
}

export async function enforceRateLimit(
  req: VercelRequest,
  action: string,
  limit: number,
  windowSeconds: number,
  subject?: string,
) {
  const source = `${action}:${clientIp(req)}:${subject || 'anonymous'}`
  const keyHash = createHash('sha256').update(source).digest('hex')
  const { data, error } = await getAdminClient().rpc('consume_api_rate_limit', {
    p_key_hash: keyHash,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  }).single()

  if (error || !data) {
    console.error('[rate-limit-failed]', { action, error })
    throw new ApiError(503, 'خدمة الحماية من كثرة الطلبات غير جاهزة', 'rate_limit_unavailable')
  }

  const result = data as { allowed: boolean; remaining: number; reset_at: string }
  if (!result.allowed) {
    throw new ApiError(429, 'طلبات كثيرة جدًا. حاول مجددًا لاحقًا.', 'rate_limited', {
      resetAt: result.reset_at,
      remaining: result.remaining,
    })
  }
  return result
}
