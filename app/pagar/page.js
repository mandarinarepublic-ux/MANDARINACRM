// Página PÚBLICA de pago con tarjeta (Payphone · Cajita) que mandarinaec.com abre
// en un recuadro desde el carrito. El middleware solo cubre /api y /dashboard:
// esta página no pide sesión. Lo que protege la compra vive en /api/publico/pago.
export const dynamic = 'force-dynamic'

import PagoEnTienda from '@/components/pago/PagoEnTienda'

export const metadata = {
  title: 'Pago con tarjeta · Mandarina Republic',
  robots: { index: false, follow: false },
  // La Cajita de Payphone revisa el dominio por el Referer: sin esto, una
  // política estricta lo vacía y Payphone responde "Acceso denegado".
  referrer: 'origin-when-cross-origin',
}

export default function PagarPage({ searchParams }) {
  return <PagoEnTienda carrito={String(searchParams?.c || '')} />
}
