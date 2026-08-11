/**
 * Cloudinary asset layer. Uses only client-safe values (cloud name + unsigned
 * upload preset) from env. When unconfigured, VisualFlow keeps working with
 * source generation URLs — Cloudinary is an enhancement, not a hard dependency.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

export function cloudinaryEnabled(): boolean {
  return !!(CLOUD_NAME && UPLOAD_PRESET)
}

export interface CloudinaryAsset {
  secureUrl: string
  publicId: string
}

/** Unsigned upload of a remote URL or data URL. Returns null when disabled or on failure. */
export async function uploadAsset(fileUrl: string, folder = 'visualflow'): Promise<CloudinaryAsset | null> {
  if (!cloudinaryEnabled()) return null
  try {
    const form = new FormData()
    form.append('file', fileUrl)
    form.append('upload_preset', UPLOAD_PRESET!)
    form.append('folder', folder)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) return null
    const data = await res.json()
    return { secureUrl: data.secure_url, publicId: data.public_id }
  } catch {
    return null
  }
}

/** Optimized delivery URL (f_auto,q_auto) for a Cloudinary public id. */
export function deliveryUrl(publicId: string, width?: number): string {
  const t = ['f_auto', 'q_auto', width ? `w_${width}` : null].filter(Boolean).join(',')
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${t}/${publicId}`
}
