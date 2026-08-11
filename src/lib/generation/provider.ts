import type { AspectRatio } from '../../types'
import { RATIO_SIZES, generateImage as pollinationsGenerate } from './pollinations'

/**
 * Image provider abstraction. Primary: Cloudinary Image Generation add-on via
 * the server-side /api/generate adapter (API secret never reaches the browser).
 * Fallback: Pollinations (keyless). Any Cloudinary failure falls back for that
 * call so a demo never stalls on quota or configuration issues.
 */

export interface GeneratedAsset {
  assetUrl: string
  cloudinaryPublicId: string | null
  provider: 'cloudinary' | 'pollinations'
}

/** Set once the server reports 501 (add-on not configured) — skips pointless calls. */
let cloudinaryUnavailable = false

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function tryCloudinary(
  prompt: string,
  ratio: AspectRatio,
  seed: number,
  signal?: AbortSignal,
): Promise<GeneratedAsset | null> {
  const { width, height } = RATIO_SIZES[ratio]
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(2000)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, width, height, seed }),
        signal,
      })
      if (res.status === 501) {
        cloudinaryUnavailable = true
        return null
      }
      if (!res.ok) continue
      const data = await res.json()
      if (typeof data.url !== 'string') continue
      return { assetUrl: data.url, cloudinaryPublicId: data.publicId ?? null, provider: 'cloudinary' }
    } catch (err) {
      if (signal?.aborted) throw err
    }
  }
  return null
}

export async function generateLayerImage(
  prompt: string,
  ratio: AspectRatio,
  seed: number,
  signal?: AbortSignal,
): Promise<GeneratedAsset> {
  if (!cloudinaryUnavailable) {
    const asset = await tryCloudinary(prompt, ratio, seed, signal)
    if (asset) return asset
  }
  const url = await pollinationsGenerate(prompt, ratio, seed, signal)
  return { assetUrl: url, cloudinaryPublicId: null, provider: 'pollinations' }
}
