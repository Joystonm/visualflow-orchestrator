import type { AspectRatio, Layer, LayerType } from '../../types'
import { RATIO_SIZES } from '../generation/pollinations'
import { LAYER_ORDER } from '../generation/scenePlanner'

/**
 * Real client-side layer compositing. The background paints opaque; every other
 * layer is generated "on pure black" and blended in — lighten for solid elements,
 * screen for light/atmosphere passes — so toggling or regenerating one layer
 * recomposites without touching the rest.
 */

interface BlendSpec {
  mode: GlobalCompositeOperation
  opacity: number
}

export const LAYER_BLEND: Record<LayerType, BlendSpec> = {
  background: { mode: 'source-over', opacity: 1 },
  environment: { mode: 'lighten', opacity: 0.85 },
  subject: { mode: 'lighten', opacity: 1 },
  foreground: { mode: 'lighten', opacity: 0.9 },
  lighting: { mode: 'screen', opacity: 0.7 },
  atmosphere: { mode: 'screen', opacity: 0.45 },
  effects: { mode: 'screen', opacity: 0.8 },
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

  const ordered = LAYER_ORDER.map((t) => layers.find((l) => l.type === t)).filter(
    (l): l is Layer => !!l && l.visible && !!l.assetUrl && l.status === 'complete',
  )

  for (const layer of ordered) {
    try {
      const img = await loadImage(layer.assetUrl!)
      const blend = LAYER_BLEND[layer.type]
      ctx.globalCompositeOperation = blend.mode
      ctx.globalAlpha = blend.opacity * layer.opacity
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    } catch {
      // A layer that fails to load is skipped rather than sinking the composition.
    }
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1

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
