import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { agentIcon } from '../lib/ao/orchestrator'

const STATUS_DOT: Record<string, string> = {
  thinking: 'bg-amber-400',
  generating: 'bg-accent-400',
  uploading: 'bg-sky-400',
  composing: 'bg-violet-400',
  complete: 'bg-emerald-400',
  failed: 'bg-red-400',
}

export function AgentActivity() {
  const { state, controller } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [state.agentEvents.length])

  return (
    <div className="vf-fade-up fixed right-3 bottom-[130px] z-40 flex max-h-[46vh] w-[330px] flex-col rounded-xl border border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/8 px-3">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-zinc-400">AO ACTIVITY</span>
        <button
          onClick={() => controller.patchUI({ activityOpen: false })}
          aria-label="Close activity panel"
          className="rounded p-1 text-zinc-500 hover:bg-ink-700 hover:text-zinc-300"
        >
          ✕
        </button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {state.agentEvents.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-zinc-600">No agent activity yet.</p>
        )}
        {state.agentEvents.map((e) => (
          <div key={e.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-white/3">
            <span className="mt-1 text-[11px] tabular-nums text-zinc-600">
              {new Date(e.timestamp).toLocaleTimeString([], { hour12: false })}
            </span>
            <span
              className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[e.status] ?? 'bg-zinc-500'}`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="font-medium text-zinc-300">
                <span aria-hidden="true" className="mr-1">{agentIcon(e.agent)}</span>
                {e.agent}
              </div>
              <div className="text-zinc-500">{e.action}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
