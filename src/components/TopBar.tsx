import { useEffect, useState } from 'react'
import { useStore } from './../store'
import { Logo } from './EmptyState'
import { clearState } from '../lib/storage'
import { logout } from '../lib/auth'

export function TopBar() {
  const { state, controller } = useStore()
  const project = state.project!
  const working = state.agentTasks.filter(
    (t) => t.status !== 'complete' && t.status !== 'failed' && t.status !== 'idle',
  ).length
  const busy = state.phase === 'planning' || state.phase === 'generating'
  const canCompare = project.versions.length >= 2

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 bg-ink-900 px-3">
      <div className="flex w-[300px] items-center gap-2.5">
        <Logo size={20} />
        <span className="text-[13px] font-semibold tracking-[0.18em] text-zinc-300">VISUALFLOW</span>
        <NewProjectButton />
      </div>

      <div className="text-[13px] font-medium text-zinc-400">
        {project.name}
      </div>

      <div className="flex w-[420px] items-center justify-end gap-1.5">
        <button
          onClick={() => controller.patchUI({ activityOpen: !state.activityOpen })}
          aria-pressed={state.activityOpen}
          className={`mr-2 flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
            busy
              ? 'border-accent-500/40 bg-accent-600/10 text-accent-400'
              : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
          }`}
          title="AO activity log"
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${busy ? 'bg-accent-400 vf-pulse' : 'bg-emerald-400'}`} />
          {busy ? `${Math.max(working, 1)} AGENT${working === 1 ? '' : 'S'} WORKING` : 'AO ONLINE'}
        </button>

        <IconButton label="Undo" disabled={state.undoStack.length === 0} onClick={() => controller.undo()}>
          <path d="M3 7h8a4 4 0 0 1 0 8H6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M6 4 3 7l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </IconButton>
        <IconButton label="Redo" disabled={state.redoStack.length === 0} onClick={() => controller.redo()}>
          <path d="M15 7H7a4 4 0 0 0 0 8h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="m12 4 3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </IconButton>

        <button
          onClick={() => controller.openCompare()}
          disabled={!canCompare}
          className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Compare
        </button>
        <button
          onClick={() => controller.patchUI({ exportOpen: true })}
          disabled={!state.compositeUrl}
          className="rounded-md bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export
        </button>
        <button
          onClick={logout}
          title="Sign out"
          className="rounded-md px-2 py-1.5 text-[12px] text-zinc-500 transition-colors hover:bg-ink-700 hover:text-zinc-300"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}

function NewProjectButton() {
  const [arming, setArming] = useState(false)
  useEffect(() => {
    if (!arming) return
    const t = setTimeout(() => setArming(false), 3000)
    return () => clearTimeout(t)
  }, [arming])
  return (
    <button
      onClick={() => {
        if (!arming) {
          setArming(true)
          return
        }
        clearState()
        window.location.reload()
      }}
      className={`ml-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
        arming
          ? 'border-red-500/40 bg-red-500/10 text-red-400'
          : 'border-white/10 text-zinc-400 hover:bg-ink-700 hover:text-zinc-200'
      }`}
      title={arming ? 'Click again to discard the current project' : 'New project'}
    >
      {arming ? 'Discard project?' : 'New'}
    </button>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-ink-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-35"
    >
      <svg width="18" height="18" viewBox="0 0 18 18">{children}</svg>
    </button>
  )
}
