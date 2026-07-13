import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, getAdminClient } from '../_lib/supabase'
import { encryptSecret } from '../_lib/crypto'
import { errorMessage, methodNotAllowed, requireString, setJsonHeaders } from '../_lib/http'

const allowedTypes = new Set(['gemini', 'openai', 'openai-compatible', 'openrouter', 'anthropic', 'nvidia', 'groq', 'deepseek', 'mistral', 'together', 'custom'])

function publicProvider(provider: any) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.base_url || undefined,
    model: provider.model || undefined,
    isEnabled: provider.is_enabled !== false,
    lastTested: provider.last_tested_at || undefined,
    status: provider.status || 'untested',
    errorMessage: provider.error_message || undefined,
    models: Array.isArray(provider.models) ? provider.models : [],
    createdAt: provider.created_at,
    updatedAt: provider.updated_at,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method || '')) return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])

  try {
    const { user } = await authenticate(req)
    const admin = getAdminClient()

    if (req.method === 'GET') {
      const { data, error } = await admin.from('providers').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (error) throw error
      return res.status(200).json({ providers: (data || []).map(publicProvider) })
    }

    const providerId = typeof req.body?.id === 'string' ? req.body.id : ''
    if (req.method === 'DELETE') {
      if (!providerId) return res.status(400).json({ error: 'id مطلوب' })
      const { error } = await admin.from('providers').delete().eq('id', providerId).eq('user_id', user.id)
      if (error) throw error
      return res.status(204).end()
    }

    if (req.method === 'PATCH') {
      if (!providerId) return res.status(400).json({ error: 'id مطلوب' })
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (typeof req.body?.model === 'string') update.model = req.body.model.trim().slice(0, 200)
      if (typeof req.body?.isEnabled === 'boolean') update.is_enabled = req.body.isEnabled
      const { data, error } = await admin.from('providers').update(update).eq('id', providerId).eq('user_id', user.id).select('*').single()
      if (error) throw error
      return res.status(200).json({ provider: publicProvider(data) })
    }

    const name = requireString(req.body?.name, 'name', 80)
    const type = requireString(req.body?.type, 'type', 40)
    const apiKey = requireString(req.body?.apiKey, 'apiKey', 4096)
    if (!allowedTypes.has(type)) return res.status(400).json({ error: 'نوع المزود غير مدعوم' })
    const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl.trim().replace(/\/$/, '') : null
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) return res.status(400).json({ error: 'Base URL يجب أن يبدأ بـ http أو https' })
    const encrypted = encryptSecret(apiKey)
    const now = new Date().toISOString()
    const { data, error } = await admin.from('providers').insert({
      user_id: user.id,
      name,
      type,
      base_url: baseUrl,
      model: typeof req.body?.model === 'string' ? req.body.model.trim().slice(0, 200) || null : null,
      encrypted_key: encrypted,
      is_enabled: true,
      status: 'untested',
      models: [],
      created_at: now,
      updated_at: now,
    }).select('*').single()
    if (error) throw error
    return res.status(201).json({ provider: publicProvider(data) })
  } catch (error) {
    const message = errorMessage(error)
    return res.status(message.includes('جلسة') ? 401 : 400).json({ error: message })
  }
}
