import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { getServerEnv } from './env'
import { ApiError } from './http'

export type ProviderProtocol = 'gemini' | 'anthropic' | 'openai-compatible'
export type ProviderFailureCategory = 'authentication' | 'authorization' | 'rate_limit' | 'quota' | 'model' | 'endpoint' | 'validation' | 'network' | 'timeout' | 'upstream' | 'unknown'

export interface ProviderRecord {
  id: string
  name?: string
  type: string
  base_url: string | null
  model: string | null
  encrypted_key?: unknown
}

export interface ProviderDiagnostic {
  success: boolean
  message: string
  providerMessage?: string
  category?: ProviderFailureCategory
  code?: string
  httpStatus?: number
  endpoint?: string
  requestId?: string
  hint?: string
  detectedProtocol: ProviderProtocol
  models: string[]
  latencyMs: number
  testedModel?: string
  warning?: string
}

interface ProviderErrorShape {
  message: string
  code?: string
  type?: string
  status?: number
  endpoint?: string
  requestId?: string
}

class ProviderRequestError extends Error {
  constructor(public readonly info: ProviderErrorShape) {
    super(info.message)
    this.name = 'ProviderRequestError'
  }
}

const defaultBaseUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  'openai-compatible': 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  together: 'https://api.together.xyz/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  anthropic: 'https://api.anthropic.com/v1',
  custom: '',
}

export function inferProtocol(type: string, baseUrl?: string | null): ProviderProtocol {
  const host = (() => {
    try { return baseUrl ? new URL(baseUrl).hostname.toLowerCase() : '' } catch { return '' }
  })()
  if (type === 'gemini' || host.includes('generativelanguage.googleapis.com')) return 'gemini'
  if (type === 'anthropic' || host.includes('anthropic.com')) return 'anthropic'
  return 'openai-compatible'
}

export function providerBaseUrl(provider: Pick<ProviderRecord, 'type' | 'base_url'>) {
  const value = provider.base_url || defaultBaseUrls[provider.type] || ''
  if (!value) throw new ApiError(400, 'هذا المزود يحتاج Base URL', 'provider_base_url_required')
  return value.replace(/\/+$/, '')
}

export function isPrivateIpAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '')
  if (normalized === '::1' || normalized === '0.0.0.0' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (!isIP(normalized)) return false
  const parts = normalized.split('.').map(Number)
  if (parts.length !== 4) return false
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
}

export async function assertSafeProviderUrl(urlValue: string) {
  let url: URL
  try { url = new URL(urlValue) } catch { throw new ApiError(400, 'Base URL غير صالح', 'invalid_provider_url') }
  const env = getServerEnv()
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiError(400, 'Base URL يجب ألا يحتوي بيانات دخول أو query parameters أو fragment', 'provider_url_components_forbidden')
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new ApiError(400, 'يسمح فقط بروابط HTTP/HTTPS', 'invalid_provider_protocol')
  if (url.protocol !== 'https:' && !env.ALLOW_INSECURE_PROVIDER_URLS) {
    throw new ApiError(400, 'يجب استخدام HTTPS للمزودات. يمكن السماح بـ HTTP محليًا فقط عبر ALLOW_INSECURE_PROVIDER_URLS=true', 'https_required')
  }

  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host === 'metadata.google.internal') {
    throw new ApiError(400, 'عنوان المزود يشير إلى شبكة داخلية وغير مسموح به', 'private_provider_host')
  }
  if (isIP(host) && isPrivateIpAddress(host)) throw new ApiError(400, 'عناوين الشبكات الخاصة غير مسموحة', 'private_provider_host')

  try {
    const addresses = await lookup(host, { all: true, verbatim: true })
    if (addresses.some((item) => isPrivateIpAddress(item.address))) {
      throw new ApiError(400, 'عنوان المزود يتحول إلى شبكة داخلية وغير مسموح به', 'private_provider_host')
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'تعذر حل اسم نطاق المزود عبر DNS', 'provider_dns_failed')
  }
}

