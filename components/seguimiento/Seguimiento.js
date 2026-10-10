'use client'
// Entrada (celular + número) y la hoja del pedido. Avisa su alto al marco de
// Shopify para que el iframe de mandarinaec.com/pedido no tenga doble scroll.
import { useEffect, useRef, useState } from 'react'
import s from './seguimiento.module.css'
import Promo from './Promo'
import HojaPedido, { waCon } from './HojaPedido'

const ORIGENES_TIENDA = ['https://www.mandarinaec.com', 'https://mandarinaec.com']

export default function Seguimiento({ promo }) {
  const [celular, setCelular] = useState('')
  const [numero, setNumero] = useState('')
  const [pedido, setPedido] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const raiz = useRef(null)

  useEffect(() => {
    if (!raiz.current || window.parent === window) return
    const avisar = () => {
      const alto = raiz.current?.scrollHeight || 0
      for (const o of ORIGENES_TIENDA) window.parent.postMessage({ tipo: 'mandarina-pedido-altura', alto }, o)
    }
    const ro = new ResizeObserver(avisar)
    ro.observe(raiz.current)
    avisar()
    return () => ro.disconnect()
  }, [])

  async function consultar(e) {
    e.preventDefault()
    setError(''); setCargando(true)
    try {
      const r = await fetch('/api/publico/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular, numero }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No pudimos cargar tu pedido. Intenta de nuevo en un momento.'); return }
      setPedido(d)
      window.scrollTo(0, 0)
    } catch {
      setError('No hay conexión. Revisa tu internet e intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div ref={raiz} className={s.raiz}>
      {pedido ? (
        <HojaPedido p={pedido} promo={promo} onVolver={() => { setPedido(null); setError('') }} />
      ) : (
        <section className={s.hoja}>
          <div className={s.cabecera}>
            <div className={s.cabFila}>
              <img src="/logos/logo_mandarina_240.png" alt="Mandarina Republic" />
              <div className={s.cabTxt}>
                <div className={s.marca}>Mandarina Republic</div>
                <h1 className={s.saludo}>Sigue tu pedido</h1>
              </div>
            </div>
            <div className={s.cabNota}>Escribe tu celular y el número que aparece en tu hoja de pedido.</div>
          </div>
          <div className={s.cortePunteado} />
          <form className={s.cuerpo} onSubmit={consultar} noValidate>
            {error && <div className={s.error} role="alert">{error}</div>}
            <div className={s.campo}>
              <label htmlFor="seg-celular">Tu celular</label>
              <input id="seg-celular" inputMode="tel" autoComplete="tel" placeholder="09 9876 5678"
                value={celular} onChange={(e) => setCelular(e.target.value)} />
            </div>
            <div className={s.campo}>
              <label htmlFor="seg-numero">Número de pedido</label>
              <input id="seg-numero" inputMode="numeric" placeholder="6308"
                value={numero} onChange={(e) => setNumero(e.target.value)} />
              <small>Está en tu hoja de pedido, por ejemplo <b>MAN-JAC-6308</b>. Basta con <b>6308</b>.</small>
            </div>
            <button className={`${s.btn} ${s.btnNaranja}`} type="submit" disabled={cargando || !celular || !numero}>
              {cargando ? 'Buscando…' : 'Ver mi pedido'}
            </button>
            {promo && <Promo promo={promo} />}
            <div className={s.duda}>
              <div><h3>¿No tienes el número o tienes una duda?</h3><p>Escríbenos y te ayudamos.</p></div>
              <a className={`${s.btn} ${s.btnWa}`} target="_blank" rel="noopener noreferrer"
                href={waCon('Hola, quiero consultar mi pedido')}>💬 Escríbenos por WhatsApp</a>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
