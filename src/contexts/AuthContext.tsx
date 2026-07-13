import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { User } from '../types'
import { apiJson, authHeaders } from '../lib/api'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (identifier: string, password: string) => Promise<boolean>
  register: (name: string, email: string, password: string, username?: string) => Promise<boolean>
  logout: () => Promise<void>
  updateUser: (updates: Partial<User>) => Promise<void>
  changePassword: (password: string) => Promise<boolean>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function configError() {
  return 'إعدادات Supabase غير مكتملة. أضف VITE_SUPABASE_URL وVITE_SUPABASE_ANON_KEY في Vercel.'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  const refreshUser = useCallback(async () => {
    if (!supabase) { setUser(null); return }
    const { data } = await supabase.auth.getSession()
    if (!data.session) { setUser(null); return }
    try {
      const body = await apiJson<{ user: User }>('/api/auth/me', { headers: await authHeaders(false) })
      setUser(body.user)
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        await supabase.auth.signOut()
        setUser(null)
      }
      throw error
    }
  }, [])

  useEffect(() => {
    if (!supabase) { setIsLoading(false); return }
    let mounted = true
    void refreshUser().catch((error) => {
      if (mounted) toast.error(error instanceof Error ? error.message : 'تعذر التحقق من الجلسة')
    }).finally(() => { if (mounted) setIsLoading(false) })

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return
      if (event === 'SIGNED_OUT') setUser(null)
      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
        queueMicrotask(() => void refreshUser().catch(() => undefined))
      }
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [refreshUser])

  const login = async (identifier: string, password: string) => {
    if (!supabase) { toast.error(configError()); return false }
    try {
      const body = await apiJson<{
        session: { access_token: string; refresh_token: string }
        user: User
      }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      })
      const { error } = await supabase.auth.setSession({
        access_token: body.session.access_token,
        refresh_token: body.session.refresh_token,
      })
      if (error) throw error
      setUser(body.user)
      toast.success(`مرحباً بعودتك، ${body.user.name}`)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل الدخول')
      return false
    }
  }

  const register = async (name: string, email: string, password: string, username?: string) => {
    if (!supabase) { toast.error(configError()); return false }
    try {
      const body = await apiJson<{
        session: { access_token: string; refresh_token: string } | null
        user: User
        requiresEmailConfirmation: boolean
      }>('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, username }),
      })
      if (body.session) {
        await supabase.auth.setSession({ access_token: body.session.access_token, refresh_token: body.session.refresh_token })
        setUser(body.user)
      }
      toast.success(body.requiresEmailConfirmation ? 'تم إنشاء الحساب. تحقق من بريدك لتفعيله.' : 'تم إنشاء الحساب بنجاح')
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إنشاء الحساب')
      return false
    }
  }

  const logout = async () => {
    if (supabase) await supabase.auth.signOut({ scope: 'local' })
    setUser(null)
    navigate('/login')
  }

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return
    try {
      const body = await apiJson<{ user: User }>('/api/auth/profile', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ name: updates.name, avatar: updates.avatar }),
      })
      setUser(body.user)
      toast.success('تم تحديث الملف الشخصي')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث الملف الشخصي')
    }
  }

  const changePassword = async (password: string) => {
    try {
      await apiJson('/api/auth/password', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ password }),
      })
      setUser((current) => current ? { ...current, forcePasswordChange: false } : current)
      toast.success('تم تغيير كلمة المرور')
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تغيير كلمة المرور')
      return false
    }
  }

  return <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateUser, changePassword, refreshUser }}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
