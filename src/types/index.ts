/**
 * How a layer composites — the Scene Director decides which layers a scene
 * needs (2-4, prompt-specific names) and assigns each a role:
 * - base: opaque backdrop plate, painted first
 * - cutout: generated on green screen, chroma-keyed, pasted as a real cutout
 * - overlay: light/weather pass on black, screen-blended
 */
export type LayerRole = 'base' | 'cutout' | 'overlay'

export type LayerStatus =
  | 'queued'
  | 'thinking'
  | 'generating'
  | 'uploading'
  | 'composing'
  | 'complete'
  | 'failed'

export interface Layer {
  id: string
  role: LayerRole
  name: string
  prompt: string
  /** Delivery URL for the generated asset (Cloudinary if configured, else source URL). */
  assetUrl: string | null
  cloudinaryPublicId: string | null
  visible: boolean
  opacity: number
  /** Non-destructive filter preset key (see lib/cloudinary/filters.ts). */
  filter?: string | null
  status: LayerStatus
  createdAt: number
  /** Seed used for generation — lets us regenerate variations deterministically. */
  seed: number
}

export interface Version {
  id: string
  parentVersionId: string | null
  label: string
  prompt: string
  /** Short scene summary + style used as generation context (not the raw prompt). */
  context?: string
  layers: Layer[]
  /** Composited image (data URL or Cloudinary URL). */
  compositeUrl: string | null
  thumbnail: string | null
  changedLayerNames: string[]
  createdAt: number
}

export interface Project {
  id: string
  name: string
  aspectRatio: AspectRatio
  createdAt: number
  currentVersionId: string | null
  versions: Version[]
}

export type AspectRatio = '1:1' | '4:5' | '16:9' | '9:16'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** Optional structured orchestration summary rendered inside the message. */
  plan?: {
    affectedLayers: string[]
    unchangedLayers: string[]
  }
  relatedVersionId?: string
}

/** Fixed orchestration roles plus dynamic per-layer agents ("Man Agent", ...). */
export type AgentName = string

export type AgentStatus =
  | 'idle'
  | 'queued'
  | 'thinking'
  | 'generating'
  | 'uploading'
  | 'composing'
  | 'complete'
  | 'failed'

export interface AgentEvent {
  id: string
  agent: AgentName
  action: string
  status: AgentStatus
  timestamp: number
}

/** Live state of an agent shown in the orchestration UI. */
export interface AgentTask {
  agent: AgentName
  layerId?: string
  status: AgentStatus
  detail: string
}

export interface ScenePlanLayer {
  role: LayerRole
  name: string
  description: string
}

export interface ScenePlan {
  scene: string
  /** Short shared style/mood phrase applied to every layer for coherence. */
  style?: string
  layers: ScenePlanLayer[]
}

export type GenerationPhase = 'idle' | 'planning' | 'generating' | 'composing' | 'done' | 'error'
