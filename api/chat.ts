import type { VercelRequest, VercelResponse } from './_lib/vercel'
import { authenticate, getAdminClient } from './_lib/supabase'
import { decryptSecret } from './_lib/crypto'
import { ApiError, methodNotAllowed, sendError, setJsonHeaders } from './_lib/http'
import { generateProviderText, inferProtocol, openCompatibleStream, providerDiagnostic, type ChatMessage, type ProviderRecord } from './_lib/provider-runtime'
import { enforceRateLimit } from './_lib/rate-limit'

function cleanMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new ApiError(400, 'الرسائل غير صالحة', 'invalid_messages')
  }
  let totalCharacters = 0
  const messages = value.map((item: any) => {
    if (!['system', 'user', 'assistant'].includes(item?.role) || typeof item?.content !== 'string') {
      throw new ApiError(400, 'صيغة الرسائل غير صالحة', 'invalid_message_shape')
    }
    const content = item.content.trim()
    if (!content) throw new ApiError(400, 'لا يمكن إرسال رسالة فارغة', 'empty_message')
    if (content.length > 100_000) throw new ApiError(413, 'إحدى الرسائل أكبر من الحد المسموح', 'message_too_large')
    totalCharacters += content.length
    return { role: item.role, content }
  })
  if (totalCharacters > 500_000) throw new ApiError(413, 'سياق المحادثة أكبر من الحد المسموح', 'context_too_large')
  return messages
}

async function streamOpenAi(res: VercelResponse, response: Response) {
  if (!response.body) throw new ApiError(502, 'المزود لم يُرجع stream', 'missing_stream')
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let transferred = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      transferred += value.byteLength
      if (transferred > 5_000_000) throw new Error('تجاوز البث الحد الآمن')
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return }
        try {
          const json = JSON.parse(data)
          const content = json.choices?.[0]?.delta?.content
          if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`)
        } catch {
          // Ignore non-text provider events.
        }
      }
    }
    res.write('data: [DONE]\n\n')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'انقطع بث المزود'
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
  } finally {
    if (!res.writableEnded) res.end()
  }
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const { user } = await authenticate(req)
    await enforceRateLimit(req, 'chat_generation', 60, 60, user.id)
    const providerId = typeof req.body?.providerId === 'string' ? req.body.providerId.trim().slice(0, 100) : ''
    const model = typeof req.body?.model === 'string' ? req.body.model.trim().slice(0, 300) : ''
    const messages = cleanMessages(req.body?.messages)
    if (!providerId || !model) throw new ApiError(400, 'providerId وmodel مطلوبان', 'provider_and_model_required')

    const admin = getAdminClient()
    const { data: provider, error } = await admin
      .from('providers')
      .select('id,name,type,base_url,model,encrypted_key')
      .eq('id', providerId)
      .eq('user_id', user.id)
      .eq('is_enabled', true)
      .maybeSingle()
    if (error) throw new ApiError(500, 'تعذر قراءة المزود', 'provider_read_failed')
    if (!provider) throw new ApiError(404, 'المزود غير موجود أو غير مفعّل', 'provider_not_found')

    const apiKey = decryptSecret(provider.encrypted_key)
    const record = provider as ProviderRecord
    const stream = req.body?.stream === true

    if (stream) {
      const startedAt = Date.now()
      try {
        const { response } = await openCompatibleStream(record, apiKey, model, messages)
        return await streamOpenAi(res, response)
      } catch (providerError) {
        const diagnostic = providerDiagnostic(providerError, 'openai-compatible', startedAt)
        await admin.from('providers').update({
          status: 'error',
          error_message: diagnostic.providerMessage || diagnostic.message,
          diagnostic,
          last_latency_ms: diagnostic.latencyMs,
          last_http_status: diagnostic.httpStatus || null,
          updated_at: new Date().toISOString(),
        }).eq('id', provider.id).eq('user_id', user.id)
        throw new ApiError(502, diagnostic.providerMessage || diagnostic.message, diagnostic.code || 'provider_request_failed', { diagnostic })
      }
    }

    const startedAt = Date.now()
    try {
      const result = await generateProviderText(record, apiKey, model, messages)
      return res.status(200).json({
        content: result.content,
        tokens: result.tokens,
        model,
        provider: provider.type,
        protocol: result.protocol,
        endpoint: result.endpoint,
        latencyMs: Date.now() - startedAt,
      })
    } catch (providerError) {
      const diagnostic = providerDiagnostic(providerError, inferProtocol(record.type, record.base_url), startedAt)
      await admin.from('providers').update({
        status: 'error',
        error_message: diagnostic.providerMessage || diagnostic.message,
        diagnostic,
        last_latency_ms: diagnostic.latencyMs,
        last_http_status: diagnostic.httpStatus || null,
        updated_at: new Date().toISOString(),
      }).eq('id', provider.id).eq('user_id', user.id)
      throw new ApiError(502, diagnostic.providerMessage || diagnostic.message, diagnostic.code || 'provider_request_failed', { diagnostic })
    }
  } catch (error) {
    return sendError(res, error)
  }
}
