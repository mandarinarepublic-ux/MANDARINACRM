'use client'
import { useEffect, useRef, useState } from 'react'
import { PROVINCIAS_EC } from '@/lib/checkoutTienda'
import { cuentasDe } from '@/lib/cuentasBancarias'
import PagoTransferencia from './PagoTransferencia'

/**
 * Pago DENTRO de la tienda (mandarinaec.com 11-nov-2026; indlovers.com con tienda=INDSTORE).
 * Se muestra en un recuadro encima del carrito. Tres pasos en una sola pantalla:
 *   1. Datos de envío y facturación (+ código de descuento)
 *   2. Resumen calculado por Shopify (productos, descuento, envío, total)
 *   3. La Cajita de Payphone con el total exacto
 * Al pagar, Payphone lleva el recuadro a /pagar/respuesta, que confirma y crea el pedido.
 */

const C = {
  fondo: '#ffffff', texto: '#1a1a1a', suave: '#6b7280', borde: '#e5e7eb',
  naranja: '#f26a1b', error: '#dc2626', verdeFondo: '#ecfdf5', verde: '#047857',
}
const sInput = (mal) => ({
  width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: 15,
  border: `1px solid ${mal ? C.error : C.borde}`, borderRadius: 8, color: C.texto,
  background: '#fff', outline: 'none', fontFamily: 'inherit',
})
const dinero = (cent) => `$${(Number(cent || 0) / 100).toFixed(2)}`

const CAMPOS_GUARDADOS = ['nombre', 'apellido', 'email', 'celular', 'cedula', 'direccion', 'referencia', 'ciudad', 'provincia']

function Campo({ label, error, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 12, color: C.suave, marginBottom: 4 }}>{label}</span>
      {children}
      {error && <span style={{ display: 'block', fontSize: 12, color: C.error, marginTop: 3 }}>{error}</span>}
    </label>
  )
}

