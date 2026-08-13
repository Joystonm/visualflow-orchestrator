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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  let input: LoginInput = {}
  try {
    input = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as LoginInput
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }
  const result = loginCore(input)
  res.status(result.status as number).json(result.body)
}
