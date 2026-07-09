export const dynamic = 'force-dynamic'

// Muestra el RIDE (Representación Impresa del Documento Electrónico) de una
// factura de Dátil.
//
// Dátil NO expone el PDF del RIDE por su API pública (link.datil.co): el
// documento se obtiene por GET /invoices/{id} (JSON), pero no hay endpoint
// ni URL para el PDF. Por eso este route:
//   1. Si algún día Dátil expone una URL de PDF en el documento, redirige a ella.
//   2. Si no, GENERA el RIDE a partir de los datos del comprobante (HTML
//      imprimible: el usuario lo ve y puede "Guardar como PDF" / imprimir).
//
// Requiere env var: DATIL_API_KEY (X-Key). Opcional: DATIL_API_PASSWORD.

// Busca recursivamente en el JSON una URL pública de PDF/RIDE (por si Dátil la agrega).
function buscarUrlPdf(obj, depth = 0) {
  if (obj == null || depth > 6) return null
  if (typeof obj === 'string') {
    const s = obj.trim()
    if (/^https?:\/\//i.test(s) && /(\.pdf(\?|$)|ride|printable|representacion)/i.test(s)) {
      if (!/link\.datil\.co\/invoices\/[^/]+\/ride/i.test(s)) return s
    }
    return null
  }
  if (Array.isArray(obj)) { for (const v of obj) { const r = buscarUrlPdf(v, depth + 1); if (r) return r } return null }
  if (typeof obj === 'object') { for (const v of Object.values(obj)) { const r = buscarUrlPdf(v, depth + 1); if (r) return r } }
  return null
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = (v) => `$${(parseFloat(v || 0) || 0).toFixed(2)}`

const TIPO_ID = { '04': 'RUC', '05': 'Cédula', '06': 'Pasaporte', '07': 'Consumidor final', '08': 'Id. exterior' }
const MEDIO_PAGO = {
  '01': 'Sin sistema financiero', '15': 'Compensación de deudas', '16': 'Tarjeta de débito',
  '17': 'Dinero electrónico', '18': 'Tarjeta prepago', '19': 'Tarjeta de crédito',
  '20': 'Otros', '21': 'Endoso de títulos',
}

function renderRideHtml(id, doc) {
  const em = doc.emisor || {}
  const est = em.establecimiento || {}
  const comp = doc.comprador || {}
  const tot = doc.totales || {}
  const items = Array.isArray(doc.items) ? doc.items : []
  const pagos = Array.isArray(doc.pagos) ? doc.pagos : []
  const auth = doc.autorizacion || {}

  const numero = `${est.codigo || '001'}-${est.punto_emision || '001'}-${String(doc.secuencial || '').padStart(9, '0')}`
  const numAutorizacion = auth.numero || doc.clave_acceso || ''
  const fechaAut = (auth.fecha || '').replace('T', ' ').slice(0, 19)
  const ambiente = (doc.ambiente === 2 || String(doc.ambiente) === '2') ? 'PRODUCCIÓN'
    : (doc.ambiente === 1 || String(doc.ambiente) === '1') ? 'PRUEBAS'
    : ((doc.clave_acceso || '')[23] === '2' ? 'PRODUCCIÓN' : (doc.clave_acceso || '')[23] === '1' ? 'PRUEBAS' : '—')

  const impuestos = Array.isArray(tot.impuestos) ? tot.impuestos : []
  const infoAd = doc.informacion_adicional && typeof doc.informacion_adicional === 'object' ? Object.entries(doc.informacion_adicional) : []

  const filasItems = items.map(it => `
    <tr>
      <td class="c">${esc(parseFloat(it.cantidad || 0))}</td>
      <td>${esc(it.descripcion || '')}${it.codigo_principal ? `<div class="muted">Cód: ${esc(it.codigo_principal)}</div>` : ''}</td>
      <td class="r">${money(it.precio_unitario)}</td>
      <td class="r">${money(it.descuento)}</td>
      <td class="r">${money(it.precio_total_sin_impuestos)}</td>
    </tr>`).join('')

  const filasImp = impuestos.map(im => `
    <div class="tline"><span>${esc(im.name || im.nombre || `IVA ${im.tarifa || ''}%`)}</span><span>${money(im.valor)}</span></div>`).join('')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RIDE ${esc(numero)} — ${esc(em.razon_social || '')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; background: #f3f4f6; margin: 0; padding: 16px; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 28px; }
  .top { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
  .brand h1 { font-size: 18px; margin: 0 0 4px; }
  .brand .muted, .muted { color: #666; font-size: 12px; }
  .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px 14px; }
  .doc { min-width: 260px; }
  .doc .tag { display: inline-block; background: #FF6B00; color: #fff; font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 6px; }
  .doc table { width: 100%; font-size: 12px; margin-top: 8px; }
  .doc td { padding: 2px 0; vertical-align: top; }
  .doc td:first-child { color: #666; padding-right: 8px; white-space: nowrap; }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 12px; }
  .kv .k { color: #666; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #444; margin: 22px 0 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  table.items { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.items th { background: #f3f4f6; text-align: left; padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; text-transform: uppercase; color: #555; }
  table.items td { padding: 7px 8px; border-bottom: 1px solid #f0f0f0; }
  table.items td.r, table.items th.r { text-align: right; }
  table.items td.c, table.items th.c { text-align: center; }
  .totales { margin-left: auto; width: 280px; margin-top: 12px; }
  .tline { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .tline.grand { border-top: 2px solid #333; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 16px; }
  .clave { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; word-break: break-all; background: #f8f8f8; border: 1px solid #eee; border-radius: 6px; padding: 8px; }
  .estado { display: inline-block; background: #16a34a; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .actions { max-width: 820px; margin: 0 auto 12px; display: flex; gap: 8px; }
  .btn { background: #FF6B00; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; font-weight: 600; cursor: pointer; font-size: 14px; }
  .btn.sec { background: #e5e7eb; color: #111; }
  @media (max-width: 640px) { .cols { grid-template-columns: 1fr; } .totales { width: 100%; } }
  @media print { body { background: #fff; padding: 0; } .sheet { border: 0; border-radius: 0; } .actions { display: none; } }
</style></head>
<body>
  <div class="actions">
    <button class="btn" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn sec" onclick="history.back()">← Volver</button>
  </div>
  <div class="sheet">
    <div class="top">
      <div class="brand">
        <h1>${esc(em.razon_social || em.nombre_comercial || 'Emisor')}</h1>
        ${em.nombre_comercial && em.nombre_comercial !== em.razon_social ? `<div class="muted">${esc(em.nombre_comercial)}</div>` : ''}
        <div class="muted">RUC: ${esc(em.ruc || '')}</div>
        <div class="muted">${esc(em.direccion || '')}</div>
        <div class="muted">Obligado a llevar contabilidad: ${em.obligado_contabilidad ? 'SÍ' : 'NO'}</div>
      </div>
      <div class="box doc">
        <span class="tag">FACTURA</span>
        <table>
          <tr><td>No.</td><td><b>${esc(numero)}</b></td></tr>
          <tr><td>Ambiente</td><td>${esc(ambiente)}</td></tr>
          <tr><td>Emisión</td><td>${doc.tipo_emision === 1 || String(doc.tipo_emision) === '1' ? 'NORMAL' : esc(doc.tipo_emision || 'NORMAL')}</td></tr>
          <tr><td>Fecha</td><td>${esc(doc.fecha_emision || '')}</td></tr>
          <tr><td>Estado</td><td><span class="estado">${esc(doc.estado || auth.estado || '')}</span></td></tr>
          ${fechaAut ? `<tr><td>Autorizado</td><td>${esc(fechaAut)}</td></tr>` : ''}
        </table>
      </div>
    </div>

    <h2>Clave de acceso / N.º de autorización</h2>
    <div class="clave">${esc(numAutorizacion)}</div>

    <h2>Cliente</h2>
    <div class="cols">
      <div class="kv">
        <span class="k">Razón social</span><span>${esc(comp.razon_social || '')}</span>
        <span class="k">Identificación</span><span>${esc(comp.identificacion || '')} ${comp.tipo_identificacion ? `(${esc(TIPO_ID[comp.tipo_identificacion] || comp.tipo_identificacion)})` : ''}</span>
      </div>
      <div class="kv">
        ${comp.email ? `<span class="k">Email</span><span>${esc(comp.email)}</span>` : ''}
        ${comp.telefono ? `<span class="k">Teléfono</span><span>${esc(comp.telefono)}</span>` : ''}
        ${comp.direccion ? `<span class="k">Dirección</span><span>${esc(comp.direccion)}</span>` : ''}
      </div>
    </div>

    <h2>Detalle</h2>
    <table class="items">
      <thead><tr><th class="c">Cant.</th><th>Descripción</th><th class="r">P. Unit.</th><th class="r">Desc.</th><th class="r">Total</th></tr></thead>
      <tbody>${filasItems || '<tr><td colspan="5" class="muted">Sin ítems</td></tr>'}</tbody>
    </table>

    <div class="totales">
      <div class="tline"><span>Subtotal</span><span>${money(tot.total_sin_impuestos)}</span></div>
      ${parseFloat(tot.descuento || 0) ? `<div class="tline"><span>Descuento</span><span>${money(tot.descuento)}</span></div>` : ''}
      ${filasImp}
      ${parseFloat(tot.propina || 0) ? `<div class="tline"><span>Propina</span><span>${money(tot.propina)}</span></div>` : ''}
      <div class="tline grand"><span>TOTAL</span><span>${money(tot.importe_total)}</span></div>
    </div>

    ${pagos.length ? `<h2>Formas de pago</h2>
    <div class="kv">${pagos.map(p => `<span class="k">${esc(MEDIO_PAGO[p.forma_pago] || p.medio || 'Pago')}</span><span>${money(p.total)}</span>`).join('')}</div>` : ''}

    ${infoAd.length ? `<h2>Información adicional</h2>
    <div class="kv">${infoAd.map(([k, v]) => `<span class="k">${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>` : ''}

    <p class="muted" style="margin-top:24px">Representación impresa del documento electrónico (RIDE). Documento autorizado por el SRI. Este RIDE es válido para respaldar la transacción; el documento con validez tributaria es el XML autorizado.</p>
  </div>
</body></html>`
}

export async function GET(req, { params }) {
  const { id } = params
  if (!id) return new Response('Falta el ID de la factura', { status: 400 })

  const key = process.env.DATIL_API_KEY
  if (!key) return new Response('Falta configurar DATIL_API_KEY en el servidor', { status: 500 })

  const headers = { 'X-Key': key }
  if (process.env.DATIL_API_PASSWORD) headers['X-Password'] = process.env.DATIL_API_PASSWORD
  const base = `https://link.datil.co/invoices/${encodeURIComponent(id)}`

  try {
    const docRes = await fetch(base, { headers, cache: 'no-store' })
    const docText = await docRes.text()
    let doc = null
    try { doc = JSON.parse(docText) } catch {}

    if (!doc) {
      console.log('[RIDE] id=%s docStatus=%s (no-json) %s', id, docRes.status, docText.slice(0, 300))
      return new Response(`No se pudo leer la factura en Dátil (HTTP ${docRes.status}).`, {
        status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    // 1) Si Dátil expone una URL de PDF en el documento, úsala.
    const urlPdf = doc.printable_version_url || doc.ride_url || doc.pdf_url || buscarUrlPdf(doc)
    if (urlPdf) {
      console.log('[RIDE] id=%s redirect PDF %s', id, urlPdf)
      return Response.redirect(urlPdf, 302)
    }

    // 2) Generar el RIDE a partir de los datos del comprobante.
    console.log('[RIDE] id=%s estado=%s -> RIDE generado', id, doc.estado || '?')
    const html = renderRideHtml(id, doc)
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e) {
    console.error('[RIDE] error', id, e)
    return new Response('Error al obtener la factura de Dátil: ' + e.message, { status: 502 })
  }
}
