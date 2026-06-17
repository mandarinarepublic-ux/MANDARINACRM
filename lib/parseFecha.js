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
  if (str.includes('T') || str.match(/^\d{4}-/)) {
    const d = new Date(str)
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

/**
 * Formatea una fecha (Date o string crudo del CRM) para mostrar en listados:
 * "16 Jun · 06:13"
 */
export function formatFechaCorta(input) {
  const d = input instanceof Date ? input : parseFecha(input)
  if (!d || isNaN(d)) return ''
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = months[d.getMonth()]
  const hh  = String(d.getHours()).padStart(2, '0')
  const mm  = String(d.getMinutes()).padStart(2, '0')
  return `${dia} ${mes} · ${hh}:${mm}`
}
