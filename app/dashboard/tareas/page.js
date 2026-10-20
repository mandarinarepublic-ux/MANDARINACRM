'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { diasDeTarea, resumenTarea } from '@/lib/tareas-auto'
import { hoyEcuador } from '@/lib/parseFecha'

// Tareas automáticas (solo ADMIN): las rutinas de Claude que corren solas en la
// nube. Cada una deja una línea al terminar; acá se ve qué días corrió, cómo le
// fue y su resumen. Se EDITAN en claude.ai/code/routines, no desde el CRM.

const COLOR = {
  ok:         { cuadro: 'bg-green-500',            texto: 'text-green-300',  etiqueta: 'Bien' },
  aviso:      { cuadro: 'bg-yellow-400',           texto: 'text-yellow-300', etiqueta: 'Con aviso' },
  incompleta: { cuadro: 'bg-yellow-400',           texto: 'text-yellow-300', etiqueta: 'Le faltó una corrida' },
  error:      { cuadro: 'bg-red-500',              texto: 'text-red-300',    etiqueta: 'Error' },
  falto:      { cuadro: 'bg-gray-700 ring-1 ring-red-500/70', texto: 'text-red-300', etiqueta: 'No corrió' },
  pendiente:  { cuadro: 'bg-gray-800 ring-1 ring-gray-600 border-dashed', texto: 'text-gray-400', etiqueta: 'Hoy, todavía no' },
  antes:      { cuadro: 'bg-gray-900',             texto: 'text-gray-600',   etiqueta: 'No existía' },
}

const DIAS_VISTA = 30
const DIA_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// "2026-10-17" → "sáb 17 oct" (el YYYY-MM-DD ya es día de Ecuador: se lee sin zona).
function diaHumano(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${DIA_SEMANA[dt.getUTCDay()]} ${d} ${MES[m - 1]}`
}
function horaEcuador(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' })
}
function hace(iso) {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `hace ${Math.max(min, 1)} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}

