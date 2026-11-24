'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import VistaAdmin from '@/components/caja/VistaAdmin'
import VistaResponsable from '@/components/caja/VistaResponsable'

/**
 * CAJA de la tienda. El admin ve la vista de control; quien tiene el permiso
 * CAJA (la responsable) ve su arqueo a ciegas y el cierre del día.
 */
export default function CajaPage() {
  const router = useRouter()
  const [rol, setRol] = useState(null)

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mp_user') || 'null')
      if (!u) router.push('/')
      else setRol(u.rol || '')
    } catch { router.push('/') }
  }, [router])

  if (rol === null) return <div className="p-4 text-sm text-gray-500">Cargando…</div>
  return (
    <div className={`${rol === 'ADMIN' ? 'max-w-5xl' : 'max-w-xl'} mx-auto p-3 sm:p-4`}>
      {rol === 'ADMIN' ? <VistaAdmin /> : <VistaResponsable />}
    </div>
  )
}
