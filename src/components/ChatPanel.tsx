import { useEffect, useRef, useState } from 'react'
import { currentVersion, useStore } from '../store'
import type { AgentTask, ChatMessage as ChatMessageType } from '../types'
import { AGENT_ICONS } from '../lib/ao/orchestrator'
import { LAYER_LABELS } from '../lib/generation/scenePlanner'

export function ChatPanel() {
  const { state, controller } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const busy = state.phase === 'planning' || state.phase === 'generating'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.chat.length, state.agentTasks])

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-white/8 bg-ink-900">
      <div className="flex h-9 shrink-0 items-center border-b border-white/8 px-4">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-zinc-500">CONVERSATION</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {state.chat.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        {busy && <OrchestrationStatus tasks={state.agentTasks} planning={state.phase === 'planning'} />}
      </div>

      <PromptInput
        disabled={busy}
        onSubmit={(text) => void controller.refine(text)}
        selectedLayerName={
          state.selectedLayerId
            ? currentVersion(state)?.layers.find((l) => l.id === state.selectedLayerId)?.name ?? null
            : null
        }
        onClearSelection={() => controller.selectLayer(null)}
      />
    </aside>
  )
}

function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === 'user'
  return (
    <div className={`vf-fade-up mb-3 ${isUser ? 'flex justify-end' : ''}`}>
      <div
        className={`max-w-[92%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser ? 'bg-accent-600/20 text-zinc-100' : 'bg-ink-800 text-zinc-300'
        }`}
      >
        {message.content}
        {message.plan && message.plan.unchangedLayers.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-white/8 pt-2 text-[11px]">
            <div className="text-zinc-500">Affected layers</div>
            <div className="flex flex-wrap gap-1">
              {message.plan.affectedLayers.map((t) => (
                <span key={t} className="rounded bg-accent-600/25 px-1.5 py-0.5 font-medium text-accent-400">
                  {LAYER_LABELS[t]}
                </span>
              ))}
            </div>
            <div className="pt-0.5 text-zinc-500">Unchanged</div>
            <div className="flex flex-wrap gap-1">
              {message.plan.unchangedLayers.map((t) => (
                <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-500">
                  {LAYER_LABELS[t]} ✓
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  queued: 'text-zinc-500',
  thinking: 'text-amber-400',
  generating: 'text-accent-400',
  uploading: 'text-sky-400',
  composing: 'text-violet-400',
  complete: 'text-emerald-400',
  failed: 'text-red-400',
}

function OrchestrationStatus({ tasks, planning }: { tasks: AgentTask[]; planning: boolean }) {
  return (
    <div className="vf-fade-up mb-3 rounded-lg border border-accent-500/20 bg-ink-850 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-400 vf-pulse" />
        <span className="text-[11px] font-semibold tracking-[0.14em] text-accent-400">
          {planning ? 'CREATING YOUR SCENE' : 'AO ORCHESTRATOR'}
        </span>
      </div>
      {tasks.length === 0 && (
        <div className="text-[12px] text-zinc-500">Routing your request...</div>
      )}
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <div key={t.agent} className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span aria-hidden="true" className="w-4 text-center">{AGENT_ICONS[t.agent]}</span>
              {t.agent}
            </span>
            <span className={`font-medium ${STATUS_STYLE[t.status] ?? 'text-zinc-500'}`}>
              {t.status === 'complete' ? '✓' : t.status === 'failed' ? '⚠' : ''}{' '}
              {t.status === 'complete' ? '' : t.detail || t.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PromptInput({
  disabled,
  onSubmit,
  selectedLayerName,
  onClearSelection,
}: {
  disabled: boolean
  onSubmit: (text: string) => void
  selectedLayerName: string | null
  onClearSelection: () => void
}) {
  const [text, setText] = useState('')

  const submit = () => {
    const t = text.trim()
    if (!t || disabled) return
    setText('')
    onSubmit(t)
  }

  return (
    <div className="shrink-0 border-t border-white/8 p-3">
      {selectedLayerName && (
        <div className="mb-2 flex items-center justify-between rounded-md border border-accent-500/30 bg-accent-600/10 px-2.5 py-1.5 text-[11px]">
          <span className="text-accent-400">
            Editing <strong>{selectedLayerName}</strong> layer only
          </span>
          <button onClick={onClearSelection} className="text-zinc-500 hover:text-zinc-300" aria-label="Clear layer selection">
            ✕
          </button>
        </div>
      )}
      <div className="rounded-lg border border-white/10 bg-ink-850 p-2 focus-within:border-accent-500/50">
        <textarea
          autoFocus
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={disabled}
          placeholder={disabled ? 'Agents are working...' : 'Describe a change...'}
          aria-label="Refinement prompt"
          className="w-full resize-none bg-transparent px-1 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
        />
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            className="rounded-md bg-accent-600 px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
