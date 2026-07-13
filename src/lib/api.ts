import { supabase } from './supabase'

export async function authHeaders(json = true) {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('انتهت جلسة الدخول')
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${data.session.access_token}`,
  }
}

export async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init)
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const message = body?.error || body?.message || `HTTP ${response.status}`
    const error = new Error(message) as Error & { code?: string; details?: unknown; status?: number }
    error.code = body?.code
    error.details = body?.details || body?.diagnostic
    error.status = response.status
    throw error
  }
  return body as T
}
