'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CotizacionForm from '@/components/cotizaciones/CotizacionForm'

const ROLES_OK = ['ADMIN', 'VENDEDOR', 'VENDEDOR_YAW']

export default function EditarCotizacionPage({ params }) {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [cotizacion, setCotizacion] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (!ROLES_OK.includes(u.rol)) { router.push('/dashboard'); return }
    setUser(u)

    fetch(`/api/cotizaciones/${params.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.cotizacion) setCotizacion(d.cotizacion)
        else setError(d.error || 'No encontrada')
      })
      .catch((e) => setError(e.message))
  }, [])

  if (!user) return null
  if (error) return <div className="p-8 text-center text-gray-500">⚠️ {error}</div>
  if (!cotizacion) return <div className="p-16 text-center text-gray-500 text-sm">Cargando cotización…</div>

  return <CotizacionForm initial={cotizacion} user={user} />
}
