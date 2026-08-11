import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, versionNumber } from '../store'
import { compositeLayers } from '../lib/compositor'
import { LAYER_LABELS } from '../lib/generation/scenePlanner'
import type { Version } from '../types'

export function CompareView() {
  const { state, controller } = useStore()
  const project = state.project!
  const { aId, bId, mode } = state.compare

  const a = project.versions.find((v) => v.id === aId) ?? null
  const b = project.versions.find((v) => v.id === bId) ?? null

  const close = () => controller.setCompare({ open: false })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compare versions"
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="m-auto flex h-[88vh] w-[92vw] max-w-6xl flex-col rounded-xl border border-white/10 bg-ink-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-4">
          <span className="text-[12px] font-semibold tracking-[0.14em] text-zinc-400">COMPARE VERSIONS</span>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-white/10 p-0.5">
              {(['slider', 'side'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => controller.setCompare({ mode: m })}
                  aria-pressed={mode === m}
                  className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    mode === m ? 'bg-ink-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {m === 'slider' ? 'Slider' : 'Side by side'}
                </button>
              ))}
            </div>
            <button onClick={close} aria-label="Close compare" className="rounded-md p-1.5 text-zinc-400 hover:bg-ink-700">
              ✕
            </button>
          </div>
        </div>

        <div className="flex shrink-0 gap-3 border-b border-white/8 px-4 py-2">
          <VersionPicker label="A" value={aId} onChange={(id) => controller.setCompare({ aId: id })} />
          <VersionPicker label="B" value={bId} onChange={(id) => controller.setCompare({ bId: id })} />
        </div>

        <div className="flex min-h-0 flex-1 gap-4 p-4">
          {a && b ? (
            mode === 'slider' ? (
              <SliderCompare a={a} b={b} />
            ) : (
              <>
                <ComparePane version={a} />
                <ComparePane version={b} />
              </>
            )
          ) : (
            <p className="m-auto text-[13px] text-zinc-500">Pick two versions to compare.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function VersionPicker({ label, value, onChange }: { label: string; value: string | null; onChange: (id: string) => void }) {
  const { state } = useStore()
  const project = state.project!
  return (
    <label className="flex items-center gap-2 text-[12px] text-zinc-400">
      <span className="font-semibold text-zinc-500">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-white/10 bg-ink-850 px-2 py-1 text-zinc-200 focus:outline-none"
      >
        {project.versions.map((v) => (
          <option key={v.id} value={v.id}>
            {versionNumber(project, v.id)} — {v.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Composite a version on demand (cached by version id + layer signature). */
function useVersionComposite(version: Version | null): string | null {
  const { state } = useStore()
  const project = state.project!
  const [url, setUrl] = useState<string | null>(version?.compositeUrl ?? null)
  const sig = version ? version.layers.map((l) => `${l.id}${l.visible}`).join() : ''
  useEffect(() => {
    let alive = true
    if (!version) return
    if (version.compositeUrl) {
      setUrl(version.compositeUrl)
      return
    }
    setUrl(null)
    compositeLayers(version.layers, project.aspectRatio)
      .then((r) => alive && setUrl(r.dataUrl))
      .catch(() => alive && setUrl(null))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id, sig])
  return url
}

function CompareMeta({ version }: { version: Version }) {
  const { state } = useStore()
  const project = state.project!
  return (
    <div className="mt-2 text-center">
      <div className="text-[12px] font-semibold text-zinc-200">
        {versionNumber(project, version.id)}
        <span className="ml-2 font-normal text-zinc-500">{new Date(version.createdAt).toLocaleTimeString()}</span>
      </div>
      <div className="mx-auto max-w-[300px] truncate text-[11px] text-zinc-500">“{version.prompt}”</div>
      <div className="mt-1 flex justify-center gap-1">
        {version.changedLayerTypes.map((t) => (
          <span key={t} className="rounded bg-accent-600/20 px-1.5 py-px text-[10px] text-accent-400">
            ✓ {LAYER_LABELS[t]}
          </span>
        ))}
      </div>
    </div>
  )
}

function ComparePane({ version }: { version: Version }) {
  const url = useVersionComposite(version)
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-ink-950">
        {url ? (
          <img src={url} alt={version.prompt} className="max-h-full max-w-full rounded" />
        ) : (
          <div className="vf-shimmer h-40 w-64 rounded-lg" />
        )}
      </div>
      <CompareMeta version={version} />
    </div>
  )
}

function SliderCompare({ a, b }: { a: Version; b: Version }) {
  const urlA = useVersionComposite(a)
  const urlB = useVersionComposite(b)
  const [pos, setPos] = useState(50)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onMove = useMemo(
    () => (clientX: number) => {
      const rect = boxRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
    },
    [],
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {urlA && urlB ? (
          <div
            ref={boxRef}
            className="relative max-h-full select-none overflow-hidden rounded-lg"
            onPointerDown={(e) => {
              dragging.current = true
              onMove(e.clientX)
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => dragging.current && onMove(e.clientX)}
            onPointerUp={() => (dragging.current = false)}
          >
            <img src={urlB} alt={b.prompt} className="block max-h-[62vh] max-w-full" draggable={false} />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
              <img
                src={urlA}
                alt={a.prompt}
                className="block max-h-[62vh] max-w-full"
                draggable={false}
                style={{ width: boxRef.current?.querySelector('img')?.clientWidth, maxWidth: 'none' }}
              />
            </div>
            <div
              className="absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.8)]"
              style={{ left: `${pos}%` }}
              aria-hidden="true"
            >
              <div className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] font-bold text-ink-950">
                ⇄
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              aria-label="Comparison slider"
              className="absolute inset-x-0 bottom-0 opacity-0"
            />
          </div>
        ) : (
          <div className="vf-shimmer h-40 w-64 rounded-lg" />
        )}
      </div>
      <div className="flex justify-center gap-10">
        <CompareMeta version={a} />
        <CompareMeta version={b} />
      </div>
    </div>
  )
}
