'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import BuscadorProductos from '@/components/pedido/BuscadorProductos'

const TALLAS = ['1 AÑO','2','3','4','5','6','7','8','9','10','12','XS','S','M','L','XL','2XL','3XL','4XL']
const TIPOS_PAGO = ['EFECTIVO','TRANSFERENCIA','LINK_PAGO']

export default function EditarPedidoPage() {
  const router = useRouter()
  const params = useParams()
  const [user, setUser] = useState(null)
  const [pedido, setPedido] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [items, setItems] = useState([])
  const [pagos, setPagos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Edit states
  const [direccion, setDireccion] = useState('')
  const [nuevoPago, setNuevoPago] = useState({ tipo: 'EFECTIVO', monto: '', notas: '' })
  const [showNuevoProducto, setShowNuevoProducto] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    loadPedido()
  }, [])

  async function loadPedido() {
    try {
      const res = await fetch(`/api/pedidos?rol=ADMIN`)
      const data = await res.json()
      const p = data.pedidos?.find(p => p.PEDIDO_ID === params.id)
      if (!p) return
      setPedido(p)
      setItems(p.items || [])
      setPagos(p.pagos || [])
      setDireccion(p.DIRECCION_TEXTO || '')

      const cr = await fetch(`/api/clientes?id=${encodeURIComponent(p.CLIENTE_ID || '')}`)
      const cd = await cr.json()
      setCliente(cd.clientes?.[0] || null)
    } finally { setLoading(false) }
  }

  const montoTotal = items.filter(i => i.SUBESTADO !== 'ELIMINADO').reduce((s, i) => s + parseFloat(i.SUBTOTAL || 0), 0)
  const montoAbonado = pagos.reduce((s, p) => s + parseFloat(p.MONTO || 0), 0)
  const montoPendiente = montoTotal - montoAbonado

  async function saveDireccion() {
    setSaving(true); setError(''); setSuccess('')
    try {
      await fetch(`/api/pedidos/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ DIRECCION_TEXTO: direccion, _usuarioId: user?.id }),
      })
      // Also update client
      if (cliente) {
        await fetch(`/api/clientes/${cliente.CLIENTE_ID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ DIRECCION: direccion }),
        })
      }
      setSuccess('Dirección actualizada')
      loadPedido()
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function savePrice(itemId, newPrice) {
    await fetch(`/api/pedidos/item/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PRECIO_UNIT: newPrice, _usuarioId: user?.id }),
    })
    loadPedido()
  }

  async function deleteItem(itemId) {
    await fetch(`/api/pedidos/item/${itemId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _usuarioId: user?.id }),
    })
    setConfirmDelete(null)
    loadPedido()
  }

  async function addItem(item) {
    setSaving(true); setError('')
    try {
      await fetch(`/api/pedidos/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevoItem: item, _usuarioId: user?.id }),
      })
      setShowNuevoProducto(false)
      setSuccess('Producto agregado')
      loadPedido()
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function addPago() {
    const monto = parseFloat(nuevoPago.monto || 0)
    if (monto <= 0) { setError('El monto debe ser mayor a 0'); return }
    if (monto > montoPendiente + 0.01) { setError(`El pago no puede superar el saldo pendiente $${montoPendiente.toFixed(2)}`); return }

    setSaving(true); setError('')
    try {
      await fetch(`/api/pedidos/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nuevoPago,
          MONTO_ABONADO: (montoAbonado + monto).toFixed(2),
          MONTO_PENDIENTE: Math.max(0, montoPendiente - monto).toFixed(2),
          MONTO_TOTAL: montoTotal.toFixed(2),
          ESTADO_PAGO: (montoAbonado + monto) >= montoTotal ? 'PAGADO' : 'ABONO',
          _usuarioId: user?.id,
        }),
      })
      setNuevoPago({ tipo: 'EFECTIVO', monto: '', notas: '' })
      setSuccess('Pago registrado')
      loadPedido()
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading || !pedido) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/mis-pedidos')} className="text-gray-500 hover:text-white">←</button>
          <div>
            <h1 className="text-lg font-display font-bold text-white">Editar {pedido.PEDIDO_ID}</h1>
            <p className="text-xs text-gray-500">Solo pedidos en producción</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">{error}</div>}
          {success && <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-xl">✓ {success}</div>}

          {/* Resumen */}
          <div className="card p-4 grid grid-cols-3 gap-3 text-center">
            <div><div className="text-lg font-bold text-white">${montoTotal.toFixed(2)}</div><div className="text-xs text-gray-500">Total</div></div>
            <div><div className="text-lg font-bold text-green-400">${montoAbonado.toFixed(2)}</div><div className="text-xs text-gray-500">Abonado</div></div>
            <div><div className={`text-lg font-bold ${montoPendiente > 0 ? 'text-yellow-400' : 'text-green-400'}`}>${montoPendiente.toFixed(2)}</div><div className="text-xs text-gray-500">Pendiente</div></div>
          </div>

          {/* Dirección */}
          <div className="card p-4">
            <h3 className="font-semibold text-white text-sm mb-3">📍 Dirección de entrega</h3>
            {cliente && <div className="text-xs text-gray-500 mb-2">Cliente: {cliente.NOMBRE} · {cliente.CELULAR}</div>}
            <textarea className="input resize-none mb-3" rows={2}
              value={direccion} onChange={e => setDireccion(e.target.value)}
              placeholder="Av. 6 de Diciembre y Mercurio. Frente al Teatro 24 Mayo" />
            <button onClick={saveDireccion} disabled={saving}
              className="btn-primary text-sm px-4 py-2">
              {saving ? '⏳ Guardando...' : '💾 Guardar dirección'}
            </button>
          </div>

          {/* Productos */}
          <div className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-white text-sm">👕 Productos</h3>
              <button onClick={() => setShowNuevoProducto(!showNuevoProducto)}
                className="text-mandarina-400 text-xs hover:underline">
                {showNuevoProducto ? '✕ Cancelar' : '+ Agregar producto'}
              </button>
            </div>

            {showNuevoProducto && (
              <div className="p-4 border-b border-gray-800">
                <BuscadorProductos tienda={pedido.TIENDA_ID} onAdd={addItem} />
              </div>
            )}

            <div className="divide-y divide-gray-800">
              {items.filter(i => i.SUBESTADO !== 'ELIMINADO').map(item => (
                <div key={item.ITEM_ID} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{item.PRODUCTO_NOMBRE}</div>
                      <div className="text-xs text-gray-500">{item.COLOR} · {item.TALLA} · <span className="text-mandarina-400">{item.AREA}</span></div>
                      <div className="text-xs text-gray-600 mt-0.5">Estado: {item.SUBESTADO}</div>
                    </div>
                    {confirmDelete === item.ITEM_ID ? (
                      <div className="flex gap-1">
                        <button onClick={() => deleteItem(item.ITEM_ID)}
                          className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg">Eliminar</button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="text-xs bg-gray-700 text-white px-2 py-1 rounded-lg">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(item.ITEM_ID)}
                        className="text-gray-600 hover:text-red-400 text-sm p-1">✕</button>
                    )}
                  </div>
                  {/* Price editor */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">Precio:</span>
                    <input type="number" step="0.50" min="0"
                      className="input py-1 text-sm w-24"
                      defaultValue={parseFloat(item.PRECIO_UNIT || 0).toFixed(2)}
                      onBlur={e => {
                        const newVal = parseFloat(e.target.value)
                        if (!isNaN(newVal) && newVal !== parseFloat(item.PRECIO_UNIT)) {
                          savePrice(item.ITEM_ID, newVal)
                        }
                      }} />
                    <span className="text-xs text-gray-500">× {item.CANTIDAD} = <span className="text-white">${parseFloat(item.SUBTOTAL||0).toFixed(2)}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Agregar pago */}
          {montoPendiente > 0.01 && (
            <div className="card p-4">
              <h3 className="font-semibold text-white text-sm mb-3">💰 Registrar pago adicional</h3>
              <div className="flex gap-2 mb-3">
                {TIPOS_PAGO.map(t => (
                  <button key={t} onClick={() => setNuevoPago(p => ({...p, tipo: t}))}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${nuevoPago.tipo === t ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'border-gray-700 text-gray-500'}`}>
                    {t === 'EFECTIVO' ? '💵' : t === 'TRANSFERENCIA' ? '🏦' : '🔗'} {t.replace('_',' ')}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="number" step="0.50" min="0" max={montoPendiente}
                  className="input flex-1" placeholder={`Máx. $${montoPendiente.toFixed(2)}`}
                  value={nuevoPago.monto}
                  onChange={e => setNuevoPago(p => ({...p, monto: e.target.value}))} />
                <button onClick={addPago} disabled={saving || !nuevoPago.monto}
                  className="btn-primary px-4 text-sm">
                  {saving ? '⏳' : 'Registrar'}
                </button>
              </div>
              {/* Historial pagos */}
              {pagos.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-xs text-gray-600 mb-1">Pagos registrados:</div>
                  {pagos.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-400">
                      <span>{p.TIPO_PAGO} · {p.FECHA_PAGO?.split(' ')[0]}</span>
                      <span className="text-white">${parseFloat(p.MONTO||0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
