/**
 * Minimal judging gate. Credentials are verified server-side (/api/login);
 * on success the token is kept in localStorage and attached to generation
 * requests, which the server also verifies — so the credit-spending endpoint
 * is protected even against direct calls.
 */

const KEY = 'visualflow:auth'

export function authToken(): string | null {
  return localStorage.getItem(KEY)
}

export function isLoggedIn(): boolean {
  return !!authToken()
}

export function authHeaders(): Record<string, string> {
  const token = authToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      return { ok: false, error: res.status === 401 ? 'Invalid email or password.' : 'Sign-in failed. Try again.' }
    }
    localStorage.setItem(KEY, btoa(`${email.trim().toLowerCase()}:${password}`))
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not reach the server.' }
  }
}

export function logout() {
  localStorage.removeItem(KEY)
  window.location.reload()
}
