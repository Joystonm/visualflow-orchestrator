import type { LayerRole, ScenePlan } from '../../types'
import type { AOAdapter, LayerJobSpec, LayerJobResult, OrchestrationBus } from './adapter'
import { generateLayerImage } from '../generation/provider'
import { planScene } from '../generation/scenePlanner'
import { uploadAsset, cloudinaryEnabled } from '../cloudinary'

/** Each layer gets its own named agent ("Man Agent", "Snowfall Agent"...). */
export const agentForLayer = (layerName: string) => `${layerName} Agent`

const FIXED_ICONS: Record<string, string> = {
  'AO Orchestrator': '◉',
  'Scene Director': '🧠',
  Cloudinary: '☁',
  Composer: '🧩',
}

const ROLE_ICONS: Record<LayerRole, string> = {
  base: '🏞',
  cutout: '👤',
  overlay: '✨',
}

export function agentIcon(agent: string, role?: LayerRole): string {
  return FIXED_ICONS[agent] ?? (role ? ROLE_ICONS[role] : '🎨')
}

/**
 * Build a layer-specific generation prompt. Each layer must produce ONLY the
 * visual element it owns — never a complete reproduction of the full scene.
 *
 * The structured prompt has four explicit sections:
 *   FULL SCENE       — coherence anchor so the model knows what the final
 *                       composition looks like, preventing style drift.
 *   LAYER            — the dynamic name assigned by the Scene Director.
 *   LAYER PURPOSE    — what this specific element represents.
 *   GENERATION INSTRUCTION — precise, role-specific directive that tells the
 *                       model what to generate and, critically, what to omit.
 *
 * Role contracts:
 *   base    → the environmental/backdrop plate only. No subjects, no
 *             independently generated foreground objects. Wide establishing
 *             shot of the setting. The subject layers are handled separately.
 *
 *   cutout  → a single isolated subject on a FLAT solid pure-green (#00ff00)
 *             background so the compositor can chroma-key it cleanly. The
 *             background must be a uniform colour — no gradients, no scenery,
 *             no shadows cast on the ground. Subject visual characteristics
 *             (clothing, pose, etc.) must match the scene context.
 *
 *   overlay → the atmospheric effect only (snow, rain, fog, sparks, glow…),
 *             rendered on a PURE BLACK background. No objects, no subjects,
 *             no setting. Must be suitable for screen blending over the base.
 *
 * sceneContext provides style/mood coherence only — it is never used as the
 * subject of generation.
 */
function buildLayerPrompt(
  role: LayerRole,
  layerName: string,
  description: string,
  sceneContext: string,
): string {
  const scene = sceneContext.slice(0, 180)

  switch (role) {
    case 'base':
      return [
        `FULL SCENE: ${scene}`,
        `LAYER: ${layerName}`,
        `LAYER PURPOSE: ${description}`,
        `GENERATION INSTRUCTION: Generate ONLY the environmental backdrop for this scene — ${description}.`,
        `Do NOT add any subjects, characters, people, animals, or foreground objects that belong to separate layers.`,
        `Do NOT recreate the complete scene. Render only the setting: terrain, sky, architecture, or background environment.`,
        `Wide establishing shot, highly detailed background plate, no text.`,
      ].join('\n')

    case 'cutout':
      return [
        `FULL SCENE: ${scene}`,
        `LAYER: ${layerName}`,
        `LAYER PURPOSE: ${description}`,
        `GENERATION INSTRUCTION: Generate ONLY the isolated subject described — ${description}.`,
        `Place the subject on a FLAT SOLID PURE GREEN (#00ff00) background. The background must be a uniform single colour with no gradients, no shadows, no reflections, and no scenery.`,
        `Do NOT add any background environment, other objects, or elements that belong to separate layers.`,
        `Do NOT recreate the complete scene. Render only this subject with the visual characteristics that fit the scene context.`,
        `Studio cutout style, nothing else in frame, no text.`,
      ].join('\n')

    case 'overlay':
      return [
        `FULL SCENE: ${scene}`,
        `LAYER: ${layerName}`,
        `LAYER PURPOSE: ${description}`,
        `GENERATION INSTRUCTION: Generate ONLY the atmospheric effect — ${description}.`,
        `Render on a PURE BLACK background (#000000). The effect must be translucent-looking so it composites naturally when screen-blended over a scene.`,
        `Do NOT add any objects, subjects, buildings, terrain, or scenery.`,
        `Do NOT recreate the complete scene. Render only the atmospheric/weather/light effect itself.`,
        `No text.`,
      ].join('\n')
  }
}

