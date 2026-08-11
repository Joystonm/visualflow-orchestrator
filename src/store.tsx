import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import type {
  AgentEvent,
  AgentName,
  AgentStatus,
  AgentTask,
  AspectRatio,
  ChatMessage,
  GenerationPhase,
  Layer,
  Project,
  Version,
} from './types'
import type { LayerJobSpec, OrchestrationBus } from './lib/ao/adapter'
import { aoAdapter, agentForLayer } from './lib/ao/orchestrator'
import { analyzeRefinement } from './lib/generation/scenePlanner'
import { compositeLayers, makeThumbnail } from './lib/compositor'
import { loadState, saveState } from './lib/storage'

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export interface CompareState {
  open: boolean
  mode: 'side' | 'slider'
  aId: string | null
  bId: string | null
}

export interface AppState {
  project: Project | null
  chat: ChatMessage[]
  agentEvents: AgentEvent[]
  agentTasks: AgentTask[]
  phase: GenerationPhase
  selectedLayerId: string | null
  compare: CompareState
  compositeUrl: string | null
  compositing: boolean
  exportOpen: boolean
  activityOpen: boolean
  undoStack: string[]
  redoStack: string[]
}

const initialState: AppState = {
  project: null,
  chat: [],
  agentEvents: [],
  agentTasks: [],
  phase: 'idle',
  selectedLayerId: null,
  compare: { open: false, mode: 'slider', aId: null, bId: null },
  compositeUrl: null,
  compositing: false,
  exportOpen: false,
  activityOpen: false,
  undoStack: [],
  redoStack: [],
}

type Action =
  | { type: 'HYDRATE'; project: Project | null; chat: ChatMessage[] }
  | { type: 'PATCH'; patch: Partial<AppState> }
  | { type: 'SET_PROJECT'; project: Project }
  | { type: 'ADD_VERSION'; version: Version; pushUndo?: boolean }
  | { type: 'SET_CURRENT_VERSION'; id: string; pushUndo?: boolean }
  | { type: 'PATCH_VERSION'; versionId: string; patch: Partial<Version> }
  | { type: 'PATCH_LAYER'; versionId: string; layerId: string; patch: Partial<Layer> }
  | { type: 'ADD_CHAT'; message: ChatMessage }
  | { type: 'ADD_EVENT'; event: AgentEvent }
  | { type: 'UPSERT_AGENT_TASK'; task: AgentTask }
  | { type: 'CLEAR_AGENT_TASKS' }
  | { type: 'UNDO' }
  | { type: 'REDO' }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, project: action.project, chat: action.chat }
    case 'PATCH':
      return { ...state, ...action.patch }
    case 'SET_PROJECT':
      return { ...state, project: action.project }
    case 'ADD_VERSION': {
      if (!state.project) return state
      const undoStack = action.pushUndo && state.project.currentVersionId
        ? [...state.undoStack, state.project.currentVersionId]
        : state.undoStack
      return {
        ...state,
        undoStack,
        redoStack: [],
        project: {
          ...state.project,
          versions: [...state.project.versions, action.version],
          currentVersionId: action.version.id,
        },
      }
    }
    case 'SET_CURRENT_VERSION': {
      if (!state.project || state.project.currentVersionId === action.id) return state
      const undoStack = action.pushUndo && state.project.currentVersionId
        ? [...state.undoStack, state.project.currentVersionId]
        : state.undoStack
      return {
        ...state,
        undoStack,
        redoStack: action.pushUndo ? [] : state.redoStack,
        project: { ...state.project, currentVersionId: action.id },
      }
    }
    case 'PATCH_VERSION': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          versions: state.project.versions.map((v) =>
            v.id === action.versionId ? { ...v, ...action.patch } : v,
          ),
        },
      }
    }
    case 'PATCH_LAYER': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          versions: state.project.versions.map((v) =>
            v.id === action.versionId
              ? { ...v, layers: v.layers.map((l) => (l.id === action.layerId ? { ...l, ...action.patch } : l)) }
              : v,
          ),
        },
      }
    }
    case 'ADD_CHAT':
      return { ...state, chat: [...state.chat, action.message] }
    case 'ADD_EVENT':
      return { ...state, agentEvents: [...state.agentEvents.slice(-199), action.event] }
    case 'UPSERT_AGENT_TASK': {
      const exists = state.agentTasks.some((t) => t.agent === action.task.agent)
      return {
        ...state,
        agentTasks: exists
          ? state.agentTasks.map((t) => (t.agent === action.task.agent ? action.task : t))
          : [...state.agentTasks, action.task],
      }
    }
    case 'CLEAR_AGENT_TASKS':
      return { ...state, agentTasks: [] }
    case 'UNDO': {
      if (!state.project || state.undoStack.length === 0) return state
      const prev = state.undoStack[state.undoStack.length - 1]
      return {
        ...state,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: state.project.currentVersionId ? [...state.redoStack, state.project.currentVersionId] : state.redoStack,
        project: { ...state.project, currentVersionId: prev },
      }
    }
    case 'REDO': {
      if (!state.project || state.redoStack.length === 0) return state
      const next = state.redoStack[state.redoStack.length - 1]
      return {
        ...state,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: state.project.currentVersionId ? [...state.undoStack, state.project.currentVersionId] : state.undoStack,
        project: { ...state.project, currentVersionId: next },
      }
    }
    default:
      return state
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const uid = () => crypto.randomUUID()
const newSeed = () => Math.floor(Math.random() * 1_000_000)