function Tarea({ tarea, corridas }) {
  const hoy = hoyEcuador()
  const dias = useMemo(() => diasDeTarea({ tarea, corridas, dias: DIAS_VISTA, hoy }), [tarea, corridas, hoy])
  const r = useMemo(() => resumenTarea(dias, corridas), [dias, corridas])
  // Por defecto se abre el último día con corridas: lo primero que uno quiere ver.
  const [elegido, setElegido] = useState(() => [...dias].reverse().find(d => d.corridas.length)?.dia || hoy)
  const diaSel = dias.find(d => d.dia === elegido)
  const ultimo = r.ultima ? COLOR[r.ultima.estado] || COLOR.error : null

  return (
    <section className="card p-4 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-white font-bold">{tarea.nombre}{tarea.activa === false && <span className="ml-2 text-xs text-gray-500">(pausada)</span>}</h2>
          <p className="text-xs text-gray-500">{tarea.horario}{tarea.descripcion ? ` · ${tarea.descripcion}` : ''}</p>
        </div>
        {/* Solo las rutinas de Claude (trig_…) se editan allá; las demás (p. ej. el
            catálogo de WhatsApp, que corre en el inbox) no tienen página que abrir. */}
        {String(tarea.id).startsWith('trig_') && (
          <a href={`https://claude.ai/code/routines/${tarea.id}`} target="_blank" rel="noreferrer"
            className="text-xs text-mandarina-400 hover:underline whitespace-nowrap">Editar en Claude ↗</a>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3">
        {r.ultima
          ? <span className={ultimo.texto}>Última: {ultimo.etiqueta.toLowerCase()} · {hace(r.ultima.inicio)}</span>
          : <span className="text-gray-500">Todavía no reporta ninguna corrida</span>}
        <span className="text-gray-400">{r.bien}/{r.dias} días bien</span>
        {r.conProblema > 0 && <span className="text-yellow-300">{r.conProblema} con problema</span>}
        {r.faltaron > 0 && <span className="text-red-300">{r.faltaron} sin correr</span>}
      </div>

      {/* Un cuadrito por día: tócalo para ver el resumen de ese día. */}
      <div className="grid gap-1.5 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(22px, 1fr))' }}>
        {dias.map(d => (
          <button key={d.dia} onClick={() => setElegido(d.dia)} title={`${diaHumano(d.dia)} · ${COLOR[d.estado].etiqueta}`}
            aria-label={`${diaHumano(d.dia)}: ${COLOR[d.estado].etiqueta}`}
            className={`h-6 rounded ${COLOR[d.estado].cuadro} ${elegido === d.dia ? 'outline outline-2 outline-white outline-offset-1' : ''}`} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-600 -mt-2 mb-3">
        <span>{diaHumano(dias[0].dia)}</span><span>hoy</span>
      </div>

      {diaSel && (
        <div className="rounded-xl bg-gray-900/70 border border-gray-800 p-3">
          <div className={`text-xs font-semibold mb-2 ${COLOR[diaSel.estado].texto}`}>
            {diaHumano(diaSel.dia)} · {COLOR[diaSel.estado].etiqueta}
          </div>
          {diaSel.corridas.length === 0 && (
            <p className="text-xs text-gray-400">
              {diaSel.estado === 'falto' ? 'Ese día la tarea no dejó ninguna corrida: no corrió, o corrió y no pudo reportar. Revísala en Claude.'
                : diaSel.estado === 'pendiente' ? 'Todavía no le toca o está corriendo.'
                : 'La tarea todavía no existía.'}
            </p>
          )}
          {diaSel.corridas.map(c => {
            const col = COLOR[c.estado] || COLOR.error
            return (
              <div key={c.id} className="mb-3 last:mb-0">
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${col.cuadro}`} />
                  <span className="text-gray-300 font-medium">{horaEcuador(c.inicio)}</span>
                  <span className={col.texto}>{col.etiqueta}</span>
                  {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="ml-auto text-mandarina-400 hover:underline">Ver en Claude ↗</a>}
                </div>
                <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{c.resumen || '(sin resumen)'}</p>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function TareasPage() {
  const router = useRouter()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    // Solo pinta: quien decide es /api/tareas-auto (requireAdmin contra la base).
    if (u.rol !== 'ADMIN') { router.push('/dashboard'); return }
    fetch('/api/tareas-auto', { cache: 'no-store' })
      .then(async res => { if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`); return res.json() })
      .then(setDatos)
      .catch(e => setError(e.message || 'Error de conexión'))
  }, [])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">⏱️ Tareas automáticas</h1>
        <p className="text-xs text-gray-500">
          Corren solas en la nube de Claude, aunque la compu esté apagada. Toca un día para ver su resumen.
          Para cambiar horario o instrucciones: <a href="https://claude.ai/code/routines" target="_blank" rel="noreferrer" className="text-mandarina-400 hover:underline">claude.ai/code/routines ↗</a>
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-gray-400 mb-4">
        {['ok', 'aviso', 'error', 'falto', 'pendiente'].map(k => (
          <span key={k} className="flex items-center gap-1.5"><span className={`inline-block w-3 h-3 rounded ${COLOR[k].cuadro}`} />{COLOR[k].etiqueta}</span>
        ))}
      </div>

      {error && <div className="card p-4 text-sm text-red-400">No se pudo cargar: {error}</div>}
      {!datos && !error && <div className="h-40 rounded-2xl bg-gray-900/60 animate-pulse" />}
      {datos && datos.tareas.length === 0 && <div className="card p-4 text-sm text-gray-400">No hay tareas registradas.</div>}
      {datos && datos.tareas.map(t => (
        <Tarea key={t.id} tarea={t} corridas={datos.corridas.filter(c => c.tarea_id === t.id)} />
      ))}
    </div>
  )
}
