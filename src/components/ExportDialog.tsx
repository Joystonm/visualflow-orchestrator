import { useEffect, useState } from 'react'
import { currentVersion, useStore } from '../store'
import { compositeLayers, downloadComposite } from '../lib/compositor'

export function ExportDialog() {
  const { state, controller } = useStore()
  const project = state.project!
  const version = currentVersion(state)
  const [busy, setBusy] = useState<'png' | 'jpg' | 'copy' | null>(null)
  const [copied, setCopied] = useState(false)

  const close = () => controller.patchUI({ exportOpen: false })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exportAs = async (format: 'png' | 'jpg') => {
    if (!version) return
    setBusy(format)
    try {
      const { canvas } = await compositeLayers(version.layers, project.aspectRatio, {
        format: format === 'png' ? 'png' : 'jpeg',
      })
      downloadComposite(canvas, project.name, format)
    } finally {
      setBusy(null)
    }
  }

  const copyUrl = async () => {
    if (!state.compositeUrl) return
    setBusy('copy')
    try {
      await navigator.clipboard.writeText(state.compositeUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export composition"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="vf-fade-up w-[380px] rounded-xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-semibold text-zinc-100">Export composition</h2>
        <p className="mt-1 text-[12px] text-zinc-500">
          Flattens all visible layers at full resolution.
        </p>

        {state.compositeUrl && (
          <img src={state.compositeUrl} alt="Export preview" className="mt-4 w-full rounded-lg" />
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void exportAs('png')}
            disabled={busy !== null}
            className="flex-1 rounded-lg bg-accent-600 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
          >
            {busy === 'png' ? 'Exporting…' : 'Download PNG'}
          </button>
          <button
            onClick={() => void exportAs('jpg')}
            disabled={busy !== null}
            className="flex-1 rounded-lg border border-white/10 py-2 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-ink-700 disabled:opacity-50"
          >
            {busy === 'jpg' ? 'Exporting…' : 'Download JPG'}
          </button>
        </div>
        <button
          onClick={() => void copyUrl()}
          disabled={busy !== null}
          className="mt-2 w-full rounded-lg border border-white/10 py-2 text-[13px] text-zinc-400 transition-colors hover:bg-ink-700 disabled:opacity-50"
        >
          {copied ? '✓ Copied' : 'Copy image URL'}
        </button>
      </div>
    </div>
  )
}
