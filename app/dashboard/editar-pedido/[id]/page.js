'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import BuscadorProductos from '@/components/pedido/BuscadorProductos'
import ItemDetalle from '@/components/pedido/ItemDetalle'
import { subirFoto } from '@/lib/subirImagen'
import { TIPOS_ID, tipoIdMeta, validarIdentificacion, inferirTipo } from '@/lib/identificacion'

const TALLAS = ['1 AÑO','2','3','4','5','6','7','8','9','10','12','XS','S','M','L','XL','2XL','3XL','4XL']
const TIPOS_PAGO = ['EFECTIVO','TRANSFERENCIA','LINK_PAGO']
const AREAS = ['ESTAMPADO','SUBLIMACION','BORDADO','ESTAMPADO + SUBLIMACION','ESTAMPADO + BORDADO','SUBLIMACION + BORDADO','ESTAMPADO + SUBLIMACION + BORDADO','PRODUCTO SIN DISEÑO','ENTREGA EN TIENDA']

// Las rutas que tocan productos exigen ADMIN y lo verifican contra la base con
// esta cabecera (lib/auth.js). Sin ella el servidor responde 401.
function headersAdmin(user) {
  return { 'Content-Type':'application/json', 'x-mp-usuario-id': user?.id || '' }
}

function ItemEditor({ item, onSave }) {
  const [data, setData] = useState({ PRODUCTO_NOMBRE:item.PRODUCTO_NOMBRE||'', COLOR:item.COLOR||'', TALLA:item.TALLA||'', CANTIDAD:item.CANTIDAD||1, PRECIO_UNIT:item.PRECIO_UNIT||'0', AREA:item.AREA||'ESTAMPADO', DETALLE_PERSONALIZADO:item.DETALLE_PERSONALIZADO||'' })
  const [fotos, setFotos] = useState({ FOTO_PECHO_URL:item.FOTO_PECHO_URL||'', FOTO_ESPALDA_URL:item.FOTO_ESPALDA_URL||'', FOTO_MANGA_D_URL:item.FOTO_MANGA_D_URL||'', FOTO_MANGA_I_URL:item.FOTO_MANGA_I_URL||'' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState({})
  const [uploadError, setUploadError] = useState('')

  // Sube la foto a Cloudinary. Se reescala a buena calidad antes de subir para
  // no exceder el límite de tamaño de request de Vercel. Solo se guarda la URL.
  async function handleFoto(key, file) {
    if (!file) return
    setUploading(u=>({...u,[key]:true})); setUploadError('')
    try {
      const url = await subirFoto(file, 'diseno')
      setFotos(f=>({...f,[key]:url}))
    } catch(e) {
      setUploadError(e.message)
    } finally {
      setUploading(u=>({...u,[key]:false}))
    }
  }

  const subtotal = (parseFloat(data.PRECIO_UNIT||0)*parseInt(data.CANTIDAD||1)).toFixed(2)
  return (
    <div className="mt-3 border-t border-gray-800 pt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><label className="label">Nombre del producto</label><input className="input text-sm" value={data.PRODUCTO_NOMBRE} onChange={e=>setData(d=>({...d,PRODUCTO_NOMBRE:e.target.value}))} /></div>
        <div><label className="label">Color</label><input className="input text-sm" value={data.COLOR} onChange={e=>setData(d=>({...d,COLOR:e.target.value}))} /></div>
        <div><label className="label">Talla</label><select className="input text-sm" value={data.TALLA} onChange={e=>setData(d=>({...d,TALLA:e.target.value}))}>{TALLAS.map(t=><option key={t}>{t}</option>)}</select></div>
        <div><label className="label">Cantidad</label><input type="number" min="1" className="input text-sm" value={data.CANTIDAD} onChange={e=>setData(d=>({...d,CANTIDAD:e.target.value}))} /></div>
        <div><label className="label">Precio $</label><input type="number" min="0" step="0.5" className="input text-sm" value={data.PRECIO_UNIT} onChange={e=>setData(d=>({...d,PRECIO_UNIT:e.target.value}))} /></div>
        <div className="col-span-2"><label className="label">Área</label><select className="input text-sm" value={data.AREA} onChange={e=>setData(d=>({...d,AREA:e.target.value}))}>{AREAS.map(a=><option key={a}>{a}</option>)}</select></div>
        <div className="col-span-2"><label className="label">Detalle / instrucciones</label><textarea className="input resize-none text-sm" rows={2} value={data.DETALLE_PERSONALIZADO} onChange={e=>setData(d=>({...d,DETALLE_PERSONALIZADO:e.target.value}))} /></div>
      </div>
      <div>
        <label className="label">Fotos del diseño</label>
        <div className="grid grid-cols-2 gap-2">
          {[['FOTO_PECHO_URL','Pecho'],['FOTO_ESPALDA_URL','Espalda'],['FOTO_MANGA_D_URL','M. Derecha'],['FOTO_MANGA_I_URL','M. Izquierda']].map(([key,label])=>(
            <div key={key}>
              <label className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed cursor-pointer overflow-hidden transition-all ${fotos[key]?'border-mandarina-500':'border-gray-700 hover:border-gray-500'} ${uploading[key]?'opacity-60 pointer-events-none':''}`}>
                <input type="file" accept="image/*" className="hidden" onChange={e=>handleFoto(key,e.target.files[0])} />
                {uploading[key]
                  ? <div className="flex flex-col items-center gap-1"><div className="w-4 h-4 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" /><span className="text-[10px] text-gray-500">Subiendo...</span></div>
                  : fotos[key]?<img src={fotos[key]} className="w-full h-full object-cover" />:<span className="text-xs text-gray-500 text-center px-1">{label}</span>}
              </label>
              {fotos[key]&&!uploading[key]&&<button onClick={()=>setFotos(f=>({...f,[key]:''}))} className="text-xs text-red-400 mt-0.5 w-full text-center">✕ quitar</button>}
            </div>
          ))}
        </div>
        {uploadError && <div className="text-red-400 text-xs mt-1">⚠️ {uploadError}</div>}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">Subtotal: <span className="text-white font-bold">${subtotal}</span></span>
        <button onClick={async()=>{setSaving(true);await onSave({...data,...fotos,SUBTOTAL:subtotal});setSaving(false)}} disabled={saving} className="btn-primary text-sm px-4 py-2">
          {saving?'⏳ Guardando...':'💾 Guardar cambios'}
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

  // FIX #10: estados separados para evitar stale closure
  const [ciudadEdit, setCiudadEdit] = useState('')
  const [direccionEdit, setDireccionEdit] = useState('')
  const [emailEdit, setEmailEdit] = useState('')
  const [celularEdit, setCelularEdit] = useState('')
  const [cedulaEdit, setCedulaEdit] = useState('')
  const [tipoIdEdit, setTipoIdEdit] = useState('CEDULA')
  const [cedulaErrorEdit, setCedulaErrorEdit] = useState('')

  const [nuevoPago, setNuevoPago] = useState({ tipo:'EFECTIVO', monto:'', notas:'' })
  const [showNuevoProducto, setShowNuevoProducto] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [editingDireccion, setEditingDireccion] = useState(false)
  const [showPago, setShowPago] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    // Editar productos de un pedido ya confirmado es SOLO de ADMIN. El vendedor
    // revisa y aprueba antes de crearlo (paso 4 de Nueva Venta); después ve el
    // detalle en modo lectura. El servidor vuelve a comprobarlo (requireAdmin),
    // esto solo evita mostrar una pantalla que no va a poder guardar.
    if (u.rol !== 'ADMIN') { router.replace(`/dashboard/pedido/${params.id}`); return }
    setUser(u)
    loadPedido()
  }, [])

  async function loadPedido() {
    try {
      const res = await fetch(`/api/pedidos/${params.id}`)
      const data = await res.json()
      const p = data.pedido
      if (!p) return
      setPedido(p)
      setItems(p.items || [])
      setPagos(p.pagos || [])
      setDireccionEdit(p.DIRECCION_TEXTO || p.DIRECCION_PEDIDO || '')
      const cr = await fetch(`/api/clientes?id=${encodeURIComponent(p.CLIENTE_ID||'')}`)
      const cd = await cr.json()
      const c = cd.clientes?.[0] || null
      setCliente(c)
      if (c) {
        setCiudadEdit(c.CIUDAD||''); setEmailEdit(c.EMAIL||''); setCelularEdit(c.CELULAR||'')
        const ced = String(c.CEDULA||''); setCedulaEdit(ced); setTipoIdEdit(inferirTipo(ced)); setCedulaErrorEdit('')
      }
    } finally { setLoading(false) }
  }

  const montoTotal = items.filter(i=>i.SUBESTADO!=='ELIMINADO').reduce((s,i)=>s+parseFloat(i.SUBTOTAL||0),0)
  const montoAbonado = pagos.reduce((s,p)=>s+parseFloat(p.MONTO||0),0)
  const montoPendiente = montoTotal - montoAbonado

  async function saveDireccion() {
    // Validar la identificación según el tipo antes de guardar
    const errId = validarIdentificacion(tipoIdEdit, cedulaEdit)
    if (errId) { setCedulaErrorEdit(errId); setError(`Identificación: ${errId}`); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      const dirCompleta = ciudadEdit ? `${ciudadEdit}: ${direccionEdit}` : direccionEdit
      await fetch(`/api/pedidos/${params.id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ DIRECCION_TEXTO:dirCompleta, _usuarioId:user?.id }),
      })
      if (cliente) {
        await fetch(`/api/clientes/${cliente.CLIENTE_ID}`, {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ NOMBRE:cliente.NOMBRE, CEDULA:String(cedulaEdit||''), CELULAR:celularEdit, EMAIL:emailEdit, CIUDAD:ciudadEdit, DIRECCION:direccionEdit }),
        })
      }
      setSuccess('Dirección actualizada')
      setEditingDireccion(false)
      loadPedido()
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function deleteItem(itemId) {
    setError('')
    const res = await fetch(`/api/pedidos/item/${itemId}`, { method:'DELETE', headers:headersAdmin(user), body:JSON.stringify({_usuarioId:user?.id}) })
    if (!res.ok) { setError((await res.json().catch(()=>({}))).error || 'No se pudo eliminar'); return }
    setConfirmDelete(null); loadPedido()
  }

  async function addItem(item) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/pedidos/${params.id}`, { method:'PATCH', headers:headersAdmin(user), body:JSON.stringify({nuevoItem:item,_usuarioId:user?.id}) })
      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'No se pudo agregar el producto')
      setShowNuevoProducto(false); setSuccess('Producto agregado'); loadPedido()
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function addPago() {
    const monto = parseFloat(nuevoPago.monto||0)
    if (monto<=0) { setError('El monto debe ser mayor a 0'); return }
    if (monto>montoPendiente+0.01) { setError(`El pago no puede superar el saldo pendiente $${montoPendiente.toFixed(2)}`); return }
    setSaving(true); setError('')
    try {
      await fetch(`/api/pedidos/${params.id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ nuevoPago, MONTO_ABONADO:(montoAbonado+monto).toFixed(2), MONTO_PENDIENTE:Math.max(0,montoPendiente-monto).toFixed(2), MONTO_TOTAL:montoTotal.toFixed(2), ESTADO_PAGO:(montoAbonado+monto)>=montoTotal?'PAGADO':'ABONO', _usuarioId:user?.id }),
      })
      setNuevoPago({tipo:'EFECTIVO',monto:'',notas:''}); setSuccess('Pago registrado'); setShowPago(false); loadPedido()
    } catch(e) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading||!pedido) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* FIX #2: router.back() */}
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white">←</button>
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

          <div className="card p-4 grid grid-cols-3 gap-3 text-center">
            <div><div className="text-lg font-bold text-white">${montoTotal.toFixed(2)}</div><div className="text-xs text-gray-500">Total</div></div>
            <div><div className="text-lg font-bold text-green-400">${montoAbonado.toFixed(2)}</div><div className="text-xs text-gray-500">Abonado</div></div>
            <div><div className={`text-lg font-bold ${montoPendiente>0?'text-yellow-400':'text-green-400'}`}>${montoPendiente.toFixed(2)}</div><div className="text-xs text-gray-500">Pendiente</div></div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">📍 Dirección de entrega</h3>
              <button onClick={() => setEditingDireccion(e=>!e)} className="text-xs text-mandarina-400 hover:underline">
                {editingDireccion ? '✕ Cancelar' : '✏️ Editar'}
              </button>
            </div>
            {cliente && <div className="text-xs text-gray-500 mb-2">{cliente.NOMBRE} · {tipoIdMeta(tipoIdEdit).label} {cedulaEdit} · {celularEdit}{emailEdit&&` · ${emailEdit}`}</div>}
            {editingDireccion ? (
              <div className="space-y-2 mb-3">
                <div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Tipo de identificación</div>
                  <div className="grid grid-cols-3 gap-2">
                    {TIPOS_ID.map(t => (
                      <button key={t.key} type="button"
                        onClick={() => { setTipoIdEdit(t.key); setCedulaErrorEdit(cedulaEdit ? (validarIdentificacion(t.key, cedulaEdit) || '') : '') }}
                        className={`py-2 min-h-[40px] rounded-xl text-xs font-semibold border-2 transition-all
                          ${tipoIdEdit === t.key ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:text-white'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input className={`input text-sm ${cedulaErrorEdit ? 'border-red-500' : ''}`}
                  placeholder={tipoIdMeta(tipoIdEdit).placeholder} value={cedulaEdit}
                  inputMode={tipoIdMeta(tipoIdEdit).inputMode}
                  onChange={e => { setCedulaEdit(e.target.value); setCedulaErrorEdit(validarIdentificacion(tipoIdEdit, e.target.value) || '') }} />
                {cedulaErrorEdit && <p className="text-red-400 text-xs">{cedulaErrorEdit}</p>}
                <input className="input text-sm" placeholder="Ciudad (ej: Quito)" value={ciudadEdit} onChange={e=>setCiudadEdit(e.target.value)} />
                <textarea className="input resize-none text-sm" rows={2} value={direccionEdit} onChange={e=>setDireccionEdit(e.target.value)} placeholder="Av. 6 de Diciembre y Mercurio..." />
                <input className="input text-sm" placeholder="Email" value={emailEdit} onChange={e=>setEmailEdit(e.target.value)} />
                <input className="input text-sm" placeholder="Celular" value={celularEdit} onChange={e=>setCelularEdit(e.target.value)} />
                <button onClick={saveDireccion} disabled={saving} className="btn-primary text-sm px-4 py-2">{saving?'⏳ Guardando...':'💾 Guardar'}</button>
              </div>
            ) : (
              <div className="bg-gray-800/50 rounded-xl px-4 py-3 text-sm text-gray-300">
                {direccionEdit || <span className="text-gray-600 italic">Sin dirección registrada</span>}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-white text-sm">👕 Productos</h3>
              <button onClick={()=>setShowNuevoProducto(!showNuevoProducto)} className="text-mandarina-400 text-xs hover:underline">
                {showNuevoProducto?'✕ Cancelar':'+ Agregar producto'}
              </button>
            </div>
            {showNuevoProducto && <div className="p-4 border-b border-gray-800"><BuscadorProductos tienda={pedido.TIENDA_ID} onAdd={addItem} /></div>}
            <div className="divide-y divide-gray-800">
              {items.filter(i=>i.SUBESTADO!=='ELIMINADO').map(item=>(
                <div key={item.ITEM_ID}>
                  <div className="flex justify-end px-4 pt-3">
                    {confirmDelete===item.ITEM_ID
                      ? <div className="flex gap-1"><button onClick={()=>deleteItem(item.ITEM_ID)} className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg">Eliminar</button><button onClick={()=>setConfirmDelete(null)} className="text-xs bg-gray-700 text-white px-2 py-1 rounded-lg">No</button></div>
                      : <button onClick={()=>setConfirmDelete(item.ITEM_ID)} className="text-gray-600 hover:text-red-400 text-sm p-1">✕</button>}
                  </div>
                  {/* VENDEDOR no ve subestados */}
                  <ItemDetalle item={item} readOnly={user?.rol === 'VENDEDOR'} tiendaColor="#FF6B00" user={user} loadPedido={loadPedido} />
                  <div className="px-4 pb-3">
                    <button onClick={()=>setEditingItem(editingItem===item.ITEM_ID?null:item.ITEM_ID)} className="text-xs text-mandarina-400 hover:underline">
                      {editingItem===item.ITEM_ID?'▲ Cerrar editor':'✏️ Editar producto'}
                    </button>
                    {editingItem===item.ITEM_ID && (
                      <ItemEditor item={item} onSave={async(updated)=>{
                        setError('')
                        const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`,{method:'PATCH',headers:headersAdmin(user),body:JSON.stringify({...updated,_usuarioId:user?.id})})
                        if (!res.ok) { setError((await res.json().catch(()=>({}))).error || 'No se pudo guardar'); return }
                        setEditingItem(null); setSuccess('Producto actualizado'); loadPedido()
                      }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-white text-sm">💰 Pagos</h3>
                <div className="text-xs text-gray-500 mt-0.5">Abonado: <span className="text-green-400">${montoAbonado.toFixed(2)}</span>{montoPendiente>0.01&&<> · Pendiente: <span className="text-yellow-400">${montoPendiente.toFixed(2)}</span></>}</div>
              </div>
              {montoPendiente>0.01&&<button onClick={()=>setShowPago(s=>!s)} className="text-xs text-mandarina-400 hover:underline">{showPago?'✕ Cancelar':'+ Agregar pago'}</button>}
            </div>
            {pagos.length>0&&<div className="space-y-1.5 mb-3">{pagos.map((p,i)=>(
              <div key={i} className="flex justify-between text-xs bg-gray-800/50 rounded-lg px-3 py-2">
                <span className="text-gray-400">{p.TIPO_PAGO} · {p.FECHA_PAGO?.split(' ')[0]}</span>
                <span className="text-white font-medium">${parseFloat(p.MONTO||0).toFixed(2)}</span>
              </div>
            ))}</div>}
            {showPago&&montoPendiente>0.01&&(
              <>
                <div className="flex gap-2 mb-3">
                  {TIPOS_PAGO.map(t=>(
                    <button key={t} onClick={()=>setNuevoPago(p=>({...p,tipo:t}))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${nuevoPago.tipo===t?'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10':'border-gray-700 text-gray-500'}`}>
                      {t==='EFECTIVO'?'💵':t==='TRANSFERENCIA'?'🏦':'🔗'} {t.replace('_',' ')}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="number" step="0.50" min="0" max={montoPendiente} className="input flex-1" placeholder={`Máx. $${montoPendiente.toFixed(2)}`} value={nuevoPago.monto} onChange={e=>setNuevoPago(p=>({...p,monto:e.target.value}))} />
                  <button onClick={addPago} disabled={saving||!nuevoPago.monto} className="btn-primary px-4 text-sm">{saving?'⏳':'Registrar'}</button>
                </div>
              </>
            )}
            {montoPendiente<=0.01&&<div className="text-xs text-green-400 bg-green-500/10 rounded-lg px-3 py-2 text-center">✅ Pedido pagado completamente</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
