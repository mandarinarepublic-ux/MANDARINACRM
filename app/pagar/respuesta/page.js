// A esta página la manda Payphone después de la Cajita (URL de respuesta de la
// app WEB): /pagar/respuesta?id=<payphone>&clientTransactionId=<compra-intento>.
// Corre DENTRO del recuadro de la tienda. Confirma el pago, crea el pedido y le
// avisa a la tienda (postMessage) para que vacíe el carrito.
export const dynamic = 'force-dynamic'

import { procesarRespuestaPago } from '@/lib/procesarPagoTienda'
import ResultadoPago from '@/components/pago/ResultadoPago'

export const metadata = {
  title: 'Pago seguro',
  robots: { index: false, follow: false },
}

export default async function RespuestaPagoPage({ searchParams }) {
  const id = String(searchParams?.id || '')
  const clientTransactionId = String(searchParams?.clientTransactionId || '')
  let r
  try {
    r = await procesarRespuestaPago({ id, clientTransactionId })
  } catch (e) {
    console.error('[/pagar/respuesta]', e.message)
    r = { estado: 'ERROR', mensaje: 'No pudimos verificar el pago. Si se te cobró, escríbenos por WhatsApp.' }
  }
  return <ResultadoPago {...r} />
}
