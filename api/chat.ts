import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, getAdminClient } from './_lib/supabase'
import { decryptSecret } from './_lib/crypto'
import { errorMessage, methodNotAllowed, setJsonHeaders } from './_lib/http'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const defaults: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  'openai-compatible': 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  together: 'https://api.together.xyz/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
}

function baseUrl(type: string, custom?: string) {
  return (custom || defaults[type] || '').replace(/\/$/, '')
}

async function responseError(response: Response) {
  const text = await response.text()
  try {
    const body = JSON.parse(text)
    return body?.error?.message || body?.message || text.slice(0, 800)
  } catch {
    return text.slice(0, 800) || `HTTP ${response.status}`
  }
}

function cleanMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new Error('الرسائل غير صالحة')
  return value.map((item: any) => {
    if (!['system', 'user', 'assistant'].includes(item?.role) || typeof item?.content !== 'string') throw new Error('صيغة الرسائل غير صالحة')
    return { role: item.role, content: item.content.slice(0, 100_000) }
  })
}

async function geminiRequest(apiKey: string, model: string, messages: ChatMessage[]) {
  const system = messages.find(message => message.role === 'system')?.content
  const contents = messages.filter(message => message.role !== 'system').map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }))
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  const data = await response.json() as any
  return { content: data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '', tokens: data.usageMetadata?.totalTokenCount || 0 }
}

async function anthropicRequest(apiKey: string, model: string, messages: ChatMessage[]) {
  const system = messages.find(message => message.role === 'system')?.content
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 4096, ...(system ? { system } : {}), messages: messages.filter(message => message.role !== 'system') }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  const data = await response.json() as any
  return { content: data.content?.map((part: any) => part.text || '').join('') || '', tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) }
}

async function openAiRequest(apiKey: string, type: string, customBase: string | null, model: string, messages: ChatMessage[]) {
  const response = await fetch(`${baseUrl(type, customBase || undefined)}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096, stream: false }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  const data = await response.json() as any
  return { content: data.choices?.[0]?.message?.content || '', tokens: data.usage?.total_tokens || 0 }
}

async function streamOpenAi(res: VercelResponse, response: Response) {
  if (!response.body) throw new Error('المزود لم يُرجع stream')
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
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
      } catch { /* incomplete provider event */ }
    }
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const { user } = await authenticate(req)
    const providerId = typeof req.body?.providerId === 'string' ? req.body.providerId : ''
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : ''
    const messages = cleanMessages(req.body?.messages)
    if (!providerId || !model) return res.status(400).json({ error: 'providerId وmodel مطلوبان' })

    const admin = getAdminClient()
    const { data: provider, error } = await admin.from('providers').select('id,type,base_url,encrypted_key').eq('id', providerId).eq('user_id', user.id).eq('is_enabled', true).maybeSingle()
    if (error) throw error
    if (!provider) return res.status(404).json({ error: 'المزود غير موجود أو غير مفعّل' })
    const apiKey = decryptSecret(provider.encrypted_key)
    const stream = req.body?.stream === true

    if (stream && provider.type !== 'gemini' && provider.type !== 'anthropic') {
      const upstream = await fetch(`${baseUrl(provider.type, provider.base_url)}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096, stream: true }),
      })
      if (!upstream.ok) throw new Error(await responseError(upstream))
      return await streamOpenAi(res, upstream)
    }

    const result = provider.type === 'gemini'
      ? await geminiRequest(apiKey, model, messages)
      : provider.type === 'anthropic'
        ? await anthropicRequest(apiKey, model, messages)
        : await openAiRequest(apiKey, provider.type, provider.base_url, model, messages)
    return res.status(200).json({ ...result, model, provider: provider.type })
  } catch (error) {
    const message = errorMessage(error)
    return res.status(message.includes('جلسة') ? 401 : 400).json({ error: message })
  }
}
