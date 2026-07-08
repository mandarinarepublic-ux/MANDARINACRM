'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ROLES = ['ADMIN', 'VENDEDOR', 'DISEÑO', 'DESPACHO']
const AREAS_DISENO = ['SUBLIMACION', 'ESTAMPADO', 'BORDADO']

export default function UsuariosPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', codigo: '', email: '', password: '', rol: 'VENDEDOR', areas: [], tiendas: ['MANDARINA', 'INDSTORE'] })
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState(null) // usuario en edición (o null)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.rol !== 'ADMIN') { router.push('/dashboard'); return }
    setUser(u)
    loadUsuarios()
  }, [])

  async function loadUsuarios() {
    const res = await fetch('/api/usuarios')
    const data = await res.json()
    setUsuarios(data.usuarios || [])
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setShowForm(false)
      setForm({ nombre: '', codigo: '', email: '', password: '', rol: 'VENDEDOR', areas: [], tiendas: ['MANDARINA', 'INDSTORE'] })
      loadUsuarios()
    } finally {
      setSaving(false)
    }
  }

  function startEdit(u) {
    setShowForm(false)
    setEditForm({
      id: u.USUARIO_ID,
      nombre: u.NOMBRE,
      rol: u.ROL || 'VENDEDOR',
      areas: u.AREAS ? u.AREAS.split(',').map(a => a.trim()).filter(Boolean) : [],
      tiendas: u.TIENDAS ? u.TIENDAS.split(',').map(t => t.trim()).filter(Boolean) : [],
      activo: u.ACTIVO === 'TRUE',
    })
  }

  async function handleUpdate() {
    if (!editForm) return
    setSavingEdit(true)
    try {
      await fetch('/api/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editForm.id,
          rol: editForm.rol,
          areas: editForm.areas,
          tiendas: editForm.tiendas,
          activo: editForm.activo,
        }),
      })
      setEditForm(null)
      loadUsuarios()
    } finally {
      setSavingEdit(false)
    }
  }

  const roleColors = { ADMIN: 'text-red-400 bg-red-500/20', VENDEDOR: 'text-blue-400 bg-blue-500/20', 'DISEÑO': 'text-purple-400 bg-purple-500/20', DESPACHO: 'text-green-400 bg-green-500/20' }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 pt-2">
        <h1 className="text-xl font-display font-bold text-white">Gestión de Usuarios</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm px-4 py-2">
          {showForm ? '✕ Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>

      {/* Form */}
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
                <label className="label">Rol *</label>
                <select className="input" value={form.rol} onChange={e => setForm(f => ({...f, rol: e.target.value}))}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Email *</label>
                <input className="input" type="email" required placeholder="juan@mandarina.com" value={form.email}
                  onChange={e => setForm(f => ({...f, email: e.target.value}))} />
              </div>
              <div className="col-span-2">
                <label className="label">Contraseña *</label>
                <input className="input" type="password" required placeholder="Mínimo 6 caracteres" value={form.password}
                  onChange={e => setForm(f => ({...f, password: e.target.value}))} />
              </div>
            </div>

            {form.rol === 'DISEÑO' && (
              <div>
                <label className="label">Áreas asignadas</label>
                <div className="flex gap-2">
                  {AREAS_DISENO.map(a => (
                    <label key={a} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all
                      ${form.areas.includes(a) ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 text-gray-500'}`}>
                      <input type="checkbox" className="hidden" checked={form.areas.includes(a)}
                        onChange={e => setForm(f => ({...f, areas: e.target.checked ? [...f.areas, a] : f.areas.filter(x => x !== a)}))} />
                      <span className="text-sm">{a}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="label">Tiendas con acceso</label>
              <div className="flex gap-2">
                {['MANDARINA', 'INDSTORE'].map(t => (
                  <label key={t} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all
                    ${form.tiendas.includes(t) ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 text-gray-500'}`}>
                    <input type="checkbox" className="hidden" checked={form.tiendas.includes(t)}
                      onChange={e => setForm(f => ({...f, tiendas: e.target.checked ? [...f.tiendas, t] : f.tiendas.filter(x => x !== t)}))} />
                    <span className="text-sm">{t === 'MANDARINA' ? '🍊 Mandarina' : '🏪 Indstore'}</span>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? '⏳ Creando...' : 'Crear usuario'}
            </button>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
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
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-white text-sm">{u.NOMBRE}</span>
                    <span className="font-mono text-xs text-gray-500">[{u.CODIGO}]</span>
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
                  <div>
                    <label className="label">Rol</label>
                    <select className="input" value={editForm.rol}
                      onChange={e => setEditForm(f => ({ ...f, rol: e.target.value }))}>
                      {ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>

                  {editForm.rol === 'DISEÑO' && (
                    <div>
                      <label className="label">Áreas asignadas (bandejas)</label>
                      <div className="flex gap-2 flex-wrap">
                        {AREAS_DISENO.map(a => (
                          <label key={a} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all
                            ${editForm.areas.includes(a) ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 text-gray-500'}`}>
                            <input type="checkbox" className="hidden" checked={editForm.areas.includes(a)}
                              onChange={e => setEditForm(f => ({ ...f, areas: e.target.checked ? [...f.areas, a] : f.areas.filter(x => x !== a) }))} />
                            <span className="text-sm">{a}</span>
                          </label>
                        ))}
                      </div>
                      {editForm.areas.length > 1 && (
                        <p className="text-xs text-mandarina-400 mt-1">
                          🔗 Verá {editForm.areas.join(' + ')} en una sola bandeja unificada.
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="label">Tiendas con acceso</label>
                    <div className="flex gap-2">
                      {['MANDARINA', 'INDSTORE'].map(t => (
                        <label key={t} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all
                          ${editForm.tiendas.includes(t) ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 text-gray-500'}`}>
                          <input type="checkbox" className="hidden" checked={editForm.tiendas.includes(t)}
                            onChange={e => setEditForm(f => ({ ...f, tiendas: e.target.checked ? [...f.tiendas, t] : f.tiendas.filter(x => x !== t) }))} />
                          <span className="text-sm">{t === 'MANDARINA' ? '🍊 Mandarina' : '🏪 Indstore'}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editForm.activo}
                      onChange={e => setEditForm(f => ({ ...f, activo: e.target.checked }))} />
                    <span className="text-sm text-gray-300">Usuario activo</span>
                  </label>

                  <div className="flex gap-2">
                    <button onClick={handleUpdate} disabled={savingEdit} className="btn-primary flex-1">
                      {savingEdit ? '⏳ Guardando...' : '💾 Guardar cambios'}
                    </button>
                    <button onClick={() => setEditForm(null)} className="btn-secondary px-4">Cancelar</button>
                  </div>
                  <p className="text-xs text-gray-500">
                    ⚠️ El trabajador debe cerrar sesión y volver a entrar para que el cambio de áreas surta efecto.
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
