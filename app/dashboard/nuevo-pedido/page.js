'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MapaPicker from '@/components/maps/MapaPicker'
import BuscadorProductos from '@/components/pedido/BuscadorProductos'
import ItemProducto from '@/components/pedido/ItemProducto'
import BuscadorCliente from '@/components/pedido/BuscadorCliente'
import SeccionPago from '@/components/pedido/SeccionPago'

const TIENDAS = ['MANDARINA', 'INDSTORE']

// Indstore color fuxia suave
const TIENDA_COLORS = {
  MANDARINA: '#FF6B00',
  INDSTORE: '#E91E8C',
}

function validarCedulaRUC(v) {
  if (!v) return 'Requerido'
  if (!/^\d+$/.test(v)) return 'Solo números'
  if (v.length === 10) {
    const prov = parseInt(v.substring(0, 2))
    if (prov < 1 || prov > 24) return 'Provincia inválida'
    const d = v.split('').map(Number)
    let suma = 0
    for (let i = 0; i < 9; i++) {
      let val = d[i] * (i % 2 === 0 ? 2 : 1)
      if (val > 9) val -= 9
      suma += val
    }
    const ver = suma % 10 === 0 ? 0 : 10 - (suma % 10)
    if (ver !== d[9]) return 'Cédula inválida'
    return null
  }
  if (v.length === 13) {
    if (v.substring(10) !== '001') return 'RUC debe terminar en 001'
    return null
  }
  return 'Debe tener 10 (cédula) o 13 dígitos (RUC)'
}

function validarCelular(v) {
  if (!v) return 'Requerido'
  if (!/^0\d{9}$/.test(v)) return 'Formato: 0987654321 (10 dígitos, empieza en 0)'
  return null
}

function getMinFecha() {
  const d = new Date()
  let count = 0
  while (count < 3) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return d.toISOString().split('T')[0]
}

function itemsValidos(items) {
  return items.every(i =>
    parseInt(i.cantidad || 0) >= 1 &&
    parseFloat(i.precioUnit || 0) >= 0
  )
}

