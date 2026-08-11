/**
 * Filter presets applied non-destructively at composite time. Layers stored in
 * Cloudinary get a real delivery-URL transformation (the Cloudinary way);
 * local/data-URL layers get the equivalent canvas filter so the feature works
 * regardless of storage backend. No regeneration, no credits.
 */

export interface FilterPreset {
  key: string
  label: string
  /** Cloudinary transformation segment inserted into the delivery URL. */
  cloudinary: string
  /** Canvas 2D ctx.filter equivalent for non-Cloudinary assets. */
  css: string
}

export const FILTER_PRESETS: FilterPreset[] = [
  { key: 'mono', label: 'Mono', cloudinary: 'e_grayscale', css: 'grayscale(1)' },
  { key: 'noir', label: 'Noir', cloudinary: 'e_grayscale,e_contrast:50', css: 'grayscale(1) contrast(1.4)' },
  { key: 'sepia', label: 'Sepia', cloudinary: 'e_sepia', css: 'sepia(0.8)' },
  { key: 'vivid', label: 'Vivid', cloudinary: 'e_vibrance:70,e_saturation:20', css: 'saturate(1.5)' },
  { key: 'warm', label: 'Warm', cloudinary: 'e_sepia:30,e_saturation:15', css: 'sepia(0.3) saturate(1.25)' },
  { key: 'cool', label: 'Cool', cloudinary: 'e_hue:20,e_saturation:10', css: 'hue-rotate(15deg) saturate(1.15)' },
  { key: 'dream', label: 'Dream', cloudinary: 'e_blur:200,e_brightness:10', css: 'blur(2px) brightness(1.1)' },
]

export function getFilter(key: string | undefined | null): FilterPreset | null {
  if (!key) return null
  return FILTER_PRESETS.find((f) => f.key === key) ?? null
}

/** Insert a transformation into an existing Cloudinary delivery URL, if it is one. */
export function transformedUrl(assetUrl: string, preset: FilterPreset): string | null {
  if (!assetUrl.includes('/image/upload/')) return null
  return assetUrl.replace('/image/upload/', `/image/upload/${preset.cloudinary}/`)
}
