import React, { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { User } from '../types'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  register: (name: string, email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  updateUser: (updates: Partial<User>) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function mapUser(authUser: any): User {
  return {
    id: authUser.id,
    name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'مستخدم',
    email: authUser.email || '',
    avatar: authUser.user_metadata?.avatar_url,
    roles: authUser.user_metadata?.roles || [],
    forcePasswordChange: authUser.user_metadata?.force_password_change || false,
    createdAt: authUser.created_at,
  }
}

function configError() {
  return 'إعدادات Supabase غير مكتملة. أضف VITE_SUPABASE_URL وVITE_SUPABASE_ANON_KEY في Vercel.'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase) { setIsLoading(false); return }
    let mounted = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (mounted) {
        if (error) toast.error(error.message)
        setUser(data.session?.user ? mapUser(data.session.user) : null)
        setIsLoading(false)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ? mapUser(session.user) : null)
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  const login = async (email: string, password: string) => {
    if (!supabase) { toast.error(configError()); return false }
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) { toast.error('البريد الإلكتروني أو كلمة المرور غير صحيحة'); return false }
    if (data.user) { setUser(mapUser(data.user)); toast.success(`مرحباً بعودتك، ${mapUser(data.user).name}`) }
    return true
  }

  const register = async (name: string, email: string, password: string) => {
    if (!supabase) { toast.error(configError()); return false }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(), password,
      options: { data: { full_name: name.trim() } },
    })
    if (error) { toast.error(error.message); return false }
    if (data.user && data.session) setUser(mapUser(data.user))
    toast.success(data.session ? 'تم إنشاء الحساب بنجاح' : 'تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتفعيل الدخول.')
    return true
  }

  const logout = async () => {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    navigate('/login')
  }

  const updateUser = async (updates: Partial<User>) => {
    if (!supabase || !user) return
    const metadata: Record<string, unknown> = {}
    if (updates.name) metadata.full_name = updates.name
    if (updates.avatar) metadata.avatar_url = updates.avatar
    const { data, error } = await supabase.auth.updateUser({ data: metadata })
    if (error) { toast.error(error.message); return }
    if (data.user) setUser(mapUser(data.user))
  }

  return <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateUser }}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
