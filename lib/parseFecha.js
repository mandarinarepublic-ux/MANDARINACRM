/**
 * Helper centralizado para parsear las fechas del CRM.
 * Soporta dos formatos:
 *  - ISO:        "2026-06-16T11:38:00.000Z"
 *  - Sheets/app: "16Jun2026 11:38:00"  (día, mes abreviado ES, año, hora:min:seg)
 *
 * IMPORTANTE: el formato "16Jun2026 11:38:00" SÍ incluye hora, minuto y segundo
 * y deben usarse en el ordenamiento — antes solo se extraía día/mes/año,
 * lo que hacía que todos los pedidos de un mismo día empataran en el sort
 * y el orden final dependiera del orden de la hoja de Google Sheets en vez
 * de la hora real de creación.
 */
export function parseFecha(str) {
  if (!str) return null
  if (str instanceof Date) return isNaN(str) ? null : str
  str = String(str).trim()
  if (!str) return null

  if (str.includes('T') || str.match(/^\d{4}-/)) {
    // Fecha SIN hora ("2026-07-21"): el motor de JS la interpreta como medianoche
    // UTC, que en Ecuador (-05:00) es el DÍA ANTERIOR a las 19:00. Se construye a
    // mano en hora local para que una fecha de entrega no aparezca corrida un día.
    const soloFecha = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (soloFecha) {
      const [, yyyy, mm, dd] = soloFecha
      return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd))
    }
    // Postgres puede devolver "2026-07-21 14:33:12+00": con espacio en vez de T
    // (que Safari no parsea) y con el huso en horas sueltas (+00), que NO es ISO
    // válido y da Invalid Date. Se normalizan las dos cosas.
    const normalizado = str
      .replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T')
      .replace(/([+-]\d{2})$/, '$1:00')
    const d = new Date(normalizado)
    return isNaN(d) ? null : d
  }

  const months = { Ene:0, Feb:1, Mar:2, Abr:3, May:4, Jun:5, Jul:6, Ago:7, Sep:8, Oct:9, Nov:10, Dic:11 }
  // Captura día, mes, año y -opcionalmente- hora:min:seg
  const m = str.match(/^(\d{2})([A-Za-z]{3})(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null

  const [, dd, mon, yyyy, hh = '0', mm = '0', ss = '0'] = m
  const mes = months[mon]
  if (mes === undefined) return null

  return new Date(
    parseInt(yyyy), mes, parseInt(dd),
    parseInt(hh), parseInt(mm), parseInt(ss)
  )
}

// ─── Hora de Ecuador ─────────────────────────────────────────────────────────
// Un timestamptz es un INSTANTE; el "día" al que pertenece depende de la zona.
// Postgres lo entrega en UTC ("2026-07-25T20:52:00+00:00" — verificado en
// producción), así que tomar los 10 primeros caracteres da el día UTC: un pedido
// hecho a las 20:00 en Ecuador cae al DÍA SIGUIENTE y las ventas del día salen
// mal. Todo lo que convierta instante → día del calendario debe pasar por aquí.
//
// Ecuador continental es UTC-5 todo el año (no hay horario de verano), así que
// basta un corrimiento fijo; se usa el mismo truco que formatFecha de lib/sheets.
const OFFSET_EC_MS = -5 * 60 * 60 * 1000

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function partesEcuador(d) {
  const ec = new Date(d.getTime() + OFFSET_EC_MS)
  return {
    anio: ec.getUTCFullYear(),
    mes:  ec.getUTCMonth(),
    dia:  ec.getUTCDate(),
    hora: ec.getUTCHours(),
    min:  ec.getUTCMinutes(),
  }
}

const dosDigitos = (n) => String(n).padStart(2, '0')

/**
 * Día de calendario (YYYY-MM-DD) al que pertenece un instante EN ECUADOR.
 * '' si no se puede leer. Usar para agrupar/comparar por día: ventas de hoy,
 * ventas del mes, "es de ayer", etc.
 */
export function fechaISOEcuador(input) {
  const d = input instanceof Date ? input : parseFecha(input)
  if (!d || isNaN(d)) return ''
  const { anio, mes, dia } = partesEcuador(d)
  return `${anio}-${dosDigitos(mes + 1)}-${dosDigitos(dia)}`
}

/** Hoy en Ecuador, como YYYY-MM-DD. */
export function hoyEcuador() {
  return fechaISOEcuador(new Date())
}

/** Suma (o resta, con n negativo) días a un YYYY-MM-DD sin tocar zonas horarias. */
function isoMasDias(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + n)
  return `${t.getUTCFullYear()}-${dosDigitos(t.getUTCMonth() + 1)}-${dosDigitos(t.getUTCDate())}`
}

/**
 * Día en formato de la app: "25Jul2026".
 *
 * Reemplaza el `FECHA_PEDIDO.split(' ')[0]` que quedó repartido por las
 * pantallas: servía cuando el backend era Sheets ("25Jul2026 20:52:00"), pero
 * Supabase manda un ISO SIN espacios, así que ese split devolvía la cadena
 * entera ("2026-07-25T20:52:00+00:00") y, si se recortaba, el día UTC.
 */