const jitter = (min: number, max: number) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)))

/**
 * LocalAOAdapter — an in-browser orchestration engine. It coordinates real
 * concurrent agent work (planning LLM call, per-layer image generation,
 * Cloudinary storage) and streams status/events to the UI bus.
 */
export class LocalAOAdapter implements AOAdapter {
  async planScene(prompt: string, bus: OrchestrationBus): Promise<ScenePlan> {
    bus.onEvent({ agent: 'AO Orchestrator', action: 'Request received', status: 'thinking' })
    bus.onAgentStatus('Scene Director', null, 'thinking', 'Deciding which layers this scene needs...')
    bus.onEvent({ agent: 'Scene Director', action: 'Analyzing prompt', status: 'thinking' })

    const { plan, source } = await planScene(prompt)

    const names = plan.layers.map((l) => l.name).join(', ')
    bus.onAgentStatus('Scene Director', null, 'complete', `Planned ${plan.layers.length} layers`)
    bus.onEvent({
      agent: 'Scene Director',
      action: `Scene plan: ${names}${source === 'fallback' ? ' (heuristic mode)' : ''}`,
      status: 'complete',
    })
    return plan
  }

  async runLayerJobs(jobs: LayerJobSpec[], bus: OrchestrationBus): Promise<Map<string, LayerJobResult | Error>> {
    const results = new Map<string, LayerJobResult | Error>()
    bus.onEvent({
      agent: 'AO Orchestrator',
      action: `Dispatching ${jobs.length} agent${jobs.length > 1 ? 's' : ''}`,
      status: 'generating',
    })

    await Promise.all(
      jobs.map(async (job, i) => {
        const agent = agentForLayer(job.name)
        try {
          bus.onAgentStatus(agent, job.layerId, 'queued', 'Queued')
          bus.onLayerStatus(job.layerId, 'queued')
          await jitter(i * 250, i * 250 + 400) // stagger dispatch so orchestration reads clearly

          bus.onAgentStatus(agent, job.layerId, 'thinking', 'Interpreting layer brief...')
          bus.onEvent({ agent, action: 'Task accepted', status: 'thinking' })
          await jitter(300, 700)

          bus.onAgentStatus(agent, job.layerId, 'generating', 'Generating...')
          bus.onLayerStatus(job.layerId, 'generating')
          bus.onEvent({ agent, action: 'Generation started', status: 'generating' })

          const prompt = buildLayerPrompt(job.role, job.name, job.description, job.sceneContext)
          const generated = await generateLayerImage(prompt, job.ratio, job.seed, job.role)
          let assetUrl = generated.assetUrl
          let publicId = generated.cloudinaryPublicId

          if (generated.provider === 'cloudinary') {
            // Generated straight into the Cloudinary media library — no upload step.
            const credits = generated.quota ? ` — ${generated.quota.remaining}/${generated.quota.limit} credits left` : ''
            bus.onEvent({ agent: 'Cloudinary', action: `Image generated & stored (${job.name})${credits}`, status: 'complete' })
          } else if (cloudinaryEnabled()) {
            bus.onAgentStatus(agent, job.layerId, 'uploading', 'Uploading to Cloudinary...')
            bus.onLayerStatus(job.layerId, 'uploading')
            const asset = await uploadAsset(assetUrl)
            if (asset) {
              assetUrl = asset.secureUrl
              publicId = asset.publicId
              bus.onEvent({ agent: 'Cloudinary', action: `Asset stored (${job.name})`, status: 'complete' })
            }
          }

          bus.onAgentStatus(agent, job.layerId, 'complete', 'Layer complete')
          bus.onLayerStatus(job.layerId, 'complete', { assetUrl, cloudinaryPublicId: publicId })
          bus.onEvent({ agent, action: 'Generation completed', status: 'complete' })
          results.set(job.layerId, { layerId: job.layerId, assetUrl, cloudinaryPublicId: publicId })
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Agent failed')
          bus.onAgentStatus(agent, job.layerId, 'failed', 'Agent failed')
          bus.onLayerStatus(job.layerId, 'failed')
          bus.onEvent({ agent, action: `Failed — ${error.message}`, status: 'failed' })
          results.set(job.layerId, error)
        }
      }),
    )
    return results
  }
}

export const aoAdapter: AOAdapter = new LocalAOAdapter()
