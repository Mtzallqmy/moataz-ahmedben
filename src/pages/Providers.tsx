import { useEffect, useState } from 'react'
import { Plus, Trash2, Play, RefreshCw, CheckCircle, XCircle, Bot } from 'lucide-react'
import { toast } from 'sonner'
import { Provider, ProviderType } from '../types'
import { supabase } from '../lib/supabase'
import { getMockModels } from '../lib/utils'

const providerTypes: Array<{ value: ProviderType; label: string }> = [
  { value: 'openai', label: 'OpenAI' }, { value: 'openrouter', label: 'OpenRouter' },
  { value: 'gemini', label: 'Google Gemini' }, { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'groq', label: 'Groq' }, { value: 'deepseek', label: 'DeepSeek' },
  { value: 'mistral', label: 'Mistral AI' }, { value: 'together', label: 'Together AI' },
  { value: 'nvidia', label: 'NVIDIA NIM' }, { value: 'openai-compatible', label: 'OpenAI-compatible' },
  { value: 'custom', label: 'مخصص' },
]

async function authHeaders() {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('انتهت جلسة الدخول')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }
}

export default function Providers() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', type: 'openai' as ProviderType, apiKey: '', baseUrl: '', model: '' })

  const loadProviders = async () => {
    try {
      const res = await fetch('/api/providers', { headers: await authHeaders() })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setProviders(body.providers || [])
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر تحميل المزودات') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadProviders() }, [])

  const addProvider = async () => {
    if (!form.name.trim() || !form.apiKey.trim()) { toast.error('الاسم ومفتاح API مطلوبان'); return }
    try {
      const res = await fetch('/api/providers', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(form) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setProviders(prev => [body.provider, ...prev])
      setShowAddModal(false); setForm({ name: '', type: 'openai', apiKey: '', baseUrl: '', model: '' })
      toast.success('تم حفظ المزود بشكل مشفّر')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حفظ المزود') }
  }

  const deleteProvider = async (id: string) => {
    try {
      const res = await fetch('/api/providers', { method: 'DELETE', headers: await authHeaders(), body: JSON.stringify({ id }) })
      if (!res.ok) { const body = await res.json(); throw new Error(body.error) }
      setProviders(prev => prev.filter(provider => provider.id !== id)); toast.success('تم حذف المزود')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حذف المزود') }
  }

  const testConnection = async (provider: Provider) => {
    setTestingId(provider.id)
    try {
      const res = await fetch('/api/providers/test', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ providerId: provider.id }) })
      const body = await res.json()
      if (!res.ok || !body.success) throw new Error(body.message || 'فشل الاتصال')
      setProviders(prev => prev.map(item => item.id === provider.id ? { ...item, status: 'connected', models: body.models || item.models, lastTested: body.testedAt, errorMessage: undefined } : item))
      toast.success(body.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل الاتصال'
      setProviders(prev => prev.map(item => item.id === provider.id ? { ...item, status: 'error', errorMessage: message } : item))
      toast.error(message)
    } finally { setTestingId(null) }
  }

  const updateModel = async (provider: Provider, model: string) => {
    try {
      const res = await fetch('/api/providers', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ id: provider.id, model }) })
      const body = await res.json(); if (!res.ok) throw new Error(body.error)
      setProviders(prev => prev.map(item => item.id === provider.id ? body.provider : item))
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر تحديث النموذج') }
  }

  const needsBaseUrl = ['custom', 'openai-compatible'].includes(form.type)

  return <div className="p-6 max-w-6xl mx-auto">
    <div className="flex items-center justify-between mb-8 gap-4">
      <div><h1 className="text-3xl font-semibold tracking-tight">مزودو الذكاء الاصطناعي</h1><p className="text-dark-400 mt-1">المفاتيح تُرسل عبر HTTPS وتُخزّن مشفّرة في الخادم، ولا تعود إلى المتصفح.</p></div>
      <button onClick={() => setShowAddModal(true)} className="btn btn-primary flex items-center gap-2"><Plus size={18} /> إضافة مزود</button>
    </div>
    {loading ? <div className="card p-12 text-center text-dark-400">جارٍ تحميل المزودات...</div> : providers.length === 0 ? <div className="card p-12 text-center"><Bot className="mx-auto text-dark-600 mb-4" size={48} /><h3 className="text-xl font-medium mb-2">لا يوجد مزودون بعد</h3><p className="text-dark-400">أضف مفتاح مزود تملكه لبدء استخدام النماذج فعليًا.</p></div> : <div className="grid gap-4">{providers.map(provider => <div key={provider.id} className="card p-6 flex flex-col md:flex-row md:items-center gap-6">
      <div className="flex-1"><div className="flex items-center gap-3 mb-1"><div className="font-semibold text-lg">{provider.name}</div><div className={`provider-badge text-xs ${provider.status === 'connected' ? 'border-emerald-600 text-emerald-400' : provider.status === 'error' ? 'border-red-600 text-red-400' : 'border-amber-600 text-amber-400'}`}>{provider.status === 'connected' ? <CheckCircle size={12} className="inline mr-1" /> : provider.status === 'error' ? <XCircle size={12} className="inline mr-1" /> : null}{provider.status}</div></div><div className="text-sm text-dark-400">{providerTypes.find(item => item.value === provider.type)?.label} • {provider.model || 'اختر نموذجًا بعد الاختبار'}</div>{provider.errorMessage && <div className="text-xs text-red-400 mt-2">{provider.errorMessage}</div>}</div>
      <div className="flex flex-wrap items-center gap-2"><button onClick={() => void testConnection(provider)} disabled={testingId === provider.id} className="btn btn-secondary text-xs px-5 py-2 flex items-center gap-2">{testingId === provider.id ? <RefreshCw className="animate-spin" size={14} /> : <Play size={14} />} اختبار فعلي</button><button onClick={() => void testConnection(provider)} className="btn btn-ghost text-xs px-4 py-2">اكتشاف النماذج</button>{(provider.models?.length || 0) > 0 && <select value={provider.model || ''} onChange={event => void updateModel(provider, event.target.value)} className="input text-xs py-2 px-3 w-auto bg-dark-800 border-dark-600">{provider.models?.map(model => <option key={model} value={model}>{model}</option>)}</select>}<button onClick={() => void deleteProvider(provider.id)} className="btn btn-ghost text-red-400 p-2.5"><Trash2 size={16} /></button></div>
    </div>)}</div>}
    {showAddModal && <div className="modal" onClick={() => setShowAddModal(false)}><div className="modal-content p-8" onClick={event => event.stopPropagation()}><h2 className="text-2xl font-semibold mb-6">إضافة مزود</h2><div className="space-y-5"><div><label className="text-sm text-dark-300 block mb-1.5">اسم العرض</label><input className="input" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="OpenAI الخاص بي" /></div><div><label className="text-sm text-dark-300 block mb-1.5">نوع المزود</label><select className="input" value={form.type} onChange={event => setForm({ ...form, type: event.target.value as ProviderType })}>{providerTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div><label className="text-sm text-dark-300 block mb-1.5">مفتاح API</label><input type="password" autoComplete="new-password" className="input font-mono text-sm" value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} placeholder="لن يتم عرضه أو حفظه في المتصفح" /></div>{needsBaseUrl && <div><label className="text-sm text-dark-300 block mb-1.5">Base URL</label><input className="input font-mono text-sm" value={form.baseUrl} onChange={event => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></div>}<div><label className="text-sm text-dark-300 block mb-1.5">النموذج (اختياري)</label><input className="input" value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder={getMockModels(form.type)[0] || 'اتركه فارغًا ثم اكتشف النماذج'} /></div></div><div className="flex gap-3 mt-8"><button onClick={() => setShowAddModal(false)} className="btn btn-secondary flex-1">إلغاء</button><button onClick={() => void addProvider()} className="btn btn-primary flex-1">حفظ واختبار لاحقًا</button></div><p className="text-[10px] text-dark-500 mt-6 text-center">لا تضع service_role أو أي مفتاح Supabase هنا. استخدم مفتاح المزود نفسه فقط.</p></div></div>}
  </div>
}