export function sanitizeProviderEndpoint(value: string) {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return value.split('?')[0].slice(0, 1000)
  }
}

function redactSecrets(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/AIza[A-Za-z0-9_-]{12,}/g, 'AIza***')
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1***')
    .slice(0, 1200)
}

async function readLimitedText(response: Response, maxBytes = 5_000_000) {
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > maxBytes) {
    throw new ProviderRequestError({
      message: 'استجابة المزود أكبر من الحد الآمن',
      code: 'response_too_large',
      status: response.status,
      endpoint: sanitizeProviderEndpoint(response.url),
    })
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('response too large').catch(() => undefined)
        throw new ProviderRequestError({
          message: 'استجابة المزود تجاوزت الحد الآمن',
          code: 'response_too_large',
          status: response.status,
          endpoint: sanitizeProviderEndpoint(response.url),
        })
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch (error: any) {
    if (error instanceof ProviderRequestError) throw error
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new ProviderRequestError({
        message: 'انتهت مهلة قراءة استجابة المزود',
        code: 'timeout',
        status: response.status,
        endpoint: sanitizeProviderEndpoint(response.url),
      })
    }
    throw error
  }
  return text + decoder.decode()
}

function headerValue(response: Response, names: string[]) {
  for (const name of names) {
    const value = response.headers.get(name)
    if (value) return value
  }
  return undefined
}

function parseProviderErrorBody(payload: unknown, fallbackText: string) {
  const body = payload as any
  const error = body?.error ?? body
  return {
    message: redactSecrets(String(error?.message || body?.message || fallbackText || 'استجابة خطأ بدون رسالة')),
    code: error?.code ? String(error.code) : (body?.status ? String(body.status) : undefined),
    type: error?.type ? String(error.type) : undefined,
  }
}

async function parseResponse(response: Response, endpoint: string) {
  const text = await readLimitedText(response)
  let payload: unknown
  try { payload = text ? JSON.parse(text) : undefined } catch { payload = undefined }

  if (!response.ok) {
    const parsed = parseProviderErrorBody(payload, text.slice(0, 1200))
    throw new ProviderRequestError({
      ...parsed,
      status: response.status,
      endpoint: sanitizeProviderEndpoint(endpoint),
      requestId: headerValue(response, ['x-request-id', 'request-id', 'cf-ray', 'x-amzn-requestid']),
    })
  }

  return payload
}

function requestHeaders(protocol: ProviderProtocol, apiKey: string) {
  const env = getServerEnv()
  if (protocol === 'anthropic') {
    return { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
  if (env.APP_URL) headers['HTTP-Referer'] = env.APP_URL
  headers['X-Title'] = 'Moataz AI'
  return headers
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const timeoutSignal = AbortSignal.timeout(getServerEnv().PROVIDER_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: timeoutSignal, redirect: 'error' })
  } catch (error: any) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new ProviderRequestError({ message: 'انتهت مهلة اتصال المزود', code: 'timeout', endpoint: sanitizeProviderEndpoint(url) })
    }
    throw new ProviderRequestError({ message: redactSecrets(error?.message || 'تعذر الاتصال بالمزود'), code: error?.code || 'network_error', endpoint: sanitizeProviderEndpoint(url) })
  }
}