export default function NuevoPedidoPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tienda, setTienda] = useState('MANDARINA')
  const [clienteId, setClienteId] = useState(null)
  const [cliente, setCliente] = useState({ nombre: '', cedula: '', celular: '', email: '', ciudad: '', direccion: '' })
  const [cedulaError, setCedulaError] = useState('')
  const [celularError, setCelularError] = useState('')
  const [emitirFactura, setEmitirFactura] = useState(true)
  const [usarMapa, setUsarMapa] = useState(false)
  const [items, setItems] = useState([])
  const [pagos, setPagos] = useState([{ tipo: 'EFECTIVO', monto: '', notas: '' }])
  const [direccionTexto, setDireccionTexto] = useState('')
  const [latitud, setLatitud] = useState(null)
  const [longitud, setLongitud] = useState(null)
  const [fechaEntrega, setFechaEntrega] = useState(getMinFecha())
  const [diasCalculado, setDiasCalculado] = useState(4)
  const [notasVendedor, setNotasVendedor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
  }, [])

  useEffect(() => {
    if (items.length === 0) return
    const areas = [...new Set(items.map(i => (i.area || '').replace(/\s*\+\s*/g, ',').split(',').map(x => x.trim())).flat())].sort()
    const combos = {
      'BORDADO': 5, 'ESTAMPADO': 3, 'SUBLIMACION': 4,
      'BORDADO,ESTAMPADO': 6, 'BORDADO,SUBLIMACION': 7,
      'ESTAMPADO,SUBLIMACION': 6, 'BORDADO,ESTAMPADO,SUBLIMACION': 8,
    }
    setDiasCalculado(combos[areas.join(',')] || 4)
  }, [items])

  const montoTotal = items.reduce((s, i) => s + (parseFloat(i.precioUnit || 0) * parseInt(i.cantidad || 1)), 0)
  const tiendaColor = TIENDA_COLORS[tienda]

  function buildDireccion() {
    if (usarMapa) return direccionTexto
    const parts = []
    if (cliente.ciudad) parts.push(cliente.ciudad)
    if (cliente.direccion) parts.push(cliente.direccion)
    return parts.join(': ')
  }

  // Step validation
  function validateStep1() {
    const errCedula = validarCedulaRUC(cliente.cedula)
    const errCelular = validarCelular(cliente.celular)
    if (!cliente.nombre.trim()) return 'El nombre es obligatorio'
    if (errCedula) return errCedula
    if (errCelular) return errCelular
    if (!buildDireccion().trim()) return 'La dirección es obligatoria'
    if (emitirFactura && !cliente.email.trim()) return '⚠️ Para emitir factura necesitas el correo del cliente'
    return null
  }

  function validateStep2() {
    if (items.length === 0) return 'Debes agregar al menos un producto'
    if (!itemsValidos(items)) return 'Completa cantidad y precio en todos los productos'
    return null
  }

  function validateStep3() {
    const totalPagado = pagos.reduce((s, p) => s + parseFloat(p.monto || 0), 0)
    if (totalPagado <= 0) return 'Debes registrar al menos una forma de pago (puede ser abono parcial)'
    return null
  }

  function canGoToStep(s) {
    if (s <= 1) return true
    if (s === 2) return !validateStep1()
    if (s >= 3) return !validateStep1() && !validateStep2()
    return true
  }

  function goToStep(s) {
    if (s > step) {
      // Validate current step before advancing
      if (step === 1) {
        const err = validateStep1()
        if (err) { setError(err); return }
      }
      if (step === 2) {
        const err = validateStep2()
        if (err) { setError(err); return }
      }
      if (step === 3) {
        const err = validateStep3()
        if (err) { setError(err); return }
      }
    }
    setError('')
    setStep(s)
  }

  async function handleSubmit() {
    const err1 = validateStep1()
    const err2 = validateStep2()
    const err3 = validateStep3()
    if (err1) { setError(err1); setStep(1); return }
    if (err2) { setError(err2); setStep(2); return }
    if (err3) { setError(err3); setStep(3); return }

    setLoading(true); setError('')

    // Always update client data (new or existing) with latest direction
    if (clienteId) {
      await fetch(`/api/clientes/${clienteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          NOMBRE: cliente.nombre,
          CEDULA: String(cliente.cedula),
          CELULAR: String(cliente.celular),
          EMAIL: cliente.email || '',
          CIUDAD: cliente.ciudad || '',
          DIRECCION: buildDireccion(),
        }),
      })
    }

    const hoy = new Date()
    const entrega = new Date(fechaEntrega)
    const diasPrometido = Math.ceil((entrega - hoy) / 86400000)

    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiendaId: tienda,
          vendedorId: user.id,
          vendedorCodigo: user.codigo,
          cliente: { ...cliente, cedula: String(cliente.cedula), celular: String(cliente.celular), direccion: buildDireccion() },
          items,
          pagos,
          emitirFactura,
          diasEntregaPrometido: diasPrometido,
          fechaEntregaPrometida: fechaEntrega,
          notasVendedor,
          direccionTexto: buildDireccion(),
          latitud, longitud,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/dashboard/pedido/${data.pedidoId}?nuevo=1`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  const steps = ['Cliente', 'Productos', 'Entrega y Pago', 'Confirmar']

  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* Fixed header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3 md:static md:border-0 md:bg-transparent">
        <div className="flex items-center gap-3 mb-4 max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white p-1">←</button>
          <h1 className="text-xl font-display font-bold text-white">Nueva Venta</h1>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Tienda selector */}
          <div className="flex gap-2 mb-4">
            {TIENDAS.map(t => (
              <button key={t} onClick={() => setTienda(t)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border
                  ${tienda === t ? 'text-white border-transparent' : 'bg-transparent text-gray-500 border-gray-700'}`}
                style={tienda === t ? { backgroundColor: TIENDA_COLORS[t] } : {}}>
                {t === 'MANDARINA' ? '🍊 Mandarina' : '🏪 Indstore'}
              </button>
            ))}
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1 mb-2">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <button onClick={() => goToStep(i + 1)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all flex-shrink-0
                    ${step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'text-white' : 'bg-gray-800 text-gray-500'}
                    ${canGoToStep(i + 1) ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                  style={step === i + 1 ? { backgroundColor: tiendaColor } : {}}>
                  {step > i + 1 ? '✓' : i + 1}
                </button>
                <span className={`text-xs hidden sm:block truncate ${step === i + 1 ? 'text-white' : 'text-gray-600'}`}>{s}</span>
                {i < steps.length - 1 && <div className={`flex-1 h-px min-w-1 ${step > i + 1 ? 'bg-green-500' : 'bg-gray-800'}`} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="max-w-2xl mx-auto px-4 pt-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <BuscadorCliente onSelect={c => {
                setClienteId(c.CLIENTE_ID || c.id || null)
                setCliente({ nombre: c.NOMBRE||c.nombre||'', cedula: String(c.CEDULA||c.cedula||''), celular: String(c.CELULAR||c.celular||''), email: c.EMAIL||c.email||'', ciudad: c.CIUDAD||c.ciudad||'', direccion: c.DIRECCION||c.direccion||'' })
                setCedulaError(''); setCelularError('')
              }} />
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Nombre completo *</label>
                  <input className="input" placeholder="María García" value={cliente.nombre}
                    onChange={e => setCliente(p => ({...p, nombre: e.target.value}))} />
                </div>
                <div>
                  <label className="label">Cédula / RUC *</label>
                  <input className={`input ${cedulaError ? 'border-red-500' : ''}`}
                    placeholder="1712345678" value={cliente.cedula}
                    onChange={e => { setCliente(p => ({...p, cedula: e.target.value})); setCedulaError(validarCedulaRUC(e.target.value) || '') }} />
                  {cedulaError && <p className="text-red-400 text-xs mt-1">{cedulaError}</p>}
                </div>
                <div>
                  <label className="label">Celular *</label>
                  <input className={`input ${celularError ? 'border-red-500' : ''}`}
                    placeholder="0987654321" value={cliente.celular}
                    onChange={e => { setCliente(p => ({...p, celular: e.target.value})); setCelularError(validarCelular(e.target.value) || '') }} />
                  {celularError && <p className="text-red-400 text-xs mt-1">{celularError}</p>}
                </div>
                <div className="col-span-2">
                  <label className="label">Email {emitirFactura ? '* (requerido para factura)' : '(opcional)'}</label>
                  <input className={`input ${emitirFactura && !cliente.email ? 'border-yellow-500/50' : ''}`}
                    type="email" placeholder="cliente@gmail.com" value={cliente.email}
                    onChange={e => setCliente(p => ({...p, email: e.target.value}))} />
                  {emitirFactura && !cliente.email && (
                    <p className="text-yellow-400 text-xs mt-1">⚠️ Necesitas el correo para emitir factura</p>
                  )}
                </div>
              </div>

              {/* Factura */}
              <label className="flex items-center gap-3 card p-4 cursor-pointer hover:border-gray-600 transition-all">
                <input type="checkbox" checked={emitirFactura} onChange={e => setEmitirFactura(e.target.checked)}
                  className="w-5 h-5 accent-orange-500" />
                <div>
                  <div className="text-white text-sm font-medium">Emitir factura electrónica</div>
                  <div className="text-gray-500 text-xs">Se enviará al SRI via Dátil</div>
                </div>
              </label>

              {/* Dirección */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Dirección de entrega *</label>
                  <button onClick={() => setUsarMapa(!usarMapa)}
                    className={`text-xs px-3 py-1 rounded-full border transition-all ${usarMapa ? 'text-white border-transparent' : 'border-gray-700 text-gray-500'}`}
                    style={usarMapa ? { backgroundColor: tiendaColor } : {}}>
                    📍 {usarMapa ? 'Mapa activo' : 'Usar mapa'}
                  </button>
                </div>
                {!usarMapa ? (
                  <div className="space-y-3">
                    <input className="input" placeholder="Ciudad (Ej: Quito)" value={cliente.ciudad}
                      onChange={e => setCliente(p => ({...p, ciudad: e.target.value}))} />
                    <input className="input" placeholder="Av. 6 de Diciembre y Mercurio. Frente al Teatro 24 Mayo"
                      value={cliente.direccion}
                      onChange={e => setCliente(p => ({...p, direccion: e.target.value}))} />
                    {buildDireccion() && (
                      <div className="bg-gray-800 rounded-xl px-3 py-2 text-xs text-gray-400">
                        📋 PDF: <span className="text-white">{buildDireccion()}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <MapaPicker onSelect={(addr, lat, lng) => { setDireccionTexto(addr); setLatitud(lat); setLongitud(lng) }}
                    initialAddress={direccionTexto} />
                )}
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <BuscadorProductos tienda={tienda} onAdd={item => setItems(p => [...p, { ...item, cantidad: item.cantidad || 1, precioUnit: item.precioUnit || '' }])} />
              {items.length === 0 && (
                <div className="card p-6 text-center text-gray-500 border-dashed">
                  <div className="text-3xl mb-2">👕</div>
                  <div className="text-sm">Busca un producto o agrega uno personalizado</div>
                </div>
              )}
              {items.length > 0 && (
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <ItemProducto key={idx} item={item} index={idx}
                      onChange={updated => setItems(p => p.map((it, i) => i === idx ? updated : it))}
                      onRemove={() => setItems(p => p.filter((_, i) => i !== idx))} />
                  ))}
                  <div className="card p-4 flex justify-between items-center">
                    <span className="text-gray-400 text-sm">{items.reduce((s,i) => s + parseInt(i.cantidad||1), 0)} prendas</span>
                    <span className="text-white font-bold text-lg">${montoTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="card p-5">
                <h3 className="font-semibold text-white mb-3">📅 Fecha de entrega</h3>
                <div className="text-xs text-gray-500 mb-2">Mínimo recomendado: <span className="text-white">{diasCalculado} días hábiles</span></div>
                <input type="date" className="input" min={getMinFecha()} value={fechaEntrega}
                  onChange={e => setFechaEntrega(e.target.value)} />
                {fechaEntrega && new Date(fechaEntrega) < new Date(Date.now() + diasCalculado * 86400000) && (
                  <p className="text-yellow-400 text-xs mt-2">⚠️ Fecha por debajo del mínimo recomendado</p>
                )}
              </div>
              <SeccionPago pagos={pagos} onChange={setPagos} montoTotal={montoTotal} />
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-semibold text-white">Confirmar pedido</h2>
              <div className="card p-5 space-y-2.5 text-sm">
                {[
                  ['Tienda', tienda],
                  ['Cliente', cliente.nombre],
                  ['Cédula/RUC', cliente.cedula],
                  ['Celular', cliente.celular],
                  ['Email', cliente.email || '-'],
                  ['Dirección', buildDireccion()],
                  ['Factura', emitirFactura ? '✅ Sí' : '❌ No'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span className="text-gray-500 shrink-0">{k}</span>
                    <span className="text-white text-right text-xs">{v}</span>
                  </div>
                ))}
                <hr className="border-gray-800" />
                <div className="flex justify-between"><span className="text-gray-500">Productos</span><span className="text-white">{items.length} ítems</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="text-white font-bold text-xl">${montoTotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Pagos</span>
                  <span className="text-green-400">${pagos.reduce((s,p) => s + parseFloat(p.monto||0), 0).toFixed(2)}</span>
                </div>
                <hr className="border-gray-800" />
                <div className="flex justify-between"><span className="text-gray-500">Entrega</span>
                  <span className="text-white">{new Date(fechaEntrega).toLocaleDateString('es-EC', {day:'numeric',month:'long',year:'numeric'})}</span>
                </div>
              </div>

              {/* Fix 4: Notas internas in step 4 */}
              <div>
                <label className="label">Notas internas</label>
                <textarea className="input resize-none" rows={3} placeholder="Instrucciones especiales para fábrica, urgencias..."
                  value={notasVendedor} onChange={e => setNotasVendedor(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-4 flex gap-3">
        {step > 1 && <button onClick={() => goToStep(step - 1)} className="btn-secondary flex-1">← Atrás</button>}
        {step < 4 ? (
          <button onClick={() => goToStep(step + 1)} className="btn-primary flex-1"
            style={{ backgroundColor: tiendaColor }}>Siguiente →</button>
        ) : (
          <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1"
            style={{ backgroundColor: tiendaColor }}>
            {loading
              ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Guardando...</span>
              : '✅ Crear pedido'}
          </button>
        )}
      </div>
    </div>
  )
}
