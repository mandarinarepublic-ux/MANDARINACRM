'use client'
import { useState } from 'react'

/**
 * Transferencia DENTRO del recuadro de la tienda (12-nov-2026).
 *   1. Botones con los bancos (como la respuesta rápida "selecciona tu banco").
 *   2. La cuenta elegida + el MONTO EXACTO, cada dato con "Copiar".
 *   3. Foto del comprobante (se comprime acá: Vercel no acepta cuerpos de más de 4,5 MB).
 * Al enviar: /api/publico/pago { accion: 'comprobante' } crea el pedido retenido en el
 * CRM y el chat con la foto en el inbox. Spec: docs/superpowers/specs/2026-11-12-transferencia-en-tienda-design.md
 */

const C = {
  texto: '#1a1a1a', suave: '#6b7280', borde: '#e5e7eb', naranja: '#f26a1b', error: '#dc2626',
  fondoSuave: '#f9fafb',
}
const dinero = (cent) => `$${(Number(cent || 0) / 100).toFixed(2)}`
const LADO_MAX = 1600

async function comprimir(archivo) {
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise((ok, mal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => mal(new Error('No pudimos leer esa imagen. Prueba con una captura de pantalla.'))
      i.src = url
    })
    const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * escala)
    canvas.height = Math.round(img.naturalHeight * escala)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function Copiar({ valor }) {
  const [hecho, setHecho] = useState(false)
  async function copiar() {
    try { await navigator.clipboard.writeText(valor) } catch {
      const t = document.createElement('textarea')
      t.value = valor; document.body.appendChild(t); t.select()
      try { document.execCommand('copy') } catch {}
      t.remove()
    }
    setHecho(true); setTimeout(() => setHecho(false), 1500)
  }
  return (
    <button type="button" onClick={copiar} style={{
      flexShrink: 0, padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
      border: `1px solid ${hecho ? '#047857' : C.borde}`, background: hecho ? '#ecfdf5' : '#fff', color: hecho ? '#047857' : C.texto,
    }}>{hecho ? '✓ Copiado' : 'Copiar'}</button>
  )
}

function Dato({ k, v, copiable = true, grande = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.borde}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.suave, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div>
        <div style={{ fontSize: grande ? 22 : 15, fontWeight: grande ? 800 : 600, color: C.texto, wordBreak: 'break-all' }}>{v}</div>
      </div>
      {copiable && <Copiar valor={String(v).replace(/^\$/, '')} />}
    </div>
  )
}

