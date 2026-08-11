import { currentVersion, useStore } from '../store'
import type { Layer } from '../types'
import { LAYER_ORDER } from '../lib/generation/scenePlanner'

const STATUS_LABEL: Record<Layer['status'], string> = {
  queued: 'Queued',
  thinking: 'Thinking',
  generating: 'Generating',
  uploading: 'Uploading',
  composing: 'Composing',
  complete: '',
  failed: 'Failed',
}

export function LayerPanel() {
  const { state, controller } = useStore()
  const version = currentVersion(state)
  if (!version) return null

  // Inspector lists top-most layer first (paint order reversed).
  const layers = [...version.layers].sort(
    (a, b) => LAYER_ORDER.indexOf(b.type) - LAYER_ORDER.indexOf(a.type),
  )
  const busy = state.phase === 'planning' || state.phase === 'generating'

  return (
    <aside className="flex w-[290px] shrink-0 flex-col border-l border-white/8 bg-ink-900">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/8 px-4">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-zinc-500">LAYERS</span>
        <span className="text-[11px] text-zinc-600">{layers.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {layers.map((layer) => (
          <LayerItem
            key={layer.id}
            layer={layer}
            selected={state.selectedLayerId === layer.id}
            busy={busy}
            onSelect={() => controller.selectLayer(state.selectedLayerId === layer.id ? null : layer.id)}
            onToggle={() => controller.toggleLayerVisibility(layer.id)}
            onRegenerate={() => void controller.regenerateLayer(layer.id)}
            onRetry={() => void controller.retryLayer(layer.id)}
            onDrop={() => controller.continueWithoutLayer(layer.id)}
          />
        ))}
      </div>
    </aside>
  )
}

function LayerItem({
  layer,
  selected,
  busy,
  onSelect,
  onToggle,
  onRegenerate,
  onRetry,
  onDrop,
}: {
  layer: Layer
  selected: boolean
  busy: boolean
  onSelect: () => void
  onToggle: () => void
  onRegenerate: () => void
  onRetry: () => void
  onDrop: () => void
}) {
  const working = layer.status !== 'complete' && layer.status !== 'failed'
  return (
    <div
      className={`group mb-1.5 rounded-lg border p-2.5 transition-colors ${
        selected
          ? 'border-accent-500/50 bg-accent-600/10'
          : layer.status === 'failed'
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-white/6 bg-ink-850 hover:border-white/12'
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name} layer`}
          aria-pressed={layer.visible}
          className={`mt-0.5 shrink-0 text-[15px] leading-none transition-opacity ${layer.visible ? 'text-zinc-300' : 'text-zinc-600 opacity-60'}`}
          title={layer.visible ? 'Hide layer' : 'Show layer'}
        >
          {layer.visible ? '👁' : '◡'}
        </button>

        {layer.assetUrl && layer.status === 'complete' ? (
          <img
            src={layer.assetUrl}
            alt=""
            loading="lazy"
            className={`h-9 w-9 shrink-0 rounded object-cover ${layer.visible ? '' : 'opacity-40'}`}
          />
        ) : (
          <div className={`h-9 w-9 shrink-0 rounded ${working ? 'vf-shimmer' : 'bg-ink-800'}`} />
        )}

        <button onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-[13px] font-medium ${layer.visible ? 'text-zinc-200' : 'text-zinc-500'}`}>
              {layer.name}
            </span>
            {layer.status === 'failed' ? (
              <span className="shrink-0 text-[10px] font-semibold text-red-400">⚠ FAILED</span>
            ) : working ? (
              <span className="shrink-0 text-[10px] font-semibold tracking-wide text-accent-400 vf-pulse">
                {STATUS_LABEL[layer.status].toUpperCase()}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">{layer.prompt}</p>
        </button>
      </div>

      <div className={`mt-2 flex gap-1.5 ${selected || layer.status === 'failed' ? '' : 'hidden group-hover:flex'}`}>
        {layer.status === 'failed' ? (
          <>
            <ActionButton onClick={onRetry} disabled={busy} primary>Retry</ActionButton>
            <ActionButton onClick={onRegenerate} disabled={busy}>Regenerate</ActionButton>
            <ActionButton onClick={onDrop} disabled={busy}>Continue without</ActionButton>
          </>
        ) : (
          <ActionButton onClick={onRegenerate} disabled={busy || working}>
            ↻ Regenerate
          </ActionButton>
        )}
      </div>
      {selected && layer.status === 'complete' && (
        <p className="mt-1.5 text-[10px] text-zinc-600">
          Generated {new Date(layer.createdAt).toLocaleTimeString()} · chat now edits only this layer
        </p>
      )}
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'bg-accent-600 text-white hover:bg-accent-500'
          : 'border border-white/10 text-zinc-300 hover:bg-ink-700'
      }`}
    >
      {children}
    </button>
  )
}
