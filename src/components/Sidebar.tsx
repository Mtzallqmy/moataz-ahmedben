import { NavLink, useLocation } from 'react-router-dom'
import { MessageCircle, LayoutDashboard, Bot, Plug, Settings, LogOut, X, Plus, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

interface SidebarProps { onClose: () => void; onLogout: () => void }

export default function Sidebar({ onClose, onLogout }: SidebarProps) {
  const location = useLocation()
  const { user } = useAuth()
  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم' },
    { to: '/chat', icon: MessageCircle, label: 'المحادثات' },
    { to: '/providers', icon: Bot, label: 'مزودو الذكاء الاصطناعي' },
    { to: '/integrations', icon: Plug, label: 'التكاملات' },
    ...(['owner', 'admin'].includes(user?.role || '') ? [{ to: '/admin/users', icon: Users, label: 'إدارة المستخدمين' }] : []),
    { to: '/settings', icon: Settings, label: 'الإعدادات' },
  ]
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  const initials = user?.name?.trim()?.charAt(0) || 'م'

  return <div className="sidebar w-72 h-full flex flex-col bg-white dark:bg-dark-900 border-l border-dark-200 dark:border-dark-700">
    <div className="flex items-center justify-between px-6 py-5 border-b border-dark-200 dark:border-dark-700"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary-600 to-accent-600 flex items-center justify-center"><span className="text-white font-bold text-xl">م</span></div><div><div className="font-semibold text-lg">معتز العلقمي</div><div className="text-[10px] text-dark-500 -mt-1">AI Platform</div></div></div><button onClick={onClose} className="md:hidden p-2 text-dark-400"><X size={18} /></button></div>
    <div className="px-4 pt-4"><NavLink to="/chat" className="btn btn-primary w-full justify-center gap-2 text-sm py-3"><Plus size={16} /> محادثة جديدة</NavLink></div>
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">{navItems.map((item) => { const Icon = item.icon; const active = isActive(item.to); return <NavLink key={item.to} to={item.to} className={cn('flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all', active ? 'bg-primary-600 text-white shadow-sm' : 'text-dark-600 dark:text-dark-300 hover:bg-dark-100 dark:hover:bg-dark-800')}><Icon size={18} />{item.label}</NavLink> })}</nav>
    <div className="border-t border-dark-200 dark:border-dark-700 p-4 mt-auto"><div className="flex items-center gap-3 px-2 py-2 rounded-2xl"><div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center font-bold text-white overflow-hidden">{user?.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" /> : initials}</div><div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{user?.name}</div><div className="text-xs text-dark-500 truncate" dir="ltr">@{user?.username || user?.email || 'user'}</div></div><button onClick={onLogout} className="p-2 text-dark-400 hover:text-red-500" title="تسجيل الخروج"><LogOut size={16} /></button></div></div>
  </div>
}
