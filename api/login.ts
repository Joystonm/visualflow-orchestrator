import type { IncomingMessage, ServerResponse } from 'node:http'
import { loginCore } from '../server/cloudinaryGenerate'
import type { LoginInput } from '../server/cloudinaryGenerate'

/**
 * Vercel serverless function — judge sign-in gate.
 * Validates credentials server-side so /api/generate can't be called
 * without a valid session token.
 */
export const config = { maxDuration: 10 }

type VercelReq = IncomingMessage & { body?: unknown; method?: string }
type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes
  json: (body: unknown) => void
}

export default function handler(req: VercelReq, res: VercelRes) {
  try {
    console.log('[login] Request method:', req.method)
    console.log('[login] Request body type:', typeof req.body)
    
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }
    let input: LoginInput = {}
    try {
      input = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as LoginInput
      console.log('[login] Parsed input, has email:', !!input.email, 'has password:', !!input.password)
    } catch (parseErr) {
      console.error('[login] Body parse error:', parseErr)
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      return
    }
    const result = loginCore(input)
    console.log('[login] loginCore result status:', result.status)
    res.statusCode = result.status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result.body))
  } catch (err) {
    console.error('[login] handler error:', err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal server error', details: err instanceof Error ? err.message : String(err) }))
  }
}
