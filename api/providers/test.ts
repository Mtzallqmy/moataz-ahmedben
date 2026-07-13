import type { VercelRequest, VercelResponse } from '../_lib/vercel'
import { authenticate, getAdminClient } from '../_lib/supabase'
import { decryptSecret } from '../_lib/crypto'
import { ApiError, methodNotAllowed, sendError, setJsonHeaders } from '../_lib/http'
import { testProviderConnection, type ProviderRecord } from '../_lib/provider-runtime'
import { enforceRateLimit } from '../_lib/rate-limit'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const { user } = await authenticate(req)
    await enforceRateLimit(req, 'provider_test', 30, 300, user.id)
    const providerId = typeof req.body?.providerId === 'string' ? req.body.providerId : ''
    if (!providerId) throw new ApiError(400, 'providerId مطلوب', 'provider_id_required')

    const admin = getAdminClient()
    const { data: provider, error } = await admin
      .from('providers')
      .select('id,name,type,base_url,model,encrypted_key')
      .eq('id', providerId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw new ApiError(500, 'تعذر قراءة المزود', 'provider_read_failed')
    if (!provider) throw new ApiError(404, 'المزود غير موجود', 'provider_not_found')

    const apiKey = decryptSecret(provider.encrypted_key)
    const diagnostic = await testProviderConnection(provider as ProviderRecord, apiKey)
    const now = new Date().toISOString()

    const { error: updateError } = await admin.from('providers').update({
      status: diagnostic.success ? 'connected' : 'error',
      last_tested_at: now,
      error_message: diagnostic.success ? null : diagnostic.providerMessage || diagnostic.message,
      models: diagnostic.models,
      detected_protocol: diagnostic.detectedProtocol,
      diagnostic,
      last_latency_ms: diagnostic.latencyMs,
      last_http_status: diagnostic.httpStatus || null,
      updated_at: now,
    }).eq('id', provider.id).eq('user_id', user.id)
    if (updateError) console.error('[provider-diagnostic-save-failed]', updateError)

    return res.status(diagnostic.success ? 200 : 422).json({
      success: diagnostic.success,
      message: diagnostic.message,
      models: diagnostic.models,
      testedAt: now,
      diagnostic,
    })
  } catch (error) {
    return sendError(res, error)
  }
}
