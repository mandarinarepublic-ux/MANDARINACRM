// lib/dlocal.js — Lectura de dLocal Go para el reporte de links de pago (13-nov-2026).
//
// El CRM NO crea links de dLocal (eso lo hacen los inbox): solo LEE los pagos y
// los retiros para el reporte /dashboard/reporte-pagos.
//
// Doc: https://docs.dlocalgo.com/integration-api/welcome-to-dlocal-go-api
//   GET /v1/payments?start_date&end_date&page&size   (size máx 20, page desde 0)
//   GET /v1/settlements?from&to&page&size            (size máx 10)
//
// Credenciales SOLO por env (las MISMAS del inbox de Mandarina: la cuenta dLocal
// es una sola para las dos tiendas):
//   DLOCAL_API_KEY, DLOCAL_SECRET  → auth "Bearer <key>:<secret>"

const limpiar = (s) => String(s || '').replace(/[^\x21-\x7E]/g, '')
const API = 'https://api.dlocalgo.com/v1'

// Tope de páginas por consulta: 50 × 20 = 1000 pagos. Hoy hay ~130 en total.
// Si se llega al tope, se avisa (truncado) en vez de cortar callado.
const MAX_PAGINAS = 50

export function dlocalConfigurado() {
  return Boolean(limpiar(process.env.DLOCAL_API_KEY) && limpiar(process.env.DLOCAL_SECRET))
}

async function get(ruta) {
  const key = limpiar(process.env.DLOCAL_API_KEY)
  const secret = limpiar(process.env.DLOCAL_SECRET)
  if (!key || !secret) throw new Error('Faltan DLOCAL_API_KEY / DLOCAL_SECRET en el CRM')
  const res = await fetch(`${API}${ruta}`, {
    headers: { Authorization: `Bearer ${key}:${secret}` },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`dLocal HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

async function paginado(base, size) {
  const items = []
  let truncado = false
  for (let page = 0; page < MAX_PAGINAS; page++) {
    const sep = base.includes('?') ? '&' : '?'
    const d = await get(`${base}${sep}page=${page}&size=${size}`)
    const lote = Array.isArray(d?.data) ? d.data : []
    items.push(...lote)
    const totalPaginas = Number(d?.totalPages)
    if (!lote.length || (Number.isFinite(totalPaginas) && page + 1 >= totalPaginas)) return { items, truncado }
    if (page + 1 === MAX_PAGINAS) truncado = true
  }
  return { items, truncado }
}

/** Pagos creados entre dos fechas 'YYYY-MM-DD' (incluidas). */
export function listarPagosDlocal(desde, hasta) {
  return paginado(`/payments?start_date=${desde}&end_date=${hasta}`, 20)
}

/** Retiros (settlements) entre dos fechas 'YYYY-MM-DD'. */
export function listarRetirosDlocal(desde, hasta) {
  return paginado(`/settlements?from=${desde}&to=${hasta}`, 10)
}
