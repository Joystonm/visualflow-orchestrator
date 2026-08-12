import type { IncomingMessage, ServerResponse } from 'node:http'
import { loginCore } from '../server/cloudinaryGenerate'
import type { LoginInput } from '../server/cloudinaryGenerate'

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
  res.status(result.status).json(result.body)
}
