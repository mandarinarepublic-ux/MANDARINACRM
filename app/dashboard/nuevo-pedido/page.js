'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import BuscadorCliente from '@/components/pedido/BuscadorCliente'
import BuscadorProductos from '@/components/pedido/BuscadorProductos'

export default function NuevoPedidoPage() {
  const router = useRouter()
  const [tienda, setTienda] = useState('MANDARINA')
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const refDireccion = useRef(null)

  const tiendaColor = tienda === 'MANDARINA' ? '#FF6B00' : '#E91E8C'

  const [cliente, setCliente] = useState({
    id: '', nombre: '', cedula: '', celular: '', email: '',
    ciudad: '', direccion: '', latitud: '', longitud: '',
  })
  const [cedulaError, setCedulaError] = useState('')
  const [celularError, setCelularError] = useState('')

  const [items, setItems] = useState([])
  const [abono, setAbono] = useState('')
  const [emitirFactura, setEmitirFactura] = useState(false)
  const [usarMapa, setUsarMapa] = useState(false)
  const [direccionTexto, setDireccionTexto] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')

  const [clienteKey] = useState(0) // ya no se usa para resetear

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    const d = new Date(); d.setDate(d.getDate() + 7)
    setFechaEntrega(d.toISOString().split('T')[0])
  }, [])

  function validarCedulaRUC(val) {
    if (!val) return ''
    if (val.length === 10) return ''
    if (val.length === 13) return ''
    return 'Cédula (10 dígitos) o RUC (13 dígitos)'
  }
  function validarCelular(val) {
    if (!val) return ''
    const clean = val.replace(/\D/g,'')
    if (clean.length === 10 && clean.startsWith('0')) return ''
    return 'Formato: 0987654321'
  }

  function validateStep1() {
    if (!cliente.nombre.trim()) return 'Nombre requerido'
    if (!cliente.cedula.trim()) return 'Cédula/RUC requerido'
    const ce = validarCedulaRUC(cliente.cedula)
    if (ce) return ce
    return ''
  }
  function validateStep2() {
    if (items.length === 0) return 'Agrega al menos un producto'
    return ''
  }
  function validateStep3() {
    if (!usarMapa && !cliente.ciudad.trim()) return 'Ciudad requerida'
    if (!fechaEntrega) return 'Fecha de entrega requerida'
    return ''
  }

  function goToStep(s) {
    setError('')
    if (s > step) {
      if (step === 1) { const e = validateStep1(); if (e) { setError(e); return } }
      if (step === 2) { const e = validateStep2(); if (e) { setError(e); return } }
      if (step === 3) { const e = validateStep3(); if (e) { setError(e); return } }
    }
    setError('')
    setStep(s)
  }

  // Factura automática al crear
  async function dispararFactura(pedidoId, clienteData, montoTotal) {
    const cedula = String(clienteData.cedula || '')
    const sinImp = parseFloat((montoTotal / 1.15).toFixed(2))
    const impuesto = parseFloat((montoTotal - sinImp).toFixed(2))
    try {
      await fetch('https://hook.us2.make.com/mjvj01tevojz6ayp7rrtt7wc6oa7v11n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedido_id:    pedidoId,
          numero:       (clienteData.celular || '').replace(/\D/g, ''),
          CI:           cedula,
          tipo_id:      cedula.length === 13 ? '04' : '05',
          cliente:      clienteData.nombre,
          email:        clienteData.email || 'info@mandarinaec.com',
          total:        montoTotal.toFixed(2),
          PrecioSinImp: sinImp.toFixed(2),
          ValorImp:     impuesto.toFixed(2),
        }),
      })
    } catch(e) { console.error('Error disparando factura:', e) }
  }

  async function handleSubmit() {
    const err1 = validateStep1()
    const err2 = validateStep2()
    const err3 = validateStep3()
    if (err1) { setError(err1); setStep(1); return }
    if (err2) { setError(err2); setStep(2); return }
    if (err3) { setError(err3); setStep(3); return }

    setLoading(true); setError('')
    try {
      const montoTotal = items.reduce((s,i) => s + parseFloat(i.SUBTOTAL||0), 0)
      const montoAbonado = parseFloat(abono || 0)

      function buildDireccion() {
        if (usarMapa) return direccionTexto
        const ciudad = (cliente.ciudad || '').trim()
        const dir = (cliente.direccion || '').trim()
        if (!ciudad && !dir) return ''
        if (!ciudad) return dir
        if (!dir) return ciudad
        if (dir.toLowerCase().startsWith(ciudad.toLowerCase())) return dir
        return `${ciudad}: ${dir}`
      }

      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tienda,
          clienteId:          cliente.id,
          clienteNombre:      cliente.nombre,
          clienteCedula:      cliente.cedula,
          clienteCelular:     cliente.celular,
          clienteEmail:       cliente.email,
          direccionTexto:     buildDireccion(),
          latitud:            cliente.latitud,
          longitud:           cliente.longitud,
          items:              items.map(i => ({
            productoId:       i.PRODUCTO_ID || i.id,
            productoNombre:   i.PRODUCTO_NOMBRE || i.title,
            area:             i.AREA,
            color:            i.COLOR,
            talla:            i.TALLA,
            cantidad:         i.CANTIDAD,
            precioUnit:       i.PRECIO_UNIT,
            subtotal:         i.SUBTOTAL,
            fotoUrl:          i.FOTO_PECHO_URL || i.foto,
            detalle:          i.DETALLE_PERSONALIZADO,
            diseno:           i.DISENO,
            archivoUrl:       i.ARCHIVO_DISENO_URL,
          })),
          montoTotal,
          montoAbonado,
          estadoPago:         montoAbonado >= montoTotal ? 'PAGADO' : montoAbonado > 0 ? 'ABONO' : 'PENDIENTE',
          emitirFactura:      emitirFactura ? 'TRUE' : 'FALSE',
          fechaEntrega,
          vendedorId:         user?.id,
          vendedorNombre:     user?.nombre,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (emitirFactura) {
        dispararFactura(data.pedidoId, { ...cliente, cedula: String(cliente.cedula), celular: String(cliente.celular) }, montoTotal)
      }
      router.push(`/dashboard/pedido/${data.pedidoId}?nuevo=1`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const montoTotal   = items.reduce((s,i) => s + parseFloat(i.SUBTOTAL||0), 0)
  const montoAbonado = parseFloat(abono || 0)
  const montoPendiente = montoTotal - montoAbonado

  const STEPS = ['Cliente','Productos','Entrega y Pago','Confirmar']

  return (
    <div className="flex flex-col" style={{ minHeight: '100dvh' }}>
      {/* Header fijo */}
      <div className="sticky top-0 z-20 bg-gray-950 border-b border-gray-800">
        {/* Selector tienda */}
        <div className="flex gap-2 p-3">
          {['MANDARINA','INDSTORE'].map(t => (
            <button key={t} onClick={() => setTienda(t)}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2
                ${tienda === t ? 'text-white shadow-lg' : 'bg-gray-800 text-gray-400'}`}
              style={tienda === t ? { backgroundColor: t === 'MANDARINA' ? '#FF6B00' : '#E91E8C' } : {}}>
              <span>{t === 'MANDARINA' ? '🍊' : '🏪'}</span>
              <span>{t === 'MANDARINA' ? 'Mandarina' : 'Indstore'}</span>
            </button>
          ))}
        </div>
        {/* Progress */}
        <div className="flex items-center px-4 pb-3 gap-2">
          {STEPS.map((label, i) => {
            const n = i + 1
            const done = n < step
            const active = n === step
            return (
              <div key={n} className="flex items-center flex-1 last:flex-none">
                <button onClick={() => n < step && goToStep(n)} disabled={n > step}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all
                    ${done ? 'bg-green-500 text-white' : active ? 'text-white' : 'bg-gray-800 text-gray-500'}`}
                  style={active ? { backgroundColor: tiendaColor } : {}}>
                  {done ? '✓' : n}
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded ${done ? 'bg-green-500' : 'bg-gray-800'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Contenido scrollable — pb-40 para que el botón no tape el contenido */}
      <div className="flex-1 overflow-y-auto pb-40">
        <div className="max-w-2xl mx-auto px-4 pt-4">

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* ── STEP 1: CLIENTE ── */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Honeypot invisible para evitar sugerencias del browser */}
              <div style={{display:'none'}} aria-hidden="true">
                <input type="text" name="username" tabIndex={-1} />
                <input type="password" name="password" tabIndex={-1} />
                <input type="email" name="email_fake" tabIndex={-1} />
                <input type="tel" name="phone_fake" tabIndex={-1} />
                <input type="text" name="address_fake" tabIndex={-1} />
              </div>

              <BuscadorCliente
                onSelect={c => {
                  setCliente({
                    id:        c.CLIENTE_ID || '',
                    nombre:    c.nombre     || '',
                    cedula:    c.cedula     || '',
                    celular:   c.celular    || '',
                    email:     c.email      || '',
                    ciudad:    c.ciudad     || '',
                    direccion: c.direccion  || '',
                    latitud: '', longitud: '',
                  })
                  setCedulaError('')
                  setCelularError('')
                }}
              />

              <div>
                <label className="label">Nombre completo *</label>
                <input className="input" placeholder="María García" value={cliente.nombre}
                  autoComplete="off" name="x-nombre"
                  onChange={e => setCliente(p => ({...p, nombre: e.target.value}))} />
              </div>

              <div>
                <label className="label">Cédula / RUC *</label>
                <input className={`input ${cedulaError ? 'border-red-500' : ''}`}
                  placeholder="1712345678" value={cliente.cedula}
                  autoComplete="off" inputMode="numeric" name="x-cedula"
                  onChange={e => { setCliente(p => ({...p, cedula: e.target.value})); setCedulaError(validarCedulaRUC(e.target.value) || '') }}
                  onBlur={async e => {
                    const ced = e.target.value.trim()
                    if (ced.length < 10) return
                    try {
                      const r = await fetch(`/api/clientes?cedula=${ced}`)
                      const d = await r.json()
                      const c = d.clientes?.[0]
                      if (c) {
                        setCliente(p => ({
                          ...p,
                          id:        c.CLIENTE_ID || p.id,
                          nombre:    c.NOMBRE     || p.nombre,
                          celular:   c.CELULAR    || p.celular,
                          email:     c.EMAIL      || p.email,
                          ciudad:    c.CIUDAD     || p.ciudad,
                          direccion: c.DIRECCION  || p.direccion,
                        }))
                      }
                    } catch {}
                  }}
                />
                {cedulaError && <p className="text-red-400 text-xs mt-1">{cedulaError}</p>}
              </div>

              <div>
                <label className="label">Celular</label>
                <input className={`input ${celularError ? 'border-red-500' : ''}`}
                  placeholder="0987654321" value={cliente.celular}
                  autoComplete="off" inputMode="tel" name="x-celular"
                  onChange={e => { setCliente(p => ({...p, celular: e.target.value})); setCelularError(validarCelular(e.target.value) || '') }} />
                {celularError && <p className="text-red-400 text-xs mt-1">{celularError}</p>}
              </div>

              <div>
                <label className="label">Email</label>
                <input className={`input ${emitirFactura && !cliente.email ? 'border-yellow-500/50' : ''}`}
                  type="email" autoComplete="off" name="x-email"
                  placeholder="cliente@gmail.com" value={cliente.email}
                  onChange={e => setCliente(p => ({...p, email: e.target.value}))} />
                {emitirFactura && !cliente.email && <p className="text-yellow-400 text-xs mt-1">⚠️ Requerido para la factura electrónica</p>}
              </div>
            </div>
          )}

          {/* ── STEP 2: PRODUCTOS ── */}
          {step === 2 && (
            <div className="space-y-4">
              <BuscadorProductos tienda={tienda} items={items} setItems={setItems} />
            </div>
          )}

          {/* ── STEP 3: ENTREGA Y PAGO ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Dirección */}
              <div>
                <label className="label">Dirección de entrega</label>
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setUsarMapa(false)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${!usarMapa ? 'text-white' : 'bg-gray-800 text-gray-400'}`}
                    style={!usarMapa ? {backgroundColor: tiendaColor} : {}}>
                    📝 Texto
                  </button>
                  <button onClick={() => setUsarMapa(true)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${usarMapa ? 'text-white' : 'bg-gray-800 text-gray-400'}`}
                    style={usarMapa ? {backgroundColor: tiendaColor} : {}}>
                    📍 Mapa
                  </button>
                </div>

                {!usarMapa ? (
                  <div className="space-y-2">
                    <input
                      className={`input ${!cliente.ciudad.trim() ? 'border-yellow-500/40' : ''}`}
                      autoComplete="off" name="x-ciudad"
                      placeholder="Ej: Quito, Guayaquil, Cuenca" value={cliente.ciudad}
                      onChange={e => setCliente(p => ({...p, ciudad: e.target.value}))} />
                    <textarea ref={refDireccion} rows={3}
                      autoComplete="off" name="x-direccion"
                      className={`input resize-none ${!cliente.direccion.trim() ? 'border-yellow-500/40' : ''}`}
                      placeholder="Dirección completa, referencia, sector..."
                      value={cliente.direccion}
                      onChange={e => setCliente(p => ({...p, direccion: e.target.value}))} />
                    {!cliente.ciudad.trim() && <p className="text-yellow-400 text-xs">⚠️ Ciudad requerida</p>}
                  </div>
                ) : (
                  <div>
                    <div id="map-container" className="w-full h-48 rounded-xl overflow-hidden border border-gray-700 bg-gray-800 mb-2">
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                        📍 Selecciona en el mapa
                      </div>
                    </div>
                    <input className="input" placeholder="Dirección detectada..."
                      autoComplete="off" name="x-mapa-direccion"
                      value={direccionTexto} onChange={e => setDireccionTexto(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Fecha entrega */}
              <div>
                <label className="label">Fecha de entrega comprometida *</label>
                <input type="date" className="input" value={fechaEntrega}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setFechaEntrega(e.target.value)} />
              </div>

              {/* Pago */}
              <div>
                <label className="label">Abono inicial ($)</label>
                <input type="number" className="input" placeholder="0.00"
                  value={abono} min="0" step="0.01"
                  onChange={e => setAbono(e.target.value)} />
                {abono > 0 && (
                  <div className="mt-2 text-xs text-gray-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Total:</span><span className="text-white">${montoTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Abono:</span><span className="text-green-400">${montoAbonado.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Saldo:</span>
                      <span className={montoPendiente > 0 ? 'text-yellow-400' : 'text-green-400'}>
                        ${montoPendiente.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Factura */}
              <div className="flex items-center justify-between card p-4">
                <div>
                  <div className="text-white text-sm font-medium">Emitir factura electrónica</div>
                  <div className="text-gray-500 text-xs mt-0.5">Dátil · vía Make</div>
                </div>
                <button onClick={() => setEmitirFactura(v => !v)}
                  className={`w-12 h-6 rounded-full transition-all ${emitirFactura ? 'bg-green-500' : 'bg-gray-700'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full mx-0.5 transition-transform ${emitirFactura ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: CONFIRMAR ── */}
          {step === 4 && (
            <div className="space-y-3 min-h-screen">
              <h2 className="text-lg font-bold text-white mb-2">Confirmar pedido</h2>
              <div className="card p-4 space-y-2 text-sm">
                {[
                  ['Tienda', tienda],
                  ['Cliente', cliente.nombre],
                  ['Cédula/RUC', cliente.cedula],
                  ['Celular', cliente.celular],
                  ['Email', cliente.email],
                  ['Dirección', usarMapa ? direccionTexto : `${cliente.ciudad}${cliente.direccion ? ': ' + cliente.direccion : ''}`],
                  ['Factura', emitirFactura ? '✅ Sí' : '❌ No'],
                ].map(([k,v]) => v ? (
                  <div key={k} className="flex justify-between gap-4">
                    <span className="text-gray-500 shrink-0">{k}</span>
                    <span className="text-white text-right">{v}</span>
                  </div>
                ) : null)}
                <div className="border-t border-gray-800 pt-2 mt-2 space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">Productos</span><span className="text-white">{items.length} ítems</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="text-white font-bold text-lg">${montoTotal.toFixed(2)}</span></div>
                  {montoAbonado > 0 && <div className="flex justify-between"><span className="text-gray-500">Pagos</span><span className="text-green-400">${montoAbonado.toFixed(2)}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">Entrega</span><span className="text-white">{fechaEntrega ? new Date(fechaEntrega+'T12:00:00').toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'}) : '-'}</span></div>
                </div>
              </div>

              <div>
                <label className="label">Notas internas</label>
                <textarea className="input resize-none" rows={3}
                  placeholder="Instrucciones especiales para fábrica, urgencias..."
                  onChange={e => {}} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Botones fijos inferiores con safe-area */}
      <div className="fixed bottom-0 left-0 right-0 md:left-56 bg-gray-950/95 backdrop-blur border-t border-gray-800 px-4 pt-3 pb-safe flex gap-3">
        {step > 1 && (
          <button onClick={() => goToStep(step - 1)} className="btn-secondary flex-1">← Atrás</button>
        )}
        {step < 4 ? (
          <button onClick={() => goToStep(step + 1)} className="btn-primary flex-1"
            style={{ backgroundColor: tiendaColor }}>Siguiente →</button>
        ) : (
          <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1"
            style={{ backgroundColor: tiendaColor }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>Guardando...</span>
              : '✅ Crear pedido'}
          </button>
        )}
      </div>
    </div>
  )
}
