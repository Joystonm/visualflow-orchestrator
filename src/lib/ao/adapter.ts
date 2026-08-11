import type { AgentEvent, AgentName, AgentStatus, AspectRatio, LayerType, ScenePlan } from '../../types'

/**
 * AO adapter boundary. The app talks to agent orchestration only through this
 * interface, so the local in-browser engine can be swapped for a remote AO
 * daemon endpoint without touching UI code. No secrets live client-side.
 */

export interface LayerJobSpec {
  layerId: string
  layerType: LayerType
  description: string
  sceneContext: string
  ratio: AspectRatio
  seed: number
}

export interface LayerJobResult {
  layerId: string
  assetUrl: string
  cloudinaryPublicId: string | null
}

export interface OrchestrationBus {
  /** Live status pushes for a named agent (drives agent cards / status strip). */
  onAgentStatus(agent: AgentName, layerType: LayerType | null, status: AgentStatus, detail: string): void
  /** Append-only event log (drives the AO ACTIVITY panel). */
  onEvent(event: Omit<AgentEvent, 'id' | 'timestamp'>): void
  /** Layer-level progress (drives the layer inspector + canvas). */
  onLayerStatus(layerId: string, status: AgentStatus, patch?: Partial<LayerJobResult>): void
}

export interface AOAdapter {
  /** Scene Director: turn a prompt into a structured scene specification. */
  planScene(prompt: string, bus: OrchestrationBus): Promise<ScenePlan>
  /** Fan a set of layer jobs out to specialized agents; resolves when all settle. */
  runLayerJobs(jobs: LayerJobSpec[], bus: OrchestrationBus): Promise<Map<string, LayerJobResult | Error>>
}
