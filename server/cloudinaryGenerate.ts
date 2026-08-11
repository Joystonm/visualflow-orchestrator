import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/**
 * Minimal server-side adapter for the Cloudinary Image Generation add-on
 * (https://cloudinary.com/documentation/image_generation_addon).
 *
 * The add-on requires Basic auth with the account's API key + secret, which
 * must never reach the browser — so the browser calls POST /api/generate and
 * this middleware (running inside the Vite dev/preview server) signs the
 * upstream request. For Vercel/Netlify, port this handler to a serverless
 * function and keep the same env var names.
 */

export interface CloudinaryGenConfig {
  cloudName?: string
  apiKey?: string
  apiSecret?: string
  modelFamily: string
  modelTier: string
}

export function configFromEnv(env: Record<string, string>): CloudinaryGenConfig {
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME || env.VITE_CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
    modelFamily: env.CLOUDINARY_GEN_MODEL_FAMILY || 'flux',
    modelTier: env.CLOUDINARY_GEN_MODEL_TIER || 'standard',
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function createGenerateHandler(cfg: CloudinaryGenConfig) {
  const enabled = !!(cfg.cloudName && cfg.apiKey && cfg.apiSecret)

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
    if (!enabled) return json(res, 501, { error: 'Cloudinary image generation is not configured' })

    try {
      const { prompt, width, height, seed } = JSON.parse(await readBody(req)) as {
        prompt?: string
        width?: number
        height?: number
        seed?: number
      }
      if (!prompt || typeof prompt !== 'string') return json(res, 400, { error: 'Missing prompt' })

      const upstream = await fetch(
        `https://api.cloudinary.com/v2/generate/${cfg.cloudName}/text_to_image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Basic ' + Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64'),
          },
          body: JSON.stringify({
            prompt: prompt.slice(0, 1000),
            model: { family: cfg.modelFamily, tier: cfg.modelTier },
            image_size: { width, height },
            ...(typeof seed === 'number' ? { seed } : {}),
            target: {
              target_type: 'managed_asset',
              public_id: `visualflow/gen_${Date.now()}_${seed ?? Math.floor(Math.random() * 1e6)}`,
            },
          }),
          signal: AbortSignal.timeout(90_000),
        },
      )

      const text = await upstream.text()
      if (!upstream.ok) {
        console.error(`[visualflow] Cloudinary generation failed (${upstream.status}):`, text.slice(0, 400))
        return json(res, upstream.status, {
          error: `Cloudinary generation failed (${upstream.status})`,
          detail: text.slice(0, 400),
        })
      }

      // Tolerate minor response-shape differences across add-on versions.
      const data = JSON.parse(text) as Record<string, any>
      const asset = data.asset ?? data.data ?? data.result ?? data
      const url: string | undefined = asset.secure_url ?? asset.url
      const publicId: string | null = asset.public_id ?? null
      if (!url) {
        console.error('[visualflow] Unexpected Cloudinary response shape:', text.slice(0, 400))
        return json(res, 502, { error: 'Unexpected Cloudinary response shape' })
      }
      return json(res, 200, { url, publicId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      console.error('[visualflow] /api/generate error:', message)
      return json(res, 500, { error: message })
    }
  }
}

export function cloudinaryGeneratePlugin(env: Record<string, string>): Plugin {
  const handler = createGenerateHandler(configFromEnv(env))
  return {
    name: 'visualflow-cloudinary-generate',
    configureServer(server) {
      server.middlewares.use('/api/generate', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/generate', handler)
    },
  }
}
