'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Gestión del catálogo de tipos de prenda (PRODUCTOS_CATALOGO).
 *
 * Hasta ahora esta lista solo crecía: cualquiera podía agregar desde el selector
 * del pedido, pero nadie —ni el admin— podía corregir un nombre mal escrito ni
 * quitar un duplicado. Así se acumularon cosas como "HOODIE SPIDERMAN" y
 * "HOODIES SPIDERMAN" conviviendo, o "BOLZO DE LIENZO".
 */
export default function TiposPrendaPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [editando, setEditando] = useState(null)   // { nombre, nuevoNombre }
  const [guardando, setGuardando] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.rol !== 'ADMIN') { router.push('/dashboard'); return }
    setUser(u)
    cargar(u)
  }, [])

  function headers(u = user) {
    return { 'Content-Type': 'application/json', 'x-mp-usuario-id': u?.id || '' }
  }

  async function leerError(res) {
    const b = await res.json().catch(() => ({}))
    return b.error || `Error ${res.status}`
  }

  async function cargar(u = user) {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/productos?gestion=1', { headers: headers(u) })
      if (!res.ok) throw new Error(await leerError(res))
      const d = await res.json()
      setProductos(d.productos || [])
    } catch (e) {
      setError(e.message || 'Error de conexión')
    } finally { setLoading(false) }
  }

  const norm = (s) => String(s ?? '').toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N').trim()

  const filtrados = useMemo(() => {
    const q = norm(busqueda)
    return productos
      .filter(p => verInactivos || p.ACTIVO)
      .filter(p => !q || norm(p.NOMBRE).includes(q))
  }, [productos, busqueda, verInactivos])

  const activos = productos.filter(p => p.ACTIVO).length
  const sinUso = productos.filter(p => p.USOS === 0).length

  async function patch(nombre, cambios, mensajeOk) {
    setGuardando(nombre); setError(''); setAviso('')
    try {
      const res = await fetch('/api/productos', {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ nombre, ...cambios }),
      })
      if (!res.ok) { setError(await leerError(res)); return false }
      setAviso(mensajeOk)
      await cargar()
      return true
    } catch (e) {
      setError(e.message || 'Error de conexión'); return false
    } finally { setGuardando('') }
  }

  async function guardarNombre() {
    if (!editando) return
    const destino = editando.nuevoNombre.trim().toUpperCase()
    if (!destino) { setError('El nombre no puede quedar vacío'); return }
    if (destino === editando.nombre) { setEditando(null); return }

    const p = productos.find(x => x.NOMBRE === editando.nombre)
    if (p?.USOS > 0 && !window.confirm(
      `"${editando.nombre}" ya se usó en ${p.USOS} prenda(s).\n\n` +
      `Los pedidos YA HECHOS conservan el nombre viejo — no se reescribe el historial.\n` +
      `Solo cambia el nombre que verán los vendedores de aquí en adelante.\n\n¿Continuar?`
    )) return

    const ok = await patch(editando.nombre, { nuevoNombre: destino }, `Renombrado a "${destino}"`)
    if (ok) setEditando(null)
  }

  async function borrar(p) {
    if (!window.confirm(`¿Borrar "${p.NOMBRE}" del catálogo?\n\nNunca se ha usado en un pedido.`)) return
    setGuardando(p.NOMBRE); setError(''); setAviso('')
    try {
      const res = await fetch('/api/productos', {
        method: 'DELETE', headers: headers(),
        body: JSON.stringify({ nombre: p.NOMBRE }),
      })
      if (!res.ok) { setError(await leerError(res)); return }
      setAviso(`"${p.NOMBRE}" eliminado`)
      await cargar()
    } catch (e) { setError(e.message || 'Error de conexión') }
    finally { setGuardando('') }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4 pt-2">
        <div>
          <h1 className="text-xl font-display font-bold text-white">👕 Tipos de prenda</h1>
          <p className="text-xs text-gray-500">
            {activos} activo(s) · {productos.length} en total
            {sinUso > 0 && ` · ${sinUso} sin usar`}
          </p>
        </div>
        <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-sm">← Volver</button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Esta es la lista que ven los vendedores al cargar una prenda personalizada.
        Desactivar un tipo lo saca del selector sin tocar los pedidos ya hechos.
      </p>

      <input className="input mb-2" placeholder="Buscar tipo de prenda…"
        value={busqueda} onChange={e => setBusqueda(e.target.value)} />

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />
        <span className="text-xs text-gray-400">Mostrar también los desactivados</span>
      </label>

      {aviso && (
        <div className="mb-3 flex items-center justify-between gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-green-300">✅ {aviso}</span>
          <button onClick={() => setAviso('')} className="text-green-400 hover:text-green-200 text-xs">✕</button>
        </div>
      )}
      {error && (
        <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-red-400">⚠️ {error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card p-8 text-center text-gray-600">Sin resultados</div>
      ) : (
        <div className="card divide-y divide-gray-800">
          {filtrados.map(p => (
            <div key={p.NOMBRE} className="p-3">
              {editando?.nombre === p.NOMBRE ? (
                <div className="space-y-2">
                  <input className="input" autoFocus value={editando.nuevoNombre}
                    onChange={e => setEditando(f => ({ ...f, nuevoNombre: e.target.value.toUpperCase() }))}
                    onKeyDown={e => { if (e.key === 'Enter') guardarNombre(); if (e.key === 'Escape') setEditando(null) }} />
                  <div className="flex gap-2">
                    <button onClick={guardarNombre} disabled={guardando === p.NOMBRE}
                      className="btn-primary flex-1 text-sm py-2">
                      {guardando === p.NOMBRE ? '⏳ Guardando…' : '💾 Guardar'}
                    </button>
                    <button onClick={() => setEditando(null)} className="btn-secondary px-4 text-sm">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${p.ACTIVO ? 'text-white' : 'text-gray-600 line-through'}`}>
                      {p.NOMBRE}
                    </div>
                    <div className="text-xs text-gray-600">
                      {p.USOS > 0 ? `usado en ${p.USOS} prenda(s)` : 'nunca usado'}
                      {!p.ACTIVO && ' · desactivado'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => setEditando({ nombre: p.NOMBRE, nuevoNombre: p.NOMBRE })}
                      title="Renombrar"
                      className="text-xs text-mandarina-400 hover:text-mandarina-300 px-2 py-1">✏️</button>
                    <button
                      onClick={() => patch(p.NOMBRE, { activo: !p.ACTIVO },
                        p.ACTIVO ? `"${p.NOMBRE}" desactivado` : `"${p.NOMBRE}" activado`)}
                      disabled={guardando === p.NOMBRE}
                      title={p.ACTIVO ? 'Desactivar' : 'Activar'}
                      className={`text-xs px-2 py-1 disabled:opacity-50 ${p.ACTIVO ? 'text-gray-400 hover:text-white' : 'text-green-400 hover:text-green-300'}`}>
                      {p.ACTIVO ? '🚫' : '✅'}
                    </button>
                    {/* Borrar solo si nunca se usó: si no, el histórico quedaría
                        apuntando a un tipo que ya no existe. */}
                    {p.USOS === 0 && (
                      <button onClick={() => borrar(p)} disabled={guardando === p.NOMBRE}
                        title="Borrar (nunca usado)"
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 disabled:opacity-50">🗑️</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
