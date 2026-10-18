// lib/conexiones.js — el "tablero de auto" de /dashboard/errores.
//
// POR QUÉ EXISTE: el 17-oct-2026 Meta dejó de mandar TODOS los WhatsApp de IND
// desde las 8:00 por un pago pendiente (131042). Las claves funcionaban y los
// mensajes de los clientes seguían entrando, así que todo "se veía conectado";
// Rodrigo se enteró porque los vendedores reclamaron. Pidió ver cada servicio de
// la empresa con una luz verde/roja, y enterarse por Telegram.
//
// Quién escribe `crm.conexiones_estado`: una rutina de Claude en la nube
// (7:00 y 15:00 Ecuador) que usa los conectores (Supabase, Vercel, Meta,
// Shopify, Make). Este archivo NO revisa nada: decide cómo se ve lo que la
// rutina dejó y cuándo eso ya no es confiable.

/** Cada cuánto corre la rutina: 7:00 y 15:00 → el hueco más largo es 16 h. */
export const VENCE_HORAS = 17

export const ORDEN_ESTADO = { rojo: 0, amarillo: 1, gris: 2, verde: 3 }
export const GRUPOS = ['Mensajería', 'Ventas', 'Facturación', 'Pauta', 'Infraestructura']

const horasDesde = (iso, ahora) => (ahora - new Date(iso).getTime()) / 3_600_000

/**
 * El color que se MUESTRA. Una luz verde de hace dos días no es verde: es "no sé".
 *
 * - La fila de la rutina (`claude_rutina`) vencida es ROJA: si la rutina no
 *   corre, el tablero entero miente, y eso es justo lo que no puede pasar en
 *   silencio.
 * - Cualquier otra fila vencida pasa a GRIS ("sin revisar desde…"), nunca se
 *   queda en su verde viejo.
 */
export function estadoEfectivo(fila, ahora = Date.now()) {
  if (!fila?.revisado_en) return { ...fila, estado: 'gris', vencida: true }
  const h = horasDesde(fila.revisado_en, ahora)
  if (h <= VENCE_HORAS) return { ...fila, vencida: false }
  const hace = h >= 48 ? `${Math.round(h / 24)} días` : `${Math.round(h)} h`
  if (fila.servicio === 'claude_rutina') {
    return {
      ...fila, estado: 'rojo', vencida: true,
      detalle: `La rutina de revisión no corre hace ${hace}: el tablero está desactualizado. Revisa claude.ai/code/routines`,
    }
  }
  return { ...fila, estado: 'gris', vencida: true, detalle: `Sin revisar hace ${hace}. ${fila.detalle || ''}`.trim() }
}

/** Ordena para pintar: por grupo, y dentro del grupo lo roto primero. */
export function ordenarParaPanel(filas) {
  const g = (x) => { const i = GRUPOS.indexOf(x.grupo); return i < 0 ? GRUPOS.length : i }
  return [...(filas || [])].sort((a, b) =>
    g(a) - g(b) || (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9) || String(a.nombre).localeCompare(String(b.nombre)))
}

export function resumen(filas) {
  const r = { verde: 0, amarillo: 0, rojo: 0, gris: 0 }
  for (const f of filas || []) if (r[f.estado] !== undefined) r[f.estado]++
  return r
}

/**
 * Texto de Telegram (Markdown). '' si todo está verde: un "todo bien" dos veces
 * al día entrena a ignorar el chat justo el día que trae algo.
 */
export function textoAlertaConexiones(filas, { baseUrl = '' } = {}) {
  const malos = (filas || []).filter(f => f.estado === 'rojo' || f.estado === 'amarillo' || f.estado === 'gris')
    .sort((a, b) => (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9))
  if (!malos.length) return ''
  const r = resumen(filas)
  const icono = { rojo: '🔴', amarillo: '🟡', gris: '⚪' }
  const cab = r.rojo
    ? `🚨 *${r.rojo} ${r.rojo === 1 ? 'conexión en ROJO' : 'conexiones en ROJO'}* — algo de la empresa está parado`
    : '⚠️ *Conexiones para revisar*'
  const lineas = malos.map(f => `${icono[f.estado]} *${f.nombre}*: ${String(f.detalle || 'sin detalle').slice(0, 220)}`)
  const pie = baseUrl ? `\n\n${baseUrl}/dashboard/errores` : ''
  return `${cab}\n\n${lineas.join('\n')}${pie}`
}
