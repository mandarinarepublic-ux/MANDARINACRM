'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MapaPicker from '@/components/maps/MapaPicker'
import BuscadorProductos from '@/components/pedido/BuscadorProductos'
import ItemProducto from '@/components/pedido/ItemProducto'
import BuscadorCliente from '@/components/pedido/BuscadorCliente'
import SeccionPago from '@/components/pedido/SeccionPago'
import { PdfGracias } from '@/components/pedido/PdfPedido'
import PdfScaler from '@/components/pedido/PdfScaler'
import { TIPOS_ID, tipoIdMeta, validarIdentificacion, inferirTipo } from '@/lib/identificacion'
import { puedeVerTienda, tiendasDisponibles } from '@/lib/tiendasUsuario'
import { parseFechaCalendario, diasHastaEntrega, hoyEcuador } from '@/lib/parseFecha'
import { avisarPedidoCreado } from '@/lib/aviso-padre'
import { emailPareceValido, limpiarEmail } from '@/lib/email-cliente'

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

function validarCelular(v) {
  if (!v) return 'Requerido'
  if (!/^0\d{9}$/.test(v)) return 'Formato: 0987654321 (10 dígitos, empieza en 0)'
  return null
}

function getMinFechaConDias(dias = 3) {
  // Se cuenta desde HOY EN ECUADOR. Antes se partía de la hora local y el día se
  // sacaba con toISOString(), que es UTC: vendiendo después de las 19:00 la fecha
  // mínima de entrega saltaba un día de más.
  const [y, m, d0] = hoyEcuador().split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, d0))
  let count = 0
  while (count < dias) {
    d.setUTCDate(d.getUTCDate() + 1)
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) count++   // sin sábados ni domingos
  }
  return d.toISOString().split('T')[0]
}

function getMinFecha() {
  return getMinFechaConDias(3)
}

// Formato de dirección que la empresa pide llenar SIEMPRE. El cuadro arranca con
// estas etiquetas y el vendedor escribe al lado de cada una. La línea CIUDAD la
// completa el sistema con el campo "Ciudad de entrega" para no escribirla dos veces.
const PLANTILLA_DIRECCION = 'CIUDAD: \nCalle principal: \nCalle secundaria: \nLugar de referencia: '

/** ¿El texto sigue siendo la plantilla vacía (nadie escribió nada)? */
function plantillaVacia(texto) {
  // "Vacía" solo si NINGUNA línea tiene contenido real. Una línea con etiqueta
  // ("Calle principal: valor") cuenta si tiene valor; una línea de TEXTO LIBRE
  // (sin ":") cuenta si tiene algo escrito. Así se acepta la dirección escrita
  // libremente, no solo con la plantilla.
  return String(texto || '').split('\n').every(linea => {
    const l = linea.trim()
    if (!l) return true
    if (l.includes(':')) return !l.split(':').slice(1).join(':').trim()
    return false
  })
}

/** Valor escrito al lado de una etiqueta, p.ej. campoDireccion(txt, 'Calle principal'). */
function campoDireccion(texto, etiqueta) {
  const linea = String(texto || '').split('\n').find(l => l.trim().toLowerCase().startsWith(etiqueta.toLowerCase()))
  if (!linea) return ''
  return linea.split(':').slice(1).join(':').trim()
}

/** Rellena la línea CIUDAD con la ciudad del formulario si quedó vacía. */
function conCiudad(texto, ciudad) {
  const t = String(texto || '')
  if (!ciudad?.trim() || !/^\s*CIUDAD\s*:/im.test(t)) return t
  return t.split('\n').map(linea =>
    /^\s*CIUDAD\s*:/i.test(linea) && !linea.split(':').slice(1).join(':').trim()
      ? `CIUDAD: ${ciudad.trim()}`
      : linea
  ).join('\n')
}

function itemsValidos(items) {
  return items.every(i =>
    parseInt(i.cantidad || 0) >= 1 &&
    parseFloat(i.precioUnit || 0) >= 0
  )
}

/**
 * Traduce los ítems del formulario (minúsculas) al shape de la hoja DETALLE
 * (MAYÚSCULAS) que esperan los componentes de PDF. Es solo para el preview de
 * aprobación del paso 4: el pedido todavía no existe, así que no hay fila que
 * leer y los datos se pintan directo del formulario. Las fotos aún son data:
 * URIs — el <img> del PDF las muestra igual.
 */
