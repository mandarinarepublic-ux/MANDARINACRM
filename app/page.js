'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { volverSeguro } from '@/lib/volver'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const data = await res.json()
      if (!res.ok || !data.user) {
        setError(data.error || 'Usuario o contraseña incorrectos')
        return
      }
      localStorage.setItem('mp_user', JSON.stringify(data.user))
      // Si el middleware nos mandó aquí desde una pantalla concreta, se vuelve
      // a ella (?volver=/dashboard/historial) en vez de aterrizar siempre en el
      // inicio. Se lee de la URL y se exige que sea una ruta interna.
      // El destino ya no es solo interno: el inbox es OTRA aplicación y también
      // manda gente acá. `volverSeguro` decide qué se acepta (lib/volver.js).
      const destino = volverSeguro(new URLSearchParams(window.location.search).get('volver'))
      if (destino.startsWith('/')) router.push(destino)
      else window.location.href = destino   // otra app: navegación completa, no router
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Tiempo de espera agotado. Intenta de nuevo.')
      } else {
        setError('Error de conexión. Intenta de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div aria-hidden="true" className="inline-flex items-center justify-center w-16 h-16 bg-mandarina-500 rounded-2xl mb-4 text-3xl">
            🍊
          </div>
          <h1 className="text-2xl font-display font-bold text-white">Mandarina Pro</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de gestión de pedidos</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              {/* htmlFor + id: tocar la etiqueta enfoca el campo y el lector de
                  pantalla dice "Usuario". name + autoComplete: el gestor de
                  contraseñas del celular/PC reconoce el formulario y ofrece
                  guardar y rellenar (en PCs compartidas, cada quien decide). */}
              <label htmlFor="login-usuario" className="block text-xs font-medium text-gray-400 mb-1.5">Usuario</label>
              <input
                id="login-usuario"
                name="username"
                type="text"
                autoComplete="username"
                spellCheck={false}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="ANDRES"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-mandarina-500 focus:ring-1 focus:ring-mandarina-500 transition-colors text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="login-clave" className="block text-xs font-medium text-gray-400 mb-1.5">Contraseña</label>
              <input
                id="login-clave"
                name="password"
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                autoCapitalize="none"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-mandarina-500 focus:ring-1 focus:ring-mandarina-500 transition-colors text-sm"
                required
              />
            </div>
            {error && (
              // role="alert": el error se anuncia apenas aparece.
              <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mandarina-500 hover:bg-mandarina-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span aria-hidden="true" className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Ingresando…
                </span>
              ) : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-700 text-xs mt-6">
          Mandarina Republic © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
