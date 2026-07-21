'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ROLES, ROL_LABEL, AREAS, usaAreas, avisoSinAreas } from '@/lib/roles'

const FORM_VACIO = {
  nombre: '', codigo: '', username: '', email: '', password: '',
  rol: 'VENDEDOR', areas: [], tiendas: ['MANDARINA', 'INDSTORE'],
}

export default function UsuariosPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadStatus, setLoadStatus] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')
  const [editForm, setEditForm] = useState(null) // usuario en edición (o null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    // Este chequeo es solo para no mostrar una pantalla inútil: la autorización
    // de verdad la hace el servidor (requireAdmin en /api/usuarios), porque este
    // localStorage lo puede editar cualquiera desde la consola del navegador.
    if (u.rol !== 'ADMIN') { router.push('/dashboard'); return }
    setUser(u)
    loadUsuarios(u)
  }, [])

  /** Cabeceras con las que el servidor verifica que quien pide es ADMIN. */
  function authHeaders(u = user) {
    return {
      'Content-Type': 'application/json',
      'x-mp-usuario-id': u?.id || '',
    }
  }

  /** Lee el error que manda la API; si no hay, devuelve uno genérico con el código. */
  async function leerError(res) {
    const body = await res.json().catch(() => ({}))
    return body.error || `Error ${res.status}`
  }

  async function loadUsuarios(u = user) {
    setLoading(true)
    setLoadError('')
    setLoadStatus(0)
    try {
      const res = await fetch('/api/usuarios', { headers: authHeaders(u) })
      if (!res.ok) {
        setLoadStatus(res.status)
        throw new Error(await leerError(res))
      }
      const data = await res.json()
      setUsuarios(data.usuarios || [])
    } catch (e) {
      // Antes un fallo dejaba la lista vacía (o el spinner girando para siempre)
      // sin decir nada, y parecía que no había usuarios.
      setLoadError(e.message || 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setCreateError('')
    setAviso('')
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(form),
      })
      // Sin mirar res.ok, un 409 (duplicado) o un 500 se veían igual que un éxito:
      // el formulario se cerraba y limpiaba como si hubiera guardado.
      if (!res.ok) { setCreateError(await leerError(res)); return }

      setAviso(`Usuario "${form.nombre}" creado. Entra con: ${form.username}`)
      setShowForm(false)
      setForm(FORM_VACIO)
      await loadUsuarios()
    } catch (e) {
      setCreateError(e.message || 'Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(u) {
    setShowForm(false)
    setEditError('')
    setEditForm({
      id: u.USUARIO_ID,
      nombre: u.NOMBRE || '',
      codigo: u.CODIGO || '',
      username: u.USERNAME || '',
      email: u.EMAIL || '',
      password: '',
      rol: u.ROL || 'VENDEDOR',
      areas: u.AREAS ? u.AREAS.split(',').map(a => a.trim()).filter(Boolean) : [],
      tiendas: u.TIENDAS ? u.TIENDAS.split(',').map(t => t.trim()).filter(Boolean) : [],
      activo: u.ACTIVO === 'TRUE',
    })
  }

  async function handleUpdate() {
    if (!editForm) return

    const esYoMismo = editForm.id === user?.id
    if (esYoMismo && (!editForm.activo || editForm.rol !== 'ADMIN')) {
      const ok = window.confirm(
        '⚠️ Te estás quitando el acceso a ti mismo.\n\n' +
        (editForm.activo ? `Cambiarías tu rol a ${editForm.rol}` : 'Te desactivarías') +
        ' y perderías la administración del sistema.\n\n¿Continuar?'
      )
      if (!ok) return
    }

    if (!editForm.username.trim()) {
      setEditError('El usuario para entrar no puede quedar vacío.')
      return
    }

    setSavingEdit(true)
    setEditError('')
    setAviso('')   // el aviso verde anterior no debe convivir con esta operación
    try {
      const res = await fetch('/api/usuarios', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          id: editForm.id,
          username: editForm.username,
          email: editForm.email,
          rol: editForm.rol,
          areas: editForm.areas,
          tiendas: editForm.tiendas,
          activo: editForm.activo,
          password: editForm.password,   // vacío = no se toca
        }),
      })
      if (!res.ok) { setEditError(await leerError(res)); return }

      const data = await res.json().catch(() => ({}))
      setAviso(
        data.passwordCambiada
          ? `Contraseña de "${editForm.nombre}" actualizada.`
          : `Cambios guardados en "${editForm.nombre}".`
      )
      setEditForm(null)
      await loadUsuarios()
    } catch (e) {
      setEditError(e.message || 'Error de conexión')
    } finally {
      setSavingEdit(false)
    }
  }

  const roleColors = {
    ADMIN: 'text-red-400 bg-red-500/20',
    VENDEDOR: 'text-blue-400 bg-blue-500/20',
    VENDEDOR_YAW: 'text-indigo-400 bg-indigo-500/20',
    'DISEÑO': 'text-purple-400 bg-purple-500/20',
    ESTAMPADO: 'text-orange-400 bg-orange-500/20',
    SUBLIMACION: 'text-cyan-400 bg-cyan-500/20',
    BORDADO: 'text-pink-400 bg-pink-500/20',
    CORTE: 'text-amber-400 bg-amber-500/20',
    DESPACHO: 'text-green-400 bg-green-500/20',
  }

  const AreasPicker = ({ valor, onChange }) => (
    <div className="flex gap-2 flex-wrap">
      {AREAS.map(a => (
        <label key={a} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all
          ${valor.includes(a) ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 text-gray-500'}`}>
          <input type="checkbox" className="hidden" checked={valor.includes(a)}
            onChange={e => onChange(e.target.checked ? [...valor, a] : valor.filter(x => x !== a))} />
          <span className="text-sm">{a}</span>
        </label>
      ))}
    </div>
  )

  const TiendasPicker = ({ valor, onChange }) => (
    <div className="flex gap-2">
      {['MANDARINA', 'INDSTORE'].map(t => (
        <label key={t} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all
          ${valor.includes(t) ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 text-gray-500'}`}>
          <input type="checkbox" className="hidden" checked={valor.includes(t)}
            onChange={e => onChange(e.target.checked ? [...valor, t] : valor.filter(x => x !== t))} />
          <span className="text-sm">{t === 'MANDARINA' ? '🍊 Mandarina' : '🏪 Indstore'}</span>
        </label>
      ))}
    </div>
  )

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 pt-2">
        <h1 className="text-xl font-display font-bold text-white">Gestión de Usuarios</h1>
        <button onClick={() => { setShowForm(!showForm); setCreateError('') }} className="btn-primary text-sm px-4 py-2">
          {showForm ? '✕ Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>

      {aviso && (
        <div className="mb-4 flex items-center justify-between gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
          <span className="text-sm text-green-300">✅ {aviso}</span>
          <button onClick={() => setAviso('')} className="text-green-400 hover:text-green-200 text-xs">✕</button>
        </div>
      )}

      {/* Alta */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h3 className="font-semibold text-white mb-4">Nuevo usuario</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Nombre completo *</label>
                <input className="input" required placeholder="Juan Pérez" value={form.nombre}
                  onChange={e => setForm(f => ({...f, nombre: e.target.value}))} />
              </div>
              <div>
                <label className="label">Código (3 letras) *</label>
                <input className="input" required maxLength={3} placeholder="JUA" value={form.codigo}
                  onChange={e => setForm(f => ({...f, codigo: e.target.value.toUpperCase()}))} />
              </div>
              <div>
                <label className="label">Usuario para entrar *</label>
                <input className="input" required placeholder="JUAN" value={form.username}
                  onChange={e => setForm(f => ({...f, username: e.target.value.toUpperCase().trim()}))} />
              </div>
              <div className="col-span-2 -mt-1">
                <p className="text-xs text-gray-500">
                  👆 Esto es lo que la persona escribe en la pantalla de ingreso. Sin esto solo podría
                  entrar con su nombre completo o su correo.
                </p>
              </div>
              <div className="col-span-2">
                <label className="label">Rol *</label>
                <select className="input" value={form.rol} onChange={e => setForm(f => ({...f, rol: e.target.value}))}>
                  {ROLES.map(r => <option key={r} value={r}>{ROL_LABEL[r] || r}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Email *</label>
                <input className="input" type="email" required placeholder="juan@mandarina.com" value={form.email}
                  onChange={e => setForm(f => ({...f, email: e.target.value}))} />
              </div>
              <div className="col-span-2">
                <label className="label">Contraseña *</label>
                <input className="input" type="password" required minLength={6} autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres" value={form.password}
                  onChange={e => setForm(f => ({...f, password: e.target.value}))} />
              </div>
            </div>

            {usaAreas(form.rol) && (
              <div>
                <label className="label">Áreas asignadas</label>
                <AreasPicker valor={form.areas} onChange={areas => setForm(f => ({...f, areas}))} />
                {form.areas.length === 0 && avisoSinAreas(form.rol) && (
                  <p className="text-xs text-amber-400 mt-1">{avisoSinAreas(form.rol)}</p>
                )}
              </div>
            )}

            <div>
              <label className="label">Tiendas con acceso</label>
              <TiendasPicker valor={form.tiendas} onChange={tiendas => setForm(f => ({...f, tiendas}))} />
            </div>

            {createError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                <p className="text-sm text-red-400">⚠️ {createError}</p>
              </div>
            )}

            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? '⏳ Creando...' : 'Crear usuario'}
            </button>
          </form>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-red-400 text-sm mb-1">No se pudo cargar la lista de usuarios</p>
          <p className="text-gray-600 text-xs mb-4">{loadError}</p>
          {/* Se decide por el CÓDIGO de estado, no por el texto: un 500 pasajero de
              la base no debe ofrecer borrar la sesión (dejaría al admin fuera del
              CRM entero por un fallo de una sola lectura). Solo el 401 lo hace. */}
          {loadStatus === 401 ? (
            <button onClick={() => { localStorage.removeItem('mp_user'); router.push('/') }}
              className="btn-primary text-xs px-4 py-2">Volver a iniciar sesión</button>
          ) : (
            <button onClick={() => loadUsuarios()} className="btn-ghost text-xs px-4 py-2">Reintentar</button>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-gray-800">
          {usuarios.map(u => (
            <div key={u.USUARIO_ID}>
              <div className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-white font-bold text-sm">
                  {u.NOMBRE?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-medium text-white text-sm">{u.NOMBRE}</span>
                    <span className="font-mono text-xs text-gray-500">[{u.CODIGO}]</span>
                    {u.USUARIO_ID === user?.id && (
                      <span className="badge text-xs bg-gray-700 text-gray-300">tú</span>
                    )}
                  </div>
                  {/* El USERNAME se muestra para que el admin sepa qué credencial dictar. */}
                  <div className="text-xs text-gray-400 font-mono">
                    {u.USERNAME
                      ? `entra como: ${u.USERNAME}`
                      : <span className="text-amber-400">⚠️ sin usuario — solo puede entrar con su correo</span>}
                  </div>
                  <div className="text-xs text-gray-500">{u.EMAIL}</div>
                  {u.AREAS && <div className="text-xs text-gray-600 mt-0.5">{u.AREAS}</div>}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`badge text-xs ${roleColors[u.ROL] || 'bg-gray-800 text-gray-400'}`}>{u.ROL}</span>
                  <span className={`text-xs ${u.ACTIVO === 'TRUE' ? 'text-green-400' : 'text-red-400'}`}>
                    {u.ACTIVO === 'TRUE' ? '● Activo' : '● Inactivo'}
                  </span>
                  <button onClick={() => editForm?.id === u.USUARIO_ID ? setEditForm(null) : startEdit(u)}
                    className="text-xs text-mandarina-400 hover:text-mandarina-300">
                    {editForm?.id === u.USUARIO_ID ? '✕ cerrar' : '✏️ editar'}
                  </button>
                </div>
              </div>

              {editForm?.id === u.USUARIO_ID && (
                <div className="px-4 pb-4 bg-gray-900/40 border-t border-gray-800 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Usuario para entrar</label>
                      <input className="input" value={editForm.username}
                        onChange={e => setEditForm(f => ({ ...f, username: e.target.value.toUpperCase().trim() }))} />
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input className="input" type="email" value={editForm.email}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                  </div>

                  {/* El nombre identifica los pedidos del vendedor en el historial
                      (crm.pedidos.vendedor_id guarda el NOMBRE), así que cambiarlo
                      desde aquí dejaría sus ventas huérfanas. */}
                  <p className="text-xs text-gray-600">
                    El nombre ({u.NOMBRE}) y el código ({u.CODIGO}) no se editan aquí: identifican
                    sus pedidos en el historial. Pídelo si hay que corregirlos.
                  </p>

                  <div>
                    <label className="label">Nueva contraseña</label>
                    <input className="input" type="password" autoComplete="new-password"
                      placeholder="Dejar vacío para no cambiarla" value={editForm.password}
                      onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
                    <p className="text-xs text-gray-500 mt-1">
                      Se usa para resetear la contraseña de alguien que la olvidó. Mínimo 6 caracteres.
                    </p>
                  </div>

                  <div>
                    <label className="label">Rol</label>
                    <select className="input" value={editForm.rol}
                      onChange={e => setEditForm(f => ({ ...f, rol: e.target.value }))}>
                      {ROLES.map(r => <option key={r} value={r}>{ROL_LABEL[r] || r}</option>)}
                    </select>
                  </div>

                  {usaAreas(editForm.rol) && (
                    <div>
                      <label className="label">Áreas asignadas (bandejas)</label>
                      <AreasPicker valor={editForm.areas}
                        onChange={areas => setEditForm(f => ({ ...f, areas }))} />
                      {editForm.areas.length > 1 && (
                        <p className="text-xs text-mandarina-400 mt-1">
                          🔗 Verá {editForm.areas.join(' + ')} en una sola bandeja unificada.
                        </p>
                      )}
                      {editForm.areas.length === 0 && avisoSinAreas(editForm.rol) && (
                        <p className="text-xs text-amber-400 mt-1">{avisoSinAreas(editForm.rol)}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="label">Tiendas con acceso</label>
                    <TiendasPicker valor={editForm.tiendas}
                      onChange={tiendas => setEditForm(f => ({ ...f, tiendas }))} />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editForm.activo}
                      onChange={e => setEditForm(f => ({ ...f, activo: e.target.checked }))} />
                    <span className="text-sm text-gray-300">Usuario activo</span>
                  </label>

                  {editError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                      <p className="text-sm text-red-400">⚠️ {editError}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={handleUpdate} disabled={savingEdit} className="btn-primary flex-1">
                      {savingEdit ? '⏳ Guardando...' : '💾 Guardar cambios'}
                    </button>
                    <button onClick={() => setEditForm(null)} className="btn-secondary px-4">Cancelar</button>
                  </div>
                  <p className="text-xs text-gray-500">
                    ⚠️ El trabajador debe cerrar sesión y volver a entrar para que los cambios de rol
                    o de áreas surtan efecto.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
