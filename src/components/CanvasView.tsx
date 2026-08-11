import { useRef, useState } from 'react'
import { currentVersion, useStore, versionNumber } from '../store'
import { FILTER_PRESETS } from '../lib/cloudinary/filters'

export function CanvasView() {
  const { state, controller } = useStore()
  const version = currentVersion(state)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const busy = state.phase === 'planning' || state.phase === 'generating'
  const generatingCount = version?.layers.filter((l) => l.status !== 'complete' && l.status !== 'failed').length ?? 0

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void containerRef.current?.requestFullscreen()
  }

  return (
    <main ref={containerRef} className="relative flex min-w-0 flex-1 flex-col bg-ink-950">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/8 px-3">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-zinc-500">
          CANVAS{version && state.project ? ` — ${versionNumber(state.project, version.id)}` : ''}
        </span>
        <div className="flex items-center gap-1">
          {version && state.compositeUrl && (
            <>
              <select
                value={
                  // Show a global value only when every layer agrees.
                  version.layers.every((l) => (l.filter ?? '') === (version.layers[0]?.filter ?? ''))
                    ? (version.layers[0]?.filter ?? '')
                    : 'mixed'
                }
                onChange={(e) => controller.applyFilterToAll(e.target.value === '' ? null : e.target.value)}
                aria-label="Filter for all layers"
                title="Cloudinary filter (all layers)"
                className="rounded border border-white/10 bg-ink-850 px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none"
              >
                <option value="">No filter</option>
                {FILTER_PRESETS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
                <option value="mixed" disabled hidden>
                  Mixed
                </option>
              </select>
              <div className="mx-1 h-4 w-px bg-white/10" />
            </>
          )}
          <ToolbarButton label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>−</ToolbarButton>
          <button
            onClick={() => setZoom(1)}
            className="min-w-[52px] rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 hover:bg-ink-800"
            title="Fit to screen"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolbarButton label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>+</ToolbarButton>
          <div className="mx-1 h-4 w-px bg-white/10" />
          <ToolbarButton label="Fullscreen" onClick={toggleFullscreen}>⛶</ToolbarButton>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {state.compositeUrl ? (
          <img
            src={state.compositeUrl}
            alt={version?.prompt ?? 'Generated composition'}
            className="max-h-full max-w-full rounded-md shadow-2xl shadow-black/60 transition-transform duration-150"
            style={{ transform: `scale(${zoom})` }}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            {busy ? (
              <>
                <div className="vf-shimmer h-48 w-72 rounded-lg" />
                <p className="text-[13px] text-zinc-500">Agents are building your scene...</p>
              </>
            ) : (
              <p className="text-[13px] text-zinc-600">Your canvas is waiting.</p>
            )}
          </div>
        )}

        {state.compositeUrl && (busy || state.compositing) && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-ink-900/90 px-3.5 py-1.5 text-[12px] text-zinc-300 shadow-lg backdrop-blur">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent-400 vf-pulse" />
            {busy
              ? generatingCount > 0
                ? `${generatingCount} layer${generatingCount > 1 ? 's' : ''} generating...`
                : 'Combining your layers...'
              : 'Combining your layers...'}
          </div>
        )}
      </div>
    </main>
  )
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-[13px] text-zinc-400 hover:bg-ink-800 hover:text-zinc-200"
    >
      {children}
    </button>
  )
}
