import type { VercelRequest, VercelResponse } from './_lib/vercel'
import { methodNotAllowed, setJsonHeaders } from './_lib/http'

export default function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res)
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  return res.status(200).json({ status: 'ok', service: 'moataz-ai', timestamp: new Date().toISOString() })
}
