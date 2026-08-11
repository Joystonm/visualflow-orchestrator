import type { AspectRatio } from '../../types'

/**
 * Image + text generation via Pollinations.ai — free, keyless, browser-safe.
 * No secrets required, so nothing can leak client-side. Calls are routed
 * through the dev server proxy (/api/*) because Pollinations rejects
 * cross-origin browser requests.
 */

export const RATIO_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '4:5': { width: 896, height: 1120 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
}

export function imageUrl(prompt: string, ratio: AspectRatio, seed: number): string {
  const { width, height } = RATIO_SIZES[ratio]
  const encoded = encodeURIComponent(prompt.slice(0, 800))
  return `/api/image/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=turbo`
}

/**
 * Pollinations' anonymous tier allows only one concurrent generation — parallel
 * requests 429. Agents still run concurrently at the orchestration level; the
 * image calls funnel through this single-slot queue with retry + backoff.
 */
let queueTail: Promise<unknown> = Promise.resolve()
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueTail.then(fn, fn)
  queueTail = run.catch(() => {})
  return run
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const RETRY_DELAYS = [0, 2500, 6000, 12000]

/** Generate an image (queued + retried) and return its stable URL, cache-warmed. */
export function generateImage(
  prompt: string,
  ratio: AspectRatio,
  seed: number,
  signal?: AbortSignal,
): Promise<string> {
  const url = imageUrl(prompt, ratio, seed)
  return enqueue(async () => {
    let lastError: Error = new Error('Image generation failed')
    for (const delay of RETRY_DELAYS) {
      if (delay > 0) await sleep(delay)
      if (signal?.aborted) throw new Error('Aborted')
      try {
        const res = await fetch(url, { signal })
        if (!res.ok) {
          lastError = new Error(res.status === 429 ? 'Rate limited' : `Generation failed (${res.status})`)
          continue
        }
        const blob = await res.blob()
        if (!blob.type.startsWith('image/')) {
          lastError = new Error('Generator returned a non-image response')
          continue
        }
        return url
      } catch (err) {
        if (signal?.aborted) throw err
        lastError = err instanceof Error ? err : new Error('Network error')
      }
    }
    throw lastError
  })
}

/** Small LLM call for scene planning. Throws on failure — callers must fall back. */
export async function generateText(system: string, user: string, timeoutMs = 25000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('/api/text/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Text generation failed (${res.status})`)
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new Error('Empty LLM response')
    return content
  } finally {
    clearTimeout(timer)
  }
}
