'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import MapaPicker from '@/components/maps/MapaPicker'
import BuscadorProductos from '@/components/pedido/BuscadorProductos'
import ItemProducto from '@/components/pedido/ItemProducto'
import BuscadorCliente from '@/components/pedido/BuscadorCliente'
import SeccionPago from '@/components/pedido/SeccionPago'

const TIENDAS = ['MANDARINA', 'INDSTORE', 'SUCURSAL']

const TIENDA_COLORS = {
  MANDARINA: '#FF6B00',
  INDSTORE: '#E91E8C',
  YAW: '#6C3FC5',
}

// Cliente fijo para la tienda YAW (no editable por los vendedores YAW)
const CLIENTE_YAW_ID = 'YAW1'
const CLIENTE_YAW = {
  nombre:   'YAW',
  cedula:   '0101010101',
  celular:  '010101010',
  email:    'YAW@YAW.COM',
  ciudad:   'CUMBAYA',
  direccion:'TIENDA YAW- CENTRO COMERCIAL VILLA CUMBAYA',
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

function getMinFechaConDias(dias = 3) {
  const d = new Date()
  let count = 0
  while (count < dias) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return d.toISOString().split('T')[0]
}

function getMinFecha() {
  return getMinFechaConDias(3)
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
  const [clienteKey, setClienteKey] = useState(0)
  const [cliente, setCliente] = useState({ nombre: '', cedula: '', celular: '', email: '', ciudad: '', direccion: '' })
  const [cedulaError, setCedulaError] = useState('')
  const [celularError, setCelularError] = useState('')
  const refDireccion = useRef(null)
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
  const pagoRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)

  // Sucursal
  const [sucursalProductos, setSucursalProductos] = useState([])
  const [loadingSucursal, setLoadingSucursal] = useState(false)
  const [sucursalIdVendido, setSucursalIdVendido] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    // Modo YAW: precargar cliente fijo y saltar directo a productos
    if (u.rol === 'VENDEDOR_YAW') {
      setTienda('YAW')
      setClienteId(CLIENTE_YAW_ID)
      setCliente(CLIENTE_YAW)
      setEmitirFactura(false)
      setStep(2)
    }
  }, [])

  useEffect(() => {
    if (tienda === 'SUCURSAL') loadSucursal()
  }, [tienda])

  async function loadSucursal() {
    setLoadingSucursal(true)
    try {
      const res = await fetch('/api/sucursal')
      const data = await res.json()
      setSucursalProductos(data.productos || [])
    } catch (e) { console.error(e) }
    finally { setLoadingSucursal(false) }
  }

  function agregarDesdeSucursal(prod) {
    setSucursalIdVendido(prod.ID)
    setItems(p => [...p, {
      tipo: 'SUCURSAL',
      sucursalId: prod.ID,
      nombre: prod.NOMBRE,
      talla: prod.TALLA,
      color: prod.COLOR,
      foto: prod.FOTO_URL,
      cantidad: 1,
      precioUnit: prod.PRECIO || '',
      area: '',
      descripcion: `${prod.NOMBRE} - Talla ${prod.TALLA}${prod.COLOR ? ' - ' + prod.COLOR : ''}`,
    }])
    setTienda('MANDARINA') // volver a Shopify después de agregar
  }

  useEffect(() => {
    if (items.length === 0) return
    const areas = [...new Set(items.map(i => (i.area || '').replace(/\s*\+\s*/g, ',').split(',').map(x => x.trim())).flat())].sort()
    const combos = {
      'BORDADO': 5, 'ESTAMPADO': 3, 'SUBLIMACION': 4,
      'BORDADO,ESTAMPADO': 6, 'BORDADO,SUBLIMACION': 7,
      'ESTAMPADO,SUBLIMACION': 6, 'BORDADO,ESTAMPADO,SUBLIMACION': 8,
    }
    const dias = combos[areas.join(',')] || 4
    setDiasCalculado(dias)
    const fecha = getMinFechaConDias(dias)
    setFechaEntrega(fecha)
  }, [items])

  const montoTotal = items.reduce((s, i) => s + (parseFloat(i.precioUnit || 0) * parseInt(i.cantidad || 1)), 0)
  const tiendaColor = TIENDA_COLORS[tienda] || '#6C3FC5'
  const isYAW = user?.rol === 'VENDEDOR_YAW'

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

  function validateStep1() {
    // Para YAW el step 1 siempre es válido (cliente prellenado)
    if (isYAW) return null
    const errCedula = validarCedulaRUC(cliente.cedula)
    const errCelular = validarCelular(cliente.celular)
    if (!cliente.nombre.trim()) return 'El nombre es obligatorio'
    if (errCedula) return errCedula
    if (errCelular) return errCelular
    if (!cliente.ciudad.trim()) return 'La ciudad de entrega es obligatoria'
    if (!cliente.direccion.trim() && !usarMapa) return 'La dirección completa es obligatoria'
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
        if (err) {
          setError(err)
          setTimeout(() => pagoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
          setTimeout(() => pagoRef.current?.querySelector('input[type="number"]')?.focus(), 300)
          return
        }
      }
    }
    setError('')
    setStep(s)
  }

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
    } catch(e) {
      console.error('Error disparando factura:', e)
    }
  }

  async function handleSubmit() {
    const err1 = validateStep1()
    const err2 = validateStep2()
    const err3 = validateStep3()
    if (err1) { setError(err1); setStep(isYAW ? 2 : 1); return }
    if (err2) { setError(err2); setStep(2); return }
    if (err3) { setError(err3); setStep(3); return }

    setLoading(true); setError('')

    const direccionFinal = usarMapa ? direccionTexto : [cliente.ciudad, cliente.direccion].filter(Boolean).join(': ')
    const clienteDireccion = usarMapa ? direccionTexto : (cliente.direccion || '')

    // Para YAW no actualizamos el cliente (es un cliente compartido de tienda)
    if (clienteId && !isYAW) {
      await fetch(`/api/clientes/${clienteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          NOMBRE: cliente.nombre,
          CEDULA: String(cliente.cedula),
          CELULAR: String(cliente.celular),
          EMAIL: cliente.email || '',
          CIUDAD: cliente.ciudad || '',
          DIRECCION: clienteDireccion,
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
          vendedorNombre: user.nombre || user.id,
          vendedorCodigo: user.codigo,
          cliente: { ...cliente, cedula: String(cliente.cedula), celular: String(cliente.celular), direccion: direccionFinal },
          items,
          pagos,
          emitirFactura,
          diasEntregaPrometido: diasPrometido,
          fechaEntregaPrometida: fechaEntrega,
          notasVendedor,
          direccionTexto: direccionFinal,
          latitud, longitud,
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

  if (!user) return null

  const steps = ['Cliente', 'Productos', 'Entrega y Pago', 'Confirmar']

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3 md:static md:border-0 md:bg-transparent">
        <div className="flex items-center gap-3 mb-4 max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white p-1">←</button>
          <h1 className="text-xl font-display font-bold text-white">Nueva Venta</h1>
        </div>
        <div className="max-w-2xl mx-auto">
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

      <div className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-2xl mx-auto px-4 pt-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {/* STEP 1 — oculto para YAW (saltan directo al 2) */}
          {step === 1 && !isYAW && (
            <div className="space-y-4">
              <BuscadorCliente onSelect={c => {
                setClienteId(c.CLIENTE_ID || c.id || null)
                setCliente({ nombre: c.NOMBRE||c.nombre||'', cedula: String(c.CEDULA||c.cedula||''), celular: String(c.CELULAR||c.celular||''), email: c.EMAIL||c.email||'', ciudad: c.CIUDAD||c.ciudad||'', direccion: c.DIRECCION||c.direccion||'' })
                setClienteKey(k => k + 1)
                setUsarMapa(false)
                setCedulaError(''); setCelularError('')
              }} />
              {clienteId && (
                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 text-sm">✅</span>
                    <span className="text-green-400 text-xs font-medium">Cliente existente cargado</span>
                  </div>
                  <button onClick={() => { setClienteId(null); setClienteKey(k => k + 1); setCliente({ nombre: '', cedula: '', celular: '', email: '', ciudad: '', direccion: '' }) }}
                    className="text-xs text-gray-500 hover:text-red-400">
                    ✕ Limpiar
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Nombre completo *</label>
                  <input className="input" placeholder="María García" value={cliente.nombre}
                    autoComplete="off"
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
                        const r = await fetch(`/api/clientes?q=${encodeURIComponent(ced)}`)
                        const d = await r.json()
                        const found = (d.clientes||[]).find(c => String(c.CEDULA)===String(ced))
                        if (found) {
                          const usar = window.confirm(`⚠️ Cliente ya existe:\n\nNombre: ${found.NOMBRE}\nCelular: ${found.CELULAR}\nDirección: ${found.DIRECCION||'No registrada'}\n\n¿Autocompletar datos?`)
                          if (usar) {
                            setClienteId(found.CLIENTE_ID)
                            setCliente({ nombre: found.NOMBRE||'', cedula: String(found.CEDULA||''), celular: String(found.CELULAR||''), email: found.EMAIL||'', ciudad: found.CIUDAD||'', direccion: found.DIRECCION||'' })
                            setClienteKey(k => k+1)
                          }
                        }
                      } catch(err) {}
                    }} />
                  {cedulaError && <p className="text-red-400 text-xs mt-1">{cedulaError}</p>}
                </div>
                <div>
                  <label className="label">Celular *</label>
                  <input className={`input ${celularError ? 'border-red-500' : ''}`}
                    placeholder="0987654321" value={cliente.celular}
                    autoComplete="off" inputMode="tel" name="x-celular"
                    onChange={e => { setCliente(p => ({...p, celular: e.target.value})); setCelularError(validarCelular(e.target.value) || '') }} />
                  {celularError && <p className="text-red-400 text-xs mt-1">{celularError}</p>}
                </div>
                <div className="col-span-2">
                  <label className="label">Email {emitirFactura ? '* (requerido para factura)' : '(opcional)'}</label>
                  <input className={`input ${emitirFactura && !cliente.email ? 'border-yellow-500/50' : ''}`}
                    type="email" autoComplete="off" name="x-email" placeholder="cliente@gmail.com" value={cliente.email}
                    onChange={e => setCliente(p => ({...p, email: e.target.value}))} />
                  {emitirFactura && !cliente.email && (
                    <p className="text-yellow-400 text-xs mt-1">⚠️ Necesitas el correo para emitir factura</p>
                  )}
                </div>
              </div>
              <label className="flex items-center gap-3 card p-4 cursor-pointer hover:border-gray-600 transition-all">
                <input type="checkbox" checked={emitirFactura} onChange={e => setEmitirFactura(e.target.checked)}
                  className="w-5 h-5 accent-orange-500" />
                <div>
                  <div className="text-white text-sm font-medium">Emitir factura electrónica</div>
                  <div className="text-gray-500 text-xs">Se enviará al SRI via Dátil</div>
                </div>
              </label>
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
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Ciudad de entrega *</p>
                      <input className={`input ${!cliente.ciudad.trim() ? 'border-yellow-500/40' : ''}`}
                        autoComplete="off" name="x-ciudad" placeholder="Ej: Quito, Guayaquil, Cuenca" value={cliente.ciudad}
                        onChange={e => setCliente(p => ({...p, ciudad: e.target.value}))} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Dirección completa *</p>
                      <textarea ref={refDireccion} autoComplete="off" name="x-direccion" rows={3}
                        className={`input resize-none ${!cliente.direccion.trim() ? 'border-yellow-500/40' : ''}`}
                        placeholder={`Ej:\nAv. 10 de Agosto y Orellana\nEdificio Torre Norte, piso 3\nReferencia: junto a Burger King`}
                        value={cliente.direccion}
                        onChange={e => setCliente(p => ({...p, direccion: e.target.value}))} />
                    </div>
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
              {/* Selector de tienda — oculto para YAW */}
              {!isYAW && (
                <div className="flex gap-2">
                  {[
                    { key: 'MANDARINA', label: '🍊 Mandarina', color: '#FF6B00' },
                    { key: 'INDSTORE',  label: '🏪 Indstore',  color: '#E91E8C' },
                    { key: 'SUCURSAL',  label: '🏬 Sucursal',  color: '#10B981' },
                  ].map(t => (
                    <button key={t.key} onClick={() => setTienda(t.key)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border
                        ${tienda === t.key ? 'text-white border-transparent' : 'bg-transparent text-gray-500 border-gray-700'}`}
                      style={tienda === t.key ? { backgroundColor: t.color } : {}}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Vista Sucursal */}
              {tienda === 'SUCURSAL' && !isYAW && (
                <div>
                  {loadingSucursal ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : sucursalProductos.length === 0 ? (
                    <div className="card p-6 text-center text-gray-500 border-dashed">
                      <div className="text-3xl mb-2">🏬</div>
                      <div className="text-sm">No hay productos en sucursal con stock disponible</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {sucursalProductos.map(p => (
                        <button key={p.ID} onClick={() => agregarDesdeSucursal(p)}
                          className="card text-left hover:border-green-500/50 overflow-hidden transition-all">
                          <div className="aspect-square bg-gray-800">
                            {p.FOTO_URL
                              ? <img src={p.FOTO_URL} alt={p.NOMBRE} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-3xl text-gray-600">👕</div>}
                          </div>
                          <div className="p-2">
                            <div className="text-xs font-medium text-white line-clamp-2 mb-1">{p.NOMBRE}</div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">{p.TALLA}{p.COLOR ? ` · ${p.COLOR}` : ''}</span>
                              <span className="text-xs font-bold text-green-400">{p.STOCK} uds</span>
                            </div>
                            {p.PRECIO > 0 && <div className="text-xs text-mandarina-400 font-medium mt-1">${parseFloat(p.PRECIO).toFixed(2)}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Banner YAW — muestra tienda y cliente fijo */}
              {isYAW && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-purple-500/30 bg-purple-500/5">
                  <span className="text-purple-400 text-lg">🛒</span>
                  <div>
                    <div className="text-purple-300 text-sm font-semibold">Tienda YAW</div>
                    <div className="text-xs text-gray-500">{cliente.nombre} · {cliente.ciudad}</div>
                  </div>
                </div>
              )}
              {/* soloPersonalizado=true para YAW: no muestra búsqueda Shopify ni catálogo */}
              <BuscadorProductos
                tienda={tienda}
                soloPersonalizado={isYAW}
                onAdd={item => setItems(p => [...p, { ...item, cantidad: item.cantidad || 1, precioUnit: item.precioUnit || '' }])}
              />
              {items.length === 0 && (
                <div className="card p-6 text-center text-gray-500 border-dashed">
                  <div className="text-3xl mb-2">👕</div>
                  <div className="text-sm">{isYAW ? 'Agrega un producto personalizado' : 'Busca un producto o agrega uno personalizado'}</div>
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
                {fechaEntrega && fechaEntrega < getMinFechaConDias(diasCalculado) && (
                  <p className="text-yellow-400 text-xs mt-2">⚠️ Fecha por debajo del mínimo recomendado</p>
                )}
              </div>
              <div ref={pagoRef}><SeccionPago pagos={pagos} onChange={setPagos} montoTotal={montoTotal} /></div>
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
                  ['Dirección', buildDireccion() || cliente.direccion],
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
              <div>
                <label className="label">Notas internas</label>
                <textarea className="input resize-none" rows={3} placeholder="Instrucciones especiales para fábrica, urgencias..."
                  value={notasVendedor} onChange={e => setNotasVendedor(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-4 flex gap-3">
        {/* YAW no puede volver al step 1 (cliente fijo) */}
        {step > 1 && !(isYAW && step === 2) && (
          <button onClick={() => goToStep(step - 1)} className="btn-secondary flex-1">← Atrás</button>
        )}
        {step < 4 ? (
          <button onClick={() => goToStep(step + 1)} disabled={!canGoToStep(step + 1)}
            className="btn-primary flex-1"
            style={canGoToStep(step + 1)
              ? { backgroundColor: tiendaColor }
              : { backgroundColor: '#374151', cursor: 'not-allowed', opacity: 0.5 }}>
            Siguiente →
          </button>
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
