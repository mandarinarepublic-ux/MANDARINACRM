'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import VistaAdmin from '@/components/caja/VistaAdmin'
import VistaResponsable from '@/components/caja/VistaResponsable'

/**
 * CAJA de la tienda. El admin ve la vista de control; quien tiene el permiso
 * CAJA (la responsable) ve su arqueo a ciegas y el cierre del día.
 * Si el admin además es responsable de una caja, puede pasar a «Mi caja».
 */
export default function CajaPage() {
  const router = useRouter()
  const [rol, setRol] = useState(null)
  const [tieneCaja, setTieneCaja] = useState(false)
  const [vista, setVista] = useState('control')

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mp_user') || 'null')
      if (!u) router.push('/')
      else setRol(u.rol || '')
    } catch { router.push('/') }
  }, [router])

  // ¿El admin es responsable de alguna caja? 200 = sí; 404 = no (solo control).
  useEffect(() => {
    if (rol !== 'ADMIN') return
    let vivo = true
    fetch('/api/caja', { cache: 'no-store' })
      .then((r) => { if (vivo) setTieneCaja(r.ok) })
      .catch(() => {})
    return () => { vivo = false }
  }, [rol])

  if (rol === null) return <div className="p-4 text-sm text-gray-500">Cargando…</div>
  const admin = rol === 'ADMIN'
  const enControl = admin && (!tieneCaja || vista === 'control')
  return (
    <div className={`${enControl ? 'max-w-5xl' : 'max-w-xl'} mx-auto p-3 sm:p-4 space-y-4`}>
      {admin && tieneCaja && (
        <div role="group" aria-label="Vista de la caja" className="grid grid-cols-2 gap-2">
          {[['mia', 'Mi caja'], ['control', 'Control']].map(([k, txt]) => (
            <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${vista === k ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
              {txt}
            </button>
          ))}
        </div>
      )}
      {enControl ? <VistaAdmin /> : <VistaResponsable />}
    </div>
  )
}
