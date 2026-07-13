import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from './vercel'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'request_error',
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function setJsonHeaders(res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Request-Id', randomUUID())
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

export function methodNotAllowed(res: VercelResponse, methods: string[]) {
  res.setHeader('Allow', methods.join(', '))
  return res.status(405).json({ error: 'الطريقة غير مسموحة', code: 'method_not_allowed' })
}

export function getBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

export function requireString(value: unknown, field: string, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new ApiError(400, `الحقل ${field} مطلوب أو غير صالح`, 'validation_error', { field })
  }
  return value.trim()
}

export function optionalString(value: unknown, maxLength = 200): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new ApiError(400, 'قيمة نصية غير صالحة', 'validation_error')
  }
  return value.trim() || undefined
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع'
}

export function sendError(res: VercelResponse, error: unknown) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ error: error.message, code: error.code, details: error.details })
  }

  const message = errorMessage(error)
  console.error('[api-error]', { message, error })
  return res.status(500).json({ error: 'حدث خطأ داخلي غير متوقع', code: 'internal_error' })
}
