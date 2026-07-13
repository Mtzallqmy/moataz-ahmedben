import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { ShieldCheck } from 'lucide-react'

const roleLabels = { owner: 'مالك', admin: 'مدير', supervisor: 'مشرف', user: 'مستخدم' }

export default function Settings() {
  const { user, updateUser, changePassword, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [name, setName] = useState(user?.name || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 8 || password !== confirmPassword) return
    setSavingPassword(true)
    const success = await changePassword(password)
    setSavingPassword(false)
    if (success) { setPassword(''); setConfirmPassword('') }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight mb-8">الإعدادات</h1>
      {user?.forcePasswordChange && <div className="card p-5 mb-6 border-amber-500/40 bg-amber-500/10"><div className="flex gap-3"><ShieldCheck className="text-amber-400" /><div><div className="font-semibold">يجب تغيير كلمة المرور المؤقتة</div><p className="text-sm text-dark-400 mt-1">لن تتمكن من استخدام بقية الصفحات حتى تعيين كلمة مرور جديدة.</p></div></div></div>}
      <div className="space-y-8">
        <div className="card p-7">
          <h3 className="font-semibold mb-5">الملف الشخصي</h3>
          <div className="space-y-4">
            <div><label className="text-sm text-dark-400 block mb-2">الاسم</label><div className="flex gap-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /><button onClick={() => void updateUser({ name })} className="btn btn-primary">حفظ</button></div></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><div className="text-sm text-dark-400">اسم المستخدم</div><div className="font-medium" dir="ltr">{user?.username || 'غير معين'}</div></div>
              <div><div className="text-sm text-dark-400">البريد الإلكتروني</div><div className="font-medium" dir="ltr">{user?.email || 'حساب باسم مستخدم فقط'}</div></div>
              <div><div className="text-sm text-dark-400">الدور</div><div className="font-medium">{user ? roleLabels[user.role] : ''}</div></div>
            </div>
          </div>
        </div>

        <form onSubmit={submitPassword} className="card p-7">
          <h3 className="font-semibold mb-4">تغيير كلمة المرور</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <input type="password" className="input" placeholder="كلمة المرور الجديدة" value={password} onChange={(e) => setPassword(e.target.value)} />
            <input type="password" className="input" placeholder="تأكيد كلمة المرور" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {password && password.length < 8 && <p className="text-xs text-red-400 mt-2">8 أحرف على الأقل</p>}
          {confirmPassword && password !== confirmPassword && <p className="text-xs text-red-400 mt-2">كلمتا المرور غير متطابقتين</p>}
          <button disabled={savingPassword || password.length < 8 || password !== confirmPassword} className="btn btn-primary mt-4">{savingPassword ? 'جارٍ الحفظ...' : 'تغيير كلمة المرور'}</button>
        </form>

        <div className="card p-7"><h3 className="font-semibold mb-4">المظهر</h3><div className="flex items-center justify-between"><div>الوضع الحالي: <span className="font-mono text-xs px-2 py-0.5 bg-dark-800 rounded">{theme}</span></div><button onClick={toggleTheme} className="btn btn-secondary">تبديل الوضع</button></div></div>
        <div className="card p-7 border-red-900/30"><h3 className="font-semibold mb-2 text-red-400">تسجيل الخروج</h3><p className="text-sm text-dark-400 mb-4">سيتم حذف جلسة هذا المتصفح.</p><button onClick={logout} className="btn btn-danger">تسجيل الخروج</button></div>
      </div>
    </div>
  )
}
