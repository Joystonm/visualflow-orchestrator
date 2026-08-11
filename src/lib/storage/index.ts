import type { ChatMessage, Project } from '../../types'

const KEY = 'visualflow:v1'

interface PersistedState {
  project: Project | null
  chat: ChatMessage[]
}

export function saveState(state: PersistedState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Quota exceeded: retry without version thumbnails (largest payloads).
    try {
      const slim: PersistedState = state.project
        ? {
            ...state,
            project: {
              ...state.project,
              versions: state.project.versions.map((v) => ({ ...v, thumbnail: null, compositeUrl: null })),
            },
          }
        : state
      localStorage.setItem(KEY, JSON.stringify(slim))
    } catch {
      /* give up quietly — persistence is best-effort */
    }
  }
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed.project) {
      // Anything mid-generation when the tab closed is stale — mark failed so the UI offers retry.
      for (const v of parsed.project.versions) {
        for (const l of v.layers) {
          if (l.status !== 'complete' && l.status !== 'failed') l.status = l.assetUrl ? 'complete' : 'failed'
        }
      }
    }
    return parsed
  } catch {
    return null
  }
}

export function clearState() {
  localStorage.removeItem(KEY)
}