function modelIds(payload: any): string[] {
  const rows = Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.models) ? payload.models
      : Array.isArray(payload?.items) ? payload.items
        : []
  const ids = rows
    .map((row: any) => String(row?.id || row?.name || row?.model || '').replace(/^models\//, '').trim())
    .filter((value: string) => Boolean(value) && value.length <= 300)
  return Array.from(new Set<string>(ids)).sort().slice(0, 1000)
}

function compatibleModelEndpoints(base: string) {
  const endpoints = [`${base}/models`]
  if (!/\/v\d+(beta)?$/i.test(base)) endpoints.push(`${base}/v1/models`)
  return Array.from(new Set(endpoints))
}

export async function discoverProviderModels(provider: ProviderRecord, apiKey: string) {
  const protocol = inferProtocol(provider.type, provider.base_url)
  const base = providerBaseUrl(provider)
  await assertSafeProviderUrl(base)

  if (protocol === 'gemini') {
    const endpoint = `${base}/models?key=${encodeURIComponent(apiKey)}`
    const response = await fetchWithTimeout(endpoint, { headers: { Accept: 'application/json' } })
    const payload = await parseResponse(response, `${base}/models`)
    return { models: modelIds(payload).filter((id) => (payload as any)?.models?.find?.((row: any) => String(row.name || '').endsWith(id))?.supportedGenerationMethods?.includes('generateContent') !== false), endpoint: `${base}/models`, protocol }
  }

  if (protocol === 'anthropic') {
    const endpoint = `${base}/models`
    const response = await fetchWithTimeout(endpoint, { headers: requestHeaders(protocol, apiKey) })
    const payload = await parseResponse(response, endpoint)
    return { models: modelIds(payload), endpoint, protocol }
  }

  let lastError: unknown
  for (const endpoint of compatibleModelEndpoints(base)) {
    try {
      const response = await fetchWithTimeout(endpoint, { headers: requestHeaders(protocol, apiKey) })
      const payload = await parseResponse(response, endpoint)
      return { models: modelIds(payload), endpoint, protocol }
    } catch (error) {
      lastError = error
      if (!(error instanceof ProviderRequestError) || ![404, 405].includes(error.info.status || 0)) throw error
    }
  }
  throw lastError || new ProviderRequestError({ message: 'لم يتم العثور على بوابة اكتشاف النماذج', code: 'models_endpoint_missing', endpoint: base })
}

function flattenForResponses(messages: ChatMessage[]) {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n')
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export async function generateProviderText(provider: ProviderRecord, apiKey: string, model: string, messages: ChatMessage[]) {
  const protocol = inferProtocol(provider.type, provider.base_url)
  const base = providerBaseUrl(provider)
  await assertSafeProviderUrl(base)

  if (protocol === 'gemini') {
    const system = messages.find((message) => message.role === 'system')?.content
    const contents = messages.filter((message) => message.role !== 'system').map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))
    const publicEndpoint = `${base}/models/${encodeURIComponent(model)}:generateContent`
    const endpoint = `${publicEndpoint}?key=${encodeURIComponent(apiKey)}`
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents }),
    })
    const payload: any = await parseResponse(response, publicEndpoint)
    const content = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('') || ''
    if (!content) throw new ProviderRequestError({ message: 'المزود أعاد استجابة ناجحة دون نص', code: 'empty_response', endpoint: publicEndpoint })
    return { content, tokens: payload?.usageMetadata?.totalTokenCount || 0, protocol, endpoint: publicEndpoint }
  }

  if (protocol === 'anthropic') {
    const endpoint = `${base}/messages`
    const system = messages.find((message) => message.role === 'system')?.content
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST', headers: requestHeaders(protocol, apiKey),
      body: JSON.stringify({ model, max_tokens: 4096, ...(system ? { system } : {}), messages: messages.filter((message) => message.role !== 'system') }),
    })
    const payload: any = await parseResponse(response, endpoint)
    const content = payload?.content?.map((part: any) => part?.text || '').join('') || ''
    if (!content) throw new ProviderRequestError({ message: 'المزود أعاد استجابة ناجحة دون نص', code: 'empty_response', endpoint })
    return { content, tokens: (payload?.usage?.input_tokens || 0) + (payload?.usage?.output_tokens || 0), protocol, endpoint }
  }

  const chatEndpoint = `${base}/chat/completions`
  try {
    const response = await fetchWithTimeout(chatEndpoint, {
      method: 'POST', headers: requestHeaders(protocol, apiKey),
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096, stream: false }),
    })
    const payload: any = await parseResponse(response, chatEndpoint)
    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content) throw new ProviderRequestError({ message: 'المزود أعاد استجابة ناجحة دون choices[0].message.content', code: 'invalid_chat_response', endpoint: chatEndpoint })
    return { content, tokens: payload?.usage?.total_tokens || 0, protocol, endpoint: chatEndpoint }
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || ![404, 405].includes(error.info.status || 0)) throw error
  }

  const responsesEndpoint = `${base}/responses`
  const response = await fetchWithTimeout(responsesEndpoint, {
    method: 'POST', headers: requestHeaders(protocol, apiKey),
    body: JSON.stringify({ model, input: flattenForResponses(messages), max_output_tokens: 4096 }),
  })
  const payload: any = await parseResponse(response, responsesEndpoint)
  const content = payload?.output_text || payload?.output?.flatMap?.((item: any) => item?.content || []).map((item: any) => item?.text || '').join('') || ''
  if (!content) throw new ProviderRequestError({ message: 'بوابة responses أعادت استجابة دون نص', code: 'invalid_responses_response', endpoint: responsesEndpoint })
  return { content, tokens: payload?.usage?.total_tokens || 0, protocol, endpoint: responsesEndpoint }
}

