'use client'
// Tablero de pauta: qué trajo cada anuncio, no cuánto costó el clic.
//
// La pregunta que contesta es "¿qué creativo vende?", que hasta ahora no se
// podía responder: un anuncio con 200 conversaciones y cero ventas se veía igual
// de bien que uno con 20 y cinco ventas.
//
// Dos reglas de lectura que la pantalla respeta en todos lados:
//
//   1. `null` NO es cero. Si Meta no reportó gasto de un anuncio, se pinta "⚠ s/d",
//      nunca "$0.00": un anuncio sin gasto conocido y uno gratis son cosas muy
//      distintas, y confundirlas haría ver un ROAS infinito.
//   2. Antes del 13-jul el webhook no guardaba `referral`, así que no hay
//      historia de pauta. Si el rango pedido se recorta, se avisa en vez de
//      mostrar ceros que parecen datos.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Tabla from './Tabla'
import { dinero, numero, veces } from './formato'

const TIENDAS = [
  { id: 'INDSTORE', nombre: 'IND STORE' },
  { id: 'MANDARINA', nombre: 'Mandarina Republic' },
]
const FECHA_PISO = '2026-07-13'

// Los dos números que atiende cada inbox. Se comportan muy distinto, así que
// verlos por separado es media pelea: al 2-ago REPUBLIC llevaba 33 chats de
// pauta y el 9804 llevaba 321. Espejo de lib/pauta/constantes.js.
const CANALES = {
  INDSTORE: [
    { phoneId: '1153686904504422', etiqueta: '3326 · +593 99 995 3326' },
    { phoneId: '2241248862581450', etiqueta: '9804 · +593 98 415 9804' },
  ],
  MANDARINA: [
    { phoneId: '1024077200794372', etiqueta: 'MANDI · +593 98 374 5757' },
    { phoneId: '118582961194601',  etiqueta: 'REPUBLIC · +593 97 910 4167' },
  ],
}


/** Hoy en Ecuador, en YYYY-MM-DD. El navegador puede estar en otra zona. */
function hoyEc() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
}