function itemsParaPreview(items) {
  return items.map(i => ({
    PRODUCTO_NOMBRE: i.productoNombre || i.nombre || '',
    COLOR: i.color || '',
    TALLA: i.talla || '',
    CANTIDAD: i.cantidad || 1,
    DETALLE_PERSONALIZADO: i.detalle || '',
    FOTO_PECHO_URL:   i.fotoPecho || i.imagenShopify || i.foto || '',
    FOTO_ESPALDA_URL: i.fotoEspalda || '',
    FOTO_MANGA_D_URL: i.fotoMangaD || '',
    FOTO_MANGA_I_URL: i.fotoMangaI || '',
    SUBTOTAL: (parseFloat(i.precioUnit || 0) * parseInt(i.cantidad || 1)).toFixed(2),
  }))
}

function NuevoPedidoContenido() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const esEmbed = searchParams?.get('embed') === '1'
  const [user, setUser] = useState(null)
  const [tienda, setTienda] = useState('MANDARINA')
  const [clienteId, setClienteId] = useState(null)
  const [clienteKey, setClienteKey] = useState(0)
  const [cliente, setCliente] = useState({ nombre: '', cedula: '', celular: '', email: '', ciudad: '', direccion: PLANTILLA_DIRECCION })
  const [tipoId, setTipoId] = useState('CEDULA')
  const [cedulaError, setCedulaError] = useState('')
  const [celularError, setCelularError] = useState('')
  const [clienteExistente, setClienteExistente] = useState(null)
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
  const errorRef = useRef(null)
  const scrollRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Limpiar el banner de error apenas el vendedor edita los datos del cliente:
  // evita que un error ya corregido (p.ej. "nombre obligatorio") quede pegado.
  useEffect(() => { setError('') }, [cliente])
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
    // Precarga desde el inbox: solo celular y nombre. El buscador de cliente que
    // ya existe hace el resto — si la cédula está registrada, trae dirección,
    // ciudad y correo solo.
    //
    // El celular llega ya en formato ecuatoriano (0987654321) porque el inbox lo
    // convierte antes de armar la URL; acá NO se vuelve a tocar. Si viene algo
    // que no calza, se deja el campo vacío a propósito: un valor inválido
    // precargado traba el formulario y es peor que no precargar nada.
    const celularUrl = searchParams?.get('celular') || ''
    const nombreUrl  = searchParams?.get('nombre') || ''
    if (celularUrl || nombreUrl) {
      setCliente((p) => ({
        ...p,
        ...(/^0\d{9}$/.test(celularUrl) ? { celular: celularUrl } : {}),
        ...(nombreUrl ? { nombre: nombreUrl } : {}),
      }))
    }
    // Modo YAW: precargar cliente fijo y saltar directo a productos
    if (u.rol === 'VENDEDOR_YAW') {
      setTienda('YAW')
      setClienteId(CLIENTE_YAW_ID)
      setCliente(CLIENTE_YAW)
      setEmitirFactura(false)
      setStep(2)
      return
    }
    // La tienda arranca en MANDARINA: si el vendedor no la tiene asignada hay
    // que moverlo a la suya o registraría la venta en la tienda equivocada.
    if (!puedeVerTienda(u, 'MANDARINA')) {
      const suyas = tiendasDisponibles(u, ['MANDARINA', 'INDSTORE'])
      if (suyas.length > 0) setTienda(suyas[0])
    }
  }, [])

  useEffect(() => {
    if (tienda === 'SUCURSAL') loadSucursal()
  }, [tienda])

  // Cada cambio de paso empieza arriba. Sin esto, al volver del paso 4 (que es
  // alto por el preview del documento) al de Productos se aterrizaba al FINAL de
  // la lista, con el buscador fuera de pantalla: parecía que ya no se podían
  // agregar más prendas.
  // En móvil scrollea el contenedor (h-screen) y en escritorio la ventana
  // (md:h-auto), así que se reinician los dos. Va en un efecto y dentro de un
  // rAF porque hay que esperar a que React pinte el paso nuevo: hacerlo en el
  // mismo clic no servía, el navegador reajustaba el scroll al acortarse la
  // página.
  useEffect(() => {
    const alInicio = () => {
      scrollRef.current?.scrollTo({ top: 0 })
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    }
    alInicio()
    const id = requestAnimationFrame(alInicio)
    return () => cancelAnimationFrame(id)
  }, [step])

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
    // Los nombres de campo deben ser los MISMOS que usa BuscadorProductos
    // (productoNombre / detalle / imagen / fotoPecho): son los que leen
    // ItemProducto y el POST de /api/pedidos. Con `nombre` y `descripcion`
    // las prendas de sucursal se guardaban sin nombre y llegaban en blanco
    // a la orden de fábrica.
    setItems(p => [...p, {
      tipo: 'SUCURSAL',
      sucursalId: prod.ID,
      productoNombre: prod.NOMBRE,
      talla: prod.TALLA,
      color: prod.COLOR,
      imagen: prod.FOTO_URL,
      imagenShopify: prod.FOTO_URL || null,
      fotoPecho: prod.FOTO_URL || null,
      cantidad: 1,
      precioUnit: prod.PRECIO || '',
      area: '',
      detalle: `${prod.NOMBRE} - Talla ${prod.TALLA}${prod.COLOR ? ' - ' + prod.COLOR : ''}`,
    }])
    setTienda('MANDARINA') // volver a Shopify después de agregar
  }

  /**
   * Copia un producto ya agregado, en blanco solo la talla y el precio.
   *
   * Un pedido de varias prendas iguales en tallas distintas obligaba a
   * recapturar todo por cada talla: color, área, fotos, archivo de diseño y el
   * detalle. Acá se conserva todo eso y queda por llenar lo único que cambia.
   *
   * La copia va JUSTO DEBAJO del original y no al final: con ocho prendas en la
   * lista, mandarla al final obliga a bajar a buscarla y se pierde de vista de
   * cuál se copió.
   *
   * `cantidad` queda en 0, no en 1: así la copia NO se puede enviar hasta que
   * alguien la escriba. Heredar la cantidad del original (o asumir 1) deja una
   * prenda lista para mandarse sin que nadie la haya mirado, y ese es el error
   * caro — se fabrica de más.
   *
   * El `detalle` SE CONSERVA: es la descripción del diseño que el vendedor
   * escribe a mano, o sea justo lo más caro de recapturar y la razón de que
   * exista este botón. Lo único que se le quita es el "- Talla X" del final,
   * que en las prendas de sucursal se arma solo y quedaría mintiendo.
   */
  function duplicarItem(idx) {
    setItems(p => {
      const copia = {
        ...p[idx],
        talla: '', precioUnit: '', cantidad: 0,
        detalle: String(p[idx].detalle || '').replace(/\s*[-–]\s*talla\s+\S+\s*$/i, ''),
      }
      return [...p.slice(0, idx + 1), copia, ...p.slice(idx + 1)]
    })
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
  const montoAbonado = pagos.reduce((s, p) => s + parseFloat(p.monto || 0), 0)
  const tiendaColor = TIENDA_COLORS[tienda] || '#6C3FC5'
  const isYAW = user?.rol === 'VENDEDOR_YAW'

  function buildDireccion() {
    if (usarMapa) return direccionTexto
    const ciudad = (cliente.ciudad || '').trim()
    const dir = (cliente.direccion || '').trim()
    if (!ciudad && !dir) return ''
    // Formato nuevo (con la etiqueta CIUDAD): se guarda tal cual, en varias
    // líneas, y solo se completa la ciudad. Antes se anteponía "Quito: " a la
    // primera línea y quedaba "Quito: CIUDAD: Quito".
    if (/^\s*CIUDAD\s*:/im.test(dir)) return conCiudad(dir, ciudad)
    if (!ciudad) return dir
    if (!dir) return ciudad
    if (dir.toLowerCase().startsWith(ciudad.toLowerCase())) return dir
    return `${ciudad}: ${dir}`
  }

  // Pedido "borrador" para el preview del paso 4. Misma forma que una fila real
  // de PEDIDOS, pero sin PEDIDO_ID: ese número se genera recién al confirmar.
  const clientePreview = {
    NOMBRE:  cliente.nombre || '',
    CELULAR: cliente.celular || '',
    CEDULA:  cliente.cedula || '',
  }
  const pedidoPreview = {
    PEDIDO_ID: 'POR ASIGNAR',
    TIENDA_ID: tienda === 'SUCURSAL' ? 'MANDARINA' : tienda,
    DIRECCION_TEXTO: buildDireccion(),
    MONTO_TOTAL: montoTotal.toFixed(2),
    MONTO_ABONADO: montoAbonado.toFixed(2),
    ESTADO_PAGO: montoAbonado >= montoTotal - 0.01 ? 'PAGADO' : 'ABONO',
    items: itemsParaPreview(items),
  }

  // Cambiar tipo de identificación: revalida y ajusta la factura.
  // Pasaporte no tiene validación SRI → desactiva y bloquea la factura.
  function cambiarTipoId(nuevo) {
    setTipoId(nuevo)
    setCedulaError(cliente.cedula ? (validarIdentificacion(nuevo, cliente.cedula) || '') : '')
    setEmitirFactura(tipoIdMeta(nuevo).factura)
  }

  function validateStep1() {
    // Para YAW el step 1 siempre es válido (cliente prellenado)
    if (isYAW) return null
    const errCedula = validarIdentificacion(tipoId, cliente.cedula)
    const errCelular = validarCelular(cliente.celular)
    if (!cliente.nombre.trim()) return 'El nombre es obligatorio'
    if (errCedula) return errCedula
    if (errCelular) return errCelular
    if (!cliente.ciudad.trim()) return 'La ciudad de entrega es obligatoria'
    // La dirección acepta TEXTO LIBRE; la plantilla es solo una recomendación de
    // formato. Solo se exige que haya contenido real (no las etiquetas vacías).
    if (!usarMapa && (!cliente.direccion.trim() || plantillaVacia(cliente.direccion))) {
      return 'La dirección completa es obligatoria'
    }
    if (emitirFactura && !cliente.email.trim()) return '⚠️ Para emitir factura necesitas el correo del cliente'
    // ☠️ Que el campo NO esté vacío no es que sea un correo. Medido el
    // 21-ago-2026: 9 clientes con correos imposibles —"diegopicotv@@mail.com",
    // "gabrielasalvador3108@gmailcom", ".con", ".conm"— y cada uno es una factura
    // que rebota DESPUÉS de la venta, cuando el cliente ya se fue.
    //
    // Solo frena cuando va con factura: ahí falla seguro y el momento de
    // arreglarlo es con el cliente enfrente. Sin factura solo se avisa (ver el
    // campo), porque trabar una venta por un correo mal dictado es peor.
    if (emitirFactura && !emailPareceValido(cliente.email)) {
      return `⚠️ Ese correo no va a servir para la factura: "${limpiarEmail(cliente.email)}". Revísalo con el cliente.`
    }
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

  function scrollToError() {
    setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
  }

  function goToStep(s) {
    if (s > step) {
      if (step === 1) {
        const err = validateStep1()
        if (err) { setError(err); scrollToError(); return }
      }
      if (step === 2) {
        const err = validateStep2()
        if (err) { setError(err); scrollToError(); return }
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
    // Se llama a NUESTRO endpoint, no a Datil directo, para que la key nunca
    // salga al navegador.
    //
    // Ojo con el silencio: `fetch` NO lanza cuando el servidor responde 500 o
    // 503, solo cuando se cae la red. Este try/catch estaba tragandose todo y
    // la unica senal de que una factura no salio era un console.error que nadie
    // mira. Ahora se revisa la respuesta y se avisa en pantalla; el servidor
    // ademas lo deja en el tablero de ERRORES.
    //
    // Lo que NO puede pasar: que un fallo al FACTURAR se vea como un fallo al
    // CREAR el pedido. Por eso esto vive fuera del try grande y solo avisa
    // (mismo motivo que la nota del inbox, mas abajo): el pedido ya esta en la
    // base y reintentarlo lo duplicaria.
    const cedula = String(clienteData.cedula || '')
    try {
      const res = await fetch('/api/factura/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedidoId,
          montoTotal,
          tipoId: clienteData.tipoCodigo || (cedula.length === 13 ? '04' : '05'),
          cliente: {
            nombre:  clienteData.nombre,
            cedula,
            celular: clienteData.celular,
            email:   clienteData.email,
          },
        }),
      })

      const d = await res.json().catch(() => ({}))
      // Un 200 no basta: la factura existe cuando Datil devolvio su id.
      if (!res.ok || !d.ok) throw new Error(d.error || `Error ${res.status}`)
    } catch(e) {
      console.error('Error disparando factura:', e)
      // El pedido SI se creo. Lo que fallo es la factura, y hay que decirlo:
      // callarlo es justo lo que dejo ~40 pedidos sin facturar sin que nadie
      // se enterara.
      alert(
        `⚠️ El pedido ${pedidoId} se creó bien, pero la FACTURA NO se emitió.\n\n` +
        `${e.message || 'error desconocido'}\n\n` +
        'Queda registrada en el tablero de ERRORES. Puedes reintentar desde la pantalla del pedido.'
      )
    }
  }

  async function handleSubmit() {
    const err1 = validateStep1()
    const err2 = validateStep2()
    const err3 = validateStep3()
    if (err1) { setError(err1); setStep(isYAW ? 2 : 1); return }
    if (err2) { setError(err2); setStep(2); return }
    if (err3) { setError(err3); setStep(3); return }

    // El check "emitir factura" nace MARCADO, así que sin este aviso se emitían
    // facturas al SRI que el cliente no pidió. Se confirma con los datos reales
    // ANTES de crear el pedido, para poder volver y desmarcar si fue un error.
    if (emitirFactura) {
      const ok = window.confirm(
        '🧾 Se emitirá FACTURA ELECTRÓNICA al SRI:\n\n' +
        `Cliente: ${cliente.nombre || '(sin nombre)'}\n` +
        `${tipoId === 'RUC' ? 'RUC' : 'Cédula'}: ${cliente.cedula}\n` +
        `Total: $${montoTotal.toFixed(2)}\n\n` +
        'Si el cliente NO pidió factura, dale Cancelar y desmarca "Emitir factura electrónica".'
      )
      if (!ok) { setStep(isYAW ? 2 : 3); return }
    }

    setLoading(true); setError('')

    // Una sola fuente para la dirección: la misma que se muestra en el preview y
    // en el PDF. Antes aquí se rearmaba con join(': ') y quedaba distinta.
    const direccionFinal = buildDireccion()
    const clienteDireccion = usarMapa ? direccionTexto : conCiudad(cliente.direccion || '', cliente.ciudad)

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

    // fechaEntrega es un día del calendario ("2026-07-30"), no un instante:
    // `new Date(...)` lo tomaba como medianoche UTC = 19:00 del día anterior en
    // Ecuador, así que el cálculo daba un día menos si se vendía de noche.
    const diasPrometido = diasHastaEntrega(fechaEntrega)

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

      // Descontar stock de sucursal si hay items de sucursal
      const itemsSucursal = items.filter(i => i.tipo === 'SUCURSAL' && i.sucursalId)
      for (const item of itemsSucursal) {
        try {
          await fetch('/api/sucursal', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: item.sucursalId,
              accion: 'vender',
              usuario: user?.nombre || user?.id || 'desconocido',
            }),
          })
        } catch (e) {
          console.error('Error descontando stock sucursal:', e)
        }
      }

      if (emitirFactura) {
        dispararFactura(data.pedidoId, { ...cliente, cedula: String(cliente.cedula), celular: String(cliente.celular), tipoCodigo: tipoIdMeta(tipoId).codigo }, montoTotal)
      }
      // El inbox necesita el número para dejar su nota y marcar la venta. Se
      // avisa ANTES de navegar: después de router.push esta pantalla se va.
      //
      // ⚠️ En su PROPIO try/catch, igual que el PATCH de sucursal y que
      // dispararFactura. Si esto lanzara dentro del try grande lo agarraría el
      // `catch (e) { setError(e.message) }` de abajo: se pintaría el banner rojo
      // de error con el pedido YA creado en la base y `router.push` nunca
      // correría. El vendedor vería "error", lo intentaría de nuevo y el pedido
      // quedaría DUPLICADO. Un fallo al avisar no puede hacerse pasar por un
      // fallo al crear.
      if (esEmbed) {
        try {
          avisarPedidoCreado({
            // El monto que manda el servidor gana: hoy coincide con el del
            // formulario porque la fórmula está duplicada, pero si algún día allá
            // se aplica un descuento o un redondeo, la nota del inbox mentiría.
            pedidoId: data.pedidoId,
            montoTotal: data.montoTotal ?? montoTotal,
            url: `${window.location.origin}/dashboard/pedido/${data.pedidoId}`,
          })
        } catch (e) {
          console.error('Error avisando al inbox del pedido creado:', e)
        }
      }
      // Se conserva el embed al navegar: si no, el pedido recién creado
      // aparecería con el menú entero dentro del panel del inbox.
      router.push(`/dashboard/pedido/${data.pedidoId}?nuevo=1${esEmbed ? '&embed=1' : ''}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  const steps = ['Cliente', 'Productos', 'Entrega y Pago', 'Revisar']

  // Ancho del contenido.
  //
  // Suelto en el CRM el formulario va con tope de 672px centrado (`max-w-2xl
  // mx-auto`): en una pantalla ancha, sin ese tope, los campos quedarían
  // larguísimos y feos.
  //
  // Dentro del panel del inbox el ancho YA lo acota el panel (el CRM cree tener
  // 800px), así que el tope solo agrega vacío a los lados y desperdicia el poco
  // sitio que hay. En embed se usa el ancho completo. El aire lateral no se
  // pierde: el relleno `px-4` de los contenedores de arriba se conserva.
  const anchoContenido = esEmbed ? 'w-full' : 'max-w-2xl mx-auto'

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3 md:static md:border-0 md:bg-transparent">
        <div className={`flex items-center gap-3 mb-4 ${anchoContenido}`}>
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white p-1">←</button>
          <h1 className="text-xl font-display font-bold text-white">Nueva Venta</h1>
        </div>
        <div className={anchoContenido}>
          <div className="flex items-center gap-1 mb-2">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <button onClick={() => goToStep(i + 1)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all flex-shrink-0
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-28">
        <div className={`${anchoContenido} px-4 pt-4`}>
          {error && (
            <div ref={errorRef} className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-4 scroll-mt-20">
              {error}
            </div>
          )}

          {/* Modal: cliente ya existe (reemplaza window.confirm nativo) */}
          {clienteExistente && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setClienteExistente(null)}>
              <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">👤</span>
                  <h3 className="text-white font-semibold text-base">Cliente ya registrado</h3>
                </div>
                <div className="bg-gray-800/60 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4"><span className="text-gray-500">Nombre</span><span className="text-white text-right">{clienteExistente.NOMBRE}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-gray-500">Celular</span><span className="text-white text-right">{clienteExistente.CELULAR || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-gray-500">Dirección</span><span className="text-white text-right">{clienteExistente.DIRECCION || 'No registrada'}</span></div>
                </div>
                <p className="text-gray-400 text-sm">¿Autocompletar los datos de este cliente?</p>
                <div className="flex gap-2">
                  <button onClick={() => setClienteExistente(null)}
                    className="btn-secondary flex-1 py-3">No, seguir</button>
                  <button onClick={() => {
                    const f = clienteExistente
                    setClienteId(f.CLIENTE_ID)
                    const ced = String(f.CEDULA||'')
                    setCliente({ nombre: f.NOMBRE||'', cedula: ced, celular: String(f.CELULAR||''), email: f.EMAIL||'', ciudad: f.CIUDAD||'', direccion: f.DIRECCION || PLANTILLA_DIRECCION })
                    const t = inferirTipo(ced); setTipoId(t); setEmitirFactura(tipoIdMeta(t).factura)
                    setClienteKey(k => k+1)
                    setClienteExistente(null)
                  }} className="btn-primary flex-1 py-3">Sí, autocompletar</button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 1 — oculto para YAW (saltan directo al 2) */}
          {step === 1 && !isYAW && (
            <div className="space-y-4">
              <BuscadorCliente onSelect={c => {
                setClienteId(c.CLIENTE_ID || c.id || null)
                const ced = String(c.CEDULA||c.cedula||'')
                setCliente({ nombre: c.NOMBRE||c.nombre||'', cedula: ced, celular: String(c.CELULAR||c.celular||''), email: c.EMAIL||c.email||'', ciudad: c.CIUDAD||c.ciudad||'', direccion: c.DIRECCION||c.direccion|| PLANTILLA_DIRECCION })
                const t = inferirTipo(ced); setTipoId(t); setEmitirFactura(tipoIdMeta(t).factura)
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
                  <button onClick={() => { setClienteId(null); setClienteKey(k => k + 1); setCliente({ nombre: '', cedula: '', celular: '', email: '', ciudad: '', direccion: PLANTILLA_DIRECCION }); setTipoId('CEDULA'); setEmitirFactura(true) }}
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
                <div className="col-span-2">
                  <label className="label">Tipo de identificación *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {TIPOS_ID.map(t => (
                      <button key={t.key} type="button" onClick={() => cambiarTipoId(t.key)}
                        className={`py-2.5 min-h-[44px] rounded-xl text-sm font-semibold border-2 transition-all
                          ${tipoId === t.key ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:text-white'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="label">{tipoIdMeta(tipoId).label} *</label>
                  <input className={`input ${cedulaError ? 'border-red-500' : ''}`}
                    placeholder={tipoIdMeta(tipoId).placeholder} value={cliente.cedula}
                    autoComplete="off" inputMode={tipoIdMeta(tipoId).inputMode} name="x-cedula"
                    onChange={e => { setCliente(p => ({...p, cedula: e.target.value})); setCedulaError(validarIdentificacion(tipoId, e.target.value) || '') }}
                    onBlur={async e => {
                      const ced = e.target.value.trim()
                      if (ced.length < 5) return
                      try {
                        const r = await fetch(`/api/clientes?q=${encodeURIComponent(ced)}`)
                        const d = await r.json()
                        const found = (d.clientes||[]).find(c => String(c.CEDULA)===String(ced))
                        if (found) setClienteExistente(found)
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
                  {/* El aviso sale mientras escribe, no al intentar avanzar: si el
                      cliente está enfrente, este es el único momento de corregirlo.
                      Se muestra el correo YA LIMPIO porque es lo que se va a
                      guardar — los espacios se quitan solos y no valen un regaño. */}
                  {!!cliente.email.trim() && !emailPareceValido(cliente.email) && (
                    <p className="text-red-400 text-xs mt-1">
                      ✗ Eso no parece un correo: <span className="font-mono">{limpiarEmail(cliente.email)}</span>
                      {emitirFactura ? ' — la factura va a rebotar.' : ' — se va a guardar así.'}
                    </p>
                  )}
                  {!!cliente.email.trim() && emailPareceValido(cliente.email)
                    && limpiarEmail(cliente.email) !== cliente.email && (
                    <p className="text-gray-400 text-xs mt-1">
                      Se guardará como <span className="font-mono">{limpiarEmail(cliente.email)}</span>
                    </p>
                  )}
                </div>
              </div>
              {tipoId === 'PASAPORTE' ? (
                <div className="flex items-center gap-3 card p-4 opacity-70">
                  <span className="text-xl">🚫</span>
                  <div>
                    <div className="text-gray-300 text-sm font-medium">Factura electrónica no disponible</div>
                    <div className="text-gray-500 text-xs">Con pasaporte no se emite factura al SRI (sin validación).</div>
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-3 card p-4 cursor-pointer hover:border-gray-600 transition-all">
                  <input type="checkbox" checked={emitirFactura} onChange={e => setEmitirFactura(e.target.checked)}
                    className="w-5 h-5 accent-orange-500" />
                  <div>
                    <div className="text-white text-sm font-medium">Emitir factura electrónica</div>
                    <div className="text-gray-500 text-xs">Se enviará al SRI via Dátil</div>
                  </div>
                </label>
              )}
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
                      {/* Llega con las etiquetas del formato de la empresa ya
                          escritas; el vendedor completa al lado de cada una. */}
                      <textarea ref={refDireccion} autoComplete="off" name="x-direccion" rows={4}
                        className={`input resize-none leading-relaxed ${plantillaVacia(cliente.direccion) ? 'border-yellow-500/40' : ''}`}
                        placeholder={PLANTILLA_DIRECCION}
                        value={cliente.direccion}
                        onChange={e => setCliente(p => ({...p, direccion: e.target.value}))} />
                      <p className="text-xs text-gray-600 mt-1">Completa cada línea; la ciudad se llena sola con la de arriba.</p>
                    </div>
                    {buildDireccion() && (
                      <div className="bg-gray-800 rounded-xl px-3 py-2 text-xs text-gray-400">
                        📋 PDF:
                        <span className="text-white block whitespace-pre-line mt-0.5">{buildDireccion()}</span>
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
              {/* Selector de tienda — oculto para YAW.
                  Solo se ofrecen las tiendas asignadas al vendedor en Usuarios.
                  SUCURSAL no es una tienda: es la vía de venta desde stock de
                  sucursal, así que se muestra siempre. */}
              {!isYAW && (
                <div className="flex gap-2">
                  {[
                    { key: 'MANDARINA', label: '🍊 Mandarina', color: '#FF6B00' },
                    { key: 'INDSTORE',  label: '🏪 Indstore',  color: '#E91E8C' },
                    { key: 'SUCURSAL',  label: '🏬 Sucursal',  color: '#10B981' },
                  ].filter(t => t.key === 'SUCURSAL' || puedeVerTienda(user, t.key)).map(t => (
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
                      onRemove={() => setItems(p => p.filter((_, i) => i !== idx))}
                      onDuplicate={() => duplicarItem(idx)} />
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
              <h2 className="font-semibold text-white">Revisa con el cliente</h2>

              {/* Preview del documento que verá el cliente. Es el punto de no
                  retorno: al dar DE ACUERDO el pedido se crea y se va a fábrica,
                  y a partir de ahí solo un ADMIN puede modificar los productos. */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs px-4 py-3 rounded-xl">
                ⚠️ Revisa tallas, colores, cantidades y precios. Al dar <strong>DE ACUERDO</strong> el
                pedido entra a fábrica y ya no lo podrás editar: los cambios los tendrá que hacer un ADMIN.
              </div>

              <div className="card p-3 overflow-hidden">
                <PdfScaler>
                  <PdfGracias
                    pedido={pedidoPreview}
                    items={pedidoPreview.items}
                    cliente={clientePreview}
                    tiendaColor={tiendaColor}
                  />
                </PdfScaler>
              </div>

              <div className="card p-5 space-y-2.5 text-sm">
                {[
                  ['Tienda', tienda],
                  ['Cliente', cliente.nombre],
                  [tipoIdMeta(tipoId).label, cliente.cedula],
                  ['Dirección', buildDireccion() || cliente.direccion],
                  ['Factura', tipoId === 'PASAPORTE' ? '🚫 No (pasaporte)' : emitirFactura ? '✅ Sí' : '❌ No'],
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
                  <span className="text-green-400">${montoAbonado.toFixed(2)}</span>
                </div>
                <hr className="border-gray-800" />
                <div className="flex justify-between"><span className="text-gray-500">Entrega</span>
                  <span className="text-white">{parseFechaCalendario(fechaEntrega)?.toLocaleDateString('es-EC', {day:'numeric',month:'long',year:'numeric'}) || fechaEntrega}</span>
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

      {/* La barra de Atrás / Siguiente. Ojo: acá el problema NO era un tope de
          ancho —esta barra nunca tuvo `max-w-2xl`— sino `md:left-60`, que la
          corre 240px a la derecha para dejarle sitio al menú lateral. En embed
          ese menú NO existe (lo quita el layout), así que esos 240px quedaban de
          hueco muerto y el botón Siguiente no llegaba al borde izquierdo. Los
          botones son `flex-1`, así que al soltar la barra se estiran solos. */}
      <div className={`fixed bottom-0 left-0 right-0 ${esEmbed ? '' : 'md:left-60'} bg-gray-950/95 backdrop-blur border-t border-gray-800 p-4 flex gap-3`}>
        {/* En el paso 4 "Atrás" se convierte en EDITAR: devuelve al paso de
            productos, que es lo que el cliente pide corregir el 99% de las veces. */}
        {step === 4 ? (
          <button onClick={() => goToStep(2)} disabled={loading} className="btn-secondary flex-1">✏️ EDITAR</button>
        ) : step > 1 && !(isYAW && step === 2) ? (
          <button onClick={() => goToStep(step - 1)} className="btn-secondary flex-1">← Atrás</button>
        ) : null}
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
              : '✅ DE ACUERDO'}
          </button>
        )}
      </div>
    </div>
  )
}

// useSearchParams() exige <Suspense> encima o el build falla.
export default function NuevoPedidoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <NuevoPedidoContenido />
    </Suspense>
  )
}
