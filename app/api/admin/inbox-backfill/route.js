export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ⚠️ ENDPOINT TEMPORAL DE BACKFILL DEL INBOX (Fase inbox) — BORRAR AL TERMINAR.
// Corre del lado del servidor en Vercel (usa la service account de Google + Supabase
// ya configuradas). Lee CONTACTOS + MENSAJES del spreadsheet del inbox y carga
// inbox.conversaciones + inbox.mensajes. Idempotente (upsert).
//
// Uso:  GET /api/admin/inbox-backfill?key=<CRON_SECRET>&cuenta=MANDI&sheetId=<idInbox>
//   MANDI: WhatsAppMandarinaSales   IND: WhatsAppINDLoversCHAT
//
// Requisito: el spreadsheet del inbox debe estar COMPARTIDO con el email de la
// service account (GOOGLE_SERVICE_ACCOUNT_EMAIL), igual que la hoja del CRM.

import { getSheets } from '@/lib/sheets'
import { getSupabaseInbox, supabaseConfigured } from '@/lib/supabase'

function authorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') || ''
  return url.searchParams.get('key') === secret || auth === `Bearer ${secret}`
}

const digits = (v) => (v == null ? '' : String(v).replace(/\D/g, ''))
const clean = (v) => (v == null || v === '' ? null : String(v))
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function toTs(v) {
  if (v == null || v === '') return null
  const d = new Date(String(v).trim())
  return isNaN(d) ? null : d.toISOString()
}
function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o }

// Lee una hoja como objetos {HEADER: valor}, detectando la fila de encabezado por headerKey.
async function readTab(sheets, sheetId, name, headerKey) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${name}!A:AZ` })
  const rows = res.data.values || []
  const h = rows.findIndex((r) => Array.isArray(r) && r.includes(headerKey))
  if (h < 0) return []
  const headers = rows[h]
  return rows.slice(h + 1).map((r) => { const o = {}; headers.forEach((hd, i) => { o[hd] = r[i] }); return o })
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: 'no autorizado' }, { status: 401 })
  if (!supabaseConfigured()) return Response.json({ error: 'Supabase no configurado' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const cuenta = (searchParams.get('cuenta') || '').toUpperCase()
  const sheetId = searchParams.get('sheetId')
  if (!['IND', 'MANDI'].includes(cuenta)) return Response.json({ error: 'cuenta debe ser IND|MANDI' }, { status: 400 })
  if (!sheetId) return Response.json({ error: 'falta sheetId' }, { status: 400 })

  try {
    const sheets = await getSheets()
    const sb = getSupabaseInbox()

    const contactos = await readTab(sheets, sheetId, 'CONTACTOS', 'Telefono')
    const mensajes = await readTab(sheets, sheetId, 'MENSAJES', 'ID')

    // ── conversaciones: unión de teléfonos, dedup ──
    const conv = new Map()
    for (const c of contactos) {
      const tel = digits(c.Telefono)
      if (!tel) continue
      conv.set(tel, {
        cuenta, canal: 'WA', telefono: tel, wa_id: clean(c.WA_ID),
        nombre_contacto: clean(c.Nombre), alias: clean(c.Alias), soporte: clean(c.SOPORTE),
        humano: clean(c.HUMANO), id_venta: clean(c.ID_VENTA), notas: clean(c.NOTAS),
        refuerzo1: toTs(c.REFUERZO1), refuerzo2: toTs(c.REFUERZO2), ultimo_mensaje_at: toTs(c.Ultima_Actualizacion),
      })
    }
    for (const m of mensajes) {
      const tel = digits(m.Telefono)
      if (!tel || conv.has(tel)) continue
      conv.set(tel, { cuenta, canal: 'WA', telefono: tel, nombre_contacto: clean(m.Nombre) })
    }
    const convRows = [...conv.values()]
    for (const batch of chunk(convRows, 500)) {
      const { error } = await sb.from('conversaciones').upsert(batch, { onConflict: 'cuenta,telefono' })
      if (error) throw new Error(`conversaciones: ${error.message}`)
    }

    // ── mapa telefono → conversacion_id ──
    const idByTel = new Map()
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('conversaciones').select('conversacion_id,telefono').eq('cuenta', cuenta).range(from, from + 999)
      if (error) throw new Error(`select conv: ${error.message}`)
      for (const r of data) idByTel.set(r.telefono, r.conversacion_id)
      if (data.length < 1000) break
    }

    // ── mensajes ──
    const msgRows = []
    let sinConv = 0, sinDir = 0
    for (const m of mensajes) {
      const tel = digits(m.Telefono)
      const convId = idByTel.get(tel)
      if (!convId) { sinConv++; continue }
      const du = String(m.Direccion || '').toUpperCase()
      const dir = du.startsWith('ENTR') ? 'IN' : du.startsWith('SAL') ? 'OUT' : null
      if (!dir) { sinDir++; continue }
      const id = clean(m.ID)
      const row = {
        conversacion_id: convId, cuenta, telefono: tel || null, nombre: clean(m.Nombre),
        direccion: dir, tipo: clean(m.Tipo), texto: clean(m.Contenido), media_url: clean(m.MediaURL),
        media_id: clean(m.MediaID), respuesta_ia: clean(m.Respuesta_IA), foto_ia: clean(m.Foto_IA),
        contexto_id: clean(m.Contexto_ID),
      }
      if (id && UUID_RE.test(id)) row.mensaje_id = id
      const ts = toTs(m.Fecha); if (ts) row.fecha = ts
      msgRows.push(row)
    }
    let okMsg = 0
    for (const batch of chunk(msgRows, 500)) {
      const conId = batch.filter((m) => m.mensaje_id)
      const sinId = batch.filter((m) => !m.mensaje_id)
      if (conId.length) { const { error } = await sb.from('mensajes').upsert(conId, { onConflict: 'mensaje_id' }); if (error) throw new Error(`mensajes upsert: ${error.message}`) }
      if (sinId.length) { const { error } = await sb.from('mensajes').insert(sinId); if (error) throw new Error(`mensajes insert: ${error.message}`) }
      okMsg += batch.length
    }

    return Response.json({
      ok: true, cuenta,
      contactos_leidos: contactos.length,
      conversaciones: convRows.length,
      mensajes_leidos: mensajes.length,
      mensajes_cargados: okMsg,
      saltados: { sin_conversacion: sinConv, sin_direccion: sinDir },
      at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('inbox-backfill error:', e)
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}
