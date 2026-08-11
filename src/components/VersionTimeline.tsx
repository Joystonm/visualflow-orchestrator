import { useStore, versionNumber } from '../store'
import { LAYER_LABELS } from '../lib/generation/scenePlanner'

export function VersionTimeline() {
  const { state, controller } = useStore()
  const project = state.project!
  const versions = project.versions

  return (
    <footer className="h-[118px] shrink-0 border-t border-white/8 bg-ink-900">
      <div className="flex h-8 items-center justify-between px-4">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-zinc-500">VERSIONS</span>
        <span className="text-[11px] text-zinc-600">
          Select any version to branch a new direction from it
        </span>
      </div>
      <div className="flex items-start gap-2 overflow-x-auto px-4 pb-2">
        {versions.map((v, i) => {
          const isCurrent = v.id === project.currentVersionId
          const prev = versions[i - 1]
          const isBranch = v.parentVersionId !== null && prev && v.parentVersionId !== prev.id
          return (
            <div key={v.id} className="flex shrink-0 items-center gap-2">
              {i > 0 && (
                <span className={`text-[11px] ${isBranch ? 'text-amber-500' : 'text-zinc-700'}`} aria-hidden="true">
                  {isBranch ? '⑂' : '─'}
                </span>
              )}
              <button
                onClick={() => controller.goToVersion(v.id)}
                aria-current={isCurrent}
                title={v.prompt}
                className={`group flex items-center gap-2 rounded-lg border p-1.5 pr-2.5 text-left transition-colors ${
                  isCurrent
                    ? 'border-accent-500/60 bg-accent-600/10'
                    : 'border-white/6 bg-ink-850 hover:border-white/15'
                }`}
              >
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt="" className="h-[52px] w-[52px] rounded object-cover" />
                ) : (
                  <div className="vf-shimmer h-[52px] w-[52px] rounded" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[12px] font-semibold ${isCurrent ? 'text-accent-400' : 'text-zinc-300'}`}>
                      {versionNumber(project, v.id)}
                    </span>
                    {isBranch && v.parentVersionId && (
                      <span className="rounded bg-amber-500/15 px-1 py-px text-[9px] font-semibold text-amber-500">
                        from {versionNumber(project, v.parentVersionId)}
                      </span>
                    )}
                  </div>
                  <div className="max-w-[130px] truncate text-[11px] text-zinc-500">{v.label}</div>
                  <div className="mt-0.5 flex gap-1">
                    {v.changedLayerTypes.slice(0, 3).map((t) => (
                      <span key={t} className="rounded bg-white/6 px-1 py-px text-[9px] text-zinc-400">
                        {LAYER_LABELS[t]}
                      </span>
                    ))}
                    {v.changedLayerTypes.length > 3 && (
                      <span className="text-[9px] text-zinc-600">+{v.changedLayerTypes.length - 3}</span>
                    )}
                  </div>
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </footer>
  )
}
