import type { IncomingMessage, ServerResponse } from 'node:http'

export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[] | undefined>
  cookies: Record<string, string>
  body: any
}

export interface VercelResponse extends ServerResponse {
  status(statusCode: number): VercelResponse
  json(body: unknown): VercelResponse
  send(body: unknown): VercelResponse
  redirect(statusOrUrl: number | string, url?: string): VercelResponse
}
