'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CotizacionForm from '@/components/cotizaciones/CotizacionForm'

// Solo ADMIN y vendedores acceden a Cotización.
const ROLES_OK = ['ADMIN', 'VENDEDOR', 'VENDEDOR_YAW']

export default function NuevaCotizacionPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (!ROLES_OK.includes(u.rol)) { router.push('/dashboard'); return }
    setUser(u)
  }, [])

  if (!user) return null

  return (
    <CotizacionForm
      user={user}
      onCreated={(id) => router.replace(`/dashboard/cotizacion/${id}`)}
    />
  )
}
