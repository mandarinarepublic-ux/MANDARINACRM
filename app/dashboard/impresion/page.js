'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PdfGraciasPagina, PdfConfeccionPagina, paginarItems, paginarItemsCliente } from '@/components/pedido/PdfPedido'
import { parseFecha, formatFechaHumana } from '@/lib/parseFecha'

const MAX_LOTE_IMPRESION = 30

const H2C_OPTS = {
  scale: 2,
  useCORS: true,
  allowTaint: true,
  backgroundColor: '#ffffff',
  width: 794,
  windowWidth: 794,
  scrollX: 0,
  scrollY: 0,
  logging: false,
}

// Filtro por estado de impresión. Arranca en PENDIENTES porque es el trabajo
// real del día; ver los ya impresos es la excepción (reimpresiones).
const F_PENDIENTES = 'PENDIENTES'
const F_IMPRESOS   = 'IMPRESOS'
const F_TODOS      = 'TODOS'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Cede el hilo para que React pinte antes de volver a bloquearlo con html2canvas
// (que es síncrono y pesado). Sin esto el texto de progreso nunca se ve avanzar.
const dejarPintar = () =>
  new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))))

export default function ImpresionPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState([])
  const [clientes, setClientesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [printing, setPrinting] = useState(false)
  const [printProgress, setPrintProgress] = useState('')
  // Ref, no estado: el bucle de impresión vive en un closure y jamás vería el
  // valor nuevo de un useState. El estado espejo existe solo para el texto.
  const cancelarRef = useRef(false)
  const [cancelando, setCancelando] = useState(false)
  // Solo los pedidos que se están capturando ahora mismo se montan en el DOM
  // oculto. Antes se montaba el lote entero (hasta 30 pedidos ≈ 90 hojas A4),
  // lo que disparaba el uso de memoria y colgaba el navegador en celular.
  const [renderIds, setRenderIds] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroTienda, setFiltroTienda] = useState('TODAS')
  const [filtroImpresion, setFiltroImpresion] = useState(F_PENDIENTES)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    loadPedidos()
  }, [])

  async function loadPedidos() {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN')
      if (!res.ok) throw new Error(`No se pudieron cargar los pedidos (HTTP ${res.status})`)
      const data = await res.json()
      const enFabrica = (data.pedidos || []).filter(p =>
        p.ESTADO_PEDIDO === 'EN_FABRICA' || p.ESTADO_PEDIDO === 'PENDIENTE_FABRICA'
      )
      // Orden estable: el pedido más ANTIGUO primero (es el que lleva más tiempo
      // esperando). Sin esto, "Seleccionar todos" recortaba a 30 en el orden
      // arbitrario en que viniera la hoja/tabla.
      enFabrica.sort((a, b) => {
        const fa = parseFecha(a.FECHA_PEDIDO)
        const fb = parseFecha(b.FECHA_PEDIDO)
        if (fa && fb) return fa - fb
        if (fa) return -1
        if (fb) return 1
        return String(a.PEDIDO_ID).localeCompare(String(b.PEDIDO_ID))
      })
      setPedidos(enFabrica)
      // UNA sola lectura de toda la hoja CLIENTES. Antes se hacía un fetch por
      // pedido en paralelo (hasta 30), lo que saturaba Google Sheets (429) y
      // dejaba pedidos sin la sección de datos del cliente de forma aleatoria.
      const r = await fetch('/api/clientes?all=1')
      if (!r.ok) throw new Error(`No se pudieron cargar los clientes (HTTP ${r.status})`)
      const d = await r.json()
      const map = {}
      for (const c of (d.clientes || [])) {
        if (c.CLIENTE_ID) map[c.CLIENTE_ID] = c
      }
      setClientesMap(map)
      return enFabrica   // el llamador puede verificar contra datos frescos
    } catch (e) {
      // Antes cualquier fallo de red dejaba la lista vacía y la pantalla decía
      // "No hay pedidos con estos filtros", que es mentira y manda a buscar el
      // problema en el lugar equivocado.
      setLoadError(e.message || 'Error de conexión')
    } finally { setLoading(false) }
  }

  const filtered = useMemo(() => pedidos.filter(p => {
    if (filtroTienda !== 'TODAS' && p.TIENDA_ID !== filtroTienda) return false

    const yaImpreso = !!p.FECHA_IMPRESION_PRODUCCION
    if (filtroImpresion === F_PENDIENTES && yaImpreso) return false
    if (filtroImpresion === F_IMPRESOS && !yaImpreso) return false

    if (fechaDesde) {
      const fp = parseFecha(p.FECHA_PEDIDO)
      // parseFecha construye "YYYY-MM-DD" en hora LOCAL, así que ambos extremos
      // se comparan en la misma zona (antes 'desde' se parseaba como UTC y el
      // rango se corría un día).
      const desde = parseFecha(fechaDesde)
      if (fp && desde && fp < desde) return false
    }
    if (fechaHasta) {
      const fp = parseFecha(p.FECHA_PEDIDO)
      const hasta = parseFecha(fechaHasta)
      if (hasta) hasta.setHours(23, 59, 59, 999)
      if (fp && hasta && fp > hasta) return false
    }
    if (busqueda) {
      const q = busqueda.toLowerCase().replace(/[\s-]/g, '')
      const c = clientes[p.CLIENTE_ID] || {}
      const campos = [p.PEDIDO_ID, c.NOMBRE, c.CEDULA, c.CELULAR]
      if (!campos.some(v => v && String(v).toLowerCase().replace(/[\s-]/g, '').includes(q))) return false
    }
    return true
  }), [pedidos, clientes, filtroTienda, filtroImpresion, fechaDesde, fechaHasta, busqueda])

  // La selección NO se borra al cambiar de filtro (buscar un pedido para sumarlo
  // al lote es justo el flujo normal, y perder lo ya marcado enfurece). En su
  // lugar se avisa cuántos seleccionados quedaron fuera de la vista, para que
  // nadie imprima a ciegas algo que no ve.
  const seleccionadosOcultos = useMemo(() => {
    if (selected.size === 0) return []
    const visibles = new Set(filtered.map(p => p.PEDIDO_ID))
    return [...selected].filter(id => !visibles.has(id))
  }, [selected, filtered])

  const totalPendientes = useMemo(
    () => pedidos.filter(p => !p.FECHA_IMPRESION_PRODUCCION).length, [pedidos]
  )

  function toggleSelect(pedido) {
    if (printing) return
    const id = pedido.PEDIDO_ID

    if (selected.has(id)) {
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
      return
    }
    // Los diálogos van FUERA del updater de estado: React puede invocar el
    // updater más de una vez, y eso mostraba el confirm por duplicado.
    if (selected.size >= MAX_LOTE_IMPRESION) {
      alert(`Máximo ${MAX_LOTE_IMPRESION} pedidos por lote de impresión.`)
      return
    }
    if (pedido.FECHA_IMPRESION_PRODUCCION) {
      const ok = window.confirm(
        `⚠️ ESTE PEDIDO YA FUE IMPRESO PARA PRODUCCIÓN\n\n` +
        `${pedido.PEDIDO_ID}\n` +
        `Impreso: ${formatFechaHumana(pedido.FECHA_IMPRESION_PRODUCCION) || '—'}\n` +
        `Por: ${pedido.IMPRESO_POR || '—'}\n\n` +
        `¿Seguro que deseas reimprimirlo?`
      )
      if (!ok) return
    }
    setSelected(prev => new Set(prev).add(id))
  }

  function selectAll() {
    if (printing) return
    if (selected.size > 0) { setSelected(new Set()); return }

    const sinImprimir = filtered.filter(p => !p.FECHA_IMPRESION_PRODUCCION)
    let candidatos = sinImprimir
    if (sinImprimir.length === 0 && filtered.length > 0) {
      const ok = window.confirm(`Los ${filtered.length} pedido(s) YA fueron impresos. ¿Reimprimirlos?`)
      if (!ok) return
      candidatos = filtered
    }
    const omitidos = filtered.length - candidatos.length
    if (candidatos.length > MAX_LOTE_IMPRESION) {
      alert(
        `Se seleccionan los ${MAX_LOTE_IMPRESION} más antiguos (máximo por lote).\n` +
        `Quedan ${candidatos.length - MAX_LOTE_IMPRESION} para el siguiente lote.`
      )
    } else if (omitidos > 0) {
      alert(`Se seleccionan ${candidatos.length} pendiente(s). Se omiten ${omitidos} ya impreso(s).`)
    }
    setSelected(new Set(candidatos.slice(0, MAX_LOTE_IMPRESION).map(p => p.PEDIDO_ID)))
  }

  // Captura un elemento y devuelve la imagen, SIN tocar el PDF todavía.
  // Lanza si el nodo no existe o si html2canvas falla, para que el llamador
  // sepa qué pedido quedó incompleto (antes devolvía en silencio y el pedido
  // se marcaba como impreso igual, con hojas faltantes en el PDF).
  async function capturarElemento(html2canvas, elementId) {
    const el = document.getElementById(elementId)
    if (!el) throw new Error(`No se pudo renderizar la hoja ${elementId}`)
    const canvas = await html2canvas(el, H2C_OPTS)
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    canvas.width = 1; canvas.height = 1
    return imgData
  }

  // Única fuente de verdad de la paginación, compartida con el render oculto:
  // si el contador y el render no coinciden, se capturan hojas inexistentes.
  function paginasDe(pedido) {
    return paginarItems(pedido?.items).length
  }
  function paginasClienteDe(pedido) {
    return paginarItemsCliente(pedido?.items).length
  }

  async function printSelected() {
    if (selected.size === 0 || printing) return
    setPrinting(true)
    cancelarRef.current = false
    setCancelando(false)
    setPrintProgress('Preparando...')

    const ids = Array.from(selected)
    const okIds = []            // pedidos capturados completos → se registran
    const fallidos = []         // { id, detalle } → NO se registran, siguen seleccionados
    let cancelado = false

    try {
      const { jsPDF } = await import('jspdf')
      const html2canvas = (await import('html2canvas')).default

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      let esPrimera = true
      let paginaActual = 0

      const totalPaginas = ids.reduce((sum, id) => {
        const p = pedidos.find(x => x.PEDIDO_ID === id)
        return sum + paginasClienteDe(p) + paginasDe(p)   // N cliente + N confección
      }, 0)

      for (const pedidoId of ids) {
        if (cancelarRef.current) { cancelado = true; break }

        const pedido = pedidos.find(x => x.PEDIDO_ID === pedidoId)
        const nPagConf = paginasDe(pedido)

        // Montar SOLO este pedido en el DOM oculto y esperar a que React pinte.
        setRenderIds([pedidoId])
        await dejarPintar()
        await sleep(120)  // margen para que resuelvan las imágenes remotas

        // Un fallo aquí descarta ESTE pedido, no el lote entero. Antes cualquier
        // excepción rompía el try grande y se perdían las 29 capturas anteriores.
        //
        // Las hojas se acumulan aparte y solo se vuelcan al PDF si el pedido se
        // capturó COMPLETO: si no, el PDF se llevaba media orden de producción
        // (hoja de gracias sí, confección no) que en la fábrica parece válida, y
        // al reintentar se duplicaban esas hojas.
        try {
          const hojas = []
          const nPagCliente = paginasClienteDe(pedido)

          for (let gi = 0; gi < nPagCliente; gi++) {
            paginaActual++
            setPrintProgress(`Generando hoja ${paginaActual} de ${totalPaginas}...`)
            await dejarPintar()
            hojas.push(await capturarElemento(html2canvas, `pdf-${pedidoId}-gracias-${gi}`))
          }

          for (let pi = 0; pi < nPagConf; pi++) {
            paginaActual++
            setPrintProgress(`Generando hoja ${paginaActual} de ${totalPaginas}...`)
            await dejarPintar()
            hojas.push(await capturarElemento(html2canvas, `pdf-${pedidoId}-conf-${pi}`))
          }

          for (const img of hojas) {
            if (!esPrimera) pdf.addPage()
            pdf.addImage(img, 'JPEG', 0, 0, 210, 297)
            esPrimera = false
          }
          okIds.push(pedidoId)
        } catch (e) {
          fallidos.push({ id: pedidoId, detalle: e.message || 'fallo al generar la hoja' })
        }
      }

      // Los que ni se llegaron a intentar por la cancelación siguen pendientes:
      // deben quedar seleccionados, no perderse en silencio.
      const procesados = new Set([...okIds, ...fallidos.map(f => f.id)])
      const noProcesados = ids.filter(id => !procesados.has(id))

      setRenderIds([])

      if (okIds.length === 0) {
        alert(
          cancelado
            ? 'Impresión cancelada. No se generó ningún PDF ni se marcó nada.'
            : 'No se pudo generar ninguna hoja. No se marcó ningún pedido como impreso.'
        )
        return   // la selección queda intacta para reintentar
      }

      pdf.save(`pedidos_${new Date().toISOString().split('T')[0]}.pdf`)

      // ── Registrar la impresión SOLO de los pedidos que sí salieron en el PDF ──
      setPrintProgress('Registrando impresión...')
      let usuario = {}
      try { usuario = JSON.parse(localStorage.getItem('mp_user') || '{}') } catch {}
      // El NOMBRE, no el id: este valor se guarda en IMPRESO_POR y se muestra tal
      // cual en el badge y en el aviso de reimpresión. Un UUID ahí no dice nada.
      const usuarioId = usuario.nombre || usuario.id || 'SISTEMA'

      const registrados = []
      for (let i = 0; i < okIds.length; i++) {
        setPrintProgress(`Registrando ${i + 1} de ${okIds.length}...`)
        await dejarPintar()
        let ok = false, detalle = ''
        try {
          // fetch NO rechaza ante 4xx/5xx: hay que mirar res.ok explícitamente.
          // Antes esto era un .catch(()=>{}) que tragaba hasta los 500.
          const res = await fetch(`/api/pedidos/${okIds[i]}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ marcarImpreso: true, _usuarioId: usuarioId }),
          })
          ok = res.ok
          if (!ok) {
            const body = await res.json().catch(() => ({}))
            detalle = body.error || `HTTP ${res.status}`
          }
        } catch (e) {
          detalle = e.message || 'sin conexión'
        }
        if (ok) registrados.push(okIds[i])
        else fallidos.push({ id: okIds[i], detalle: `no se registró: ${detalle}` })
        if (i < okIds.length - 1) await sleep(350)   // throttle anti-429 de Sheets
      }

      // Releer del servidor en vez de inventar la fecha en el cliente: así el
      // badge muestra el MISMO valor que quedó guardado, sin un tercer formato.
      setPrintProgress('Actualizando lista...')
      const frescos = await loadPedidos()

      // Un PATCH puede haberse guardado y perderse la respuesta (timeout). Se
      // confirma contra los datos recién leídos en vez de creerle al error, para
      // no decirle al usuario que reintente algo que ya quedó registrado.
      const yaImpreso = new Set(
        (frescos || []).filter(p => p.FECHA_IMPRESION_PRODUCCION).map(p => p.PEDIDO_ID)
      )
      const pendientesDeVerdad = fallidos.filter(f => !yaImpreso.has(f.id))
      const rescatados = fallidos.length - pendientesDeVerdad.length

      // Siguen seleccionados los que fallaron de verdad y los que la cancelación
      // dejó sin procesar, para poder reintentar de una.
      setSelected(new Set([...pendientesDeVerdad.map(f => f.id), ...noProcesados]))

      const listos = registrados.length + rescatados
      if (pendientesDeVerdad.length > 0) {
        alert(
          `⚠️ ${listos} de ${ids.length} pedido(s) quedaron impresos y registrados.\n\n` +
          `Estos NO:\n` +
          pendientesDeVerdad.map(f => `• ${f.id} — ${f.detalle}`).join('\n') +
          (noProcesados.length ? `\n\nY ${noProcesados.length} no se alcanzaron a procesar por la cancelación.` : '') +
          `\n\nQuedan seleccionados para que reintentes.`
        )
      } else if (cancelado) {
        alert(
          `Impresión cancelada.\n\n` +
          `${listos} pedido(s) quedaron impresos y registrados` +
          (noProcesados.length
            ? `; ${noProcesados.length} no se procesaron y siguen seleccionados.`
            : '.')
        )
      }
    } catch (e) {
      alert('Error al generar el PDF: ' + (e?.message || e))
    } finally {
      setRenderIds([])
      setPrinting(false)
      cancelarRef.current = false
      setCancelando(false)
      setPrintProgress('')
    }
  }

  const pedidosARenderizar = pedidos.filter(p => renderIds.includes(p.PEDIDO_ID))

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-display font-bold text-white">🖨️ Imprimir Pedidos</h1>
              <p className="text-xs text-gray-500">
                {totalPendientes > 0
                  ? `${totalPendientes} pendiente(s) por imprimir`
                  : 'Todo al día — no hay pendientes'}
              </p>
            </div>
            <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-sm">← Volver</button>
          </div>

          {/* Filtro por estado de impresión */}
          <div className="flex gap-1 mb-2 p-1 bg-gray-900 rounded-xl">
            {[
              { v: F_PENDIENTES, label: '📋 Pendientes' },
              { v: F_IMPRESOS,   label: '🖨️ Ya impresos' },
              { v: F_TODOS,      label: 'Todos' },
            ].map(op => (
              <button key={op.v} onClick={() => setFiltroImpresion(op.v)} disabled={printing}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50
                  ${filtroImpresion === op.v ? 'bg-mandarina-500 text-white' : 'text-gray-400 hover:text-white'}`}>
                {op.label}
              </button>
            ))}
          </div>

          <input className="input mb-2" placeholder="Buscar por pedido, nombre, cédula o celular..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} disabled={printing} />

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="label">Tienda</label>
              <select className="input py-2 text-sm" value={filtroTienda} disabled={printing}
                onChange={e => setFiltroTienda(e.target.value)}>
                <option value="TODAS">Todas las tiendas</option>
                <option value="MANDARINA">🍊 Mandarina Republic</option>
                <option value="INDSTORE">🏪 Indstore</option>
              </select>
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input py-2 text-sm" value={fechaDesde} disabled={printing}
                onChange={e => setFechaDesde(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input py-2 text-sm" value={fechaHasta} disabled={printing}
                onChange={e => setFechaHasta(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button disabled={printing}
                onClick={() => { setFechaDesde(''); setFechaHasta(''); setFiltroTienda('TODAS'); setBusqueda(''); setFiltroImpresion(F_PENDIENTES) }}
                className="btn-ghost text-xs w-full py-2.5 disabled:opacity-50">Limpiar filtros</button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-1">
            <button onClick={selectAll} disabled={printing || filtered.length === 0}
              className="text-sm text-mandarina-400 hover:text-mandarina-300 disabled:opacity-40">
              {selected.size > 0 ? 'Deseleccionar todos' : 'Seleccionar todos (sin imprimir)'}
            </button>
            <span className={`text-xs ${selected.size >= MAX_LOTE_IMPRESION ? 'text-amber-400 font-semibold' : 'text-gray-500'}`}>
              {filtered.length} en lista · {selected.size}/{MAX_LOTE_IMPRESION} seleccionado(s)
            </span>
          </div>

          {seleccionadosOcultos.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <span className="text-xs text-amber-300">
                ⚠️ {seleccionadosOcultos.length} seleccionado(s) no se ven con estos filtros — igual se imprimirán
              </span>
              <button disabled={printing}
                onClick={() => setSelected(prev => {
                  const ocultos = new Set(seleccionadosOcultos)
                  return new Set([...prev].filter(id => !ocultos.has(id)))
                })}
                className="text-xs text-amber-400 hover:text-amber-200 underline flex-shrink-0 disabled:opacity-50">
                Quitarlos
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="card p-8 text-center">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-red-400 text-sm mb-1">No se pudo cargar la lista</p>
              <p className="text-gray-600 text-xs mb-4">{loadError}</p>
              <button onClick={loadPedidos} className="btn-ghost text-xs px-4 py-2">Reintentar</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-gray-600">
              <div className="text-3xl mb-3">{filtroImpresion === F_PENDIENTES ? '✅' : '🏭'}</div>
              {filtroImpresion === F_PENDIENTES
                ? 'No hay pedidos pendientes de imprimir'
                : 'No hay pedidos con estos filtros'}
            </div>
          ) : (
            <div className={`space-y-2 ${printing ? 'opacity-50 pointer-events-none' : ''}`}>
              {filtered.map(p => {
                const cliente = clientes[p.CLIENTE_ID] || {}
                const isSelected = selected.has(p.PEDIDO_ID)
                const yaImpreso = !!p.FECHA_IMPRESION_PRODUCCION
                return (
                  <button key={p.PEDIDO_ID} onClick={() => toggleSelect(p)} disabled={printing}
                    aria-pressed={isSelected}
                    className={`w-full card p-4 flex items-center gap-4 transition-all text-left
                      ${isSelected ? 'border-mandarina-500 bg-mandarina-500/5' : yaImpreso ? 'border-amber-700/40' : 'hover:border-gray-700'}`}>
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all
                      ${isSelected ? 'bg-mandarina-500 border-mandarina-500' : 'border-gray-600'}`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-sm font-medium text-white">{p.PEDIDO_ID}</span>
                        <span className="text-xs">{p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                        <span className={`badge text-xs ${p.ESTADO_PEDIDO === 'EN_FABRICA' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {p.ESTADO_PEDIDO === 'EN_FABRICA' ? 'EN PRODUCCIÓN' : 'PEND. FÁBRICA'}
                        </span>
                        {yaImpreso && (
                          <span className="badge text-xs bg-amber-500/20 text-amber-400"
                            title={`Impreso por ${p.IMPRESO_POR || '—'}`}>
                            🖨️ Impreso {formatFechaHumana(p.FECHA_IMPRESION_PRODUCCION) || 'sin fecha'}
                            {p.IMPRESO_POR ? ` · ${p.IMPRESO_POR}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {cliente.NOMBRE || '...'} · {p.items?.length || 0} prendas · ${parseFloat(p.MONTO_TOTAL||0).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500 flex-shrink-0">
                      {formatFechaHumana(p.FECHA_PEDIDO) || '-'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-56 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-4">
        <button onClick={printSelected} disabled={selected.size === 0 || printing}
          className="btn-primary w-full flex items-center justify-center gap-2"
          style={{ opacity: selected.size === 0 ? 0.5 : 1 }}>
          {printing ? `⏳ ${printProgress || 'Preparando...'}` : `🖨️ Imprimir ${selected.size > 0 ? `${selected.size} pedido(s)` : ''}`}
        </button>
        {printing ? (
          <button onClick={() => { cancelarRef.current = true; setCancelando(true) }}
            className="w-full text-center text-gray-500 hover:text-white text-xs mt-2">
            {cancelando ? 'Cancelando al terminar el pedido actual...' : 'Cancelar'}
          </button>
        ) : selected.size === 0 && (
          <p className="text-center text-gray-600 text-xs mt-2">Selecciona al menos un pedido</p>
        )}
      </div>

      {/* Zona de render oculto — cada página tiene su propio ID atómico.
          La paginación de confección se hace aquí con paginarItems, no dentro
          del componente, para que cada sub-página sea un div independiente
          que html2canvas capture por separado sin hojas en blanco.
          Solo se monta el pedido que se está capturando (ver renderIds). */}
      <div style={{ position:'fixed', top:'-9999px', left:'-9999px', width:'794px', backgroundColor:'white', fontFamily:"'Helvetica Neue', Arial, sans-serif" }}>
        {pedidosARenderizar.map(pedido => {
          const cliente = clientes[pedido.CLIENTE_ID] || {}
          const items = pedido.items || []
          const tiendaColor = pedido.TIENDA_ID === 'MANDARINA' ? '#FF6B00' : '#E91E8C'
          const paginas = paginarItems(items)
          const totalPagConf = paginas.length
          const pagsCliente = paginarItemsCliente(items)

          return (
            <div key={pedido.PEDIDO_ID}>
              {/* Hoja(s) del cliente — 1 div atómico por hoja */}
              {pagsCliente.map((pag, gIdx) => (
                <div key={gIdx} id={`pdf-${pedido.PEDIDO_ID}-gracias-${gIdx}`} style={{ width:'794px' }}>
                  <PdfGraciasPagina
                    pedido={pedido}
                    items={pag.items}
                    filas={pag.filas}
                    cliente={cliente}
                    tiendaColor={tiendaColor}
                    offsetIdx={pag.offset}
                    esPrimera={gIdx === 0}
                    esUltima={gIdx === pagsCliente.length - 1}
                    paginaActual={gIdx + 1}
                    totalPaginas={pagsCliente.length}
                  />
                </div>
              ))}

              {/* Hojas confección — 1 div atómico por sub-página */}
              {paginas.map((pag, pIdx) => (
                <div key={pIdx} id={`pdf-${pedido.PEDIDO_ID}-conf-${pIdx}`} style={{ width:'794px' }}>
                  <PdfConfeccionPagina
                    pedido={pedido}
                    items={pag.items}
                    tiendaColor={tiendaColor}
                    paginaActual={pIdx + 1}
                    totalPaginas={totalPagConf}
                    offsetIdx={pag.offset}
                    esUltimaPagina={pIdx === totalPagConf - 1}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
