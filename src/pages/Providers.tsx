import { useEffect, useState } from 'react'
import { Bot, CheckCircle, ChevronDown, ChevronUp, Play, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, authHeaders } from '../lib/api'
import type { Provider, ProviderDiagnostic, ProviderType } from '../types'

const providerTypes: Array<{ value: ProviderType; label: string }> = [
  { value: 'openai', label: 'OpenAI' }, { value: 'openrouter', label: 'OpenRouter' },
  { value: 'gemini', label: 'Google Gemini' }, { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'groq', label: 'Groq' }, { value: 'deepseek', label: 'DeepSeek' },
  { value: 'mistral', label: 'Mistral AI' }, { value: 'together', label: 'Together AI' },
  { value: 'nvidia', label: 'NVIDIA NIM' }, { value: 'openai-compatible', label: 'OpenAI-compatible' },
  { value: 'custom', label: 'مخصص/اكتشاف تلقائي' },
]

const categoryLabels: Record<string, string> = {
  authentication: 'مفتاح غير صالح', authorization: 'صلاحية غير كافية', rate_limit: 'حد الطلبات', quota: 'الرصيد/الحصة',
  model: 'النموذج', endpoint: 'البوابة', validation: 'صيغة الطلب', network: 'الشبكة/DNS', timeout: 'انتهاء المهلة', upstream: 'خادم المزود', unknown: 'غير مصنف',
}

