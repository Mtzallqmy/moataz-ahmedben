import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { User } from '../types'

// مستخدم ضيف افتراضي لتخطي تسجيل الدخول
const GUEST_USER: User = {
  id: 'guest-user-id',
  name: 'معتز العلقمي',
  username: 'mtzallqmy',
  email: 'mtzallqmy@gmail.com',
  role: 'owner',
  isActive: true,
  createdAt: new Date().toISOString(),
  forcePasswordChange: false
}

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // تعيين المستخدم الضيف افتراضياً وتخطي حالة التحميل
  const [user, setUser] = useState<User | null>(GUEST_USER)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const refreshUser = useCallback(async () => {
    // لا حاجة للتحقق من الجلسة في وضع الضيف
    setUser(GUEST_USER)
  }, [])

  useEffect(() => {
    // تأكيد تعيين المستخدم عند بدء التطبيق
    setUser(GUEST_USER)
    setIsLoading(false)
  }, [])

  const login = async (_identifier: string, _password: string) => {
    setUser(GUEST_USER)
    toast.success(`مرحباً بك، ${GUEST_USER.name}`)
    return true
  }

  const register = async (name: string, _email: string, _password: string, _username?: string) => {
    setUser({ ...GUEST_USER, name })
    toast.success('تم إنشاء الحساب بنجاح (وضع الوصول العام)')
    return true
  }

  const logout = async () => {
    // في وضع الوصول العام، تسجيل الخروج يعيد التوجيه فقط
    navigate('/')
  }

  const updateUser = async (updates: Partial<User>) => {
    setUser((current) => current ? { ...current, ...updates } : GUEST_USER)
    toast.success('تم تحديث الملف الشخصي محلياً')
  }

  const changePassword = async (_password: string) => {
    toast.success('تم تغيير كلمة المرور محلياً')
    return true
  }

  return <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateUser, changePassword, refreshUser }}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
