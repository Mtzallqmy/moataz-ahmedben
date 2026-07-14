import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Chat, Message, Provider } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

export const supabase: SupabaseClient | null = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    // بدلاً من رمي خطأ يوقف التطبيق، نقوم بتسجيل تحذير
    console.warn('إعدادات Supabase غير موجودة. سيتم استخدام البيانات المحلية فقط.')
    return null
  }
  return supabase
}

export function mapProvider(row: any): Provider {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url || undefined,
    model: row.model || undefined,
    isEnabled: row.is_enabled !== false,
    lastTested: row.last_tested_at || undefined,
    status: row.status || 'untested',
    errorMessage: row.error_message || undefined,
    models: Array.isArray(row.models) ? row.models : [],
  }
}

export function mapChat(row: any): Chat {
  return {
    id: row.id,
    title: row.title,
    providerId: row.provider_id || '',
    model: row.model || '',
    mode: row.mode === 'agent' ? 'agent' : 'chat',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count || 0,
  }
}

export function mapMessage(row: any): Message {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    model: row.model || undefined,
    tokens: row.tokens || undefined,
  }
}

export async function listChats(userId: string) {
  const client = requireSupabase()
  if (!client) return []
  try {
    const { data, error } = await client.from('chats').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapChat)
  } catch (e) {
    console.error('Failed to list chats:', e)
    return []
  }
}

export async function createChat(userId: string, providerId: string | null, model: string, mode: 'chat' | 'agent') {
  const client = requireSupabase()
  if (!client) throw new Error('لا يمكن إنشاء محادثة بدون قاعدة بيانات')
  const { data, error } = await client.from('chats').insert({ user_id: userId, provider_id: providerId || null, model, mode, title: 'محادثة جديدة' }).select('*').single()
  if (error) throw error
  return mapChat(data)
}

export async function updateChat(chatId: string, userId: string, patch: Partial<{ title: string; provider_id: string | null; model: string; mode: 'chat' | 'agent'; message_count: number }>) {
  const client = requireSupabase()
  if (!client) return null
  const { data, error } = await client.from('chats').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', chatId).eq('user_id', userId).select('*').single()
  if (error) throw error
  return mapChat(data)
}

export async function deleteChat(chatId: string, userId: string) {
  const client = requireSupabase()
  if (!client) return
  const { error } = await client.from('chats').delete().eq('id', chatId).eq('user_id', userId)
  if (error) throw error
}

export async function listMessages(chatId: string, userId: string) {
  const client = requireSupabase()
  if (!client) return []
  try {
    const { data, error } = await client.from('messages').select('*').eq('chat_id', chatId).eq('user_id', userId).order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map(mapMessage)
  } catch (e) {
    console.error('Failed to list messages:', e)
    return []
  }
}

export async function insertMessage(message: Message, userId: string) {
  const client = requireSupabase()
  if (!client) return mapMessage({ ...message, created_at: new Date().toISOString() })
  const { data, error } = await client.from('messages').insert({
    id: message.id,
    chat_id: message.chatId,
    user_id: userId,
    role: message.role,
    content: message.content,
    model: message.model || null,
    tokens: message.tokens || null,
  }).select('*').single()
  if (error) throw error
  return mapMessage(data)
}