function classify(error: ProviderRequestError): Pick<ProviderDiagnostic, 'category' | 'code' | 'hint'> {
  const status = error.info.status
  const code = (error.info.code || error.info.type || '').toLowerCase()
  const message = error.info.message.toLowerCase()

  if (code.includes('timeout')) return { category: 'timeout', code: error.info.code, hint: 'تحقق من سرعة المزود أو ارفع PROVIDER_TIMEOUT_MS ضمن الحد المسموح.' }
  if (!status) return { category: 'network', code: error.info.code, hint: 'تحقق من Base URL وDNS وشهادة TLS واتصال المزود.' }
  if (status === 401) return { category: 'authentication', code: error.info.code || 'unauthorized', hint: 'المفتاح غير صحيح أو منتهي أو أُرسل إلى بوابة غير مناسبة.' }
  if (status === 403) return { category: 'authorization', code: error.info.code || 'forbidden', hint: 'المفتاح صحيح غالبًا لكنه لا يملك إذن النموذج أو المؤسسة أو البوابة.' }
  if (status === 429 && (code.includes('quota') || message.includes('quota') || message.includes('credit') || message.includes('billing'))) {
    return { category: 'quota', code: error.info.code || 'quota_exceeded', hint: 'راجع الرصيد أو حدود الحساب لدى المزود.' }
  }
  if (status === 429) return { category: 'rate_limit', code: error.info.code || 'rate_limited', hint: 'تم تجاوز حد الطلبات؛ انتظر أو ارفع حدود الحساب.' }
  if (status === 404 && (message.includes('model') || code.includes('model'))) return { category: 'model', code: error.info.code || 'model_not_found', hint: 'اختر نموذجًا موجودًا ومتاحًا لهذا المفتاح.' }
  if ([404, 405].includes(status)) return { category: 'endpoint', code: error.info.code || 'endpoint_not_found', hint: 'تحقق من Base URL؛ غالبًا يجب أن ينتهي بـ /v1 أو أن المزود لا يدعم هذه البوابة.' }
  if ([400, 409, 422].includes(status)) return { category: 'validation', code: error.info.code || 'invalid_request', hint: 'المزود رفض صيغة الطلب أو اسم النموذج. راجع الرسالة الأصلية أدناه.' }
  if (status >= 500) return { category: 'upstream', code: error.info.code || 'provider_error', hint: 'الخطأ صادر من خادم المزود؛ أعد الاختبار لاحقًا أو راجع حالة خدمته.' }
  return { category: 'unknown', code: error.info.code || 'provider_error', hint: 'راجع رسالة المزود والبوابة المستخدمة.' }
}