export default function Providers() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', type: 'openai' as ProviderType, apiKey: '', baseUrl: '', model: '' })

  const loadProviders = async () => {
    try {
      const body = await apiJson<{ providers: Provider[] }>('/api/providers', { headers: await authHeaders(false) })
      setProviders(body.providers || [])
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر تحميل المزودات') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadProviders() }, [])

  const addProvider = async () => {
    if (!form.name.trim() || !form.apiKey.trim()) { toast.error('الاسم ومفتاح API مطلوبان'); return }
    try {
      const body = await apiJson<{ provider: Provider }>('/api/providers', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(form) })
      setProviders((current) => [body.provider, ...current])
      setShowAddModal(false)
      setForm({ name: '', type: 'openai', apiKey: '', baseUrl: '', model: '' })
      toast.success('تم حفظ المزود بشكل مشفّر. اختبره لاكتشاف البوابة والنماذج.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حفظ المزود') }
  }

  const deleteProvider = async (id: string) => {
    if (!confirm('حذف المزود نهائيًا؟')) return
    try {
      await apiJson('/api/providers', { method: 'DELETE', headers: await authHeaders(), body: JSON.stringify({ id }) })
      setProviders((current) => current.filter((provider) => provider.id !== id))
      toast.success('تم حذف المزود')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حذف المزود') }
  }

  const testConnection = async (provider: Provider) => {
    setTestingId(provider.id)
    try {
      const body = await apiJson<{ success: boolean; message: string; models: string[]; diagnostic: ProviderDiagnostic; testedAt: string }>('/api/providers/test', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ providerId: provider.id }),
      })
      setProviders((current) => current.map((item) => item.id === provider.id ? { ...item, status: 'connected', models: body.models, lastTested: body.testedAt, diagnostic: body.diagnostic, errorMessage: undefined, detectedProtocol: body.diagnostic.detectedProtocol, lastLatencyMs: body.diagnostic.latencyMs } : item))
      setExpandedId(provider.id)
      toast.success(body.message)
    } catch (error: any) {
      const diagnostic = error?.details as ProviderDiagnostic | undefined
      setProviders((current) => current.map((item) => item.id === provider.id ? { ...item, status: 'error', errorMessage: diagnostic?.providerMessage || error.message, diagnostic, detectedProtocol: diagnostic?.detectedProtocol, lastLatencyMs: diagnostic?.latencyMs, lastHttpStatus: diagnostic?.httpStatus } : item))
      setExpandedId(provider.id)
      toast.error(diagnostic?.providerMessage || error.message || 'فشل الاتصال')
    } finally { setTestingId(null) }
  }

  const updateModel = async (provider: Provider, model: string) => {
    try {
      const body = await apiJson<{ provider: Provider }>('/api/providers', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ id: provider.id, model }) })
      setProviders((current) => current.map((item) => item.id === provider.id ? body.provider : item))
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر تحديث النموذج') }
  }

  const needsBaseUrl = ['custom', 'openai-compatible'].includes(form.type)

  return <div className="p-6 max-w-6xl mx-auto">
    <div className="flex items-start justify-between mb-8 gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">مزودو الذكاء الاصطناعي</h1><p className="text-dark-400 mt-1">اختبار حقيقي للمفتاح والبوابة واكتشاف النماذج مع عرض رسالة المزود الأصلية وتصنيف الخطأ.</p></div><button onClick={() => setShowAddModal(true)} className="btn btn-primary"><Plus size={18} /> إضافة مزود</button></div>
    {loading ? <div className="card p-12 text-center text-dark-400">جارٍ تحميل المزودات...</div> : providers.length === 0 ? <div className="card p-12 text-center"><Bot className="mx-auto text-dark-600 mb-4" size={48} /><h3 className="text-xl font-medium mb-2">لا يوجد مزودون بعد</h3><p className="text-dark-400">أضف مفتاح مزود تملكه لبدء الاختبار الفعلي.</p></div> : <div className="grid gap-4">{providers.map((provider) => <div key={provider.id} className="card overflow-hidden">
      <div className="p-6 flex flex-col md:flex-row md:items-center gap-5"><div className="flex-1"><div className="flex items-center gap-3 mb-1"><div className="font-semibold text-lg">{provider.name}</div><StatusBadge status={provider.status} /></div><div className="text-sm text-dark-400">{providerTypes.find((item) => item.value === provider.type)?.label} • {provider.model || 'لم يُحدد نموذج'}</div><div className="flex gap-3 text-xs text-dark-500 mt-2">{provider.detectedProtocol && <span>البروتوكول: {provider.detectedProtocol}</span>}{provider.lastLatencyMs !== undefined && <span>الزمن: {provider.lastLatencyMs}ms</span>}{provider.lastHttpStatus && <span>HTTP {provider.lastHttpStatus}</span>}</div></div>
      <div className="flex flex-wrap items-center gap-2"><button onClick={() => void testConnection(provider)} disabled={testingId === provider.id} className="btn btn-secondary text-xs px-5 py-2">{testingId === provider.id ? <RefreshCw className="animate-spin" size={14} /> : <Play size={14} />} اختبار واكتشاف</button>{(provider.models?.length || 0) > 0 && <select value={provider.model || ''} onChange={(event) => void updateModel(provider, event.target.value)} className="input text-xs py-2 px-3 w-auto max-w-64"><option value="">اختر نموذجًا</option>{provider.models?.map((model) => <option key={model} value={model}>{model}</option>)}</select>}<button onClick={() => setExpandedId(expandedId === provider.id ? null : provider.id)} className="btn btn-ghost p-2">{expandedId === provider.id ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button><button onClick={() => void deleteProvider(provider.id)} className="btn btn-ghost text-red-400 p-2"><Trash2 size={17} /></button></div></div>
      {expandedId === provider.id && <DiagnosticPanel provider={provider} />}
    </div>)}</div>}

    {showAddModal && <div className="modal" onClick={() => setShowAddModal(false)}><div className="modal-content p-8" onClick={(event) => event.stopPropagation()}><h2 className="text-2xl font-semibold mb-6">إضافة مزود</h2><div className="space-y-5"><div><label className="text-sm text-dark-300 block mb-1.5">اسم العرض</label><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="OpenAI الخاص بي" /></div><div><label className="text-sm text-dark-300 block mb-1.5">نوع المزود</label><select className="input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ProviderType })}>{providerTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div><label className="text-sm text-dark-300 block mb-1.5">مفتاح API</label><input type="password" autoComplete="new-password" className="input font-mono text-sm" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder="لا يُعاد إلى المتصفح بعد الحفظ" /></div>{needsBaseUrl && <div><label className="text-sm text-dark-300 block mb-1.5">Base URL</label><input className="input font-mono text-sm" dir="ltr" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /><p className="text-xs text-dark-500 mt-1">يُمنع localhost والشبكات الداخلية لحماية الخادم من SSRF.</p></div>}<div><label className="text-sm text-dark-300 block mb-1.5">النموذج (اختياري)</label><input className="input" dir="ltr" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="يستخدم لاختبار التوليد إذا لم يدعم المزود /models" /></div></div><div className="flex gap-3 mt-8"><button onClick={() => setShowAddModal(false)} className="btn btn-secondary flex-1">إلغاء</button><button onClick={() => void addProvider()} className="btn btn-primary flex-1">حفظ</button></div></div></div>}
  </div>
}

function StatusBadge({ status }: { status: Provider['status'] }) {
  const style = status === 'connected' ? 'border-emerald-600 text-emerald-400' : status === 'error' ? 'border-red-600 text-red-400' : 'border-amber-600 text-amber-400'
  return <div className={`provider-badge ${style}`}>{status === 'connected' ? <CheckCircle size={12} className="inline ml-1" /> : status === 'error' ? <XCircle size={12} className="inline ml-1" /> : null}{status === 'connected' ? 'متصل' : status === 'error' ? 'خطأ' : 'غير مختبر'}</div>
}

function DiagnosticPanel({ provider }: { provider: Provider }) {
  const diagnostic = provider.diagnostic
  if (!diagnostic) return <div className="border-t border-dark-700 p-5 text-sm text-dark-400">لم يتم تنفيذ اختبار تفصيلي بعد.</div>
  return <div className="border-t border-dark-700 p-5 bg-dark-900/30 text-sm"><div className="grid md:grid-cols-2 gap-4"><div><div className="text-dark-500 text-xs">النتيجة</div><div className={diagnostic.success ? 'text-emerald-400' : 'text-red-400'}>{diagnostic.message}</div></div><div><div className="text-dark-500 text-xs">التصنيف</div><div>{diagnostic.category ? categoryLabels[diagnostic.category] || diagnostic.category : 'نجاح'}</div></div><div><div className="text-dark-500 text-xs">البوابة المستخدمة</div><div className="font-mono text-xs break-all" dir="ltr">{diagnostic.endpoint || '—'}</div></div><div><div className="text-dark-500 text-xs">رمز المزود/الطلب</div><div className="font-mono text-xs" dir="ltr">{diagnostic.code || '—'} {diagnostic.requestId ? `• ${diagnostic.requestId}` : ''}</div></div></div>{diagnostic.providerMessage && <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20"><div className="text-xs text-red-300 mb-1">رسالة المزود الأصلية</div><div className="text-red-200 break-words">{diagnostic.providerMessage}</div></div>}{diagnostic.hint && <div className="mt-3 p-3 rounded-xl bg-primary-500/10 border border-primary-500/20"><span className="font-medium">الحل المقترح: </span>{diagnostic.hint}</div>}{diagnostic.warning && <div className="mt-3 text-amber-400">{diagnostic.warning}</div>}</div>
}