export default function PagoTransferencia({ id, total, cuentas, onRecibido }) {
  const [cuenta, setCuenta] = useState(null)
  const [foto, setFoto] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function elegir(c) {
    if (ocupado) return
    setOcupado(true); setError('')
    try {
      const r = await fetch('/api/publico/pago', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'transferencia', id, banco: c.id }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.yaComprobante) { onRecibido(d.pedido); return }
      if (!r.ok || !d.ok) { setError(d.error || 'No pudimos mostrar la cuenta. Intenta de nuevo.'); return }
      setCuenta({ ...c, ...d.cuenta })
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  async function elegirFoto(e) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    if (!/^image\//.test(archivo.type)) { setError('Sube una foto o captura de pantalla del comprobante.'); return }
    try { setFoto(await comprimir(archivo)) } catch (err) { setError(err.message) }
  }

  async function enviar() {
    if (ocupado || !foto || !cuenta) return
    setOcupado(true); setError('')
    try {
      const r = await fetch('/api/publico/pago', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'comprobante', id, banco: cuenta.id, foto }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.yaComprobante || (r.ok && d.ok)) { onRecibido(d.pedido || null); return }
      setError(d.error || 'No pudimos enviar el comprobante. Intenta de nuevo.')
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  if (!cuenta) {
    return (
      <div>
        <h2 style={{ fontSize: 17, margin: '6px 0 4px', color: C.texto }}>🏦 Selecciona tu banco</h2>
        <p style={{ fontSize: 13, color: C.suave, margin: '0 0 12px' }}>Te mostramos la cuenta para transferir {dinero(total)}.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {cuentas.map((c) => (
            <button key={c.id} type="button" disabled={ocupado} onClick={() => elegir(c)} style={{
              minHeight: 64, padding: 10, borderRadius: 12, border: 0, cursor: ocupado ? 'wait' : 'pointer',
              background: c.color, color: c.texto, fontWeight: 800, fontSize: 15, lineHeight: 1.2,
              boxShadow: '0 2px 6px rgba(0,0,0,.12)', opacity: ocupado ? 0.7 : 1,
            }}>{c.banco}</button>
          ))}
        </div>
        {error && <p style={{ color: C.error, fontSize: 14 }}>⚠️ {error}</p>}
      </div>
    )
  }

  return (
    <div>
      <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.borde}` }}>
        <div style={{ background: cuenta.color, color: cuenta.texto, padding: '10px 14px', fontWeight: 800, fontSize: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{cuenta.banco}</span>
          <button type="button" onClick={() => { setCuenta(null); setFoto(null); setError('') }} style={{
            background: 'rgba(255,255,255,.85)', color: '#111', border: 0, borderRadius: 6, fontSize: 12, padding: '4px 8px', cursor: 'pointer',
          }}>Cambiar banco</button>
        </div>
        <div style={{ padding: '4px 14px 8px', background: '#fff' }}>
          {cuenta.qr && (
            <div style={{ textAlign: 'center', padding: '10px 0 12px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.texto, marginBottom: 8 }}>Escanea con tu app Deuna</div>
              <img src={cuenta.qr} alt={`Código QR de ${cuenta.banco}`} width={220} height={238}
                style={{ width: 220, maxWidth: '80%', height: 'auto', display: 'block', margin: '0 auto', borderRadius: 8, border: `1px solid ${C.borde}` }} />
              <a href={cuenta.qr} download="QR-Deuna-Mandarina.jpg" style={{
                display: 'inline-block', marginTop: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                border: `1px solid ${C.borde}`, color: C.texto, textDecoration: 'none', background: '#fff',
              }}>⬇️ Guardar QR</a>
              <div style={{ fontSize: 12, color: C.suave, marginTop: 6 }}>¿Estás en el celular? Guárdalo y ábrelo desde la galería en tu app Deuna.</div>
            </div>
          )}
          <Dato k="Monto a transferir" v={dinero(total)} grande />
          <Dato k={`Cuenta de ${cuenta.tipo.toLowerCase()}`} v={cuenta.numero} />
          <Dato k="Titular" v={cuenta.titular} />
          <Dato k="Cédula" v={cuenta.cedula} />
        </div>
      </div>

      <p style={{ fontSize: 13, color: C.suave, margin: '12px 0 8px' }}>
        Transfiere el monto exacto desde tu app y sube aquí la foto o captura del comprobante.
      </p>

      <label style={{
        display: 'block', textAlign: 'center', padding: foto ? 8 : 18, borderRadius: 12, cursor: 'pointer',
        border: `2px dashed ${foto ? '#047857' : C.borde}`, background: C.fondoSuave, color: C.texto, fontWeight: 600, fontSize: 15,
      }}>
        <input type="file" accept="image/*" onChange={elegirFoto} style={{ display: 'none' }} />
        {foto
          ? <><img src={foto} alt="Comprobante" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, display: 'block', margin: '0 auto 6px' }} /><span style={{ fontSize: 13, color: C.suave }}>Toca para cambiar la foto</span></>
          : '📸 Subir foto del comprobante'}
      </label>

      {error && <p style={{ color: C.error, fontSize: 14 }}>⚠️ {error}</p>}

      <button type="button" onClick={enviar} disabled={!foto || ocupado} style={{
        width: '100%', marginTop: 12, padding: 14, fontSize: 16, fontWeight: 700, color: '#fff', border: 0, borderRadius: 10,
        background: !foto || ocupado ? '#9ca3af' : C.naranja, cursor: !foto || ocupado ? 'default' : 'pointer',
      }}>{ocupado ? 'Enviando…' : 'Enviar comprobante'}</button>
    </div>
  )
}