export function providerDiagnostic(error: unknown, protocol: ProviderProtocol, startedAt: number): ProviderDiagnostic {
  const latencyMs = Date.now() - startedAt
  if (error instanceof ProviderRequestError) {
    const classified = classify(error)
    return {
      success: false,
      message: 'فشل اختبار المزود',
      providerMessage: redactSecrets(error.info.message),
      httpStatus: error.info.status,
      endpoint: error.info.endpoint,
      requestId: error.info.requestId,
      detectedProtocol: protocol,
      models: [],
      latencyMs,
      ...classified,
    }
  }
  return {
    success: false,
    message: error instanceof Error ? error.message : 'فشل غير معروف أثناء اختبار المزود',
    category: 'unknown',
    code: 'unknown_error',
    detectedProtocol: protocol,
    models: [],
    latencyMs,
  }
}

export async function testProviderConnection(provider: ProviderRecord, apiKey: string): Promise<ProviderDiagnostic> {
  const startedAt = Date.now()
  const protocol = inferProtocol(provider.type, provider.base_url)
  try {
    const discovered = await discoverProviderModels(provider, apiKey)
    if (discovered.models.length > 0) {
      return {
        success: true,
        message: `تم الاتصال واكتشاف ${discovered.models.length} نموذجًا فعليًا`,
        detectedProtocol: discovered.protocol,
        models: discovered.models,
        endpoint: discovered.endpoint,
        latencyMs: Date.now() - startedAt,
      }
    }

    if (!provider.model) {
      throw new ProviderRequestError({ message: 'نجح الاتصال لكن المزود لم يُرجع نماذج، ولم يتم تحديد نموذج للاختبار', code: 'empty_model_list', endpoint: discovered.endpoint })
    }

    await generateProviderText(provider, apiKey, provider.model, [{ role: 'user', content: 'Reply with OK only.' }])
    return {
      success: true,
      message: 'نجح طلب توليد فعلي باستخدام النموذج المحدد',
      warning: 'بوابة /models لم تُرجع قائمة؛ تم اعتماد نجاح طلب التوليد الفعلي بدلًا منها.',
      detectedProtocol: protocol,
      models: [provider.model],
      testedModel: provider.model,
      endpoint: discovered.endpoint,
      latencyMs: Date.now() - startedAt,
    }
  } catch (discoveryError) {
    if (provider.model) {
      try {
        const generated = await generateProviderText(provider, apiKey, provider.model, [{ role: 'user', content: 'Reply with OK only.' }])
        return {
          success: true,
          message: 'نجح طلب توليد فعلي باستخدام النموذج المحدد',
          warning: `تعذر اكتشاف النماذج، لكن بوابة التوليد تعمل. سبب الاكتشاف: ${discoveryError instanceof Error ? discoveryError.message : 'غير معروف'}`,
          detectedProtocol: generated.protocol,
          models: [provider.model],
          testedModel: provider.model,
          endpoint: generated.endpoint,
          latencyMs: Date.now() - startedAt,
        }
      } catch (probeError) {
        return providerDiagnostic(probeError, protocol, startedAt)
      }
    }
    return providerDiagnostic(discoveryError, protocol, startedAt)
  }
}

export async function openCompatibleStream(provider: ProviderRecord, apiKey: string, model: string, messages: ChatMessage[]) {
  const protocol = inferProtocol(provider.type, provider.base_url)
  if (protocol !== 'openai-compatible') throw new ApiError(400, 'البث الحالي متاح للمزودات المتوافقة مع OpenAI فقط', 'stream_not_supported')
  const base = providerBaseUrl(provider)
  await assertSafeProviderUrl(base)
  const endpoint = `${base}/chat/completions`
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST', headers: requestHeaders(protocol, apiKey),
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096, stream: true }),
  })
  if (!response.ok) await parseResponse(response, endpoint)
  return { response, endpoint }
}
