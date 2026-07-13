import type { VercelRequest, VercelResponse } from '../_lib/vercel'
import { authenticate, getAdminClient } from '../_lib/supabase'
import { encryptSecret } from '../_lib/crypto'
import { ApiError, methodNotAllowed, optionalString, requireString, sendError, setJsonHeaders } from '../_lib/http'
import { assertSafeProviderUrl } from '../_lib/provider-runtime'
import { enforceRateLimit } from '../_lib/rate-limit'

const allowedTypes = new Set(['gemini', 'openai', 'openai-compatible', 'openrouter', 'anthropic', 'nvidia', 'groq', 'deepseek', 'mistral', 'together', 'custom'])

function publicProvider(provider: any) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.base_url || undefined,
    model: provider.model || undefined,
    isEnabled: provider.is_enabled !== false,
    lastTested: provider.last_tested_at || undefined,
    status: provider.status || 'untested',
    errorMessage: provider.error_message || undefined,
    models: Array.isArray(provider.models) ? provider.models : [],
    detectedProtocol: provider.detected_protocol || undefined,
    diagnostic: provider.diagnostic || undefined,
    lastLatencyMs: provider.last_latency_ms ?? undefined,
    lastHttpStatus: provider.last_http_status ?? undefined,
    createdAt: provider.created_at,
    updatedAt: provider.updated_at,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method || '')) {
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])
  }

  try {
    const { user } = await authenticate(req)
    await enforceRateLimit(req, req.method === 'GET' ? 'providers_read' : 'providers_write', req.method === 'GET' ? 120 : 40, req.method === 'GET' ? 60 : 300, user.id)
    const admin = getAdminClient()

    if (req.method === 'GET') {
      const { data, error } = await admin.from('providers').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (error) throw new ApiError(500, 'تعذر تحميل المزودات', 'providers_read_failed')
      return res.status(200).json({ providers: (data || []).map(publicProvider) })
    }

    const providerId = optionalString(req.body?.id, 100)
    if (req.method === 'DELETE') {
      if (!providerId) throw new ApiError(400, 'id مطلوب', 'provider_id_required')
      const { error } = await admin.from('providers').delete().eq('id', providerId).eq('user_id', user.id)
      if (error) throw new ApiError(500, 'تعذر حذف المزود', 'provider_delete_failed')
      return res.status(204).end()
    }

    if (req.method === 'PATCH') {
      if (!providerId) throw new ApiError(400, 'id مطلوب', 'provider_id_required')
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (typeof req.body?.model === 'string') update.model = req.body.model.trim().slice(0, 200) || null
      if (typeof req.body?.isEnabled === 'boolean') update.is_enabled = req.body.isEnabled
      if (typeof req.body?.name === 'string' && req.body.name.trim()) update.name = req.body.name.trim().slice(0, 80)
      const baseUrl = optionalString(req.body?.baseUrl, 1000)
      if (baseUrl) {
        await assertSafeProviderUrl(baseUrl)
        update.base_url = baseUrl.replace(/\/+$/, '')
      }
      const { data, error } = await admin.from('providers').update(update).eq('id', providerId).eq('user_id', user.id).select('*').single()
      if (error) throw new ApiError(500, 'تعذر تحديث المزود', 'provider_update_failed')
      return res.status(200).json({ provider: publicProvider(data) })
    }

    const name = requireString(req.body?.name, 'name', 80)
    const type = requireString(req.body?.type, 'type', 40)
    const apiKey = requireString(req.body?.apiKey, 'apiKey', 4096)
    if (!allowedTypes.has(type)) throw new ApiError(400, 'نوع المزود غير مدعوم', 'unsupported_provider_type')

    const baseUrl = optionalString(req.body?.baseUrl, 1000)?.replace(/\/+$/, '')
    if (['custom', 'openai-compatible'].includes(type) && !baseUrl) {
      throw new ApiError(400, 'Base URL مطلوب لهذا النوع من المزودات', 'provider_base_url_required')
    }
    if (baseUrl) await assertSafeProviderUrl(baseUrl)

    const encrypted = encryptSecret(apiKey)
    const now = new Date().toISOString()
    const { data, error } = await admin.from('providers').insert({
      user_id: user.id,
      name,
      type,
      base_url: baseUrl || null,
      model: optionalString(req.body?.model, 200) || null,
      encrypted_key: encrypted,
      is_enabled: true,
      status: 'untested',
      models: [],
      diagnostic: null,
      created_at: now,
      updated_at: now,
    }).select('*').single()
    if (error) throw new ApiError(500, 'تعذر حفظ المزود', 'provider_create_failed')
    return res.status(201).json({ provider: publicProvider(data) })
  } catch (error) {
    return sendError(res, error)
  }
}
