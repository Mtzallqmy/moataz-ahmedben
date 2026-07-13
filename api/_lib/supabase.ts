import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { VercelRequest } from '@vercel/node'
import { getBearerToken } from './http'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function getAdminClient(): SupabaseClient {
  if (!url || !serviceRoleKey) throw new Error('إعدادات Supabase الخلفية غير مكتملة')
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function getUserClient(token: string): SupabaseClient {
  if (!url || !publishableKey) throw new Error('إعدادات Supabase الخلفية غير مكتملة')
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

export async function authenticate(req: VercelRequest): Promise<{ token: string; user: User; client: SupabaseClient }> {
  const token = getBearerToken(req)
  if (!token) throw new Error('يجب تسجيل الدخول أولاً')
  const client = getUserClient(token)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new Error('جلسة الدخول غير صالحة أو منتهية')
  return { token, user: data.user, client }
}

