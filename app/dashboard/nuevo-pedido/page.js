'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MapaPicker from '@/components/maps/MapaPicker'
import BuscadorProductos from '@/components/pedido/BuscadorProductos'
import ItemProducto from '@/components/pedido/ItemProducto'
import BuscadorCliente from '@/components/pedido/BuscadorCliente'
import SeccionPago from '@/components/pedido/SeccionPago'

const TIENDAS = ['MANDARINA', 'INDSTORE']

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

// Get min date: 3 business days from today
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

export default function NuevoPedidoPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tienda, setTienda] = useState('MANDARINA')
  const [clienteId, setClienteId] = useState(null) // existing client ID for updates
  const [cliente, setCliente] = useState({ nombre: '', cedula: '', celular: '', email: '', ciudad: '', direccion: '' })
  const [cedulaError, setCedulaError] = useState('')
  const [celularError, setCelularError] = useState('')
  const [emitirFactura, setEmitirFactura] = useState(true)
  const [usarMapa, setUsarMapa] = useState(false)
  const [items, setItems] = useState([])
  const [pago, setPago] = useState({ tipo: 'EFECTIVO', monto: 0, notas: '' })
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
    const areas = [...new Set(items.map(i => i.area).filter(Boolean))].sort()
    const combos = {
      'BORDADO': 5, 'ESTAMPADO': 3, 'SUBLIMACION': 4,
      'BORDADO,ESTAMPADO': 6, 'BORDADO,SUBLIMACION': 7,
      'ESTAMPADO,SUBLIMACION': 6, 'BORDADO,ESTAMPADO,SUBLIMACION': 8,
    }
    // Normalize area keys (remove spaces around +)
    const normalizedAreas = areas.map(a => a.replace(/\s*\+\s*/g, ',').split(',').map(x => x.trim()).join(','))
    const uniqueAreas = [...new Set(normalizedAreas.join(',').split(',').map(x => x.trim()))].sort()
    const key = uniqueAreas.join(',')
    setDiasCalculado(combos[key] || 4)
  }, [items])

  const montoTotal = items.reduce((s, i) => s + (parseFloat(i.precioUnit || 0) * parseInt(i.cantidad || 1)), 0)

  function handleCedulaChange(val) {
    setCliente(p => ({...p, cedula: val}))
    setCedulaError(validarCedulaRUC(val) || '')
  }

  function handleCelularChange(val) {
    setCliente(p => ({...p, celular: val}))
    setCelularError(validarCelular(val) || '')
  }

  function handleClienteSelect(c) {
    setClienteId(c.id || null)
    setCliente({
      nombre: c.nombre || c.NOMBRE || '',
      cedula: c.cedula || c.CEDULA || '',
      celular: c.celular || c.CELULAR || '',
      email: c.email || c.EMAIL || '',
      ciudad: c.ciudad || c.CIUDAD || '',
      direccion: c.direccion || c.DIRECCION || '',
    })
    setCedulaError('')
    setCelularError('')
  }

  function buildDireccionTexto() {
    if (usarMapa) return direccionTexto
    const parts = []
    if (cliente.ciudad) parts.push(cliente.ciudad)
    if (cliente.direccion) parts.push(cliente.direccion)
    return parts.join(': ')
  }

  function canGoToStep(s) {
    if (s <= 1) return true
    if (s === 2) return !!(cliente.nombre && cliente.cedula && !cedulaError && cliente.celular && !celularError)
    if (s >= 3) return items.length > 0
    return true
  }

  function goToStep(s) {
    if (!canGoToStep(s)) return
    setStep(s)
  }

  async function handleSubmit() {
    const errCedula = validarCedulaRUC(cliente.cedula)
    const errCelular = validarCelular(cliente.celular)
    if (!cliente.nombre || errCedula || errCelular) {
      setError(errCedula || errCelular || 'Completa los datos del cliente')
      setStep(1); return
    }
    if (items.length === 0) { setError('Agrega al menos un producto'); setStep(2); return }
    if (!buildDireccionTexto()) { setError('La dirección es obligatoria'); setStep(1); return }

    setLoading(true); setError('')

    // Update existing client if fields changed
    if (clienteId) {
      await fetch(`/api/clientes/${clienteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          NOMBRE: cliente.nombre, CEDULA: cliente.cedula,
          CELULAR: cliente.celular, EMAIL: cliente.email,
          CIUDAD: cliente.ciudad, DIRECCION: buildDireccionTexto(),
        }),
      })
    }

    const dirFinal = buildDireccionTexto()
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
          cliente: { ...cliente, direccion: dirFinal },
          items, pago, emitirFactura,
          diasEntregaPrometido: diasPrometido,
          fechaEntregaPrometida: fechaEntrega,
          notasVendedor,
          direccionTexto: dirFinal,
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

  const tiendaColor = tienda === 'MANDARINA' ? '#FF6B00' : '#1A1A2E'
  const steps = ['Cliente', 'Productos', 'Entrega y Pago', 'Confirmar']

  return (
    <div className="max-w-2xl mx-auto p-4 pb-32">
      <div className="flex items-center gap-3 mb-6 pt-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-white p-1">←</button>
        <h1 className="text-xl font-display font-bold text-white">Nueva Venta</h1>
      </div>

      {/* Tienda selector */}
      <div className="flex gap-2 mb-6">
        {TIENDAS.map(t => (
          <button key={t} onClick={() => setTienda(t)}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border
              ${tienda === t ? 'text-white border-transparent' : 'bg-transparent text-gray-500 border-gray-700'}`}
            style={tienda === t ? { backgroundColor: tiendaColor } : {}}>
            {t === 'MANDARINA' ? '🍊 Mandarina' : '🏪 Indstore'}
          </button>
        ))}
      </div>

      {/* Step indicator - clickable */}
      <div className="flex items-center gap-1 mb-8">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <button onClick={() => goToStep(i + 1)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'text-white' : 'bg-gray-800 text-gray-500'}
                ${canGoToStep(i + 1) ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed opacity-40'}`}
              style={step === i + 1 ? { backgroundColor: tiendaColor } : {}}>
              {step > i + 1 ? '✓' : i + 1}
            </button>
            <span className={`text-xs hidden sm:block truncate ${step === i + 1 ? 'text-white' : 'text-gray-600'}`}>{s}</span>
            {i < steps.length - 1 && <div className={`flex-1 h-px min-w-2 ${step > i + 1 ? 'bg-green-500' : 'bg-gray-800'}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>
      )}

      {/* STEP 1: Cliente */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-white mb-2">Datos del cliente</h2>
          <BuscadorCliente onSelect={handleClienteSelect} />
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
                onChange={e => handleCedulaChange(e.target.value)} />
              {cedulaError && <p className="text-red-400 text-xs mt-1">{cedulaError}</p>}
            </div>
            <div>
              <label className="label">Celular *</label>
              <input className={`input ${celularError ? 'border-red-500' : ''}`}
                placeholder="0987654321" value={cliente.celular}
                onChange={e => handleCelularChange(e.target.value)} />
              {celularError && <p className="text-red-400 text-xs mt-1">{celularError}</p>}
            </div>
            <div className="col-span-2">
              <label className="label">Email (opcional)</label>
              <input className="input" type="email" placeholder="cliente@gmail.com" value={cliente.email}
                onChange={e => setCliente(p => ({...p, email: e.target.value}))} />
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
                className={`text-xs px-3 py-1 rounded-full border transition-all ${usarMapa ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10' : 'border-gray-700 text-gray-500'}`}>
                {usarMapa ? '📍 Mapa activo' : '📍 Usar mapa'}
              </button>
            </div>
            {!usarMapa ? (
              <div className="space-y-3">
                <div>
                  <label className="label">Ciudad</label>
                  <input className="input" placeholder="Ej: Quito, Guayaquil..." value={cliente.ciudad}
                    onChange={e => setCliente(p => ({...p, ciudad: e.target.value}))} />
                </div>
                <div>
                  <label className="label">Calle principal y secundaria *</label>
                  <input className="input" placeholder="Av. República E7-65 y Diego de Almagro, Edif. Torre X, piso 3"
                    value={cliente.direccion}
                    onChange={e => setCliente(p => ({...p, direccion: e.target.value}))} />
                </div>
                {(cliente.ciudad || cliente.direccion) && (
                  <div className="bg-gray-800 rounded-xl px-3 py-2 text-xs text-gray-400">
                    📋 En PDF: <span className="text-white">{buildDireccionTexto()}</span>
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

      {/* STEP 2: Productos */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-white mb-2">Productos del pedido</h2>
          <BuscadorProductos tienda={tienda} onAdd={item => setItems(p => [...p, item])} />
          {items.length > 0 && (
            <div className="space-y-3 mt-4">
              {items.map((item, idx) => (
                <ItemProducto key={idx} item={item} index={idx}
                  onChange={updated => setItems(p => p.map((it, i) => i === idx ? updated : it))}
                  onRemove={() => setItems(p => p.filter((_, i) => i !== idx))} />
              ))}
              <div className="card p-4 flex justify-between items-center">
                <span className="text-gray-400 text-sm">{items.reduce((s,i) => s + parseInt(i.cantidad||1), 0)} productos</span>
                <span className="text-white font-bold text-lg">${montoTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Entrega y Pago */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="font-semibold text-white mb-4">📅 Fecha de entrega</h3>
            <div className="bg-gray-800 rounded-xl px-4 py-2 text-sm text-gray-400 mb-3">
              Mínimo recomendado: <span className="text-white font-semibold">{diasCalculado} días hábiles</span>
            </div>
            <label className="label">Fecha de entrega comprometida</label>
            <input type="date" className="input" min={getMinFecha()} value={fechaEntrega}
              onChange={e => setFechaEntrega(e.target.value)} />
            {fechaEntrega && new Date(fechaEntrega) < new Date(Date.now() + diasCalculado * 86400000) && (
              <div className="mt-2 text-yellow-400 text-xs">⚠️ Fecha por debajo del mínimo recomendado ({diasCalculado} días)</div>
            )}
          </div>
          <SeccionPago pago={pago} onChange={setPago} montoTotal={montoTotal} />
          <div>
            <label className="label">Notas internas (opcional)</label>
            <textarea className="input resize-none" rows={3} placeholder="Instrucciones especiales, urgencias..."
              value={notasVendedor} onChange={e => setNotasVendedor(e.target.value)} />
          </div>
        </div>
      )}

      {/* STEP 4: Confirmar */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-white mb-4">Confirmar pedido</h2>
          <div className="card p-5 space-y-2.5">
            {[
              ['Tienda', tienda],
              ['Cliente', cliente.nombre],
              ['Cédula/RUC', cliente.cedula],
              ['Celular', cliente.celular],
              ['Dirección', buildDireccionTexto()],
              ['Factura', emitirFactura ? '✅ Sí' : '❌ No'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm gap-4">
                <span className="text-gray-500 shrink-0">{k}</span>
                <span className="text-white text-right text-xs">{v || '-'}</span>
              </div>
            ))}
            <hr className="border-gray-800" />
            <div className="flex justify-between text-sm"><span className="text-gray-500">Productos</span><span className="text-white">{items.length} ítems</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Total</span><span className="text-white font-bold text-lg">${montoTotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Abono</span><span className="text-green-400">${parseFloat(pago.monto||0).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Pendiente</span>
              <span className={(montoTotal - parseFloat(pago.monto||0)) > 0 ? 'text-yellow-400' : 'text-green-400'}>
                ${(montoTotal - parseFloat(pago.monto||0)).toFixed(2)}
              </span>
            </div>
            <hr className="border-gray-800" />
            <div className="flex justify-between text-sm"><span className="text-gray-500">Fecha entrega</span>
              <span className="text-white">{new Date(fechaEntrega).toLocaleDateString('es-EC', {day:'numeric',month:'long',year:'numeric'})}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Pago</span><span className="text-white">{pago.tipo}</span></div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-4 flex gap-3">
        {step > 1 && (
          <button onClick={() => setStep(s => s - 1)} className="btn-secondary flex-1">← Atrás</button>
        )}
        {step < 4 ? (
          <button onClick={() => setStep(s => s + 1)} className="btn-primary flex-1"
            style={{ backgroundColor: tiendaColor }}>Siguiente →</button>
        ) : (
          <button onClick={handleSubmit} className="btn-primary flex-1" disabled={loading}
            style={{ backgroundColor: tiendaColor }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Guardando...
              </span>
            ) : '✅ Crear pedido'}
          </button>
        )}
      </div>
    </div>
  )
}
