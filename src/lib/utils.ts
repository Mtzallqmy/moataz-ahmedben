import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', ...options }).format(new Date(date))
}

export function generateId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export function truncate(str: string, length: number) { return str.length > length ? str.substring(0, length) + '...' : str }

async function parseError(response: Response) {
  const text = await response.text()
  try { const body = JSON.parse(text); const detail = body?.details?.diagnostic || body?.details || body?.diagnostic; return detail?.providerMessage || body.error || body.message || text } catch { return text || `خطأ في الخادم (${response.status})` }
}

type ChatParams = {
  accessToken: string
  providerId: string
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  signal?: AbortSignal
}

export async function sendRealChatRequest(params: ChatParams): Promise<{ content: string; tokens: number }> {
  const response = await fetch('/api/chat', {
    method: 'POST', signal: params.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.accessToken}` },
    body: JSON.stringify({ providerId: params.providerId, model: params.model, messages: params.messages }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return await response.json()
}

export async function sendRealStreamingChat(params: ChatParams, onChunk: (partial: string) => void): Promise<{ content: string; tokens: number }> {
  const response = await fetch('/api/chat', {
    method: 'POST', signal: params.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.accessToken}` },
    body: JSON.stringify({ providerId: params.providerId, model: params.model, messages: params.messages, stream: true }),
  })
  if (!response.ok || !response.body) throw new Error(await parseError(response))
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return { content: fullContent, tokens: Math.ceil(fullContent.length / 4) }
      try {
        const parsed = JSON.parse(data)
        if (parsed.error) throw new Error(parsed.error)
        if (typeof parsed.content === 'string') { fullContent += parsed.content; onChunk(fullContent) }
      } catch (error) {
        if (error instanceof Error && error.message !== 'Unexpected end of JSON input') throw error
      }
    }
  }
  return { content: fullContent, tokens: Math.ceil(fullContent.length / 4) }
}