export function currentVersion(state: AppState): Version | null {
  if (!state.project?.currentVersionId) return null
  return state.project.versions.find((v) => v.id === state.project!.currentVersionId) ?? null
}

export function versionNumber(project: Project, versionId: string): string {
  const idx = project.versions.findIndex((v) => v.id === versionId)
  return `V${idx + 1}`
}

function projectNameFrom(prompt: string): string {
  const words = prompt.split(/\s+/).slice(0, 3).join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/* ------------------------------------------------------------------ */
/* Controller                                                          */
/* ------------------------------------------------------------------ */

export class AppController {
  constructor(
    private dispatch: (a: Action) => void,
    private getState: () => AppState,
  ) {}

  private bus(versionId: string): OrchestrationBus {
    return {
      onAgentStatus: (agent: AgentName, layerId: string | null, status: AgentStatus, detail: string) => {
        this.dispatch({ type: 'UPSERT_AGENT_TASK', task: { agent, layerId: layerId ?? undefined, status, detail } })
      },
      onEvent: (e) => {
        this.dispatch({ type: 'ADD_EVENT', event: { ...e, id: uid(), timestamp: Date.now() } })
      },
      onLayerStatus: (layerId, status, patch) => {
        this.dispatch({
          type: 'PATCH_LAYER',
          versionId,
          layerId,
          patch: {
            status: status as Layer['status'],
            ...(patch?.assetUrl ? { assetUrl: patch.assetUrl } : {}),
            ...(patch?.cloudinaryPublicId !== undefined ? { cloudinaryPublicId: patch.cloudinaryPublicId } : {}),
          },
        })
      },
    }
  }

  private addChat(role: 'user' | 'assistant', content: string, extra?: Partial<ChatMessage>) {
    this.dispatch({
      type: 'ADD_CHAT',
      message: { id: uid(), role, content, timestamp: Date.now(), ...extra },
    })
  }

  private async finalizeVersion(versionId: string, announce = true) {
    const state = this.getState()
    const project = state.project
    const version = project?.versions.find((v) => v.id === versionId)
    if (!project || !version) return

    const completed = version.layers.filter((l) => l.status === 'complete')
    const failed = version.layers.filter((l) => l.status === 'failed')

    if (completed.length > 0) {
      this.dispatch({ type: 'UPSERT_AGENT_TASK', task: { agent: 'Composer', status: 'composing', detail: 'Combining layers...' } })
      this.dispatch({ type: 'ADD_EVENT', event: { id: uid(), agent: 'Composer', action: 'Compositing layers', status: 'composing', timestamp: Date.now() } })
      try {
        const thumb = await makeThumbnail(version.layers, project.aspectRatio)
        this.dispatch({ type: 'PATCH_VERSION', versionId, patch: { thumbnail: thumb } })
      } catch { /* thumbnail is cosmetic */ }
      this.dispatch({ type: 'UPSERT_AGENT_TASK', task: { agent: 'Composer', status: 'complete', detail: 'Composition ready' } })
      this.dispatch({ type: 'ADD_EVENT', event: { id: uid(), agent: 'Composer', action: 'Final composition created', status: 'complete', timestamp: Date.now() } })
    }

    this.dispatch({ type: 'PATCH', patch: { phase: failed.length > 0 ? 'error' : 'done' } })

    if (failed.length === 0 && announce) {
      const isFirst = project.versions.length === 1
      this.addChat(
        'assistant',
        isFirst
          ? 'Scene ready. Chat to refine it, or select a layer to edit just that layer.'
          : `${versionNumber(project, versionId)} created — changed: ${version.changedLayerNames.join(', ')}.`,
        { relatedVersionId: versionId },
      )
    }
    if (failed.length > 0) {
      this.addChat(
        'assistant',
        `⚠ ${failed.map((l) => agentForLayer(l.name)).join(', ')} encountered an error. You can retry the layer from the inspector, or continue without it.`,
      )
    }
  }

  /** Full scene generation from the landing prompt. */
  async generateScene(prompt: string, ratio: AspectRatio) {
    this.addChat('user', prompt)
    this.dispatch({ type: 'PATCH', patch: { phase: 'planning', compositeUrl: null } })
    this.dispatch({ type: 'CLEAR_AGENT_TASKS' })

    const versionId = uid()
    const busThatTargets = this.bus(versionId)
    const plan = await aoAdapter.planScene(prompt, busThatTargets)
    // Short scene summary + style — used as generation context instead of the raw prompt.
    const context = [plan.scene, plan.style].filter(Boolean).join(', ').slice(0, 180)

    const layers: Layer[] = plan.layers.map((pl) => ({
      id: uid(),
      role: pl.role,
      name: pl.name,
      prompt: pl.description,
      assetUrl: null,
      cloudinaryPublicId: null,
      visible: true,
      opacity: 1,
      status: 'queued',
      createdAt: Date.now(),
      seed: newSeed(),
    }))

    const version: Version = {
      id: versionId,
      parentVersionId: null,
      label: 'Original',
      prompt,
      context,
      layers,
      compositeUrl: null,
      thumbnail: null,
      changedLayerNames: layers.map((l) => l.name),
      createdAt: Date.now(),
    }

    const project: Project = {
      id: uid(),
      name: `${projectNameFrom(prompt)} — Untitled`,
      aspectRatio: ratio,
      createdAt: Date.now(),
      currentVersionId: versionId,
      versions: [version],
    }

    this.dispatch({ type: 'SET_PROJECT', project })
    this.addChat(
      'assistant',
      `I'll build this as ${plan.layers.length} layers: ${plan.layers.map((l) => l.name).join(', ')}.`,
      { plan: { affectedLayers: plan.layers.map((l) => l.name), unchangedLayers: [] }, relatedVersionId: versionId },
    )
    this.dispatch({ type: 'PATCH', patch: { phase: 'generating' } })

    await this.runJobs(versionId, layers, context, ratio)
  }

  private async runJobs(versionId: string, layers: Layer[], sceneContext: string, ratio: AspectRatio, announce = true) {
    const jobs: LayerJobSpec[] = layers.map((l) => ({
      layerId: l.id,
      role: l.role,
      name: l.name,
      description: l.prompt,
      sceneContext,
      ratio,
      seed: l.seed,
    }))
    await aoAdapter.runLayerJobs(jobs, this.bus(versionId))
    await this.finalizeVersion(versionId, announce)
  }

  /** Chat refinement — routes to affected layers only, creates a new version. */
  async refine(message: string) {
    const state = this.getState()
    const project = state.project
    const version = currentVersion(state)
    if (!project || !version) return

    this.addChat('user', message)

    const selected = state.selectedLayerId
      ? version.layers.find((l) => l.id === state.selectedLayerId)
      : undefined
    // A selected layer pins the routing — "make it bigger" with Man selected hits Man only.
    const intent = selected
      ? { affectedIds: [selected.id], wholeScene: false }
      : analyzeRefinement(message, version.layers)

    const affectedSet = new Set(intent.affectedIds)
    const affectedNames = version.layers.filter((l) => affectedSet.has(l.id)).map((l) => l.name)
    const unchangedNames = version.layers.filter((l) => !affectedSet.has(l.id)).map((l) => l.name)

    this.dispatch({ type: 'CLEAR_AGENT_TASKS' })
    this.dispatch({ type: 'PATCH', patch: { phase: 'generating' } })
    this.dispatch({ type: 'ADD_EVENT', event: { id: uid(), agent: 'AO Orchestrator', action: `Request analyzed — ${affectedNames.length} layer(s) affected`, status: 'complete', timestamp: Date.now() } })

    // New layer objects get new ids — map old→new so job targeting stays correct.
    const newLayers: Layer[] = version.layers.map((l) =>
      affectedSet.has(l.id)
        ? {
            ...l,
            id: uid(),
            prompt: `${l.prompt}, ${message}`.slice(0, 220),
            assetUrl: null,
            cloudinaryPublicId: null,
            status: 'queued' as const,
            createdAt: Date.now(),
            seed: newSeed(),
          }
        : { ...l },
    )

    const parentContext = version.context ?? version.prompt.slice(0, 120)
    const newVersion: Version = {
      id: uid(),
      parentVersionId: version.id,
      label: message.length > 42 ? `${message.slice(0, 42)}…` : message,
      prompt: message,
      context: `${parentContext}; ${message}`.slice(0, 180),
      layers: newLayers,
      compositeUrl: null,
      thumbnail: null,
      changedLayerNames: affectedNames,
      createdAt: Date.now(),
    }

    this.dispatch({ type: 'ADD_VERSION', version: newVersion, pushUndo: true })
    this.addChat(
      'assistant',
      unchangedNames.length > 0
        ? `I'll update ${affectedNames.join(' and ')} while preserving ${unchangedNames.join(', ')}.`
        : `I'll rebuild the whole scene with that direction.`,
      { plan: { affectedLayers: affectedNames, unchangedLayers: unchangedNames }, relatedVersionId: newVersion.id },
    )

    const toGenerate = newLayers.filter((l) => l.status === 'queued')
    await this.runJobs(newVersion.id, toGenerate, newVersion.context!, project.aspectRatio)
  }

  /** Regenerate one layer (new seed, same brief) — creates a new version. */
  async regenerateLayer(layerId: string) {
    const state = this.getState()
    const project = state.project
    const version = currentVersion(state)
    if (!project || !version) return
    const layer = version.layers.find((l) => l.id === layerId)
    if (!layer) return

    this.dispatch({ type: 'CLEAR_AGENT_TASKS' })
    this.dispatch({ type: 'PATCH', patch: { phase: 'generating' } })

    const regenerated: Layer = {
      ...layer,
      id: uid(),
      assetUrl: null,
      cloudinaryPublicId: null,
      status: 'queued',
      createdAt: Date.now(),
      seed: newSeed(),
    }
    const newVersion: Version = {
      id: uid(),
      parentVersionId: version.id,
      label: `Regenerated ${layer.name}`,
      prompt: version.prompt,
      context: version.context,
      layers: version.layers.map((l) => (l.id === layerId ? regenerated : { ...l })),
      compositeUrl: null,
      thumbnail: null,
      changedLayerNames: [layer.name],
      createdAt: Date.now(),
    }
    this.dispatch({ type: 'ADD_VERSION', version: newVersion, pushUndo: true })
    this.addChat('assistant', `Regenerating ${layer.name}...`, {
      plan: { affectedLayers: [layer.name], unchangedLayers: version.layers.filter((l) => l.id !== layerId).map((l) => l.name) },
      relatedVersionId: newVersion.id,
    })
    await this.runJobs(newVersion.id, [regenerated], version.context ?? version.prompt.slice(0, 120), project.aspectRatio)
  }

  /** Retry a failed layer in place (no new version). */
  async retryLayer(layerId: string) {
    const state = this.getState()
    const project = state.project
    const version = currentVersion(state)
    if (!project || !version) return
    const layer = version.layers.find((l) => l.id === layerId)
    if (!layer) return
    this.dispatch({ type: 'PATCH', patch: { phase: 'generating' } })
    const seed = newSeed()
    this.dispatch({ type: 'PATCH_LAYER', versionId: version.id, layerId, patch: { status: 'queued', seed } })
    await this.runJobs(version.id, [{ ...layer, seed }], version.context ?? version.prompt.slice(0, 120), project.aspectRatio, false)
    const after = this.getState()
    const v = after.project?.versions.find((x) => x.id === version.id)
    if (v?.layers.find((l) => l.id === layerId)?.status === 'complete') {
      this.addChat('assistant', `${agentForLayer(layer.name)} recovered.`)
    }
  }

  /** Drop a failed layer and continue with the rest of the composition. */
  continueWithoutLayer(layerId: string) {
    const state = this.getState()
    const version = currentVersion(state)
    if (!version) return
    this.dispatch({ type: 'PATCH_LAYER', versionId: version.id, layerId, patch: { visible: false, status: 'complete' } })
    this.dispatch({ type: 'PATCH', patch: { phase: 'done' } })
  }

  toggleLayerVisibility(layerId: string) {
    const state = this.getState()
    const version = currentVersion(state)
    if (!version) return
    const layer = version.layers.find((l) => l.id === layerId)
    if (!layer) return
    this.dispatch({ type: 'PATCH_LAYER', versionId: version.id, layerId, patch: { visible: !layer.visible } })
  }

  selectLayer(layerId: string | null) {
    this.dispatch({ type: 'PATCH', patch: { selectedLayerId: layerId } })
  }

  goToVersion(versionId: string) {
    this.dispatch({ type: 'SET_CURRENT_VERSION', id: versionId, pushUndo: true })
    this.dispatch({ type: 'PATCH', patch: { selectedLayerId: null } })
  }

  branchFrom(versionId: string) {
    const state = this.getState()
    if (!state.project) return
    this.goToVersion(versionId)
    this.addChat(
      'assistant',
      `Branching from ${versionNumber(state.project, versionId)}. Describe the new direction and I'll build it from here.`,
    )
  }

  undo() { this.dispatch({ type: 'UNDO' }) }
  redo() { this.dispatch({ type: 'REDO' }) }

  openCompare() {
    const state = this.getState()
    const project = state.project
    if (!project || project.versions.length < 2) return
    const current = project.currentVersionId
    const cv = project.versions.find((v) => v.id === current)
    const other = cv?.parentVersionId ?? project.versions.filter((v) => v.id !== current).slice(-1)[0]?.id
    this.dispatch({ type: 'PATCH', patch: { compare: { open: true, mode: 'slider', aId: other ?? null, bId: current } } })
  }

  setCompare(patch: Partial<CompareState>) {
    const state = this.getState()
    this.dispatch({ type: 'PATCH', patch: { compare: { ...state.compare, ...patch } } })
  }

  patchUI(patch: Partial<AppState>) {
    this.dispatch({ type: 'PATCH', patch })
  }

  async recompose() {
    const state = this.getState()
    const project = state.project
    const version = currentVersion(state)
    if (!project || !version) {
      this.dispatch({ type: 'PATCH', patch: { compositeUrl: null } })
      return
    }
    this.dispatch({ type: 'PATCH', patch: { compositing: true } })
    try {
      const { dataUrl } = await compositeLayers(version.layers, project.aspectRatio)
      // Only apply if this is still the current version (avoid races).
      if (this.getState().project?.currentVersionId === version.id) {
        this.dispatch({ type: 'PATCH', patch: { compositeUrl: dataUrl } })
        this.dispatch({ type: 'PATCH_VERSION', versionId: version.id, patch: { compositeUrl: dataUrl } })
      }
    } catch {
      /* composite retried on next layer change */
    } finally {
      this.dispatch({ type: 'PATCH', patch: { compositing: false } })
    }
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

const StoreContext = createContext<{ state: AppState; controller: AppController } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(() => loadState(), [])
  const [state, dispatch] = useReducer(reducer, initialState, (init) =>
    persisted ? { ...init, project: persisted.project, chat: persisted.chat } : init,
  )
  const stateRef = useRef(state)
  stateRef.current = state

  const controller = useMemo(
    () => new AppController(dispatch, () => stateRef.current),
    [],
  )

  // Persist project + chat (debounced).
  useEffect(() => {
    const t = setTimeout(() => saveState({ project: state.project, chat: state.chat }), 400)
    return () => clearTimeout(t)
  }, [state.project, state.chat])

  // Recomposite whenever the current version's layer signature changes.
  const version = currentVersion(state)
  const signature = version
    ? `${version.id}|${version.layers.map((l) => `${l.id}:${l.status}:${l.visible}:${l.opacity}:${l.assetUrl ? 1 : 0}`).join('|')}`
    : 'none'
  useEffect(() => {
    controller.recompose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const value = useMemo(() => ({ state, controller }), [state, controller])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore outside provider')
  return ctx
}
