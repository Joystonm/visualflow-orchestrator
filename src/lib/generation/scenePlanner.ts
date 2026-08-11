import type { Layer, LayerRole, ScenePlan, ScenePlanLayer } from '../../types'
import { generateText } from './pollinations'

const PLANNER_SYSTEM = `You are the Scene Director of a layered AI compositing tool. Decompose the user's visual prompt into the SMALLEST useful set of layers (2-4). Respond with ONLY valid JSON, no markdown:
{"scene":"<scene summary, max 10 words>","style":"<style/mood/medium phrase, max 8 words>","layers":[{"name":"<1-3 word layer name>","role":"base|cutout|overlay","description":"<max 12 words>"}]}
RULES:
- Exactly ONE "base" layer, FIRST: the full backdrop/setting behind everything (terrain, sky, room, street...).
- 1-3 "cutout" layers: each is ONE distinct physical thing (a person, animal, object, structure), ordered back to front. Description names ONLY that thing.
- At most ONE "overlay" layer, LAST, only if the scene implies weather/glow/particles (rain, snow, fog, sparks...).
- Never restate the whole scene in a description. Style words go in "style" only.
EXAMPLE for "man on snowy mountain":
{"scene":"a man standing on a snowy mountain","style":"crisp alpine daylight, photorealistic","layers":[{"name":"Mountain Backdrop","role":"base","description":"snowy mountain slope, distant peaks, pale sky"},{"name":"Man","role":"cutout","description":"a man in winter clothing standing"},{"name":"Snowfall","role":"overlay","description":"drifting snow flurries"}]}`

const WEATHER_WORDS =
  /\b(rain|rainy|snow|snowy|storm|fog|foggy|mist|misty|smoke|sparks|neon|glow|dust|particles|fireflies|blizzard)\b/i

/**
 * Deterministic fallback so the demo never blocks on the LLM. Extracts a
 * subject/setting split from "X on/in/at Y" prompts.
 */
export function fallbackPlan(prompt: string): ScenePlan {
  const clean = prompt
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const short = clean.length > 120 ? `${clean.slice(0, 120).replace(/\s+\S*$/, '')}` : clean

  const split = short.match(
    /^(?:an?\s+|the\s+)?(.{2,50}?)\s+(?:standing\s+|sitting\s+|walking\s+)?(?:on|in|at|inside|under|over|near|by|against|within)\s+(?:an?\s+|the\s+)?(.{2,70})$/i,
  )
  const subject = split ? split[1].trim() : null
  const setting = split ? split[2].trim() : short
  const weather = short.match(WEATHER_WORDS)?.[0]

  const titleCase = (s: string) =>
    s
      .split(' ')
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

  const layers: ScenePlanLayer[] = [
    { role: 'base', name: titleCase(setting), description: `${setting}, full backdrop with sky and terrain` },
    ...(subject ? [{ role: 'cutout' as LayerRole, name: titleCase(subject), description: subject }] : []),
    ...(weather
      ? [{ role: 'overlay' as LayerRole, name: titleCase(weather), description: `${weather} weather effect` }]
      : []),
  ]
  return { scene: short, style: 'cinematic, highly detailed', layers }
}

const VALID_ROLES = new Set<string>(['base', 'cutout', 'overlay'])

export async function planScene(prompt: string): Promise<{ plan: ScenePlan; source: 'llm' | 'fallback' }> {
  try {
    const raw = await generateText(PLANNER_SYSTEM, prompt)
    const jsonText = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(jsonText)
    const rawLayers: unknown[] = Array.isArray(parsed.layers) ? parsed.layers : []
    let layers: ScenePlanLayer[] = rawLayers
      .filter((l): l is { role: string; name: string; description: string } => {
        const c = l as { role?: unknown; name?: unknown; description?: unknown }
        return (
          typeof c?.role === 'string' &&
          VALID_ROLES.has(c.role) &&
          typeof c?.name === 'string' &&
          typeof c?.description === 'string'
        )
      })
      .map((l) => ({
        role: l.role as LayerRole,
        name: l.name.slice(0, 28),
        description: l.description.slice(0, 140),
      }))

    // Enforce structure: one base first, cutouts middle, overlays last, max 5.
    const base = layers.find((l) => l.role === 'base')
    if (!base || layers.length < 2) throw new Error('Plan too sparse')
    layers = [
      base,
      ...layers.filter((l) => l.role === 'cutout').slice(0, 3),
      ...layers.filter((l) => l.role === 'overlay').slice(0, 1),
    ]

    return {
      plan: {
        scene: typeof parsed.scene === 'string' ? parsed.scene.slice(0, 120) : prompt.slice(0, 120),
        style: typeof parsed.style === 'string' ? parsed.style.slice(0, 100) : undefined,
        layers,
      },
      source: 'llm',
    }
  } catch {
    return { plan: fallbackPlan(prompt), source: 'fallback' }
  }
}

/* ------------------------------------------------------------------ */
/* Refinement intent routing                                           */
/* ------------------------------------------------------------------ */

const WHOLE_SCENE_KEYWORDS = ['everything', 'whole scene', 'entire scene', 'all layers', 'completely', 'start over', 'whole image', 'entire image', 'style', 'redo']

export interface RefinementIntent {
  affectedIds: string[]
  wholeScene: boolean
}

const STOP_WORDS = new Set(['the', 'and', 'with', 'this', 'that', 'more', 'less', 'very', 'make', 'add', 'effect', 'layer'])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

/**
 * Route a chat refinement to the layers it mentions, matching against each
 * layer's name and description. Deterministic so the demo never misroutes.
 */
export function analyzeRefinement(message: string, layers: Layer[]): RefinementIntent {
  const text = message.toLowerCase()
  if (WHOLE_SCENE_KEYWORDS.some((k) => text.includes(k))) {
    return { affectedIds: layers.map((l) => l.id), wholeScene: true }
  }
  const messageTokens = new Set(tokens(message))
  const affected = layers.filter((l) =>
    [...tokens(l.name), ...tokens(l.prompt)].some(
      (t) => messageTokens.has(t) || messageTokens.has(`${t}s`) || (t.endsWith('s') && messageTokens.has(t.slice(0, -1))),
    ),
  )
  // Generic routing when nothing matched by name: weather/light words hit
  // overlays (or the base, which carries the scene's light), else whole scene.
  if (affected.length === 0) {
    if (WEATHER_WORDS.test(text)) {
      const overlays = layers.filter((l) => l.role === 'overlay')
      if (overlays.length > 0) return { affectedIds: overlays.map((l) => l.id), wholeScene: false }
    }
    if (/\b(light|lighting|dark|darker|bright|brighter|sunset|sunrise|golden|color|colours|warm|cool|sky)\b/.test(text)) {
      const base = layers.filter((l) => l.role === 'base')
      if (base.length > 0) return { affectedIds: base.map((l) => l.id), wholeScene: false }
    }
    return { affectedIds: layers.map((l) => l.id), wholeScene: true }
  }
  return { affectedIds: affected.map((l) => l.id), wholeScene: false }
}