export default function PagoEnTienda({ carrito, modo = 'tarjeta', tienda = 'MANDARINA' }) {
  const [metodo, setMetodo] = useState(modo === 'transferencia' ? 'transferencia' : 'tarjeta')
  const [id, setId] = useState(null)
  const [fase, setFase] = useState('cargando') // cargando | datos | pagar | transferencia | pagado | recibido | error
  const [errorGeneral, setErrorGeneral] = useState('')
  const [datos, setDatos] = useState({ provincia: 'Pichincha' })
  const [errores, setErrores] = useState({})
  const [resumen, setResumen] = useState(null)
  const [avisoCodigo, setAvisoCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [pedido, setPedido] = useState(null)
  const cajitaLista = useRef(false)

  const avisarTienda = (data) => { try { window.parent?.postMessage({ origen: 'mandarina-pago', ...data }, '*') } catch {} }

  // Datos del cliente recordados en ESTE navegador (para no reescribir todo).
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem('mp_pago_datos') || '{}')
      setDatos((d) => ({ ...d, ...Object.fromEntries(Object.entries(g).filter(([k]) => CAMPOS_GUARDADOS.includes(k))) }))
    } catch {}
  }, [])

  // 1) Abrir la compra con el carrito que mandó la tienda.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/publico/pago', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'iniciar', carrito, tienda }),
        })
        const d = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok || !d.ok) { setErrorGeneral(d.error || 'No pudimos abrir tu compra'); setFase('error'); return }
        setId(d.id); setFase('datos')
      } catch {
        if (vivo) { setErrorGeneral('Sin conexión. Intenta de nuevo.'); setFase('error') }
      }
    })()
    return () => { vivo = false }
  }, [carrito, tienda])

  const cambiar = (k) => (e) => { setDatos((d) => ({ ...d, [k]: e.target.value })); setErrores((x) => ({ ...x, [k]: undefined })) }

  // 2) Calcular con Shopify y pasar a pagar.
  // envio: el handle de la tarifa que eligió el cliente (o null = la de siempre).
  async function continuar(e, envio = resumen?.envio?.handle || null) {
    e?.preventDefault?.()
    if (ocupado || !id) return
    setOcupado(true); setErrorGeneral(''); setAvisoCodigo('')
    try {
      const r = await fetch('/api/publico/pago', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'cotizar', id, datos, envio }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.yaPagado) { setPedido(d.pedido); setFase('pagado'); return }
      if (d.yaComprobante) { setPedido(d.pedido); setFase('recibido'); return }
      if (!r.ok || !d.ok) { setErrores(d.errores || {}); setErrorGeneral(d.error || 'Revisa tus datos'); return }
      try { localStorage.setItem('mp_pago_datos', JSON.stringify(Object.fromEntries(CAMPOS_GUARDADOS.map((k) => [k, datos[k] || ''])))) } catch {}
      setResumen(d.resumen)
      if (d.codigoNoAplicado) setAvisoCodigo(`El código "${String(datos.descuento || '').toUpperCase()}" no aplica a esta compra.`)
      cajitaLista.current = false
      setFase(metodo === 'transferencia' ? 'transferencia' : 'pagar')
      avisarTienda({ evento: 'datos_listos', total: d.resumen.total })
    } catch {
      setErrorGeneral('Sin conexión. Intenta de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  // 3) Cargar la Cajita de Payphone con el total guardado en el servidor.
  useEffect(() => {
    if (fase !== 'pagar' || !id || cajitaLista.current) return
    cajitaLista.current = true
    let vivo = true
    ;(async () => {
      const r = await fetch('/api/publico/pago', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'intento', id }),
      })
      const d = await r.json().catch(() => ({}))
      if (!vivo) return
      if (!r.ok || !d.ok) { setErrorGeneral(d.error || 'No se pudo abrir el pago con tarjeta'); return }
      await cargarScriptsPayphone()
      const esperar = (n = 0) => {
        if (typeof window.PPaymentButtonBox === 'function') {
          const cont = document.getElementById('pp-button')
          if (cont) cont.replaceChildren()
          new window.PPaymentButtonBox({ ...d.cajita, lang: 'es', defaultMethod: 'card', timeZone: -5 }).render('pp-button')
        } else if (n < 50) setTimeout(() => esperar(n + 1), 200)
        else setErrorGeneral('No cargó el formulario de pago. Recarga e intenta de nuevo.')
      }
      esperar()
    })()
    return () => { vivo = false }
  }, [fase, id])

  if (fase === 'cargando') return <Marco><p style={{ color: C.suave }}>Cargando tu compra…</p></Marco>
  if (fase === 'error') return <Marco><p style={{ color: C.error }}>⚠️ {errorGeneral}</p></Marco>
  if (fase === 'recibido') return (
    <Marco>
      <div style={{ background: C.verdeFondo, color: C.verde, padding: 18, borderRadius: 12, lineHeight: 1.5 }}>
        <div style={{ fontSize: 34, marginBottom: 6 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>¡Recibimos tu comprobante!</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>
          Lo verificamos y te confirmamos por WhatsApp. Apenas confirmemos el pago, tu pedido entra a producción.
          {pedido ? <><br />Tu pedido es el <b>{pedido}</b>.</> : null}
        </div>
      </div>
      <button type="button" onClick={() => avisarTienda({ evento: 'cerrar' })}
        style={{ marginTop: 16, width: '100%', padding: '14px 16px', fontSize: 16, fontWeight: 700, color: '#fff', background: C.naranja, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
        Cerrar
      </button>
    </Marco>
  )
  if (fase === 'pagado') return (
    <Marco>
      <div style={{ background: C.verdeFondo, color: C.verde, padding: 16, borderRadius: 10, fontWeight: 600 }}>
        ✅ Esta compra ya está pagada{pedido ? ` (pedido ${pedido})` : ''}.
      </div>
      <button type="button" onClick={() => avisarTienda({ evento: 'cerrar' })}
        style={{ marginTop: 16, width: '100%', padding: '14px 16px', fontSize: 16, fontWeight: 700, color: '#fff', background: C.naranja, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
        Cerrar
      </button>
    </Marco>
  )

  return (
    <Marco>
      {fase === 'datos' && (
        <form onSubmit={continuar}>
          <h2 style={{ fontSize: 18, margin: '0 0 12px', color: C.texto }}>Datos de envío</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Campo label="Nombre" error={errores.nombre}><input style={sInput(errores.nombre)} value={datos.nombre || ''} onChange={cambiar('nombre')} autoComplete="given-name" /></Campo>
            <Campo label="Apellido" error={errores.apellido}><input style={sInput(errores.apellido)} value={datos.apellido || ''} onChange={cambiar('apellido')} autoComplete="family-name" /></Campo>
          </div>
          <Campo label="Correo" error={errores.email}><input style={sInput(errores.email)} type="email" value={datos.email || ''} onChange={cambiar('email')} autoComplete="email" /></Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Campo label="Celular" error={errores.celular}><input style={sInput(errores.celular)} type="tel" inputMode="tel" placeholder="0987654321" value={datos.celular || ''} onChange={cambiar('celular')} autoComplete="tel" /></Campo>
            <Campo label="Cédula o RUC" error={errores.cedula}><input style={sInput(errores.cedula)} inputMode="numeric" value={datos.cedula || ''} onChange={cambiar('cedula')} /></Campo>
          </div>
          <Campo label="Dirección" error={errores.direccion}><input style={sInput(errores.direccion)} value={datos.direccion || ''} onChange={cambiar('direccion')} autoComplete="street-address" /></Campo>
          <Campo label="Referencia (opcional)"><input style={sInput(false)} value={datos.referencia || ''} onChange={cambiar('referencia')} /></Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Campo label="Ciudad" error={errores.ciudad}><input style={sInput(errores.ciudad)} value={datos.ciudad || ''} onChange={cambiar('ciudad')} autoComplete="address-level2" /></Campo>
            <Campo label="Provincia" error={errores.provincia}>
              <select style={sInput(errores.provincia)} value={datos.provincia || ''} onChange={cambiar('provincia')}>
                {PROVINCIAS_EC.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Campo>
          </div>
          <Campo label="Código de descuento (opcional)"><input style={sInput(false)} value={datos.descuento || ''} onChange={cambiar('descuento')} autoCapitalize="characters" /></Campo>
          {errorGeneral && <p style={{ color: C.error, fontSize: 14 }}>⚠️ {errorGeneral}</p>}
          <button type="submit" disabled={ocupado} style={{
            width: '100%', padding: 14, fontSize: 16, fontWeight: 700, color: '#fff',
            background: ocupado ? '#9ca3af' : C.naranja, border: 0, borderRadius: 10, cursor: ocupado ? 'default' : 'pointer',
          }}>{ocupado ? 'Calculando…' : metodo === 'transferencia' ? 'Continuar a la transferencia' : 'Continuar al pago'}</button>
        </form>
      )}

      {fase === 'pagar' && resumen && (
        <>
          <Resumen r={resumen} onEnvio={(h) => continuar(null, h)} ocupado={ocupado} />
          {avisoCodigo && <p style={{ color: C.error, fontSize: 13 }}>⚠️ {avisoCodigo}</p>}
          <button onClick={() => { setFase('datos'); setErrorGeneral('') }}
            style={{ background: 'none', border: 0, color: C.suave, fontSize: 13, padding: 0, margin: '4px 0 12px', cursor: 'pointer', textDecoration: 'underline' }}>
            ← Cambiar mis datos
          </button>
          {errorGeneral && <p style={{ color: C.error, fontSize: 14 }}>⚠️ {errorGeneral}</p>}
          <div id="pp-button" />
          <button onClick={() => { setMetodo('transferencia'); setErrorGeneral(''); setFase('transferencia') }}
            style={{ width: '100%', marginTop: 14, padding: 13, fontSize: 15, fontWeight: 700, background: '#121212', color: '#fff', border: 0, borderRadius: 10, cursor: 'pointer' }}>
            🏦 Prefiero pagar con transferencia
          </button>
        </>
      )}

      {fase === 'transferencia' && resumen && (
        <>
          <Resumen r={resumen} onEnvio={(h) => continuar(null, h)} ocupado={ocupado} />
          <button onClick={() => { setFase('datos'); setErrorGeneral('') }}
            style={{ background: 'none', border: 0, color: C.suave, fontSize: 13, padding: 0, margin: '4px 0 12px', cursor: 'pointer', textDecoration: 'underline' }}>
            ← Cambiar mis datos
          </button>
          <PagoTransferencia
            id={id}
            total={resumen.total}
            cuentas={cuentasDe(tienda)}
            tienda={tienda}
            onRecibido={(ped) => { setPedido(ped); setFase('recibido'); avisarTienda({ evento: 'resultado', estado: 'PAGADO' }) }}
          />
          <button onClick={() => { setMetodo('tarjeta'); cajitaLista.current = false; setErrorGeneral(''); setFase('pagar') }}
            style={{ width: '100%', marginTop: 14, padding: 13, fontSize: 15, fontWeight: 700, background: '#fff3ea', color: '#c2410c', border: '2px solid #f26a1b', borderRadius: 10, cursor: 'pointer' }}>
            💳 Prefiero pagar con tarjeta
          </button>
        </>
      )}
    </Marco>
  )
}

function Resumen({ r, onEnvio, ocupado }) {
  return (
    <div style={{ border: `1px solid ${C.borde}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
      {r.lineas.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          {l.imagen && <img src={l.imagen} alt="" width={44} height={44} style={{ borderRadius: 6, objectFit: 'cover' }} />}
          <div style={{ flex: 1, fontSize: 14, color: C.texto }}>
            {l.titulo}<div style={{ fontSize: 12, color: C.suave }}>{l.variante} · x{l.cantidad}</div>
          </div>
          <div style={{ fontSize: 14, color: C.texto, textAlign: 'right' }}>
            {l.original > l.centavos && <div style={{ fontSize: 12, color: C.suave, textDecoration: 'line-through' }}>{dinero(l.original)}</div>}
            {dinero(l.centavos)}
          </div>
        </div>
      ))}
      {/* Cálculos viejos (sin subtotalOriginal/ahorro) caen al subtotal de Shopify sin fila de descuento: siempre cuadra. */}
      <Fila k="Subtotal" v={dinero(r.subtotalOriginal ?? r.subtotal)} />
      {r.ahorro > 0 && <Fila k={r.codigos?.length ? `Descuento · ${r.codigos.join(', ')}` : 'Descuento'} v={<span style={{ color: '#047857', fontWeight: 600 }}>-{dinero(r.ahorro)}</span>} />}
      {/* IVA aparte se suma; IVA incluido en el precio (IND) solo se informa al pie del total. */}
      {r.impuestos > 0 && !r.impuestosIncluidos && <Fila k="IVA" v={dinero(r.impuestos)} />}
      {/* Si Shopify da más de una tarifa (domicilio, retiro en tienda…), elige el cliente. */}
      {(r.tarifas || []).length > 1 ? (
        <div style={{ margin: '6px 0' }}>
          <div style={{ fontSize: 13, color: C.suave, marginBottom: 4 }}>Envío</div>
          {r.tarifas.map((t) => (
            <label key={t.handle} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.texto, padding: '4px 0', cursor: ocupado ? 'wait' : 'pointer' }}>
              <input type="radio" name="envio" checked={r.envio?.handle === t.handle} disabled={ocupado}
                onChange={() => onEnvio?.(t.handle)} />
              <span style={{ flex: 1 }}>{t.title}</span>
              <span>{t.centavos ? dinero(t.centavos) : 'Gratis'}</span>
            </label>
          ))}
        </div>
      ) : (
        <Fila k={`Envío · ${r.envio?.title || ''}`} v={r.envio?.centavos ? dinero(r.envio.centavos) : 'Gratis'} />
      )}
      <div style={{ borderTop: `1px solid ${C.borde}`, marginTop: 6, paddingTop: 6 }}>
        <Fila k={<b>Total</b>} v={<b>{dinero(r.total)}</b>} />
        {r.impuestos > 0 && r.impuestosIncluidos && (
          <div style={{ fontSize: 12, color: C.suave, textAlign: 'right' }}>Incluye IVA {dinero(r.impuestos)}</div>
        )}
      </div>
    </div>
  )
}

const Fila = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.texto, margin: '2px 0' }}>
    <span>{k}</span><span>{v}</span>
  </div>
)

function Marco({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.fondo, color: C.texto, padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

let _scripts = null
function cargarScriptsPayphone() {
  if (_scripts) return _scripts
  _scripts = new Promise((resolve) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.css'
    document.head.appendChild(css)
    const js = document.createElement('script')
    js.type = 'module'
    js.src = 'https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.js'
    js.onload = () => resolve()
    js.onerror = () => resolve()
    document.head.appendChild(js)
  })
  return _scripts
}
