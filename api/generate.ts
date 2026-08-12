import type { IncomingMessage, ServerResponse } from 'node:http'
import { configFromEnv, generateCore, isAuthorized } from '../server/cloudinaryGenerate'
import type { GenerateInput } from '../server/cloudinaryGenerate'

/**
 * Vercel serverless function for Cloudinary image generation. Reads
 * CLOUDINARY_* env vars from the Vercel project settings — the API secret
 * never reaches the browser. Generation + persist can take ~10-40s, hence
 * maxDuration (supported on the Hobby plan).
 */
export const config = { maxDuration: 60 }

type VercelReq = IncomingMessage & { body?: unknown; method?: string }
type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes
  json: (body: unknown) => void
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!isAuthorized(req.headers.authorization)) {
    res.status(401).json({ error: 'Sign in required' })
    return
  }
  // Vercel parses JSON bodies; tolerate a raw string just in case.
  let input: GenerateInput = {}
  try {
    input = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as GenerateInput
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }
  const cfg = configFromEnv(process.env as Record<string, string>)
  const result = await generateCore(cfg, input)
  res.status(result.status).json(result.body)
}
