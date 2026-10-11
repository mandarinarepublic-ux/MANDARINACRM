// Página PÚBLICA del seguimiento (mandarinaec.com/pedido la muestra en un marco).
// El middleware solo cubre /api y /dashboard: esta página no pide sesión. Lo que
// protege los datos está en /api/publico/pedido. La de IND es /pedido/ind.
export const dynamic = 'force-dynamic'

import PaginaSeguimiento from '@/components/seguimiento/PaginaSeguimiento'

export const metadata = {
  title: 'Sigue tu pedido · Mandarina Republic',
  robots: { index: false, follow: false },
}

export default function PedidoPublicoPage() {
  return <PaginaSeguimiento tienda="mandarina" />
}
