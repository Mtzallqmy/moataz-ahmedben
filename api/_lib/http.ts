import type { VercelRequest, VercelResponse } from '@vercel/node'

export function setJsonHeaders(res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
}

export function methodNotAllowed(res: VercelResponse, methods: string[]) {
  res.setHeader('Allow', methods.join(', '))
  return res.status(405).json({ error: 'الطريقة غير مسموحة' })
}

export function getBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

export function requireString(value: unknown, field: string, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`الحقل ${field} مطلوب أو غير صالح`)
  }
  return value.trim()
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع'
}

