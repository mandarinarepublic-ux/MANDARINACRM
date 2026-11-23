'use client'
import { useState, useEffect, useRef, useId, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import BuscadorProductos from '@/components/pedido/BuscadorProductos'
import ItemDetalle from '@/components/pedido/ItemDetalle'
import { subirFoto } from '@/lib/subirImagen'
import { TIPOS_ID, tipoIdMeta, validarIdentificacion, inferirTipo } from '@/lib/identificacion'
import { imagenAncho } from '@/lib/imagenes'
import { formatFechaDia } from '@/lib/parseFecha'
import { emailPareceValido, limpiarEmail } from '@/lib/email-cliente'
import { direccionSinCiudad } from '@/lib/direccionPedido'
import { AREAS, TALLAS, TALLAS_ADULTO, TALLAS_NINO, opcionesConValor, valorFueraDeLista } from '@/lib/catalogo-pedido'
import InputDinero from '@/components/InputDinero'

// Áreas y tallas: las MISMAS del pedido nuevo (lib/catalogo-pedido.js). Esta
// pantalla tenía su propia lista, sin `PREMIUM - SIN DISEÑO`: al abrir una
// prenda con esa área el <select> mostraba ESTAMPADO y, al guardar cualquier
// otro cambio, la pisaba.
const TIPOS_PAGO = ['EFECTIVO','TRANSFERENCIA','LINK_PAGO']

// Las rutas que tocan productos exigen ADMIN y lo verifican contra la base con
// esta cabecera (lib/auth.js). Sin ella el servidor responde 401.
function headersAdmin(user) {
  return { 'Content-Type':'application/json', 'x-mp-usuario-id': user?.id || '' }
}

function ItemEditor({ item, onSave, onDirty }) {
  const [data, setData] = useState({ PRODUCTO_NOMBRE:item.PRODUCTO_NOMBRE||'', COLOR:item.COLOR||'', TALLA:item.TALLA||'', CANTIDAD:item.CANTIDAD||1, PRECIO_UNIT:item.PRECIO_UNIT||'0', AREA:item.AREA||'ESTAMPADO', DETALLE_PERSONALIZADO:item.DETALLE_PERSONALIZADO||'' })
  const [fotos, setFotos] = useState({ FOTO_PECHO_URL:item.FOTO_PECHO_URL||'', FOTO_ESPALDA_URL:item.FOTO_ESPALDA_URL||'', FOTO_MANGA_D_URL:item.FOTO_MANGA_D_URL||'', FOTO_MANGA_I_URL:item.FOTO_MANGA_I_URL||'' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState({})
  const [uploadError, setUploadError] = useState('')
  const uid = useId()
  const idCampo = (n) => `${uid}-${n}`

  // ¿Cambió algo respecto a lo que se abrió? Lo usa el aviso de "cambios sin
  // guardar" de la página. Se compara contra la primera foto del estado.
  const inicialRef = useRef(JSON.stringify({ data, fotos }))
  const sucio = JSON.stringify({ data, fotos }) !== inicialRef.current
  useEffect(() => { onDirty?.(sucio) }, [sucio, onDirty])
  useEffect(() => () => onDirty?.(false), [onDirty])

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
        <div className="col-span-2"><label className="label" htmlFor={idCampo('nombre')}>Nombre del producto</label><input id={idCampo('nombre')} className="input text-sm" value={data.PRODUCTO_NOMBRE} onChange={e=>setData(d=>({...d,PRODUCTO_NOMBRE:e.target.value}))} /></div>
        <div><label className="label" htmlFor={idCampo('color')}>Color</label><input id={idCampo('color')} className="input text-sm" value={data.COLOR} onChange={e=>setData(d=>({...d,COLOR:e.target.value}))} /></div>
        <div>
          <label className="label" htmlFor={idCampo('talla')}>Talla</label>
          {/* La opción vacía existe para que una prenda SIN talla no se pinte
              como "4XL" (la primera); y la talla guardada que no esté en la
              lista se agrega para no pisarla. */}
          <select id={idCampo('talla')} className="input text-sm" value={data.TALLA} onChange={e=>setData(d=>({...d,TALLA:e.target.value}))}>
            <option value="">—</option>
            <optgroup label="Adulto">{TALLAS_ADULTO.map(t=><option key={t}>{t}</option>)}</optgroup>
            <optgroup label="Niño">{TALLAS_NINO.map(t=><option key={t}>{t}</option>)}</optgroup>
            {valorFueraDeLista(TALLAS, data.TALLA) && <option value={data.TALLA}>{data.TALLA}</option>}
          </select>
        </div>
        <div><label className="label" htmlFor={idCampo('cantidad')}>Cantidad</label><input id={idCampo('cantidad')} type="number" min="1" inputMode="numeric" className="input text-sm" value={data.CANTIDAD} onChange={e=>setData(d=>({...d,CANTIDAD:e.target.value}))} /></div>
        <div><label className="label" htmlFor={idCampo('precio')}>Precio $</label><InputDinero id={idCampo('precio')} className="input text-sm" value={data.PRECIO_UNIT} onChange={e=>setData(d=>({...d,PRECIO_UNIT:e.target.value}))} /></div>
        <div className="col-span-2"><label className="label" htmlFor={idCampo('area')}>Área</label><select id={idCampo('area')} className="input text-sm" value={data.AREA} onChange={e=>setData(d=>({...d,AREA:e.target.value}))}>{opcionesConValor(AREAS, data.AREA).map(a=><option key={a} value={a}>{a}</option>)}</select></div>
        <div className="col-span-2"><label className="label" htmlFor={idCampo('detalle')}>Detalle / instrucciones</label><textarea id={idCampo('detalle')} className="input resize-none text-sm" rows={2} value={data.DETALLE_PERSONALIZADO} onChange={e=>setData(d=>({...d,DETALLE_PERSONALIZADO:e.target.value}))} /></div>
      </div>
      <div>
        <div className="label" id={idCampo('fotos')}>Fotos del diseño</div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={idCampo('fotos')}>
          {[['FOTO_PECHO_URL','Pecho'],['FOTO_ESPALDA_URL','Espalda'],['FOTO_MANGA_D_URL','M. Derecha'],['FOTO_MANGA_I_URL','M. Izquierda']].map(([key,label])=>(
            <div key={key}>
              {/* Input `sr-only` dentro del label (no `hidden`): así también se
                  llega con teclado; el anillo marca el foco. */}
              <label className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed cursor-pointer overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-mandarina-500 ${fotos[key]?'border-mandarina-500':'border-gray-700 hover:border-gray-500'} ${uploading[key]?'opacity-60 pointer-events-none':''}`}>
                <input type="file" accept="image/*" className="sr-only" aria-label={`${fotos[key]?'Cambiar':'Subir'} foto: ${label}`} onChange={e=>handleFoto(key,e.target.files[0])} />
                {uploading[key]
                  ? <div className="flex flex-col items-center gap-1" role="status"><div className="w-4 h-4 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span className="text-[10px] text-gray-500">Subiendo…</span></div>
                  : fotos[key]?<img src={imagenAncho(fotos[key], 240)} alt={`Foto: ${label}`} loading="lazy" className="w-full h-full object-cover" />:<span className="text-xs text-gray-500 text-center px-1">{label}</span>}
              </label>
              {fotos[key]&&!uploading[key]&&<button type="button" onClick={()=>setFotos(f=>({...f,[key]:''}))} aria-label={`Quitar foto: ${label}`} className="text-xs text-red-400 mt-0.5 w-full text-center min-h-[40px]"><span aria-hidden="true">✕ </span>quitar</button>}
            </div>
          ))}
        </div>
        {uploadError && <div className="text-red-400 text-xs mt-1" role="alert">⚠️ {uploadError}</div>}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">Subtotal: <span className="text-white font-bold">${subtotal}</span></span>
        <button type="button" onClick={async()=>{setSaving(true);await onSave({...data,...fotos,SUBTOTAL:subtotal});setSaving(false)}} disabled={saving} className="btn-primary text-sm px-4 py-2">
          {saving?'⏳ Guardando…':'💾 Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

export default function EditarPedidoPage() {
  const router = useRouter()
  const params = useParams()
  // Dentro del panel del inbox (?embed=1) se queda en modo incrustado al salir:
  // sin esto caía en el CRM completo, con menú lateral, en la columna angosta.
  const embed = useSearchParams()?.get('embed') === '1' ? '?embed=1' : ''
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
  const [nombreEdit, setNombreEdit] = useState('')
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
  const uid = useId()
  const idCampo = (n) => `${uid}-${n}`

  // ─── Cambios sin guardar ───────────────────────────────────────────────────
  // Mismo aviso del navegador que tiene el pedido nuevo: en el celular, bajar
  // con el dedo desde arriba RECARGA y se perdía lo que se estaba corrigiendo
  // (una dirección dictada, un pago, una prenda). Solo se activa si de verdad
  // hay algo distinto de lo que se cargó; mirar el pedido sin tocar no avisa.
  const originalRef = useRef(null)
  const [itemSucio, setItemSucio] = useState(false)
  const [productoNuevoTocado, setProductoNuevoTocado] = useState({})
  const reportarProductoNuevo = useCallback((clave, valor) => {
    setProductoNuevoTocado(prev => {
      const tocado = !!valor?.tocado
      if (!!prev[clave] === tocado) return prev
      return { ...prev, [clave]: tocado }
    })
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    // Editar productos de un pedido ya confirmado es SOLO de ADMIN. El vendedor
    // revisa y aprueba antes de crearlo (paso 4 de Nueva Venta); después ve el
    // detalle en modo lectura. El servidor vuelve a comprobarlo (requireAdmin),
    // esto solo evita mostrar una pantalla que no va a poder guardar.
    if (u.rol !== 'ADMIN') { router.replace(`/dashboard/pedido/${params.id}${embed}`); return }
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
      // Borradores viejos traían una línea "CIUDAD: X" dentro de la dirección.
      setDireccionEdit(direccionSinCiudad(p.DIRECCION_TEXTO || p.DIRECCION_PEDIDO || ''))
      setCiudadEdit(p.CIUDAD_PEDIDO || '')
      const cr = await fetch(`/api/clientes?id=${encodeURIComponent(p.CLIENTE_ID||'')}`)
      const cd = await cr.json()
      const c = cd.clientes?.[0] || null
      setCliente(c)
      // Lo cargado, para saber después si hay cambios sin guardar. Misma
      // cuenta que los setState de abajo.
      originalRef.current = {
        direccion: direccionSinCiudad(p.DIRECCION_TEXTO || p.DIRECCION_PEDIDO || ''),
        ciudad: p.CIUDAD_PEDIDO || c?.CIUDAD || '',
        nombre: c?.NOMBRE || '',
        email: c?.EMAIL || '', celular: c?.CELULAR || '', cedula: c ? String(c.CEDULA || '') : '',
      }
      if (c) {
        setNombreEdit(c.NOMBRE||'')
        setCiudadEdit(prev => p.CIUDAD_PEDIDO || prev || c.CIUDAD || ''); setEmailEdit(c.EMAIL||''); setCelularEdit(c.CELULAR||'')
        const ced = String(c.CEDULA||''); setCedulaEdit(ced); setTipoIdEdit(inferirTipo(ced)); setCedulaErrorEdit('')
      }
    } finally { setLoading(false) }
  }

  const montoTotal = items.filter(i=>i.SUBESTADO!=='ELIMINADO').reduce((s,i)=>s+parseFloat(i.SUBTOTAL||0),0)
  const montoAbonado = pagos.reduce((s,p)=>s+parseFloat(p.MONTO||0),0)
  const montoPendiente = montoTotal - montoAbonado

  const o = originalRef.current
  const direccionSucia = editingDireccion && !!o && (
    nombreEdit !== o.nombre || direccionEdit !== o.direccion || ciudadEdit !== o.ciudad || emailEdit !== o.email ||
    String(celularEdit) !== String(o.celular) || cedulaEdit !== o.cedula
  )
  const pagoSucio = showPago && !!String(nuevoPago.monto || '').trim()
  const nuevoSucio = showNuevoProducto && Object.values(productoNuevoTocado).some(Boolean)
  const hayCambios = direccionSucia || pagoSucio || (editingItem !== null && itemSucio) || nuevoSucio

  useEffect(() => {
    if (!hayCambios || saving) return
    const avisar = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [hayCambios, saving])

  // ← del encabezado: si no hay historial (se abrió directo o en el panel del
  // inbox), router.back() no hace nada o saca del CRM. Ahí se va al pedido.
  function volverAtras() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push(`/dashboard/pedido/${params.id}${embed}`)
  }

  async function saveDireccion() {
    // Validar la identificación según el tipo antes de guardar
    const errId = validarIdentificacion(tipoIdEdit, cedulaEdit)
    if (errId) { setCedulaErrorEdit(errId); setError(`Identificación: ${errId}`); return }
    if (cliente && !nombreEdit.trim()) { setError('El nombre del cliente es obligatorio'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      const rp = await fetch(`/api/pedidos/${params.id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ DIRECCION_TEXTO:direccionEdit, CIUDAD_PEDIDO:ciudadEdit.trim(), _usuarioId:user?.id }),
      })
      if (!rp.ok) throw new Error((await rp.json().catch(()=>({}))).error || 'No se pudo guardar la dirección')
      if (cliente) {
        const rc = await fetch(`/api/clientes/${cliente.CLIENTE_ID}`, {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ NOMBRE:nombreEdit.trim(), CEDULA:String(cedulaEdit||''), CELULAR:celularEdit, EMAIL:emailEdit, CIUDAD:ciudadEdit, DIRECCION:direccionEdit }),
        })
        if (!rc.ok) throw new Error((await rc.json().catch(()=>({}))).error || 'No se pudieron guardar los datos del cliente')
      }
      setSuccess('Datos del cliente actualizados')
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

  if (loading||!pedido) return <div className="flex items-center justify-center h-64" role="status"><div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span className="sr-only">Cargando pedido…</span></div>

  return (
    // h-dvh: con h-screen la barra del navegador del celular tapaba el final.
    <div className="flex flex-col h-dvh md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* FIX #2: router.back(), con salida si no hay historial */}
          <button type="button" onClick={volverAtras} aria-label="Volver"
            className="text-gray-500 hover:text-white min-w-[44px] min-h-[44px] -ml-3 flex items-center justify-center rounded-lg transition-colors">
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <h1 className="text-lg font-display font-bold text-white">Editar {pedido.PEDIDO_ID}</h1>
            <p className="text-xs text-gray-500">Solo pedidos en producción</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">{error}</div>}
          {success && <div role="status" className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-xl">✓ {success}</div>}

          <div className="card p-4 grid grid-cols-3 gap-3 text-center">
            <div><div className="text-lg font-bold text-white">${montoTotal.toFixed(2)}</div><div className="text-xs text-gray-500">Total</div></div>
            <div><div className="text-lg font-bold text-green-400">${montoAbonado.toFixed(2)}</div><div className="text-xs text-gray-500">Abonado</div></div>
            <div><div className={`text-lg font-bold ${montoPendiente>0?'text-yellow-400':'text-green-400'}`}>${montoPendiente.toFixed(2)}</div><div className="text-xs text-gray-500">Pendiente</div></div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">📍 Cliente y entrega</h3>
              <button type="button" onClick={() => setEditingDireccion(e=>!e)} aria-expanded={editingDireccion}
                className="text-xs text-mandarina-400 hover:underline px-2 -mr-2 min-h-[40px]">
                {editingDireccion ? '✕ Cancelar' : '✏️ Editar'}
              </button>
            </div>
            {cliente && <div className="text-xs text-gray-500 mb-2">{nombreEdit || cliente.NOMBRE} · {tipoIdMeta(tipoIdEdit).label} {cedulaEdit} · {celularEdit}{emailEdit&&` · ${emailEdit}`}</div>}
            {editingDireccion ? (
              <div className="space-y-2 mb-3">
                {cliente && (
                  <div>
                    <label className="label" htmlFor={idCampo('nombre-cliente')}>Nombre del cliente</label>
                    <input id={idCampo('nombre-cliente')} className={`input text-sm ${!nombreEdit.trim() ? 'border-red-500' : ''}`}
                      value={nombreEdit} placeholder="María García"
                      autoComplete="off" autoCapitalize="words"
                      aria-invalid={!nombreEdit.trim() || undefined}
                      onChange={e => setNombreEdit(e.target.value)} />
                  </div>
                )}
                {/* Antes los campos solo tenían placeholder: al empezar a
                    escribir desaparecía y no quedaba claro qué era cada cuadro
                    (celular y cédula se confundían). Ahora cada uno tiene su
                    etiqueta. autoComplete="off" como en el pedido nuevo: son
                    datos del CLIENTE, no del que edita. */}
                <div>
                  <div className="label" id={idCampo('tipo-id')}>Tipo de identificación</div>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby={idCampo('tipo-id')}>
                    {TIPOS_ID.map(t => (
                      <button key={t.key} type="button" aria-pressed={tipoIdEdit === t.key}
                        onClick={() => { setTipoIdEdit(t.key); setCedulaErrorEdit(cedulaEdit ? (validarIdentificacion(t.key, cedulaEdit) || '') : '') }}
                        className={`py-2 min-h-[44px] rounded-xl text-xs font-semibold border-2 transition-colors
                          ${tipoIdEdit === t.key ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:text-white'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor={idCampo('cedula')}>{tipoIdMeta(tipoIdEdit).label}</label>
                  <input id={idCampo('cedula')} className={`input text-sm ${cedulaErrorEdit ? 'border-red-500' : ''}`}
                    placeholder={tipoIdMeta(tipoIdEdit).placeholder} value={cedulaEdit}
                    inputMode={tipoIdMeta(tipoIdEdit).inputMode} autoComplete="off" spellCheck={false}
                    autoCapitalize={tipoIdEdit === 'PASAPORTE' ? 'characters' : 'none'}
                    aria-invalid={!!cedulaErrorEdit || undefined}
                    aria-describedby={cedulaErrorEdit ? idCampo('cedula-err') : undefined}
                    onChange={e => { setCedulaEdit(e.target.value); setCedulaErrorEdit(validarIdentificacion(tipoIdEdit, e.target.value) || '') }} />
                  {cedulaErrorEdit && <p id={idCampo('cedula-err')} className="text-red-400 text-xs mt-1">{cedulaErrorEdit}</p>}
                </div>
                <div>
                  <label className="label" htmlFor={idCampo('ciudad')}>Ciudad de entrega</label>
                  <input id={idCampo('ciudad')} className="input text-sm" placeholder="Ej: Quito" value={ciudadEdit}
                    autoComplete="off" autoCapitalize="words" onChange={e=>setCiudadEdit(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor={idCampo('direccion')}>Dirección completa</label>
                  <textarea id={idCampo('direccion')} className="input resize-none text-sm leading-relaxed" rows={4} value={direccionEdit}
                    autoComplete="off" onChange={e=>setDireccionEdit(e.target.value)} placeholder={'Calle principal: \nCalle secundaria: \nLugar de referencia: '} />
                </div>
                <div>
                  <label className="label" htmlFor={idCampo('email')}>Email</label>
                  <input id={idCampo('email')} className="input text-sm" placeholder="cliente@gmail.com" value={emailEdit}
                    type="email" inputMode="email" autoCapitalize="none" spellCheck={false} autoComplete="off"
                    aria-invalid={(!!emailEdit.trim() && !emailPareceValido(emailEdit)) || undefined}
                    aria-describedby={idCampo('email-ayuda')}
                    onChange={e=>setEmailEdit(e.target.value)} />
                </div>
                <div id={idCampo('email-ayuda')}>
                {/* Esta es la pantalla por donde se ARREGLAN los correos rotos, así
                    que es la que más necesita decir si quedó bien. No bloquea:
                    guardar un correo dudoso es mejor que no poder corregir la
                    dirección de un pedido por culpa del correo. */}
                {!!emailEdit.trim() && !emailPareceValido(emailEdit) && (
                  <p className="text-red-400 text-xs">
                    ✗ Eso no parece un correo: <span className="font-mono">{limpiarEmail(emailEdit)}</span> — la factura va a rebotar.
                  </p>
                )}
                {!!emailEdit.trim() && emailPareceValido(emailEdit) && limpiarEmail(emailEdit) !== emailEdit && (
                  <p className="text-gray-400 text-xs">Se guardará como <span className="font-mono">{limpiarEmail(emailEdit)}</span></p>
                )}
                </div>
                <div>
                  <label className="label" htmlFor={idCampo('celular')}>Celular</label>
                  <input id={idCampo('celular')} className="input text-sm" placeholder="0987654321" value={celularEdit}
                    type="tel" inputMode="tel" autoComplete="off"
                    onChange={e=>setCelularEdit(e.target.value)} />
                </div>
                <button type="button" onClick={saveDireccion} disabled={saving} className="btn-primary text-sm px-4 py-2">{saving?'⏳ Guardando…':'💾 Guardar'}</button>
              </div>
            ) : (
              <div className="bg-gray-800/50 rounded-xl px-4 py-3 text-sm text-gray-300 whitespace-pre-line">
                {direccionEdit || <span className="text-gray-600 italic">Sin dirección registrada</span>}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-white text-sm">👕 Productos</h3>
              <button type="button" onClick={()=>setShowNuevoProducto(!showNuevoProducto)} aria-expanded={showNuevoProducto}
                className="text-mandarina-400 text-xs hover:underline px-2 -mr-2 min-h-[40px]">
                {showNuevoProducto?'✕ Cancelar':'+ Agregar producto'}
              </button>
            </div>
            {showNuevoProducto && <div className="p-4 border-b border-gray-800"><BuscadorProductos tienda={pedido.TIENDA_ID} onAdd={addItem} onPendiente={reportarProductoNuevo} /></div>}
            <div className="divide-y divide-gray-800">
              {items.filter(i=>i.SUBESTADO!=='ELIMINADO').map(item=>(
                <div key={item.ITEM_ID}>
                  <div className="flex justify-end px-4 pt-3">
                    {confirmDelete===item.ITEM_ID
                      ? <div className="flex gap-1" role="group" aria-label={`¿Eliminar ${item.PRODUCTO_NOMBRE || 'producto'}?`}><button type="button" onClick={()=>deleteItem(item.ITEM_ID)} className="text-xs bg-red-500 text-white px-3 min-h-[40px] rounded-lg">Eliminar</button><button type="button" onClick={()=>setConfirmDelete(null)} className="text-xs bg-gray-700 text-white px-3 min-h-[40px] rounded-lg">No</button></div>
                      : <button type="button" onClick={()=>setConfirmDelete(item.ITEM_ID)} aria-label={`Eliminar ${item.PRODUCTO_NOMBRE || 'producto'}`}
                          className="text-gray-600 hover:text-red-400 text-sm min-w-[44px] min-h-[44px] -mr-3 flex items-center justify-center transition-colors"><span aria-hidden="true">✕</span></button>}
                  </div>
                  {/* VENDEDOR no ve subestados */}
                  <ItemDetalle item={item} readOnly={user?.rol === 'VENDEDOR'} tiendaColor="#FF6B00" user={user} loadPedido={loadPedido} />
                  <div className="px-4 pb-3">
                    <button type="button" onClick={()=>setEditingItem(editingItem===item.ITEM_ID?null:item.ITEM_ID)} aria-expanded={editingItem===item.ITEM_ID}
                      className="text-xs text-mandarina-400 hover:underline min-h-[40px]">
                      {editingItem===item.ITEM_ID?'▲ Cerrar editor':'✏️ Editar producto'}
                    </button>
                    {editingItem===item.ITEM_ID && (
                      <ItemEditor item={item} onDirty={setItemSucio} onSave={async(updated)=>{
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
              {montoPendiente>0.01&&<button type="button" onClick={()=>setShowPago(s=>!s)} aria-expanded={showPago} className="text-xs text-mandarina-400 hover:underline px-2 -mr-2 min-h-[40px]">{showPago?'✕ Cancelar':'+ Agregar pago'}</button>}
            </div>
            {pagos.length>0&&<div className="space-y-1.5 mb-3">{pagos.map((p,i)=>(
              <div key={i} className="flex justify-between text-xs bg-gray-800/50 rounded-lg px-3 py-2">
                <span className="text-gray-400">{p.TIPO_PAGO} · {formatFechaDia(p.FECHA_PAGO)}</span>
                <span className="text-white font-medium">${parseFloat(p.MONTO||0).toFixed(2)}</span>
              </div>
            ))}</div>}
            {showPago&&montoPendiente>0.01&&(
              <>
                <div className="flex gap-2 mb-3" role="group" aria-label="Forma de pago">
                  {TIPOS_PAGO.map(t=>(
                    <button key={t} type="button" onClick={()=>setNuevoPago(p=>({...p,tipo:t}))} aria-pressed={nuevoPago.tipo===t}
                      className={`flex-1 py-2 min-h-[44px] rounded-xl text-xs font-semibold border transition-colors ${nuevoPago.tipo===t?'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10':'border-gray-700 text-gray-500'}`}>
                      <span aria-hidden="true">{t==='EFECTIVO'?'💵':t==='TRANSFERENCIA'?'🏦':'🔗'} </span>{t.replace('_',' ')}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <InputDinero aria-label="Monto del pago"
                    className="input flex-1" placeholder={`Máx. $${montoPendiente.toFixed(2)}`} value={nuevoPago.monto} onChange={e=>setNuevoPago(p=>({...p,monto:e.target.value}))} />
                  <button type="button" onClick={addPago} disabled={saving||!nuevoPago.monto} className="btn-primary px-4 text-sm">{saving?<span aria-label="Guardando">⏳</span>:'Registrar'}</button>
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
