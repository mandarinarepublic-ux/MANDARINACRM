'use client'
// El Tablero: una tarjeta por SUB-ÁREA, no tres columnas de flujo.
//
// POR QUÉ CAMBIÓ. Las columnas CORTE → PRODUCCIÓN → DESPACHO metían, medido el
// 4-sep-2026, 69 de 74 pedidos vivos en la PRIMERA. Un tablero donde el 93% cae
// en una columna no reparte trabajo: solo repite que todo sigue atascado en el
// mismo sitio, y no dice a quién le toca qué.
//
// ☠️ EL CORTE NO ES UNA PUERTA. La regla vive en lib/pivot-areas.js, con sus
// pruebas. Acá solo se pinta. Si una tarjeta con trabajo desapareciera, el
// sospechoso es el `.filter` de ese módulo, no esta pantalla.
//
// ⚠️ ORDEN DE LOS HOOKS: una `const` del cuerpo leída antes de declararse tumba
// la pantalla entera con ReferenceError, compila sin chistar y solo se ve al
// abrirla. Lo vigila tests/hooks-orden.test.js. Los efectos van DESPUÉS de las
// funciones que nombran en sus dependencias.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { coincideBusqueda } from '@/lib/buscarPedido'
import { parseFecha, inicioDiaEcuador, finDiaEcuador } from '@/lib/parseFecha'
import { useEstadoPantalla, useScrollGuardado } from '@/lib/useEstadoPantalla'
import AvisoFiltros from '@/components/AvisoFiltros'
import { construirPivot, subareasVisibles, META_SUBAREA } from '@/lib/pivot-areas'

const TIENDA_META = {
  MANDARINA: { emoji: '🍊', label: 'Mandarina' },
  INDSTORE:  { emoji: '🏪', label: 'Indstore' },
  YAW:       { emoji: '🟣', label: 'YAW' },
}

// Colores por sub-área. Validados para daltonismo (peor par ΔE 23,6): naranja,
// azul y magenta se separan bien; Corte va en gris a propósito, porque no es un
// área más sino la puerta de entrada.
const COLOR_SUB = {
  CORTE:       '#A8A29B',
  ESTAMPADO:   '#E0611F',
  SUBLIMACION: '#4A85E8',
  BORDADO:     '#DE4A80',
  SIN_AREA:    '#807A73',
  // Verde: es la única tarjeta que significa "ya está hecho", y tiene que
  // leerse distinta de las que piden trabajo.
  POR_ENTREGAR:'#4ADE80',
}

const ESTADO_ETQ = {
  SOLICITADO: 'Solicitado',
  EN_PROCESO: 'En proceso',
  ENVIADO_APROBACION: 'Espera al cliente',
  LISTO: 'Listo',
}
const ORDEN_ESTADO = ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO']

const ORDENES = {
  atraso: { label: 'Más atrasado primero', cmp: (a, b) => cmp(b.atraso, a.atraso) },
  quieto: { label: 'Más tiempo quieto',    cmp: (a, b) => cmp(b.quieto, a.quieto) },
  viejo:  { label: 'Más antiguo',          cmp: (a, b) => cmp(b.edad, a.edad) },
  nuevo:  { label: 'Más reciente',         cmp: (a, b) => cmp(a.edad, b.edad) },
}
/** `null` SIEMPRE al final: un pedido sin dato no es un pedido con cero. */
function cmp(a, b) {
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  return a - b
}