export function formatFechaDia(input) {
  const d = input instanceof Date ? input : parseFecha(input)
  if (!d || isNaN(d)) return ''
  const { anio, mes, dia } = partesEcuador(d)
  return `${dosDigitos(dia)}${MESES[mes]}${anio}`
}

/**
 * Instante en que EMPIEZA (00:00:00) un día de Ecuador. Para filtros "desde".
 * `new Date('2026-07-25')` daba medianoche UTC = 19:00 del 24 en Ecuador, así que
 * el filtro se llevaba 5 horas del día anterior.
 */
export function inicioDiaEcuador(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000-05:00`)
  return isNaN(d) ? null : d
}

/** Instante en que TERMINA (23:59:59.999) un día de Ecuador. Para filtros "hasta". */
export function finDiaEcuador(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59.999-05:00`)
  return isNaN(d) ? null : d
}

/**
 * Formatea una fecha (Date o string crudo del CRM) para mostrar en listados:
 * "16 Jun · 06:13"
 */
export function formatFechaCorta(input) {
  const d = input instanceof Date ? input : parseFecha(input)
  if (!d || isNaN(d)) return ''
  const { mes, dia, hora, min } = partesEcuador(d)
  return `${dosDigitos(dia)} ${MESES[mes]} · ${dosDigitos(hora)}:${dosDigitos(min)}`
}

/**
 * Para campos que son una FECHA DE CALENDARIO, no un instante:
 * FECHA_ENTREGA_PROMETIDA y similares.
 *
 * En Supabase la columna es timestamptz y se guarda siempre a medianoche UTC
 * ("2026-07-28 00:00:00+00" — verificado en la base de producción). Leído como
 * instante, en Ecuador (-05:00) eso son las 19:00 del 27: la orden de producción
 * se imprimía con la entrega corrida un día ANTES y el badge 🚨 URGENTE saltaba
 * un día antes de tiempo. Aquí se toma solo la parte YYYY-MM-DD y se construye
 * la fecha en hora local, así el 28 es el 28 en cualquier zona.
 */
export function parseFechaCalendario(input) {
  if (!input) return null
  if (input instanceof Date) return isNaN(input) ? null : input
  const m = String(input).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
  return parseFecha(input)   // formato de la hoja: "28Jul2026"
}

/**
 * Días de CALENDARIO que faltan para una fecha (negativo = atrasado, 0 = hoy).
 * null si la fecha no se puede leer.
 *
 * Reemplaza el `Math.ceil((new Date(f) - new Date()) / 86400000)` que estaba
 * copiado en varias pantallas: ese comparaba instantes, así que el resultado
 * cambiaba según la HORA a la que se abriera la pantalla, y sobre una fecha sin
 * hora ("2026-07-25") arrancaba desde medianoche UTC = un día menos en Ecuador.
 */
export function diasHastaFecha(input) {
  const d = input instanceof Date ? input : parseFecha(input)
  if (!d || isNaN(d)) return null
  const objetivo = new Date(d); objetivo.setHours(0, 0, 0, 0)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.round((objetivo - hoy) / 86400000)
}

/**
 * Días que faltan para la entrega comprometida de un pedido.
 * Atajo de diasHastaFecha(parseFechaCalendario(v)): usar SIEMPRE este para
 * FECHA_ENTREGA_PROMETIDA, para no repetir el destratamiento de zona horaria
 * en cada pantalla (era la causa del badge URGENTE un día antes de tiempo).
 */
export function diasHastaEntrega(fechaEntrega) {
  return diasHastaFecha(parseFechaCalendario(fechaEntrega))
}

/**
 * Fecha legible para humanos, relativa a hoy: "Hoy 14:33", "Ayer 09:12",
 * "18 Jul 16:40", "18 Jul 2025 16:40" (si es de otro año).
 *
 * Existe porque el badge "Ya impreso" pintaba el valor CRUDO del backend, que
 * según DATA_BACKEND es un ISO UTC de Postgres ("2026-07-21T19:33:12.000Z") o el
 * string de la hoja ("21Jul2026 14:33:00"). Ninguno de los dos se entiende de un
 * vistazo, y el ISO además muestra la hora en UTC (5h adelantada respecto a
 * Ecuador), por lo que una impresión de las 20:00 se leía como del día siguiente.
 * Al parsear a Date y formatear en hora LOCAL, ambos backends se ven igual y bien.
 */
export function formatFechaHumana(input) {
  const d = input instanceof Date ? input : parseFecha(input)
  if (!d || isNaN(d)) return ''

  const { anio, mes, dia, hora: hh, min } = partesEcuador(d)
  const hora = `${dosDigitos(hh)}:${dosDigitos(min)}`

  // "Hoy"/"Ayer" según el calendario de Ecuador, no el del dispositivo.
  const iso = `${anio}-${dosDigitos(mes + 1)}-${dosDigitos(dia)}`
  const hoy = hoyEcuador()
  if (iso === hoy) return `Hoy ${hora}`
  if (iso === isoMasDias(hoy, -1)) return `Ayer ${hora}`

  const anioTexto = String(anio) !== hoy.slice(0, 4) ? ` ${anio}` : ''
  return `${dosDigitos(dia)} ${MESES[mes]}${anioTexto} ${hora}`
}
