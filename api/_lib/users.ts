import { randomBytes } from 'node:crypto'
import type { User as AuthUser } from '@supabase/supabase-js'
import { ApiError } from './http'
import { getAdminClient, type AppRole, type ProfileRow } from './supabase'

export const ALL_ROLES: AppRole[] = ['owner', 'admin', 'supervisor', 'user']

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

export function validateUsername(username: string) {
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(username)) {
    throw new ApiError(400, 'اسم المستخدم يجب أن يكون 3–32 حرفًا إنجليزيًا أو رقمًا، ويسمح بالنقطة والشرطة', 'invalid_username')
  }
}

export function generateTemporaryPassword(length = 18) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%_-'
  const bytes = randomBytes(length)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export async function listAllAuthUsers(maxUsers = 5000): Promise<AuthUser[]> {
  const admin = getAdminClient()
  const users: AuthUser[] = []
  let page = 1
  const perPage = 1000

  while (users.length < maxUsers) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new ApiError(500, 'تعذر تحميل مستخدمي المصادقة', 'auth_users_read_failed')
    users.push(...data.users)
    if (data.users.length < perPage) break
    page += 1
  }

  return users.slice(0, maxUsers)
}

export async function findAuthUserByEmail(email: string): Promise<AuthUser | undefined> {
  const normalized = email.trim().toLowerCase()
  const users = await listAllAuthUsers()
  return users.find((user) => user.email?.toLowerCase() === normalized)
}

export function adminUserView(profile: ProfileRow, authUser?: AuthUser) {
  return {
    id: profile.id,
    username: profile.username,
    name: profile.display_name,
    email: profile.is_internal_email ? '' : (authUser?.email || ''),
    loginEmail: authUser?.email || '',
    role: profile.role,
    isActive: profile.is_active,
    mustChangePassword: profile.must_change_password,
    isInternalEmail: profile.is_internal_email,
    lastLoginAt: profile.last_login_at,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  }
}
