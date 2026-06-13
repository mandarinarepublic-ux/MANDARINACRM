'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import BuscadorProductos from '@/components/pedido/BuscadorProductos'

const TALLAS = ['1 AÑO','2','3','4','5','6','7','8','9','10','12','XS','S','M','L','XL','2XL','3XL','4XL']
const TIPOS_PAGO = ['EFECTIVO','TRANSFERENCIA','LINK_PAGO']
const AREAS = [
  'ESTAMPADO','SUBLIMACION','BORDADO',
  'ESTAMPADO + SUBLIMACION','ESTAMPADO + BORDADO',
  'SUBLIMACION + BORDADO','ESTAMPADO + SUBLIMACION + BORDADO',
  'PRODUCTO SIN DISEÑO','ENTREGA EN TIENDA',
]

function ItemEditor({ item, onSave }) {
  const [data, setData] = useState({
    PRODUCTO_NOMBRE: item.PRODUCTO_NOMBRE || '',
    COLOR: item.COLOR || '',
    TALLA: item.TALLA || '',
    CANTIDAD: item.CANTIDAD || 1,
    PRECIO_UNIT: item.PRECIO_UNIT || '0',
    AREA: item.AREA || 'ESTAMPADO',
    DETALLE_PERSONALIZADO: item.DETALLE_PERSONALIZADO || '',
  })
  const [fotos, setFotos] = useState({
    FOTO_PECHO_URL: item.FOTO_PECHO_URL || '',
    FOTO_ESPALDA_URL: item.FOTO_ESPALDA_URL || '',
    FOTO_MANGA_D_URL: item.FOTO_MANGA_D_URL || '',
    FOTO_MANGA_I_URL: item.FOTO_MANGA_I_URL || '',
  })
  const [saving, setSaving] = useState(false)

  function handleFoto(key, file) {
    if (!file) return
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const MAX = 800
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }
      }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      setFotos(f => ({ ...f, [key]: canvas.toDataURL('image/jpeg', 0.75) }))
    }
    img.src = url
  }

  const subtotal = (parseFloat(data.PRECIO_UNIT || 0) * parseInt(data.CANTIDAD || 1)).toFixed(2)

  return (
    <div className="mt-3 border-t border-gray-800 pt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="label">Nombre del producto</label>
          <input className="input text-sm" value={data.PRODUCTO_NOMBRE}
            onChange={e => setData(d => ({...d, PRODUCTO_NOMBRE: e.target.value}))} />
        </div>
        <div>
          <label className="label">Color</label>
          <input className="input text-sm" value={data.COLOR}
            onChange={e => setData(d => ({...d, COLOR: e.target.value}))} />
        </div>
        <div>
          <label className="label">Talla</label>
          <select className="input text-sm" value={data.TALLA}
            onChange={e => setData(d => ({...d, TALLA: e.target.value}))}>
            {TALLAS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Cantidad</label>
          <input type="number" min="1" className="input text-sm" value={data.CANTIDAD}
            onChange={e => setData(d => ({...d, CANTIDAD: e.target.value}))} />
        </div>
        <div>
          <label className="label">Precio $</label>
          <input type="number" min="0" step="0.5" className="input text-sm" value={data.PRECIO_UNIT}
            onChange={e => setData(d => ({...d, PRECIO_UNIT: e.target.value}))} />
        </div>
        <div className="col-span-2">
          <label className="label">Área</label>
          <select className="input text-sm" value={data.AREA}
            onChange={e => setData(d => ({...d, AREA: e.target.value}))}>
            {AREAS.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Detalle / instrucciones</label>
          <textarea className="input resize-none text-sm" rows={2} value={data.DETALLE_PERSONALIZADO}
            onChange={e => setData(d => ({...d, DETALLE_PERSONALIZADO: e.target.value}))} />
        </div>
      </div>

      {/* Fotos */}
      <div>
        <label className="label">Fotos del diseño</label>
        <div className="grid grid-cols-2 gap-2">
          {[['FOTO_PECHO_URL','Pecho'],['FOTO_ESPALDA_URL','Espalda'],['FOTO_MANGA_D_URL','M. Derecha'],['FOTO_MANGA_I_URL','M. Izquierda']].map(([key, label]) => (
            <div key={key}>
              <label className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed cursor-pointer overflow-hidden transition-all
                ${fotos[key] ? 'border-mandarina-500' : 'border-gray-700 hover:border-gray-500'}`}>
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => handleFoto(key, e.target.files[0])} />
                {fotos[key]
                  ? <img src={fotos[key]} className="w-full h-full object-cover" />
                  : <span className="text-xs text-gray-500 text-center px-1">{label}</span>}
              </label>
              {fotos[key] && (
                <button onClick={() => setFotos(f => ({...f, [key]: ''}))}
                  className="text-xs text-red-400 mt-0.5 w-full text-center">✕ quitar</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">Subtotal: <span className="text-white font-bold">${subtotal}</span></span>
        <button onClick={async () => {
          setSaving(true)
          await onSave({
            PRODUCTO_NOMBRE: data.PRODUCTO_NOMBRE,
            COLOR: data.COLOR,
            TALLA: data.TALLA,
            CANTIDAD: data.CANTIDAD,
            PRECIO_UNIT: data.PRECIO_UNIT,
            SUBTOTAL: subtotal,
            AREA: data.AREA,
            DETALLE_PERSONALIZADO: data.DETALLE_PERSONALIZADO,
            ...fotos,
          })
          setSaving(false)
        }} disabled={saving} className="btn-primary text-sm px-4 py-2">
          {saving ? '⏳ Guardando...' : '💾 Guardar cambios'}
        </button>
      </div>
    </div>
  )
}


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
  const [editingItem, setEditingItem] = useState(null)
  const [editingDireccion, setEditingDireccion] = useState(false)
  const [showPago, setShowPago] = useState(false)

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
      setDireccion(p.DIRECCION_TEXTO || p.DIRECCION_PEDIDO || '')

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
      if (cliente) {
        // Build full address for pedido
        const ciudadCliente = cliente.CIUDAD || ''
        const dirCompleta = ciudadCliente ? `${ciudadCliente}: ${direccion}` : direccion
        await fetch(`/api/pedidos/${params.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ DIRECCION_TEXTO: dirCompleta, _usuarioId: user?.id }),
        })
        await fetch(`/api/clientes/${cliente.CLIENTE_ID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            NOMBRE: cliente.NOMBRE,
            CEDULA: String(cliente.CEDULA || ''),
            CELULAR: String(cliente.CELULAR || ''),
            EMAIL: cliente.EMAIL || '',
            CIUDAD: ciudadCliente,
            DIRECCION: direccion,
          }),
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">📍 Dirección de entrega</h3>
              <button onClick={() => setEditingDireccion(e => !e)}
                className="text-xs text-mandarina-400 hover:underline">
                {editingDireccion ? '✕ Cancelar' : '✏️ Editar dirección'}
              </button>
            </div>
            {cliente && (
              <div className="text-xs text-gray-500 mb-2">
                {cliente.NOMBRE} · {cliente.CELULAR}
                {cliente.EMAIL && ` · ${cliente.EMAIL}`}
              </div>
            )}
            {editingDireccion ? (
              <>
                <div className="space-y-2 mb-3">
                  <input className="input text-sm" placeholder="Ciudad (ej: Quito)"
                    value={cliente?.CIUDAD || ''}
                    onChange={e => setCliente(c => ({...c, CIUDAD: e.target.value}))} />
                  <textarea className="input resize-none text-sm" rows={2}
                    value={direccion} onChange={e => setDireccion(e.target.value)}
                    placeholder="Av. 6 de Diciembre y Mercurio. Frente al Teatro 24 Mayo" />
                  <input className="input text-sm" placeholder="Correo electrónico"
                    value={cliente?.EMAIL || ''}
                    onChange={e => setCliente(c => ({...c, EMAIL: e.target.value}))} />
                  <input className="input text-sm" placeholder="Celular"
                    value={cliente?.CELULAR || ''}
                    onChange={e => setCliente(c => ({...c, CELULAR: e.target.value}))} />
                </div>
                <button onClick={async () => {
                  await saveDireccion()
                  setEditingDireccion(false)
                }} disabled={saving} className="btn-primary text-sm px-4 py-2">
                  {saving ? '⏳ Guardando...' : '💾 Guardar cambios'}
                </button>
              </>
            ) : (
              <div className="bg-gray-800/50 rounded-xl px-4 py-3 text-sm text-gray-300">
                {direccion || <span className="text-gray-600 italic">Sin dirección registrada</span>}
              </div>
            )}
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
                  {/* Edit item button */}
                  <button onClick={() => setEditingItem(editingItem === item.ITEM_ID ? null : item.ITEM_ID)}
                    className="text-xs text-mandarina-400 hover:underline mt-2 block">
                    {editingItem === item.ITEM_ID ? '▲ Cerrar editor' : '✏️ Editar producto'}
                  </button>
                  {editingItem === item.ITEM_ID && (
                    <ItemEditor item={item} onSave={async (updated) => {
                      await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...updated, _usuarioId: user?.id }),
                      })
                      setEditingItem(null)
                      setSuccess('Producto actualizado')
                      loadPedido()
                    }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pagos */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-white text-sm">💰 Pagos</h3>
                <div className="text-xs text-gray-500 mt-0.5">
                  Abonado: <span className="text-green-400">${montoAbonado.toFixed(2)}</span>
                  {montoPendiente > 0.01 && <> · Pendiente: <span className="text-yellow-400">${montoPendiente.toFixed(2)}</span></>}
                </div>
              </div>
              {montoPendiente > 0.01 && (
                <button onClick={() => setShowPago(s => !s)}
                  className="text-xs text-mandarina-400 hover:underline">
                  {showPago ? '✕ Cancelar' : '+ Agregar pago'}
                </button>
              )}
            </div>

            {/* Historial pagos - siempre visible */}
            {pagos.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {pagos.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs bg-gray-800/50 rounded-lg px-3 py-2">
                    <span className="text-gray-400">{p.TIPO_PAGO} · {p.FECHA_PAGO?.split(' ')[0]}</span>
                    <span className="text-white font-medium">${parseFloat(p.MONTO||0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario - solo cuando showPago */}
            {showPago && montoPendiente > 0.01 && (
              <>
                <div className="flex gap-2 mb-3">
                  {TIPOS_PAGO.map(t => (
                    <button key={t} onClick={() => setNuevoPago(p => ({...p, tipo: t}))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all
                        ${nuevoPago.tipo === t
                          ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10'
                          : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}>
                      {t === 'EFECTIVO' ? '💵' : t === 'TRANSFERENCIA' ? '🏦' : '🔗'} {t.replace('_',' ')}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="number" step="0.50" min="0" max={montoPendiente}
                    className="input flex-1" placeholder={`Máx. $${montoPendiente.toFixed(2)}`}
                    value={nuevoPago.monto}
                    onChange={e => setNuevoPago(p => ({...p, monto: e.target.value}))} />
                  <button onClick={async () => { await addPago(); setShowPago(false) }}
                    disabled={saving || !nuevoPago.monto}
                    className="btn-primary px-4 text-sm">
                    {saving ? '⏳' : 'Registrar'}
                  </button>
                </div>
              </>
            )}

            {montoPendiente <= 0.01 && (
              <div className="text-xs text-green-400 bg-green-500/10 rounded-lg px-3 py-2 text-center">
                ✅ Pedido pagado completamente
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
