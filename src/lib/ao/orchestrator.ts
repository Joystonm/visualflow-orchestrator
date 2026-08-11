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
 * Layer prompts are engineered for real compositing: the base paints the full
 * backdrop plate; cutouts render on a flat green screen and are chroma-keyed
 * into the composition; overlays render on pure black and are screen-blended.
 */
function buildLayerPrompt(role: LayerRole, description: string, sceneContext: string): string {
  const ctx = sceneContext.slice(0, 160)
  switch (role) {
    case 'base':
      return `${description}, wide cinematic shot, full scene backdrop, no text, highly detailed, style: ${ctx}`
    case 'cutout':
      return `${description}, isolated on a flat solid bright green screen background, chroma key style, studio cutout, nothing else in frame, no text, no background scenery, matching: ${ctx}`
    case 'overlay':
      return `${description}, translucent overlay effect pass on a pure black background, no objects, no scenery, no text`
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

          const prompt = buildLayerPrompt(job.role, job.description, job.sceneContext)
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
