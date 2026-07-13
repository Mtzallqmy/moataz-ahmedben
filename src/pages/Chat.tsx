import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bot, ChevronDown, Plus, Search, Send, Square, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { Chat as ChatType, Message, Provider } from '../types'
import { createChat, deleteChat as deleteChatRecord, insertMessage, listChats, listMessages, updateChat } from '../lib/supabase'
import { formatDate, generateId, sendRealChatRequest, sendRealStreamingChat } from '../lib/utils'
import { supabase } from '../lib/supabase'

async function getAccessToken() {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('انتهت جلسة الدخول')
  return data.session.access_token
}

async function loadProviders() {
  const token = await getAccessToken()
  const response = await fetch('/api/providers', { headers: { Authorization: `Bearer ${token}` } })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'تعذر تحميل المزودات')
  return body.providers as Provider[]
}

export default function Chat() {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [chats, setChats] = useState<ChatType[]>([])
  const [currentChat, setCurrentChat] = useState<ChatType | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [mode, setMode] = useState<'chat' | 'agent'>('chat')
  const [input, setInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const creatingRef = useRef(false)

  useEffect(() => {
    if (!user) return
    Promise.all([listChats(user.id), loadProviders()]).then(([chatRows, providerRows]) => {
      setChats(chatRows); setProviders(providerRows)
      const first = providerRows.find(provider => provider.isEnabled) || providerRows[0] || null
      setSelectedProvider(first); setSelectedModel(first?.model || first?.models?.[0] || '')
    }).catch(error => toast.error(error instanceof Error ? error.message : 'تعذر تحميل بيانات الدردشة')).finally(() => setLoading(false))
  }, [user])

  useEffect(() => {
    if (!user || loading || creatingRef.current) return
    if (!chatId) {
      creatingRef.current = true
      const provider = selectedProvider
      void createChat(user.id, provider?.id || null, selectedModel, mode).then(chat => { setChats(prev => [chat, ...prev]); navigate(`/chat/${chat.id}`, { replace: true }) }).catch(error => toast.error(error.message)).finally(() => { creatingRef.current = false })
      return
    }
    const chat = chats.find(item => item.id === chatId)
    if (!chat) return
    setCurrentChat(chat); setMode('chat')
    void listMessages(chat.id, user.id).then(setMessages).catch(error => toast.error(error.message))
    const provider = providers.find(item => item.id === chat.providerId) || selectedProvider
    if (provider) { setSelectedProvider(provider); setSelectedModel(chat.model || provider.model || provider.models?.[0] || '') }
  }, [chatId, chats, loading, providers, user, navigate])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingContent])
  useEffect(() => { if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px` } }, [input])

  const createNewChat = async () => {
    if (!user) return
    try { const chat = await createChat(user.id, selectedProvider?.id || null, selectedModel, mode); setChats(prev => [chat, ...prev]); navigate(`/chat/${chat.id}`) } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر إنشاء المحادثة') }
  }

  const removeChat = async (id: string) => {
    if (!user) return
    try { await deleteChatRecord(id, user.id); const remaining = chats.filter(chat => chat.id !== id); setChats(remaining); if (currentChat?.id === id) navigate(remaining[0] ? `/chat/${remaining[0].id}` : '/chat'); toast.success('تم حذف المحادثة') } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حذف المحادثة') }
  }

  const sendMessage = async () => {
    if (!user || !currentChat || !selectedProvider || !selectedModel || !input.trim() || isStreaming) {
      if (!selectedProvider) toast.error('أضف مزودًا واختبر الاتصال أولًا')
      else if (!selectedModel) toast.error('اختر نموذجًا للمزود')
      return
    }
    const content = input.trim(); setInput(''); setIsStreaming(true); setStreamingContent('')
    const userMessage: Message = { id: generateId(), chatId: currentChat.id, role: 'user', content, createdAt: new Date().toISOString() }
    const nextMessages = [...messages, userMessage]; setMessages(nextMessages)
    try {
      await insertMessage(userMessage, user.id)
      let chat = currentChat
      if (messages.length === 0) { chat = await updateChat(currentChat.id, user.id, { title: content.slice(0, 45), provider_id: selectedProvider.id, model: selectedModel, mode }); setCurrentChat(chat); setChats(prev => prev.map(item => item.id === chat.id ? chat : item)) }
      const controller = new AbortController(); abortRef.current = controller; const token = await getAccessToken()
      const request = { accessToken: token, providerId: selectedProvider.id, model: selectedModel, signal: controller.signal, messages: nextMessages.map(message => ({ role: message.role === 'tool' ? 'assistant' : message.role, content: message.content })) as Array<{ role: 'system' | 'user' | 'assistant'; content: string }> }
      const result = selectedProvider.type === 'gemini' || selectedProvider.type === 'anthropic' ? await sendRealChatRequest(request) : await sendRealStreamingChat(request, setStreamingContent)
      const assistant: Message = { id: generateId(), chatId: currentChat.id, role: 'assistant', content: result.content, createdAt: new Date().toISOString(), model: selectedModel, tokens: result.tokens }
      await insertMessage(assistant, user.id); const all = [...nextMessages, assistant]; setMessages(all); setStreamingContent('')
      chat = await updateChat(currentChat.id, user.id, { message_count: all.length }).catch(() => currentChat)
      setCurrentChat(chat); setChats(prev => prev.map(item => item.id === chat.id ? chat : item))
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error(error instanceof Error ? error.message : 'فشل استدعاء النموذج') }
    finally { abortRef.current = null; setIsStreaming(false); setStreamingContent('') }
  }

  const stopGeneration = () => { abortRef.current?.abort(); setIsStreaming(false); setStreamingContent(''); toast.info('تم إيقاف التوليد') }
    const filteredChats = chats.filter(chat => chat.title.toLowerCase().includes(searchTerm.toLowerCase()))

  return <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
    <div className="w-72 border-l border-dark-700 bg-dark-900 flex-col hidden lg:flex"><div className="p-4 border-b border-dark-700 flex items-center justify-between"><div className="font-semibold">المحادثات</div><button onClick={() => void createNewChat()} className="btn btn-secondary px-3 py-1.5 text-xs"><Plus size={14} /> جديدة</button></div><div className="p-3"><div className="relative"><Search className="absolute right-3 top-3 text-dark-500" size={16} /><input className="input py-2 pr-9 text-sm" placeholder="ابحث..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></div></div><div className="flex-1 overflow-y-auto px-2 space-y-1">{filteredChats.map(chat => <div key={chat.id} onClick={() => navigate(`/chat/${chat.id}`)} className={`group flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer text-sm ${currentChat?.id === chat.id ? 'bg-primary-600 text-white' : 'hover:bg-dark-800 text-dark-200'}`}><div className="flex-1 min-w-0 pr-2"><div className="font-medium truncate">{chat.title}</div><div className="text-[10px] opacity-60 mt-0.5">{chat.model || 'بدون نموذج'} • {formatDate(chat.updatedAt, { month: 'short', day: 'numeric' })}</div></div><button onClick={event => { event.stopPropagation(); void removeChat(chat.id) }} className="opacity-0 group-hover:opacity-100 p-1.5"><Trash2 size={14} /></button></div>)}</div><div className="p-4 border-t border-dark-700 text-[10px] text-dark-500 text-center">{chats.length} محادثة محفوظة في Supabase</div></div>
    <div className="flex-1 flex flex-col min-w-0"><div className="h-14 border-b border-dark-700 px-5 flex items-center justify-between bg-dark-900 flex-shrink-0 gap-3"><div><div className="font-semibold text-lg truncate">{currentChat?.title || 'محادثة جديدة'}</div><div className="text-xs text-dark-500">{selectedProvider?.name || 'اختر مزودًا'} • {selectedModel || 'اختر نموذجًا'} • دردشة</div></div><div className="flex items-center gap-2"><div className="flex items-center bg-dark-800 rounded-2xl p-1 text-xs"><button type="button" className="px-3 py-1.5 rounded-xl bg-white text-dark-950">دردشة</button><button type="button" disabled title="يحتاج Agent Loop وأدوات خادمية حقيقية" className="px-3 py-1.5 rounded-xl flex items-center gap-1 text-dark-600 cursor-not-allowed"><Bot size={14} /> وكيل قريبًا</button></div><div className="relative group"><button className="flex items-center gap-2 text-sm px-3 py-2 bg-dark-800 rounded-2xl border border-dark-700">{selectedProvider?.name || 'اختر مزود'}<ChevronDown size={14} /></button><div className="absolute left-0 mt-2 w-64 bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl py-1 z-50 hidden group-hover:block">{providers.map(provider => <div key={provider.id} onClick={() => { setSelectedProvider(provider); setSelectedModel(provider.model || provider.models?.[0] || '') }} className="px-4 py-2.5 hover:bg-dark-800 cursor-pointer text-sm flex justify-between">{provider.name}<span className="text-[10px] text-emerald-400">{provider.status}</span></div>)}</div></div></div></div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-dark-950">{messages.length === 0 && !isStreaming && <div className="h-full flex flex-col items-center justify-center text-center"><Bot className="text-primary-400 mb-4" size={40} /><h3 className="text-2xl font-semibold mb-2">كيف يمكنني مساعدتك اليوم؟</h3><p className="text-dark-400">الردود هنا تأتي من المزود الذي تختاره عبر استدعاء API حقيقي.</p></div>}{messages.map(message => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`message-bubble ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}>{message.role === 'assistant' && <div className="flex items-center gap-2 text-xs text-dark-400 mb-2"><Bot size={14} /> {message.model || selectedModel}</div>}<div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>{message.tokens ? <div className="text-[10px] text-dark-500 mt-2">{message.tokens} رمز</div> : null}</div></div>)}{isStreaming && <div className="flex justify-start"><div className="message-bubble assistant-message"><div className="text-xs text-dark-400 mb-2"><Bot size={14} className="inline" /> {selectedModel} • يكتب...</div><div className="prose prose-invert prose-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent || 'جارٍ التفكير...'}</ReactMarkdown></div></div></div>}<div ref={messagesEndRef} /></div>
      <div className="border-t border-dark-700 p-4 bg-dark-900 flex-shrink-0"><div className="max-w-4xl mx-auto flex gap-3 items-end"><textarea ref={textareaRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder="اكتب رسالتك... (Shift+Enter لسطر جديد)" className="textarea flex-1 py-4" disabled={isStreaming} rows={1} />{isStreaming ? <button onClick={stopGeneration} className="btn btn-danger h-12 w-12 p-0 flex items-center justify-center rounded-2xl"><Square size={18} /></button> : <button onClick={() => void sendMessage()} disabled={!input.trim() || !currentChat} className="btn btn-primary h-12 w-12 p-0 flex items-center justify-center rounded-2xl disabled:bg-dark-700"><Send size={18} /></button>}</div><div className="text-[10px] text-dark-500 mt-2 text-center">المفاتيح لا تغادر الخادم • اضغط Enter للإرسال</div></div>
    </div>
  </div>
}
