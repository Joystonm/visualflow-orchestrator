import type { AgentName, LayerType, ScenePlan } from '../../types'
import type { AOAdapter, LayerJobSpec, LayerJobResult, OrchestrationBus } from './adapter'
import { generateImage } from '../generation/pollinations'
import { planScene } from '../generation/scenePlanner'
import { uploadAsset, cloudinaryEnabled } from '../cloudinary'

export const AGENT_FOR_LAYER: Record<LayerType, AgentName> = {
  background: 'Background Agent',
  environment: 'Environment Agent',
  subject: 'Subject Agent',
  foreground: 'Foreground Agent',
  lighting: 'Lighting Agent',
  atmosphere: 'Atmosphere Agent',
  effects: 'Effects Agent',
}

export const AGENT_ICONS: Record<AgentName, string> = {
  'AO Orchestrator': '◉',
  'Scene Director': '🧠',
  'Background Agent': '🏙',
  'Environment Agent': '🎨',
  'Subject Agent': '👤',
  'Foreground Agent': '🖼',
  'Lighting Agent': '💡',
  'Atmosphere Agent': '🌫',
  'Effects Agent': '✨',
  Cloudinary: '☁',
  Composer: '🧩',
}

/**
 * Layer prompts are engineered for real compositing: the background paints the
 * base plate; every other pass is generated on pure black so lighten/screen
 * blending stacks it into the composition non-destructively.
 */
function buildLayerPrompt(type: LayerType, description: string, sceneContext: string): string {
  const ctx = sceneContext.slice(0, 160)
  switch (type) {
    case 'background':
      return `${description}, wide cinematic establishing shot, no text, highly detailed, scene: ${ctx}`
    case 'environment':
      return `${description}, glowing mid-ground scenery elements isolated on a pure black background, no text, cinematic, part of: ${ctx}`
    case 'subject':
      return `${description}, single focal subject, centered, isolated on a solid pure black background, cinematic rim light, no text, part of: ${ctx}`
    case 'foreground':
      return `${description}, close foreground elements isolated on a pure black background, shallow depth of field, part of: ${ctx}`
    case 'lighting':
      return `abstract cinematic lighting pass: ${description}, soft light leaks, glow and bokeh on a pure black background, no objects, no text`
    case 'atmosphere':
      return `subtle volumetric atmosphere pass: ${description}, soft fog and haze gradients on a pure black background, no objects, no text`
    case 'effects':
      return `visual effects overlay: ${description}, isolated on a pure black background, no scenery, no text`
  }
}

const jitter = (min: number, max: number) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)))

/**
 * LocalAOAdapter — an in-browser orchestration engine. It coordinates real
 * concurrent agent work (planning LLM call, per-layer image generation,
 * Cloudinary uploads) and streams status/events to the UI bus.
 */
export class LocalAOAdapter implements AOAdapter {
  async planScene(prompt: string, bus: OrchestrationBus): Promise<ScenePlan> {
    bus.onEvent({ agent: 'AO Orchestrator', action: 'Request received', status: 'thinking' })
    bus.onAgentStatus('Scene Director', null, 'thinking', 'Analyzing composition...')
    bus.onEvent({ agent: 'Scene Director', action: 'Analyzing prompt', status: 'thinking' })

    const { plan, source } = await planScene(prompt)

    bus.onAgentStatus('Scene Director', null, 'complete', `Scene structure created (${plan.layers.length} layers)`)
    bus.onEvent({
      agent: 'Scene Director',
      action: `Scene plan created — ${plan.layers.length} layers${source === 'fallback' ? ' (heuristic mode)' : ''}`,
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
        const agent = AGENT_FOR_LAYER[job.layerType]
        try {
          bus.onAgentStatus(agent, job.layerType, 'queued', 'Queued')
          bus.onLayerStatus(job.layerId, 'queued')
          await jitter(i * 250, i * 250 + 400) // stagger dispatch so orchestration reads clearly

          bus.onAgentStatus(agent, job.layerType, 'thinking', 'Interpreting layer brief...')
          bus.onEvent({ agent, action: 'Task accepted', status: 'thinking' })
          await jitter(300, 700)

          bus.onAgentStatus(agent, job.layerType, 'generating', 'Generating...')
          bus.onLayerStatus(job.layerId, 'generating')
          bus.onEvent({ agent, action: 'Generation started', status: 'generating' })

          const prompt = buildLayerPrompt(job.layerType, job.description, job.sceneContext)
          let assetUrl = await generateImage(prompt, job.ratio, job.seed)
          let publicId: string | null = null

          if (cloudinaryEnabled()) {
            bus.onAgentStatus(agent, job.layerType, 'uploading', 'Uploading to Cloudinary...')
            bus.onLayerStatus(job.layerId, 'uploading')
            const asset = await uploadAsset(assetUrl)
            if (asset) {
              assetUrl = asset.secureUrl
              publicId = asset.publicId
              bus.onEvent({ agent: 'Cloudinary', action: `Asset stored (${job.layerType})`, status: 'complete' })
            }
          }

          bus.onAgentStatus(agent, job.layerType, 'complete', 'Layer complete')
          bus.onLayerStatus(job.layerId, 'complete', { assetUrl, cloudinaryPublicId: publicId })
          bus.onEvent({ agent, action: 'Generation completed', status: 'complete' })
          results.set(job.layerId, { layerId: job.layerId, assetUrl, cloudinaryPublicId: publicId })
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Agent failed')
          bus.onAgentStatus(agent, job.layerType, 'failed', 'Agent failed')
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
