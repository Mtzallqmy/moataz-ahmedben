import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, getAdminClient } from '../_lib/supabase'
import { decryptSecret } from '../_lib/crypto'
import { errorMessage, methodNotAllowed, setJsonHeaders } from '../_lib/http'

const defaults: Record<string, string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  together: 'https://api.together.xyz/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
}

function apiUrl(type: string, baseUrl?: string) {
  if (type === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta'
  if (type === 'anthropic') return (baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '')
  return (baseUrl || defaults[type] || '').replace(/\/$/, '')
}

async function readError(response: Response) {
  const text = await response.text()
  try {
    const json = JSON.parse(text)
    return json?.error?.message || json?.message || text.slice(0, 500)
  } catch {
    return text.slice(0, 500) || `HTTP ${response.status}`
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const { user } = await authenticate(req)
    const providerId = typeof req.body?.providerId === 'string' ? req.body.providerId : ''
    if (!providerId) return res.status(400).json({ success: false, message: 'providerId مطلوب' })

    const admin = getAdminClient()
    const { data: provider, error } = await admin
      .from('providers')
      .select('id,name,type,base_url,model,encrypted_key')
      .eq('id', providerId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!provider) return res.status(404).json({ success: false, message: 'المزود غير موجود' })

    const apiKey = decryptSecret(provider.encrypted_key)
    let models: string[] = []
    let message = 'تم الاتصال بنجاح'

    if (provider.type === 'gemini') {
      const response = await fetch(`${apiUrl('gemini')}/models?key=${encodeURIComponent(apiKey)}`)
      if (!response.ok) throw new Error(await readError(response))
      const data = await response.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> }
      models = (data.models || [])
        .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
        .map(model => (model.name || '').replace(/^models\//, ''))
        .filter(Boolean)
    } else if (provider.type === 'anthropic') {
      const response = await fetch(`${apiUrl('anthropic')}/models`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      })
      if (!response.ok) throw new Error(await readError(response))
      const data = await response.json() as { data?: Array<{ id?: string }> }
      models = (data.data || []).map(model => model.id || '').filter(Boolean)
    } else {
      const response = await fetch(`${apiUrl(provider.type, provider.base_url)}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!response.ok) throw new Error(await readError(response))
      const data = await response.json() as { data?: Array<{ id?: string }> }
      models = (data.data || []).map(model => model.id || '').filter(Boolean)
    }

    const now = new Date().toISOString()
    await admin.from('providers').update({
      status: 'connected',
      last_tested_at: now,
      error_message: null,
      models,
      updated_at: now,
    }).eq('id', provider.id).eq('user_id', user.id)

    return res.status(200).json({ success: true, message, models, testedAt: now })
  } catch (error) {
    const message = errorMessage(error)
    return res.status(message.includes('جلسة') ? 401 : 400).json({ success: false, message })
  }
}
