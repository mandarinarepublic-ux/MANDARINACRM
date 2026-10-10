// Página PÚBLICA del seguimiento (mandarinaec.com/pedido la muestra en un marco).
// El middleware solo cubre /api y /dashboard: esta página no pide sesión. Lo que
// protege los datos está en /api/publico/pedido.
export const dynamic = 'force-dynamic'

import Seguimiento from '@/components/seguimiento/Seguimiento'
import { leerPromo } from '@/lib/db/seguimiento'
import { limpiarPromo, promoVisible } from '@/lib/seguimientoPublico'

export const metadata = {
  title: 'Sigue tu pedido · Mandarina Republic',
  robots: { index: false, follow: false },
}

export default async function PedidoPublicoPage() {
  let promo = null
  try {
    const p = limpiarPromo(await leerPromo())
    promo = promoVisible(p) ? p : null
  } catch (e) {
    // Sin promo la página sirve igual: el seguimiento es lo importante.
    console.error('Promo del seguimiento no cargó:', e?.message || e)
  }
  return <Seguimiento promo={promo} />
}
