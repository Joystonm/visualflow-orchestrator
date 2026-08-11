export type LayerType =
  | 'background'
  | 'environment'
  | 'subject'
  | 'foreground'
  | 'lighting'
  | 'atmosphere'
  | 'effects'

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
  type: LayerType
  name: string
  prompt: string
  /** Delivery URL for the generated asset (Cloudinary if configured, else source URL). */
  assetUrl: string | null
  cloudinaryPublicId: string | null
  visible: boolean
  opacity: number
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
  layers: Layer[]
  /** Composited image (data URL or Cloudinary URL). */
  compositeUrl: string | null
  thumbnail: string | null
  changedLayerTypes: LayerType[]
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
    affectedLayers: LayerType[]
    unchangedLayers: LayerType[]
  }
  relatedVersionId?: string
}

export type AgentName =
  | 'AO Orchestrator'
  | 'Scene Director'
  | 'Background Agent'
  | 'Environment Agent'
  | 'Subject Agent'
  | 'Foreground Agent'
  | 'Lighting Agent'
  | 'Atmosphere Agent'
  | 'Effects Agent'
  | 'Cloudinary'
  | 'Composer'

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
  layerType?: LayerType
  status: AgentStatus
  detail: string
}

export interface ScenePlanLayer {
  type: LayerType
  description: string
}

export interface ScenePlan {
  scene: string
  layers: ScenePlanLayer[]
}

export type GenerationPhase = 'idle' | 'planning' | 'generating' | 'composing' | 'done' | 'error'
