import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
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

/**
 * Persist a generated image permanently via the signed Upload API. The
 * generation endpoint's temporary URLs expire after ~1 hour, which would break
 * version history — so the adapter downloads the bytes and re-uploads them.
 */
async function persistAsset(
  cfg: CloudinaryGenConfig,
  tempUrl: string,
): Promise<{ secure_url: string; public_id: string } | null> {
  try {
    const imgRes = await fetch(tempUrl, { signal: AbortSignal.timeout(60_000) })
    if (!imgRes.ok) return null
    const contentType = imgRes.headers.get('content-type') ?? 'image/png'
    const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64')

    const timestamp = Math.floor(Date.now() / 1000)
    const folder = 'visualflow'
    const signature = createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${cfg.apiSecret}`)
      .digest('hex')

    const form = new FormData()
    form.append('file', `data:${contentType};base64,${base64}`)
    form.append('api_key', cfg.apiKey!)
    form.append('timestamp', String(timestamp))
    form.append('folder', folder)
    form.append('signature', signature)

    const upRes = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
    if (!upRes.ok) {
      console.error('[visualflow] persist upload failed:', (await upRes.text()).slice(0, 300))
      return null
    }
    const data = (await upRes.json()) as { secure_url?: string; public_id?: string }
    return data.secure_url && data.public_id
      ? { secure_url: data.secure_url, public_id: data.public_id }
      : null
  } catch (err) {
    console.error('[visualflow] persist error:', err instanceof Error ? err.message : err)
    return null
  }
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
            // managed_asset fails with MG_00503 on some accounts; generate as
            // temporary, then persist via the signed Upload API below.
            target: { target_type: 'temporary' },
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

      // Response shape: { data: { assets: [{ storage: { secure_url }, ... }] }, limits: ... }
      const data = JSON.parse(text) as Record<string, any>
      const genAsset = data.data?.assets?.[0] ?? data.asset ?? data
      const tempUrl: string | undefined =
        genAsset?.storage?.secure_url ?? genAsset?.secure_url ?? genAsset?.url
      if (!tempUrl) {
        console.error('[visualflow] Unexpected Cloudinary response shape:', text.slice(0, 400))
        return json(res, 502, { error: 'Unexpected Cloudinary response shape' })
      }

      const quota = data.limits?.addons_quota?.find?.(
        (q: { type?: string }) => q.type === 'image_generation',
      )
      if (quota) console.log(`[visualflow] image_generation quota: ${quota.remaining}/${quota.limit} remaining`)

      const persisted = await persistAsset(cfg, tempUrl)
      // Fall back to the temporary URL (valid ~1h) if persistence fails —
      // better a working demo now than a hard error.
      return json(res, 200, {
        url: persisted?.secure_url ?? tempUrl,
        publicId: persisted?.public_id ?? null,
      })
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
