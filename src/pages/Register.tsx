import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { toast } from 'sonner'

export default function Register() {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name || !email || !password) { toast.error('يرجى ملء الحقول المطلوبة'); return }
    if (password.length < 8) { toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return }
    setIsLoading(true)
    const success = await register(name, email, password, username || undefined)
    setIsLoading(false)
    if (success) navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-dark-400 hover:text-white mb-8 group">
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition" /> العودة للصفحة الرئيسية
        </Link>
        <div className="card p-8 border-dark-700">
          <div className="flex justify-center mb-6"><div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-600 to-accent-600 flex items-center justify-center"><span className="text-white text-3xl font-bold">م</span></div></div>
          <h1 className="text-3xl font-semibold tracking-tight text-center mb-2">أنشئ حسابك</h1>
          <p className="text-center text-dark-400 mb-8">قد يكون التسجيل العام متوقفًا ويُدار من لوحة المدير</p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div><label className="block text-sm font-medium mb-2 text-dark-300">الاسم الكامل</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div><label className="block text-sm font-medium mb-2 text-dark-300">اسم المستخدم (اختياري)</label><input className="input" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="moataz" /></div>
            <div><label className="block text-sm font-medium mb-2 text-dark-300">البريد الإلكتروني</label><input type="email" className="input" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div>
              <label className="block text-sm font-medium mb-2 text-dark-300">كلمة المرور</label>
              <div className="relative"><input type={showPassword ? 'text' : 'password'} className="input pr-12" placeholder="8 أحرف على الأقل" value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </div>
            <button type="submit" disabled={isLoading} className="btn btn-primary w-full py-3.5">{isLoading ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}</button>
          </form>
          <div className="mt-6 text-center text-sm">لديك حساب؟ <Link to="/login" className="text-primary-400 hover:underline">سجل الدخول</Link></div>
        </div>
      </div>
    </div>
  )
}
