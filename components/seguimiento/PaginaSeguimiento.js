// La página pública del seguimiento, compartida por /pedido (Mandarina) y
// /pedido/ind (IND). Componente de servidor: lee la promo de ESA tienda.
import Seguimiento from './Seguimiento'
import { leerPromo } from '@/lib/db/seguimiento'
import { limpiarPromo, promoVisible } from '@/lib/seguimientoPublico'

export default async function PaginaSeguimiento({ tienda }) {
  let promo = null
  try {
    const p = limpiarPromo(await leerPromo(tienda))
    promo = promoVisible(p) ? p : null
  } catch (e) {
    // Sin promo la página sirve igual: el seguimiento es lo importante.
    console.error('Promo del seguimiento no cargó:', e?.message || e)
  }
  return <Seguimiento promo={promo} tienda={tienda} />
}
