import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Providers from './pages/Providers'
import Integrations from './pages/Integrations'
import Settings from './pages/Settings'
import AdminUsers from './pages/AdminUsers'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import NotFound from './pages/NotFound'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import type { AppRole } from './types'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-dark-950"><div className="flex flex-col items-center gap-4"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /><p className="text-dark-400 text-sm">جارٍ التحميل...</p></div></div>
  // في وضع الوصول العام، نسمح دائماً بالمرور
  return <>{children}</>
}

function RoleRoute({ roles, children }: { roles: AppRole[]; children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { user, logout } = useAuth()
  const location = useLocation()
  useEffect(() => { if (window.innerWidth < 768) setSidebarOpen(false) }, [location.pathname])
  if (!user) return <>{children}</>

  return <div className="flex h-screen bg-dark-950 text-dark-100 overflow-hidden">
    <div className={`fixed md:static inset-y-0 right-0 z-50 w-72 transform transition-transform duration-300 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}><Sidebar onClose={() => setSidebarOpen(false)} onLogout={logout} /></div>
    {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}
    <div className="flex-1 flex flex-col min-w-0"><Topbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} sidebarOpen={sidebarOpen} user={user} /><main className="flex-1 overflow-auto bg-dark-950"><AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="h-full">{children}</motion.div></AnimatePresence></main></div>
  </div>
}

const protectedPage = (page: React.ReactNode) => <ProtectedRoute><AppLayout>{page}</AppLayout></ProtectedRoute>

export default function App() {
  return <ThemeProvider><AuthProvider><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Navigate to="/dashboard" replace />} />
    <Route path="/register" element={<Navigate to="/dashboard" replace />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/dashboard" element={protectedPage(<Dashboard />)} />
    <Route path="/chat" element={protectedPage(<Chat />)} />
    <Route path="/chat/:chatId" element={protectedPage(<Chat />)} />
    <Route path="/providers" element={protectedPage(<Providers />)} />
    <Route path="/integrations" element={protectedPage(<Integrations />)} />
    <Route path="/settings" element={protectedPage(<Settings />)} />
    <Route path="/admin/users" element={protectedPage(<RoleRoute roles={['owner', 'admin']}><AdminUsers /></RoleRoute>)} />
    <Route path="*" element={<NotFound />} />
  </Routes></AuthProvider></ThemeProvider>
}
