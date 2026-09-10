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

  // ⚠️ Tras crear se cambia la URL SIN desmontar el formulario. Antes era
  // `router.replace(...)`, que navega a la pantalla de editar: se desmonta
  // esto, se vuelve a pedir la cotización y se monta un formulario nuevo. Eso
  // mataba cualquier cosa en curso — y ahora hay una: «Enviar por WhatsApp»
  // sobre una cotización nueva la GUARDA primero (para que tenga número) y
  // sigue con el PDF en el mismo componente. Con la navegación de por medio, el
  // PDF se generaba en un componente que ya no existía.
  //
  // `history.replaceState` sí lo entiende el router de Next (desde 14.1): la
  // barra muestra /cotizacion/<id>, atrás/adelante funcionan, y recargar cae en
  // la pantalla de editar con la fila ya guardada. Nada se pierde.
  return (
    <CotizacionForm
      user={user}
      onCreated={(id) => window.history.replaceState(null, '', `/dashboard/cotizacion/${id}`)}
    />
  )
}
