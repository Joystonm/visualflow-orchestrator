import type { IncomingMessage, ServerResponse } from 'node:http'

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

interface LoginInput {
  email?: string
  password?: string
}

// Credentials with defaults - override via VF_AUTH_EMAIL / VF_AUTH_PASSWORD env vars
const AUTH_EMAIL = (process.env.VF_AUTH_EMAIL || 'visualfloworchestrator@gmail.com').toLowerCase()
const AUTH_PASSWORD = process.env.VF_AUTH_PASSWORD || 'visualfloworchestrator567'

function validateCredentials(input: LoginInput): { status: number; body: unknown } {
  if (
    typeof input.email === 'string' &&
    typeof input.password === 'string' &&
    input.email.trim().toLowerCase() === AUTH_EMAIL &&
    input.password === AUTH_PASSWORD
  ) {
    return { status: 200, body: { ok: true } }
  }
  return { status: 401, body: { error: 'Invalid credentials' } }
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
    const result = validateCredentials(input)
    console.log('[login] validation result status:', result.status)
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
