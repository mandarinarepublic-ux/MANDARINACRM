'use client'
import { useEffect } from 'react'

/**
 * Resultado del pago dentro del recuadro. Le avisa a la tienda (postMessage)
 * para que vacíe el carrito cuando se pagó. El texto lo dice todo: el cliente
 * nunca se queda sin saber si se le cobró.
 */
export default function ResultadoPago({ estado, pedido, mensaje }) {
  useEffect(() => {
    try { window.parent?.postMessage({ origen: 'mandarina-pago', evento: 'resultado', estado, pedido: pedido || null }, '*') } catch {}
  }, [estado, pedido])

  const ok = estado === 'PAGADO'
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#1a1a1a', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 440, margin: '40px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>{ok ? '✅' : estado === 'RECHAZADO' ? '❌' : '⚠️'}</div>
        <h2 style={{ fontSize: 20, margin: '10px 0' }}>
          {ok ? '¡Pago recibido!' : estado === 'RECHAZADO' ? 'El pago no se aprobó' : 'Revisando tu pago'}
        </h2>
        {ok && pedido && <p style={{ fontSize: 15 }}>Tu pedido es el <b>{pedido}</b>. Te llegará la confirmación a tu correo.</p>}
        <p style={{ color: '#6b7280', fontSize: 14 }}>{mensaje}</p>
        {estado === 'RECHAZADO' && (
          <p style={{ fontSize: 14, marginTop: 14 }}>
            No se te cobró nada. Cierra esta ventana y vuelve a tocar <b>«Pagar con tarjeta»</b> para intentar con otra tarjeta.
          </p>
        )}
      </div>
    </div>
  )
}