export default function PautaPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tienda, setTienda] = useState('INDSTORE')
  const [canal, setCanal] = useState('')   // '' = los dos números
  const [desde, setDesde] = useState(FECHA_PISO)
  const [hasta, setHasta] = useState(hoyEc())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    // Esto es cosmético: quien manda es requireAdmin en /api/pauta.
    if (u.rol !== 'ADMIN') { router.push('/dashboard'); return }
    setUser(u)
    cargar(u)
  }, [])

  function headers(u = user) {
    return { 'Content-Type': 'application/json', 'x-mp-usuario-id': u?.id || '' }
  }

  async function cargar(u = user) {
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams({ tienda, desde, hasta })
      if (canal) qs.set('canal', canal)
      const res = await fetch(`/api/pauta?${qs}`, { headers: headers(u), cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setData(d)
    } catch (e) {
      setError(e.message || 'Error de conexión')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  const t = data?.totales
  const e = data?.embudo
  const c = data?.cubetas

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">📣 Pauta</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Qué trajo cada anuncio: del gasto al pedido pagado.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Tienda</label>
          <select className="input py-2 text-sm w-auto" value={tienda}
                  onChange={(ev) => { setTienda(ev.target.value); setCanal('') }}>
            {TIENDAS.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Número</label>
          <select className="input py-2 text-sm w-auto" value={canal}
                  onChange={(ev) => setCanal(ev.target.value)}>
            <option value="">Los dos</option>
            {(CANALES[tienda] || []).map((c) => (
              <option key={c.phoneId} value={c.phoneId}>{c.etiqueta}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Desde</label>
          <input type="date" className="input py-2 text-sm w-auto" value={desde}
                 min={FECHA_PISO} onChange={(ev) => setDesde(ev.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Hasta</label>
          <input type="date" className="input py-2 text-sm w-auto" value={hasta}
                 onChange={(ev) => setHasta(ev.target.value)} />
        </div>
        <button onClick={() => cargar()} disabled={loading}
                className="px-4 py-2 rounded-xl bg-mandarina-500 text-white text-sm font-semibold disabled:opacity-60">
          {loading ? '⏳' : 'Ver'}
        </button>
      </div>

      {error && (
        <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-red-400">⚠️ {error}</span>
        </div>
      )}

      {/* El rango pedido empieza antes de que existieran los datos. Se avisa en
          vez de mostrar ceros: un cero acá se lee como "no vendió". */}
      {data?.recortadoAlPiso && (
        <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-amber-400">
            Antes del {FECHA_PISO} no se guardaba de qué anuncio venía cada chat,
            así que el rango arranca ahí.
          </span>
        </div>
      )}

      {/* Con un número elegido, el gasto NO se puede partir: Meta lo reporta por
          anuncio y no sabe a qué número escribió cada persona. Callarlo haría
          leer un ROAS por canal que no significa nada. */}
      {data?.gastoEsDeTodaLaTienda && (
        <div className="mb-3 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-blue-300">
            Los chats y las ventas son solo de este número, pero <b>el gasto es de
            toda la tienda</b>: Meta no sabe a cuál de tus números escribió cada
            persona. Sirve para comparar los dos números entre sí, no para leer el
            ROAS de uno solo.
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? null : (
        <>
          {/* Los cuatro números que importan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            <Tarjeta titulo="Gasto en Meta" valor={dinero(t.gasto)} />
            <Tarjeta titulo="Venta atribuida" valor={dinero(t.ventaAtribuida)}
                     nota="pagada, de gente que llegó por un anuncio" />
            <Tarjeta titulo="ROAS del CRM" valor={veces(t.roasCrm)} destacado
                     nota="venta atribuida ÷ gasto" />
            <Tarjeta titulo="MER" valor={veces(t.mer)}
                     nota="TODA la venta de la tienda ÷ gasto" />
          </div>

          {/* ROAS del CRM vs el que reporta Meta. La brecha es el punto: Meta
              suele contar de más porque atribuye por vista. */}
          {t.roasMeta != null && (
            <div className="mb-4 card p-3 text-xs text-gray-400">
              Meta reporta <b className="text-white">{veces(t.roasMeta)}</b> y el CRM
              mide <b className="text-white">{veces(t.roasCrm)}</b> sobre ventas
              cobradas. Cuando difieren, manda el CRM.
            </div>
          )}

          {/* De dónde salió cada venta, con la MISMA regla con la que se le
              reporta a Meta (lib/canalVenta.js). Si esto y el CAPI dijeran cosas
              distintas, el tablero estaría mintiendo sobre lo que se envía. */}
          {data.origenes && (
            <div className="card p-3 mb-4">
              <div className="text-xs font-semibold text-white mb-2">¿De dónde salió cada venta?</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <Origen titulo="Digital a físico" o={data.origenes.digital_a_fisico}
                        color="text-green-400" emoji="📲🏬"
                        nota="vio el anuncio, escribió y compró en la tienda" />
                <Origen titulo="Por chat" o={data.origenes.por_chat}
                        color="text-mandarina-400" emoji="💬"
                        nota="vino de un anuncio y cerró por WhatsApp" />
                <Origen titulo="Cliente de paso" o={data.origenes.cliente_de_paso}
                        color="text-amber-400" emoji="🚶"
                        nota="mostrador, sin chat — se reporta como physical_store" />
                <Origen titulo="Sin origen" o={data.origenes.sin_origen}
                        color="text-gray-500" emoji="❓"
                        nota="no hay forma de saberlo" />
              </div>
              <p className="text-[10px] text-gray-600 mt-2 leading-tight">
                Las tres primeras se le reportan a Meta. “Digital a físico” y “Por
                chat” llevan el anuncio exacto; “Cliente de paso” va con los datos
                hasheados para que Meta cruce contra quién vio la pauta.
              </p>
            </div>
          )}

          {/* OJO: `pauta` y `sinPauta` cuentan PERSONAS que escribieron por
              primera vez; `sinChat` cuenta PEDIDOS. Son unidades distintas y no
              suman entre sí — la función crm.pauta_cubetas las devuelve juntas
              por comodidad, no porque sean partes de un mismo total.
              Pintarlas como tres pedazos de una torta (que es como estaban al
              principio, bajo el título "¿de dónde vinieron las ventas?") hace
              creer que el 10% de las ventas viene de pauta cuando ese número
              habla de contactos. Van separadas a propósito. */}
          {c && (
            <div className="grid sm:grid-cols-2 gap-2 mb-4">
              <div className="card p-3">
                <div className="text-xs font-semibold text-white mb-2">Contactos nuevos</div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <Cubeta label="Llegaron por un anuncio" valor={c.pauta} color="text-green-400" />
                  <Cubeta label="Llegaron por otro lado" valor={c.sinPauta} color="text-blue-400" />
                </div>
              </div>
              <div className="card p-3 border border-amber-500/20">
                <div className="text-xs font-semibold text-white mb-2">Ventas que no se pueden atribuir</div>
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-400">{numero(c.sinChat)}</div>
                  <div className="text-[10px] text-gray-500">pedidos sin chat</div>
                </div>
                <p className="text-[10px] text-gray-600 mt-2 leading-tight">
                  Su celular nunca escribió por WhatsApp a esta tienda, así que no
                  se sabe de dónde vinieron. Suele ser que el vendedor registró un
                  número distinto al del chat.
                </p>
              </div>
            </div>
          )}

          {/* Embudo */}
          <div className="card p-3 mb-4">
            <div className="text-xs font-semibold text-white mb-2">El embudo</div>
            <div className="flex flex-wrap gap-1.5 items-center text-center">
              <Paso label="Impresiones" valor={e.impresiones} />
              <Flecha />
              <Paso label="Clics" valor={e.clics} />
              <Flecha />
              <Paso label="Escribieron" valor={e.llegaron} />
              <Flecha />
              <Paso label="Respondieron" valor={e.respondieron} />
              <Flecha />
              <Paso label="Conversaron" valor={e.conversaron} />
              <Flecha />
              <Paso label="Pedidos" valor={e.pedidos} />
              <Flecha />
              <Paso label="Pagados" valor={e.pagados} destacado />
            </div>
          </div>

          <Tabla campanas={data.campanas} />

          {data.ultimoDato && (
            <p className="text-[10px] text-gray-600 mt-3">
              Último gasto traído de Meta: {data.ultimoDato}. Lo refresca el cron
              diario; si esta fecha se queda atrás, revisa <code>META_ADS_TOKEN</code>.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Tarjeta({ titulo, valor, nota, destacado }) {
  return (
    <div className={`card p-3 border ${destacado ? 'border-mandarina-500/50' : 'border-gray-800'}`}>
      <div className="text-[10px] text-gray-500">{titulo}</div>
      <div className={`text-lg font-bold ${destacado ? 'text-mandarina-400' : 'text-white'}`}>{valor}</div>
      {nota && <div className="text-[10px] text-gray-600 mt-0.5 leading-tight">{nota}</div>}
    </div>
  )
}

/** Una caja de origen. `o` en null = no hubo ninguna venta de ese tipo. */
function Origen({ titulo, o, color, emoji, nota }) {
  return (
    <div className="rounded-lg bg-gray-800/40 p-2.5">
      <div className="text-[10px] text-gray-500">{emoji} {titulo}</div>
      <div className={`text-lg font-bold ${o ? color : 'text-gray-700'}`}>
        {o ? numero(o.ventas) : '0'}
      </div>
      <div className="text-[10px] text-gray-500">{o ? dinero(o.usd) : '—'}</div>
      <div className="text-[9px] text-gray-600 mt-1 leading-tight">{nota}</div>
    </div>
  )
}

function Cubeta({ label, valor, color }) {
  return (
    <div>
      <div className={`text-lg font-bold ${color}`}>{numero(valor)}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  )
}

function Paso({ label, valor, destacado }) {
  return (
    <div className={`flex-1 min-w-[70px] rounded-lg px-2 py-1.5 ${destacado ? 'bg-mandarina-500/10' : 'bg-gray-800/50'}`}>
      <div className={`text-sm font-bold ${destacado ? 'text-mandarina-400' : 'text-white'}`}>{numero(valor)}</div>
      <div className="text-[9px] text-gray-500 leading-tight">{label}</div>
    </div>
  )
}

const Flecha = () => <span className="text-gray-700 text-xs">›</span>
