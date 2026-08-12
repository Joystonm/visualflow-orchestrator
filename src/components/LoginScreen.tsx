import { useState } from 'react'
import { login } from '../lib/auth'
import { Logo } from './EmptyState'

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await login(email, password)
    setBusy(false)
    if (result.ok) onSuccess()
    else setError(result.error ?? 'Sign-in failed.')
  }

  return (
    <div className="flex h-full items-center justify-center bg-ink-950 px-6">
      <form onSubmit={submit} className="vf-fade-up w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo />
          <span className="text-sm font-semibold tracking-[0.2em] text-zinc-300">VISUALFLOW</span>
        </div>
        <h1 className="text-xl font-semibold text-zinc-50">Sign in</h1>
        <p className="mt-1 text-[13px] text-zinc-500">Private judging build — credentials required.</p>

        <label className="mt-6 block text-[12px] font-medium text-zinc-400">
          Email
          <input
            type="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-[14px] text-zinc-100 placeholder:text-zinc-600 focus:border-accent-500/50 focus:outline-none"
            placeholder="you@example.com"
          />
        </label>
        <label className="mt-3 block text-[12px] font-medium text-zinc-400">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-[14px] text-zinc-100 placeholder:text-zinc-600 focus:border-accent-500/50 focus:outline-none"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="mt-5 w-full rounded-lg bg-accent-600 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
