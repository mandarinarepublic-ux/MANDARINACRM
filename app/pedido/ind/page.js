// Página PÚBLICA del seguimiento de IND (indlovers.com/pedido la muestra en un
// marco). Misma página que la de Mandarina, con la marca, colores y WhatsApp de
// IND, y solo encuentra pedidos de INDSTORE. Ver lib/tiendasSeguimiento.js.
export const dynamic = 'force-dynamic'

import PaginaSeguimiento from '@/components/seguimiento/PaginaSeguimiento'

export const metadata = {
  title: 'Sigue tu pedido · Ind Store',
  robots: { index: false, follow: false },
}

export default function PedidoPublicoIndPage() {
  return <PaginaSeguimiento tienda="ind" />
}
