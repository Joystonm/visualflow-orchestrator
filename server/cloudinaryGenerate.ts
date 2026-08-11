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
 * Download the freshly generated image. Temp URLs are short-lived and can lag
 * behind the generation response by a few seconds — retry briefly, and send
 * account auth in case the storage endpoint requires it.
 */
async function downloadAsset(
  cfg: CloudinaryGenConfig,
  tempUrl: string,
): Promise<{ contentType: string; base64: string } | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000))
    try {
      const imgRes = await fetch(tempUrl, {
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64'),
        },
        signal: AbortSignal.timeout(60_000),
      })
      if (!imgRes.ok) {
        console.warn(`[visualflow] temp asset download attempt ${attempt + 1}: HTTP ${imgRes.status}`)
        continue
      }
      const buf = Buffer.from(await imgRes.arrayBuffer())
      // The stream endpoint serves application/octet-stream — sniff magic bytes.
      const contentType =
        buf[0] === 0x89 && buf[1] === 0x50
          ? 'image/png'
          : buf[0] === 0xff && buf[1] === 0xd8
            ? 'image/jpeg'
            : buf.subarray(8, 12).toString() === 'WEBP'
              ? 'image/webp'
              : null
      if (!contentType || buf.length < 1000) {
        console.warn(`[visualflow] temp asset download attempt ${attempt + 1}: not an image (${buf.length} bytes)`)
        continue
      }
      return { contentType, base64: buf.toString('base64') }
    } catch (err) {
      console.warn('[visualflow] temp asset download error:', err instanceof Error ? err.message : err)
    }
  }
  return null
}

/**
 * Persist a generated image permanently via the signed Upload API. The
 * generation endpoint's temporary URLs expire within minutes, which would
 * break version history — so the adapter re-uploads the downloaded bytes.
 */
async function persistAsset(
  cfg: CloudinaryGenConfig,
  contentType: string,
  base64: string,
): Promise<{ secure_url: string; public_id: string } | null> {
  try {
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

/**
 * Per-role model + resolution policy to minimize credit usage. The base plate
 * and cutouts need the photorealistic flux standard model at full resolution
 * (cutouts get chroma-keyed, so clean edges matter); overlays are soft
 * light/weather passes that screen-blend, so the cheaper nano-banana model at
 * reduced resolution is indistinguishable. Standard tier everywhere — premium
 * models cost multiples more. CLOUDINARY_GEN_MODEL_FAMILY (/_TIER) env vars
 * apply only to requests without a known role.
 */
const LAYER_GEN: Record<string, { family: string; tier: string; scale: number }> = {
  base: { family: 'flux', tier: 'standard', scale: 1 },
  cutout: { family: 'flux', tier: 'standard', scale: 1 },
  overlay: { family: 'nano-banana', tier: 'standard', scale: 0.65 },
}

const snap8 = (n: number) => Math.max(256, Math.round(n / 8) * 8)

export function createGenerateHandler(cfg: CloudinaryGenConfig) {
  const enabled = !!(cfg.cloudName && cfg.apiKey && cfg.apiSecret)

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
    if (!enabled) return json(res, 501, { error: 'Cloudinary image generation is not configured' })

    try {
      const { prompt, width, height, seed, role } = JSON.parse(await readBody(req)) as {
        prompt?: string
        width?: number
        height?: number
        seed?: number
        role?: string
      }
      if (!prompt || typeof prompt !== 'string') return json(res, 400, { error: 'Missing prompt' })

      const policy = (role && LAYER_GEN[role]) || {
        family: cfg.modelFamily,
        tier: cfg.modelTier,
        scale: 1,
      }
      const genWidth = snap8((width ?? 1024) * policy.scale)
      const genHeight = snap8((height ?? 1024) * policy.scale)

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
            model: { family: policy.family, tier: policy.tier },
            image_size: { width: genWidth, height: genHeight },
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
      const quotaOut = quota ? { remaining: quota.remaining, limit: quota.limit } : null

      // Temp URLs die within minutes and lack CORS headers (they break canvas
      // compositing) — download immediately, then persist via signed upload.
      const bytes = await downloadAsset(cfg, tempUrl)
      if (!bytes) {
        return json(res, 502, { error: 'Generated image could not be downloaded before expiry' })
      }
      const persisted = await persistAsset(cfg, bytes.contentType, bytes.base64)
      if (persisted) {
        return json(res, 200, { url: persisted.secure_url, publicId: persisted.public_id, quota: quotaOut })
      }
      // Persistence denied (e.g. restricted API key): return the bytes as a
      // data URL — same-origin-safe for canvas compositing, never expires.
      console.warn('[visualflow] persistence unavailable — returning data URL (fix API key permissions for stable URLs)')
      return json(res, 200, {
        url: `data:${bytes.contentType};base64,${bytes.base64}`,
        publicId: null,
        quota: quotaOut,
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
