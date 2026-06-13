'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    // Safety timeout — never stay stuck loading more than 10s
    const timeout = setTimeout(() => {
      setLoading(false)
      setError('El servidor tardó demasiado. Intenta de nuevo.')
    }, 10000)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      clearTimeout(timeout)
      if (!res.ok) { setError(data.error || 'Error al iniciar sesión'); setLoading(false); return }
      localStorage.setItem('mp_user', JSON.stringify(data.user))
      router.push('/dashboard')
    } catch (e) {
      clearTimeout(timeout)
      setError('Error de conexión. Verifica tu internet.')
    } finally {
      clearTimeout(timeout)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-mandarina-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-mandarina-500 rounded-2xl mb-4 shadow-lg shadow-mandarina-500/30">
            <span className="text-2xl font-display font-bold text-white">M</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-white">Mandarina Pro</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de gestión</p>
        </div>

        {/* Form */}
        <div className="card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">USUARIO</label>
              <input
                type="text"
                className="input"
                placeholder="CHRISTIAN"
                value={username}
                onChange={e => setUsername(e.target.value.toUpperCase())}
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Entrando...
                </span>
              ) : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          ¿Problemas para entrar? Contacta al administrador.
        </p>
      </div>
    </div>
  )
}
