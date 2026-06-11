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
            <div key={u.USUARIO_ID} className="p-4 flex items-center gap-4">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
