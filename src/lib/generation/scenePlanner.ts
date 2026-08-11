import type { LayerType, ScenePlan } from '../../types'
import { generateText } from './pollinations'

export const LAYER_ORDER: LayerType[] = [
  'background',
  'environment',
  'subject',
  'foreground',
  'lighting',
  'atmosphere',
  'effects',
]

export const LAYER_LABELS: Record<LayerType, string> = {
  background: 'Background',
  environment: 'Environment',
  subject: 'Subject',
  foreground: 'Foreground',
  lighting: 'Lighting',
  atmosphere: 'Atmosphere',
  effects: 'Effects',
}

const PLANNER_SYSTEM = `You are the Scene Director of a layered AI compositing tool.
Break the user's visual prompt into layers. Respond with ONLY valid JSON, no markdown:
{"scene":"<one-line scene summary>","layers":[{"type":"background|environment|subject|foreground|lighting|atmosphere|effects","description":"<short visual description of just this layer>"}]}
Rules: always include background, lighting and effects. Include subject only if the scene implies a focal subject. Include environment for mid-ground detail. Include atmosphere for haze/mood. 5-7 layers total. Descriptions are concise visual phrases, not sentences.`

/** Deterministic fallback so the demo never blocks on the LLM. */
export function fallbackPlan(prompt: string): ScenePlan {
  const p = prompt.trim()
  return {
    scene: p,
    layers: [
      { type: 'background', description: `the distant backdrop, skyline and sky of ${p}` },
      { type: 'environment', description: `the mid-ground setting, architecture and signage of ${p}` },
      { type: 'subject', description: `the single most striking focal subject of ${p}` },
      { type: 'lighting', description: `the dominant light sources, glow and color grade of ${p}` },
      { type: 'atmosphere', description: `the haze, mood and depth of ${p}` },
      { type: 'effects', description: `the weather, particles and visual effects of ${p}` },
    ],
  }
}

const VALID_TYPES = new Set<string>(LAYER_ORDER)

export async function planScene(prompt: string): Promise<{ plan: ScenePlan; source: 'llm' | 'fallback' }> {
  try {
    const raw = await generateText(PLANNER_SYSTEM, prompt)
    const jsonText = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(jsonText)
    const rawLayers: unknown[] = Array.isArray(parsed.layers) ? parsed.layers : []
    const layers: { type: LayerType; description: string }[] = rawLayers
      .filter((l): l is { type: string; description: string } => {
        const c = l as { type?: unknown; description?: unknown }
        return typeof c?.type === 'string' && VALID_TYPES.has(c.type) && typeof c?.description === 'string'
      })
      .map((l) => ({ type: l.type as LayerType, description: l.description }))
    // Dedupe by type, keep layer paint order stable.
    const byType = new Map<LayerType, { type: LayerType; description: string }>(layers.map((l) => [l.type, l]))
    const ordered = LAYER_ORDER.filter((t) => byType.has(t)).map((t) => byType.get(t)!)
    if (ordered.length < 3 || !byType.has('background')) throw new Error('Plan too sparse')
    return {
      plan: { scene: typeof parsed.scene === 'string' ? parsed.scene : prompt, layers: ordered },
      source: 'llm',
    }
  } catch {
    return { plan: fallbackPlan(prompt), source: 'fallback' }
  }
}

/* ------------------------------------------------------------------ */
/* Refinement intent routing                                           */
/* ------------------------------------------------------------------ */

const LAYER_KEYWORDS: Record<LayerType, string[]> = {
  background: ['background', 'sky', 'skyline', 'horizon', 'backdrop', 'city', 'mountains', 'distance', 'buildings'],
  environment: ['environment', 'street', 'signs', 'sign', 'storefront', 'road', 'trees', 'architecture', 'surroundings', 'setting'],
  subject: ['subject', 'person', 'character', 'man', 'woman', 'figure', 'umbrella', 'car', 'product', 'model', 'hero', 'protagonist', 'people'],
  foreground: ['foreground', 'front', 'closest', 'framing'],
  lighting: ['light', 'lighting', 'neon', 'glow', 'golden', 'sunset', 'sunrise', 'dark', 'darker', 'bright', 'brighter', 'shadow', 'color', 'colours', 'blue', 'red', 'warm', 'cold', 'cool', 'moody', 'contrast', 'hour'],
  atmosphere: ['atmosphere', 'fog', 'mist', 'haze', 'mood', 'depth', 'air', 'smog'],
  effects: ['rain', 'rainy', 'snow', 'storm', 'particles', 'smoke', 'sparks', 'effects', 'effect', 'lens', 'flare', 'bokeh', 'dust', 'fireflies', 'heavier', 'wind'],
}

const WHOLE_SCENE_KEYWORDS = ['everything', 'whole scene', 'entire scene', 'all layers', 'completely', 'start over', 'whole image', 'entire image', 'cinematic', 'style', 'redo']

export interface RefinementIntent {
  affected: LayerType[]
  wholeScene: boolean
}

/** Route a chat refinement to the layers it affects. Deterministic so the demo never misroutes. */
export function analyzeRefinement(message: string, availableLayers: LayerType[]): RefinementIntent {
  const text = message.toLowerCase()
  if (WHOLE_SCENE_KEYWORDS.some((k) => text.includes(k))) {
    return { affected: availableLayers, wholeScene: true }
  }
  const affected = new Set<LayerType>()
  for (const type of availableLayers) {
    if (LAYER_KEYWORDS[type].some((k) => new RegExp(`\\b${k}\\b`).test(text))) affected.add(type)
  }
  if (affected.size === 0) {
    // Unrecognized request: treat as a style pass on lighting + atmosphere.
    for (const t of ['lighting', 'atmosphere'] as LayerType[]) {
      if (availableLayers.includes(t)) affected.add(t)
    }
  }
  return { affected: LAYER_ORDER.filter((t) => affected.has(t)), wholeScene: false }
}
