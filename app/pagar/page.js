// Página PÚBLICA de pago (tarjeta Payphone · transferencia) que la tienda abre
// en un recuadro desde el carrito. El middleware solo cubre /api y /dashboard:
// esta página no pide sesión. Lo que protege la compra vive en /api/publico/pago.
export const dynamic = 'force-dynamic'

import PagoEnTienda from '@/components/pago/PagoEnTienda'

export const metadata = {
  title: 'Pago seguro',
  robots: { index: false, follow: false },
  // La Cajita de Payphone revisa el dominio por el Referer: sin esto, una
  // política estricta lo vacía y Payphone responde "Acceso denegado".
  referrer: 'origin-when-cross-origin',
}

export default function PagarPage({ searchParams }) {
  // ?m=t: el cliente tocó "Pagar con transferencia" en la tienda.
  const modo = searchParams?.m === 't' ? 'transferencia' : 'tarjeta'
  // ?t=ind: viene de indlovers.com. Lista cerrada; sin t → MANDARINA.
  const tienda = searchParams?.t === 'ind' ? 'INDSTORE' : 'MANDARINA'
  return <PagoEnTienda carrito={String(searchParams?.c || '')} modo={modo} tienda={tienda} />
}