/** Días como celda, con temperatura. Los umbrales se dicen al pie de la tabla. */
function Dias({ v, tibio, caliente }) {
  if (v === null || v === undefined) return <td className="px-2 py-1.5 text-right font-mono text-gray-600">—</td>
  const color = v >= caliente ? 'text-red-400 font-semibold'
    : v >= tibio ? 'text-amber-400 font-semibold' : 'text-gray-500'
  return <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${color}`}>{v} d</td>
}

function Situacion({ atraso }) {
  if (atraso === null || atraso === undefined)
    return <span className="badge text-[10px] bg-gray-800 text-gray-500">sin promesa</span>
  if (atraso > 0)
    return <span className="badge text-[10px] bg-red-500/15 text-red-400">{atraso} d tarde</span>
  if (atraso === 0)
    return <span className="badge text-[10px] bg-amber-500/15 text-amber-400">vence hoy</span>
  return <span className="badge text-[10px] bg-green-500/15 text-green-400">{-atraso} d de plazo</span>
}

// Estado inicial Y referencia del aviso (lib/estado-pantalla.js `hayFiltro`).
// ⚠️ Clave NUEVA (`tablero-areas`): la pantalla vieja guardaba otras llaves y
// mezclarlas restauraría filtros que ya no existen.
const POR_DEFECTO = {
  busqueda: '', filtroTienda: 'TODAS', orden: 'atraso',
  incluirDespachados: false, mostrarFiltros: false,
  creacionDesde: '', creacionHasta: '', entregaDesde: '', entregaHasta: '',
  subActiva: '', verTodos: false, scroll: 0,
}

export default function TableroPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [areasUsuario, setAreasUsuario] = useState([])
  const [loading, setLoading] = useState(true)
  // CARGANDO | ERROR | INCOMPLETO | LISTA. Antes solo había `loading`, y un fallo
  // se veía igual que un tablero sin trabajo pendiente.
  const [estado, setEstado] = useState('CARGANDO')
  const [errorTexto, setErrorTexto] = useState('')
  const [cerradosCount, setCerradosCount] = useState(null)

  const { valores, set, setFiltro, restaurado, avisoFiltro, ocultarAviso, limpiarFiltros } =
    useEstadoPantalla('tablero-areas', POR_DEFECTO, {
      alFiltrar: { scroll: 0 },
      // Nada de esto ESCONDE pedidos: la tarjeta abierta, el cajón de filtros y
      // el orden solo cambian lo que se ve, e `incluirDespachados` muestra MÁS.
      noSonFiltro: ['scroll', 'mostrarFiltros', 'incluirDespachados', 'subActiva', 'orden', 'verTodos'],
    })
  const { busqueda, filtroTienda, orden, incluirDespachados, mostrarFiltros,
          creacionDesde, creacionHasta, entregaDesde, entregaHasta, subActiva, verTodos } = valores

  const contenedorRef = useRef(null)
  useScrollGuardado(contenedorRef, valores.scroll, (y) => set('scroll', y), restaurado && !loading)

  const filtrosFechaActivos = [creacionDesde, creacionHasta, entregaDesde, entregaHasta].filter(Boolean).length

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true); setEstado('CARGANDO'); setErrorTexto('')
    try {
      // NO se manda el rol: el acceso por tienda y las áreas los aplica el
      // servidor contra la cookie firmada.
      const res = await fetch(`/api/tablero${incluirDespachados ? '?cerrados=1' : ''}`, { cache: 'no-store' })
      if (!res.ok) {
        const detalle = await res.json().catch(() => ({}))
        setErrorTexto(detalle.error || `HTTP ${res.status}`)
        setPedidos([]); setEstado('ERROR')
        return
      }
      const data = await res.json()
      setPedidos(data.pedidos || [])
      setAreasUsuario(data.areasUsuario || [])
      setCerradosCount(typeof data.cerrados === 'number' ? data.cerrados : null)
      setEstado(data.completo === false ? 'INCOMPLETO' : 'LISTA')
    } catch (e) {
      // Una respuesta que no es JSON también es un fallo, no un tablero vacío.
      setErrorTexto(e?.message || 'Error de conexión')
      setPedidos([]); setEstado('ERROR')
    } finally { setLoading(false) }
  }, [incluirDespachados])

  // ☠️ Este efecto va DESPUÉS de declarar `cargar`: la lista de dependencias se
  // evalúa DURANTE el render y una `const` sin inicializar lanza ReferenceError.
  useEffect(() => { cargar() }, [cargar])

  // Filtros que aplican a los PEDIDOS, antes de repartirlos por sub-área.
  const pedidosFiltrados = useMemo(() => (pedidos || []).filter(p => {
    if (filtroTienda !== 'TODAS' && p.TIENDA_ID !== filtroTienda) return false
    if (busqueda && !coincideBusqueda(p, busqueda)) return false
    if (creacionDesde) { const f = parseFecha(p.FECHA_PEDIDO), d = inicioDiaEcuador(creacionDesde); if (!f || (d && f < d)) return false }
    if (creacionHasta) { const f = parseFecha(p.FECHA_PEDIDO), h = finDiaEcuador(creacionHasta); if (!f || (h && f > h)) return false }
    const entrega = (p.FECHA_ENTREGA_PROMETIDA || '').slice(0, 10)
    if (entregaDesde && (!entrega || entrega < entregaDesde)) return false
    if (entregaHasta && (!entrega || entrega > entregaHasta)) return false
    return true
  }), [pedidos, filtroTienda, busqueda, creacionDesde, creacionHasta, entregaDesde, entregaHasta])

  const pivot = useMemo(() => construirPivot(pedidosFiltrados), [pedidosFiltrados])

  // Qué tarjetas ve este usuario. Sale de las áreas que manda el SERVIDOR.
  const visibles = useMemo(() => {
    const permitidas = subareasVisibles({ rol: user?.rol, areas: areasUsuario })
    return permitidas ? pivot.filter(s => permitidas.includes(s.sub)) : pivot
  }, [pivot, user, areasUsuario])

  // La tarjeta abierta. Si la guardada ya no tiene trabajo, se cae a la primera
  // en vez de dejar la pantalla en blanco sin explicación.
  const abierta = useMemo(() => {
    if (visibles.length === 0) return null
    return visibles.find(s => s.sub === subActiva) || visibles[0]
  }, [visibles, subActiva])

  const lista = useMemo(() => {
    if (!abierta) return []
    return [...abierta.lista].sort((ORDENES[orden] || ORDENES.atraso).cmp)
  }, [abierta, orden])

  const TOPE = 15
  const mostradas = verTodos ? lista : lista.slice(0, TOPE)

  const totales = useMemo(() => ({
    pedidos: new Set(visibles.flatMap(s => s.lista.map(x => x.id))).size,
    vencidos: new Set(visibles.flatMap(s => s.lista.filter(x => x.atraso > 0).map(x => x.id))).size,
  }), [visibles])

  return (
    <div ref={contenedorRef} className="min-h-screen">
      {/* ── Cabecera ── */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white p-1">←</button>
              <div>
                <h1 className="text-xl font-display font-bold text-white">🧵 Pendientes por área</h1>
                <p className="text-xs text-gray-500">
                  {totales.pedidos} pedido(s) con trabajo pendiente
                  {totales.vencidos > 0 && <span className="text-red-400"> · {totales.vencidos} vencido(s)</span>}
                </p>
              </div>
            </div>
            <button onClick={cargar} disabled={loading} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5">
              {loading ? <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" /> : '🔄'}
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="Buscar por pedido, nombre, cédula o celular..."
              value={busqueda} onChange={e => setFiltro('busqueda', e.target.value)} />
            <select value={filtroTienda} onChange={e => setFiltro('filtroTienda', e.target.value)}
              className={`bg-gray-800 border rounded-xl px-3 py-2.5 min-h-[44px] text-sm outline-none cursor-pointer
                ${filtroTienda !== 'TODAS' ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}>
              <option value="TODAS">🏬 Todas las tiendas</option>
              <option value="MANDARINA">🍊 Mandarina</option>
              <option value="INDSTORE">🏪 Indstore</option>
              <option value="YAW">🟣 YAW</option>
            </select>
            <button onClick={() => set('mostrarFiltros', !mostrarFiltros)}
              className={`text-sm px-3 py-2.5 min-h-[44px] rounded-xl border whitespace-nowrap flex items-center justify-center gap-1.5
                ${filtrosFechaActivos > 0 ? 'border-mandarina-500 bg-mandarina-500/10 text-mandarina-400' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
              📅 Fechas
              {filtrosFechaActivos > 0 && <span className="bg-mandarina-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{filtrosFechaActivos}</span>}
              <span className="text-[10px]">{mostrarFiltros ? '▲' : '▼'}</span>
            </button>
          </div>

          {mostrarFiltros && (
            <div className="mt-2 card p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Rango titulo="Creado" desde={creacionDesde} hasta={creacionHasta}
                onDesde={v => setFiltro('creacionDesde', v)} onHasta={v => setFiltro('creacionHasta', v)} />
              <Rango titulo="Entrega prometida" desde={entregaDesde} hasta={entregaHasta}
                onDesde={v => setFiltro('entregaDesde', v)} onHasta={v => setFiltro('entregaHasta', v)} />
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        <AvisoFiltros visible={avisoFiltro} onLimpiar={limpiarFiltros} onCerrar={ocultarAviso} />

        {estado === 'ERROR' && (
          <div className="card p-4 border border-red-500/40 bg-red-500/5 mb-4">
            <div className="text-sm font-semibold text-red-400">No se pudo cargar el tablero</div>
            <div className="text-xs text-gray-400 mt-1">{errorTexto}</div>
            <button onClick={cargar} className="btn-secondary text-xs px-3 py-1.5 mt-2">Reintentar</button>
          </div>
        )}
        {estado === 'INCOMPLETO' && (
          <div className="card p-3 border border-amber-500/40 bg-amber-500/5 mb-4 text-xs text-amber-300">
            ⚠️ La lista llegó incompleta. Lo que falte no se está viendo — no es que no exista.
          </div>
        )}

        {/* ── Tarjetas por sub-área ── */}
        {estado === 'CARGANDO' ? (
          <div className="text-center text-gray-600 text-sm py-10">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-3xl mb-2 opacity-50">🧵</div>
            <div className="text-sm text-gray-400">
              {estado === 'ERROR' ? 'No se pudo leer.' : 'Ninguna área tiene trabajo pendiente.'}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Si eso te sorprende, revisa el dato antes de creerlo: un área en cero casi siempre
              es una regla que la está escondiendo.
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 mb-4">
              {visibles.map(s => {
                const activa = abierta?.sub === s.sub
                return (
                  <button key={s.sub}
                    onClick={() => { set('subActiva', s.sub); set('verTodos', false) }}
                    aria-expanded={activa}
                    className={`card p-3 text-left transition-all border-t-4 hover:bg-gray-800/40
                      ${activa ? 'ring-1 ring-gray-600' : 'opacity-80 hover:opacity-100'}`}
                    style={{ borderTopColor: COLOR_SUB[s.sub] }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span>{s.icon}</span>
                      <span className="text-sm font-display font-bold" style={{ color: COLOR_SUB[s.sub] }}>{s.label}</span>
                    </div>
                    <div className="flex items-end gap-3">
                      <div>
                        <div className="text-2xl font-black text-white leading-none">{s.pedidos}</div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-wide mt-1">pedidos</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-gray-300 leading-none">{s.unidades}</div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-wide mt-1">unidades</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.vencidos > 0 && <Chip tono="malo">{s.vencidos} vencido{s.vencidos !== 1 ? 's' : ''}</Chip>}
                      {s.urgentes > 0 && <Chip tono="medio">{s.urgentes} urge</Chip>}
                      {ORDEN_ESTADO.filter(e => s.estados[e]).map(e => (
                        <Chip key={e} tono={e === 'ENVIADO_APROBACION' ? 'medio' : 'neutro'}>
                          {ESTADO_ETQ[e]} {s.estados[e]}
                        </Chip>
                      ))}
                      {/* El corte es DATO, no filtro: avisa sin esconder nada. */}
                      {s.sinCorte > 0 && <Chip tono="corte">✂ {s.sinCorte} sin marcar</Chip>}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-2 pt-2 border-t border-gray-800">
                      {s.masViejo > 0 ? `el más viejo lleva ${s.masViejo} días` : s.nota}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* ── Detalle de la tarjeta abierta ── */}
            {abierta && (
              <div className="card overflow-hidden">
                <div className="px-3 py-2.5 border-b border-gray-800 bg-gray-900/50 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-display font-bold text-sm text-white">
                    {abierta.icon} {abierta.label} · {lista.length} pedido{lista.length !== 1 ? 's' : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">
                      {abierta.prendas} prendas · {abierta.unidades} und
                      {abierta.sinCorte > 0 && ` · ${abierta.sinCorte} sin marca de corte`}
                    </span>
                    <select value={orden} onChange={e => set('orden', e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-[11px] text-gray-300 outline-none cursor-pointer">
                      {Object.entries(ORDENES).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-900/40">
                        <th className="text-left px-2 py-2">Pedido</th>
                        <th className="text-left px-2 py-2">Cliente</th>
                        <th className="text-left px-2 py-2 whitespace-nowrap">Creado</th>
                        <th className="text-left px-2 py-2">Situación</th>
                        <th className="text-right px-2 py-2 whitespace-nowrap" title="Días entre la venta y la impresión de la hoja">Venta→taller</th>
                        <th className="text-right px-2 py-2 whitespace-nowrap" title="Días desde que llegó al taller">En taller</th>
                        <th className="text-right px-2 py-2 whitespace-nowrap" title="Días desde el último evento registrado. Es la señal de cuello de botella.">Quieto</th>
                        <th className="text-left px-2 py-2 whitespace-nowrap">Último evento</th>
                        <th className="text-right px-2 py-2 whitespace-nowrap">Prendas</th>
                        <th className="text-left px-2 py-2">En esta área</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mostradas.map(p => {
                        const t = TIENDA_META[p.tienda] || {}
                        const ests = ORDEN_ESTADO.filter(e => p.estados[e])
                          .map(e => `${ESTADO_ETQ[e]} ${p.estados[e]}`).join(' · ')
                        return (
                          <tr key={p.id} className="border-t border-gray-800/60 hover:bg-gray-800/30">
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <Link href={`/dashboard/pedido/${p.id}`} className="font-mono text-mandarina-400 hover:underline">
                                {t.emoji} {p.id}
                              </Link>
                              {p.sinCorte > 0 && abierta.sub !== 'CORTE' && (
                                <div className="text-[9px] text-gray-600 font-mono mt-0.5"
                                  title="Nadie ha marcado estas prendas como cortadas. No significa que no lo estén.">
                                  ✂ {p.sinCorte} sin marcar
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 max-w-[16ch] truncate text-gray-300" title={p.cliente}>{p.cliente || '—'}</td>
                            <td className="px-2 py-1.5 font-mono text-gray-500 whitespace-nowrap">{p.creado}</td>
                            <td className="px-2 py-1.5"><Situacion atraso={p.atraso} /></td>
                            <Dias v={p.aTaller} tibio={2} caliente={4} />
                            <Dias v={p.enTaller} tibio={6} caliente={10} />
                            <Dias v={p.quieto} tibio={4} caliente={7} />
                            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{p.ultimoEvento || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-gray-400 whitespace-nowrap">{p.prendas} / {p.unidades}</td>
                            <td className="px-2 py-1.5 text-gray-400 max-w-[22ch] truncate" title={ests}>{ests}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {lista.length > TOPE && (
                  <button onClick={() => set('verTodos', !verTodos)}
                    className="w-full py-2.5 border-t border-gray-800 bg-gray-900/40 text-[11px] text-gray-400 hover:text-white hover:bg-gray-800">
                    {verTodos ? `Mostrar solo los ${TOPE} primeros` : `Ver los ${lista.length - TOPE} pedidos restantes`}
                  </button>
                )}

                <div className="px-3 py-2 border-t border-gray-800 bg-gray-900/30 text-[10px] text-gray-600 leading-relaxed">
                  Ámbar y rojo marcan 4 y 7 días en «Quieto», 6 y 10 en «En taller», 2 y 4 en «Venta→taller».
                  Cuando «Quieto» se acerca a «En taller», nadie tocó ese pedido desde que entró.
                  No hay columna por área: ese desglose no existe en el histórico.
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between mt-4">
          <button onClick={() => set('incluirDespachados', !incluirDespachados)}
            className={`text-xs px-3 py-2 rounded-xl border transition-all
              ${incluirDespachados ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
            {incluirDespachados ? '✅ Con cerrados' : '➕ Ver también los cerrados'}
          </button>
          {cerradosCount !== null && (
            <span className="text-[11px] text-gray-600">{cerradosCount} pedido(s) ya cerrados</span>
          )}
        </div>
      </div>
    </div>
  )
}

function Chip({ tono, children }) {
  const tonos = {
    malo:   'bg-red-500/15 text-red-400',
    medio:  'bg-amber-500/15 text-amber-400',
    neutro: 'bg-gray-800 text-gray-400',
    corte:  'bg-gray-900 text-gray-500 border border-dashed border-gray-700',
  }
  return <span className={`text-[9px] px-1.5 py-0.5 rounded ${tonos[tono] || tonos.neutro}`}>{children}</span>
}

function Rango({ titulo, desde, hasta, onDesde, onHasta }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">{titulo}</div>
      <div className="flex gap-2">
        <input type="date" value={desde} onChange={e => onDesde(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-2 py-2 text-xs text-gray-200 outline-none" />
        <input type="date" value={hasta} onChange={e => onHasta(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-2 py-2 text-xs text-gray-200 outline-none" />
      </div>
    </div>
  )
}
