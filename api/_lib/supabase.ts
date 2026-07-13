import { createClient, type SupabaseClient, type User as AuthUser } from '@supabase/supabase-js'
import type { VercelRequest } from './vercel'
import { ApiError, getBearerToken } from './http'
import { getServerEnv } from './env'

export type AppRole = 'owner' | 'admin' | 'supervisor' | 'user'

export interface ProfileRow {
  id: string
  username: string | null
  display_name: string
  avatar_url: string | null
  role: AppRole
  is_active: boolean
  must_change_password: boolean
  is_internal_email: boolean
  created_by: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

let adminClient: SupabaseClient | undefined

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const env = getServerEnv()
    adminClient = createClient(env.supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  }
  return adminClient
}

export function getPublicAuthClient(): SupabaseClient {
  const env = getServerEnv()
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

export function getUserClient(token: string): SupabaseClient {
  const env = getServerEnv()
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

export async function getProfile(userId: string): Promise<ProfileRow> {
  const admin = getAdminClient()
  const { data, error } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw new ApiError(500, 'تعذر قراءة ملف المستخدم', 'profile_read_failed')
  if (!data) throw new ApiError(403, 'حساب المستخدم غير مهيأ في قاعدة البيانات', 'profile_missing')
  return data as ProfileRow
}

export async function authenticate(req: VercelRequest): Promise<{
  token: string
  user: AuthUser
  profile: ProfileRow
  client: SupabaseClient
}> {
  const token = getBearerToken(req)
  if (!token) throw new ApiError(401, 'يجب تسجيل الدخول أولاً', 'authentication_required')

  const client = getUserClient(token)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new ApiError(401, 'جلسة الدخول غير صالحة أو منتهية', 'invalid_session')

  const profile = await getProfile(data.user.id)
  if (!profile.is_active) throw new ApiError(403, 'تم إيقاف هذا الحساب. تواصل مع إدارة الموقع.', 'account_disabled')

  return { token, user: data.user, profile, client }
}

export async function requireRoles(req: VercelRequest, roles: AppRole[]) {
  const auth = await authenticate(req)
  if (!roles.includes(auth.profile.role)) {
    throw new ApiError(403, 'ليس لديك صلاحية لتنفيذ هذه العملية', 'insufficient_role')
  }
  return auth
}

export function publicUser(user: AuthUser, profile: ProfileRow) {
  return {
    id: user.id,
    name: profile.display_name || user.email?.split('@')[0] || 'مستخدم',
    username: profile.username,
    email: profile.is_internal_email ? '' : (user.email || ''),
    loginEmail: user.email || '',
    avatar: profile.avatar_url || undefined,
    role: profile.role,
    roles: [profile.role],
    isActive: profile.is_active,
    forcePasswordChange: profile.must_change_password,
    createdAt: profile.created_at || user.created_at,
  }
}
