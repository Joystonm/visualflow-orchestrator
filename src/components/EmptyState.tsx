import { useState } from 'react'
import type { AspectRatio } from '../types'
import { useStore } from '../store'

const RATIOS: { value: AspectRatio; w: number; h: number }[] = [
  { value: '1:1', w: 14, h: 14 },
  { value: '4:5', w: 12, h: 15 },
  { value: '16:9', w: 18, h: 10 },
  { value: '9:16', w: 10, h: 18 },
]

const EXAMPLES = [
  'Cinematic Tokyo street during heavy rain',
  'Ancient Rome at golden hour',
  'Minimal futuristic product advertisement',
  'Surreal desert with floating architecture',
]

export function EmptyState() {
  const { state, controller } = useStore()
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState<AspectRatio>('16:9')
  const planning = state.phase === 'planning'

  const submit = () => {
    const p = prompt.trim()
    if (!p || planning) return
    void controller.generateScene(p, ratio)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-ink-950 px-6">
      <div className="vf-fade-up w-full max-w-2xl">
        <div className="mb-10 flex items-center gap-2.5">
          <Logo />
          <span className="text-sm font-semibold tracking-[0.2em] text-zinc-300">VISUALFLOW</span>
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">
          Create something worth seeing.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
          Describe a scene. VisualFlow coordinates a team of AI agents to turn it into a layered,
          editable composition.
        </p>

        <div className="mt-8 rounded-xl border border-white/10 bg-ink-900 p-3 shadow-2xl shadow-black/40 focus-within:border-accent-500/50">
          <textarea
            autoFocus
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Describe the image you want to create..."
            aria-label="Scene description"
            className="w-full resize-none bg-transparent px-1 py-0.5 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Aspect ratio">
              {RATIOS.map((r) => (
                <button
                  key={r.value}
                  role="radio"
                  aria-checked={ratio === r.value}
                  onClick={() => setRatio(r.value)}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    ratio === r.value
                      ? 'bg-ink-700 text-zinc-100'
                      : 'text-zinc-500 hover:bg-ink-800 hover:text-zinc-300'
                  }`}
                >
                  <span
                    className={`inline-block rounded-[2px] border ${ratio === r.value ? 'border-accent-400' : 'border-zinc-600'}`}
                    style={{ width: r.w, height: r.h }}
                  />
                  {r.value}
                </button>
              ))}
            </div>
            <button
              onClick={submit}
              disabled={!prompt.trim() || planning}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {planning ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-white vf-pulse" />
                  Scene Director is planning...
                </span>
              ) : (
                'Generate Scene'
              )}
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-white/8 bg-ink-900 px-3.5 py-1.5 text-[13px] text-zinc-400 transition-colors hover:border-white/15 hover:text-zinc-200"
            >
              {ex}
            </button>
          ))}
        </div>

        <p className="mt-12 text-xs text-zinc-600">
          One prompt. An entire creative team — Scene Director, Background, Subject, Lighting and
          Effects agents, orchestrated by AO.
        </p>
      </div>
    </div>
  )
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="6" fill="none" stroke="#6366f1" strokeWidth="2.5" />
      <rect x="8.5" y="8.5" width="15" height="15" rx="3" fill="none" stroke="#818cf8" strokeWidth="2" opacity="0.7" />
      <rect x="13.5" y="13.5" width="5" height="5" rx="1" fill="#a5b4fc" />
    </svg>
  )
}
