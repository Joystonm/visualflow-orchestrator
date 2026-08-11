import type { AspectRatio, Layer, LayerRole } from '../../types'
import { RATIO_SIZES } from '../generation/pollinations'
import { getFilter, transformedUrl } from '../cloudinary/filters'

/**
 * Real client-side layer compositing:
 * - base paints opaque (the backdrop plate)
 * - cutouts are generated on a flat green screen, chroma-keyed to
 *   transparency here, and pasted as true cutouts
 * - overlays are generated on pure black and screen-blended (light passes)
 * Layers paint in array order. Toggling or regenerating one layer
 * recomposites without touching the rest.
 */

interface BlendSpec {
  mode: GlobalCompositeOperation
  opacity: number
  /** Chroma-key the green screen to transparency before drawing. */
  chroma?: boolean
}

export const LAYER_BLEND: Record<LayerRole, BlendSpec> = {
  base: { mode: 'source-over', opacity: 1 },
  cutout: { mode: 'source-over', opacity: 1, chroma: true },
  overlay: { mode: 'screen', opacity: 0.75 },
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(url: string): Promise<HTMLImageElement> {
  let cached = imageCache.get(url)
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load layer image'))
      img.src = url
    })
    imageCache.set(url, cached)
    cached.catch(() => imageCache.delete(url))
  }
  return cached
}

interface KeyedAsset {
  canvas: HTMLCanvasElement
  /** Fraction of pixels that stayed opaque (≈1 means the model ignored the green screen). */
  opaqueRatio: number
  /** Bounding box of the remaining content, or null if nothing survived. */
  bbox: { x: number; y: number; w: number; h: number } | null
}

const keyedCache = new Map<string, KeyedAsset>()

/**
 * Key a green-screen render to transparency. Pixels where green clearly
 * dominates red/blue become transparent, with a feathered edge and green
 * spill suppression on what remains. Also measures the surviving content so
 * the compositor can place cutouts like real layers.
 */
function chromaKey(img: HTMLImageElement, cacheKey: string): KeyedAsset {
  const hit = keyedCache.get(cacheKey)
  if (hit) return hit

  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const px = data.data
  let opaque = 0
  let minX = c.width
  let minY = c.height
  let maxX = -1
  let maxY = -1
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]
    const g = px[i + 1]
    const b = px[i + 2]
    const greenness = g - Math.max(r, b)
    if (greenness > 45) {
      px[i + 3] = 0
      continue
    }
    if (greenness > 15) {
      // Feathered edge + despill.
      px[i + 3] = Math.round(px[i + 3] * (1 - (greenness - 15) / 30))
      px[i + 1] = Math.max(r, b)
    } else if (greenness > 0) {
      px[i + 1] = Math.min(g, Math.max(r, b) + 15)
    }
    if (px[i + 3] > 40) {
      opaque++
      const p = i / 4
      const x = p % c.width
      const y = (p / c.width) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  ctx.putImageData(data, 0, 0)

  const result: KeyedAsset = {
    canvas: c,
    opaqueRatio: opaque / (c.width * c.height),
    bbox: maxX >= 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null,
  }
  if (keyedCache.size > 60) keyedCache.clear()
  keyedCache.set(cacheKey, result)
  return result
}

export interface CompositeResult {
  dataUrl: string
  canvas: HTMLCanvasElement
}

export async function compositeLayers(
  layers: Layer[],
  ratio: AspectRatio,
  opts: { scale?: number; format?: 'png' | 'jpeg'; quality?: number } = {},
): Promise<CompositeResult> {
  const { width, height } = RATIO_SIZES[ratio]
  const scale = opts.scale ?? 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const ordered = layers.filter((l) => l.visible && !!l.assetUrl && l.status === 'complete')

  for (const layer of ordered) {
    try {
      // Filters: Cloudinary assets get a real URL transformation; everything
      // else gets the equivalent canvas filter. Both are non-destructive.
      const preset = getFilter(layer.filter)
      const cloudinaryFiltered = preset ? transformedUrl(layer.assetUrl!, preset) : null
      let sourceUrl = layer.assetUrl!
      let cssFilter = 'none'
      if (preset && cloudinaryFiltered) {
        try {
          await loadImage(cloudinaryFiltered)
          sourceUrl = cloudinaryFiltered
        } catch {
          cssFilter = preset.css // transformation URL failed — fall back to canvas
        }
      } else if (preset) {
        cssFilter = preset.css
      }

      const img = await loadImage(sourceUrl)
      const blend = LAYER_BLEND[layer.role]
      ctx.globalCompositeOperation = blend.mode
      ctx.globalAlpha = blend.opacity * layer.opacity
      ctx.filter = cssFilter
      if (blend.chroma) {
        const keyed = chromaKey(img, sourceUrl)
        // If the model ignored the green screen (nearly everything opaque),
        // fall back to lighten blending so it doesn't blot out the backdrop.
        if (keyed.opaqueRatio > 0.95) {
          ctx.globalCompositeOperation = 'lighten'
          ctx.globalAlpha = 0.85 * layer.opacity
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        } else {
          ctx.drawImage(keyed.canvas, 0, 0, canvas.width, canvas.height)
        }
      } else {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      }
      ctx.filter = 'none'
    } catch {
      // A layer that fails to load is skipped rather than sinking the composition.
    }
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.filter = 'none'

  const format = opts.format ?? 'jpeg'
  const dataUrl = canvas.toDataURL(`image/${format}`, opts.quality ?? 0.92)
  return { dataUrl, canvas }
}

export async function makeThumbnail(layers: Layer[], ratio: AspectRatio): Promise<string> {
  const { width } = RATIO_SIZES[ratio]
  const { dataUrl } = await compositeLayers(layers, ratio, {
    scale: 240 / width,
    format: 'jpeg',
    quality: 0.7,
  })
  return dataUrl
}

export function downloadComposite(canvas: HTMLCanvasElement, name: string, format: 'png' | 'jpg') {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  canvas.toBlob(
    (blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}.${format}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    },
    mime,
    0.95,
  )
}
