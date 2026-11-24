// lib/db/caja.js — Repositorio de la caja de la tienda (cierre diario de efectivo, 23-nov-2026).
// Tablas: crm.cajas, cierres_caja, cierre_pagos, movimientos_caja, verificaciones_banco
// (docs/sql/2026-11-23-caja-tienda.sql). Montos: numeric(10,2) en la base, Number en dólares aquí.
// Las reglas de cuenta viven en lib/caja.js (centavos); este archivo solo lee y escribe.
import { getSupabase } from '../supabase.js'
import { aDolares, seleccionarCobros } from '../caja.js'
import { leerTodo } from '../leerTodo.js'

const COLS_CAJA = 'id,nombre,responsable_usuario_id,fondo_fijo,tolerancia,activa,inicio,creado_en'
const COLS_CIERRE = 'id,caja_id,tipo,estado,apertura,cobros_efectivo,salidas,esperado,contado,diferencia,motivo,contado_en,cerrado_en,firmado_por,firmado_por_nombre,reabierto_por,reabierto_en'
const COLS_MOV = 'id,caja_id,cierre_id,tipo,monto,motivo,foto_url,creado_por,creado_por_nombre,creado_en,confirmacion,monto_confirmado,confirmado_por,confirmado_en,anulado,anulado_por,anulado_en'
const COLS_PAGO = 'pago_id,pedido_id,tipo,monto,fecha,estado,foto_comprobante_url,vendedor_id,notas'

const LOTE_IN = 200

const num = (v) => (v == null ? v : Number(v))
const ahora = () => new Date().toISOString()
const falla = (error) => { if (error) throw new Error(error.message) }
const conStatus = (mensaje, status) => Object.assign(new Error(mensaje), { status })

const cajaOut = (c) => (c ? { ...c, fondo_fijo: num(c.fondo_fijo), tolerancia: num(c.tolerancia) } : null)
const movOut = (m) => (m ? { ...m, monto: num(m.monto), monto_confirmado: num(m.monto_confirmado) } : null)
const pagoOut = (p) => ({ ...p, monto: num(p.monto) })
const cierreBase = (c) => ({
  ...c,
  apertura: num(c.apertura), cobros_efectivo: num(c.cobros_efectivo), salidas: num(c.salidas),
  esperado: num(c.esperado), contado: num(c.contado), diferencia: num(c.diferencia),
})

function trozos(lista, n = LOTE_IN) {
  const r = []
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n))
  return r
}

/** `.in()` en lotes para no pasarse del largo de la URL. */
async function leerPorIds(tabla, cols, columna, ids, extra) {
  const todo = []
  for (const lote of trozos([...new Set(ids)])) {
    let q = getSupabase().from(tabla).select(cols).in(columna, lote)
    if (extra) q = extra(q)
    const { data, error } = await q
    falla(error)
    todo.push(...(data || []))
  }
  return todo
}

// ─── CAJAS ───────────────────────────────────────────────────────────────────

export async function cajaDeResponsable(usuarioId) {
  const { data, error } = await getSupabase().from('cajas').select(COLS_CAJA)
    .eq('responsable_usuario_id', usuarioId).eq('activa', true).order('id').limit(1)
  falla(error)
  return cajaOut((data || [])[0] || null)
}

export async function cajaPorId(id) {
  const { data, error } = await getSupabase().from('cajas').select(COLS_CAJA).eq('id', id).maybeSingle()
  falla(error)
  return cajaOut(data)
}

export async function listarCajas() {
  const { data, error } = await getSupabase().from('cajas').select(COLS_CAJA).order('id').limit(100)
  falla(error)
  return (data || []).map(cajaOut)
}

export async function actualizarCaja(id, { fondo_fijo, tolerancia } = {}) {
  const cambios = {}
  if (fondo_fijo !== undefined) cambios.fondo_fijo = fondo_fijo
  if (tolerancia !== undefined) cambios.tolerancia = tolerancia
  if (!Object.keys(cambios).length) {
    const c = await cajaPorId(id)
    if (!c) throw conStatus('Caja no encontrada', 404)
    return c
  }
  const { data, error } = await getSupabase().from('cajas').update(cambios).eq('id', id).select(COLS_CAJA)
  falla(error)
  if (!data || !data.length) throw conStatus('Caja no encontrada', 404)
  return cajaOut(data[0])
}

// ─── CIERRES ─────────────────────────────────────────────────────────────────

/** Agrega a cada cierre sus pagos, salidas y su sobre/depósito (consultas en lote). */
async function conHijos(cierres) {
  if (!cierres.length) return []
  const ids = cierres.map((c) => c.id)
  const pagos = await leerPorIds('cierre_pagos', 'cierre_id,pago_id,pedido_id,monto', 'cierre_id', ids)
  const movs = await leerPorIds('movimientos_caja', COLS_MOV, 'cierre_id', ids, (q) => q.eq('anulado', false).order('id'))
  return cierres.map((c) => {
    const ms = movs.filter((m) => m.cierre_id === c.id).map(movOut)
    return {
      ...cierreBase(c),
      pagos: pagos.filter((p) => p.cierre_id === c.id).map((p) => ({ pago_id: p.pago_id, pedido_id: p.pedido_id, monto: num(p.monto) })),
      salidas: ms.filter((m) => m.tipo === 'SALIDA'),
      salida: ms.find((m) => m.tipo === 'SOBRE' || m.tipo === 'DEPOSITO') || null,
    }
  })
}

async function cierresDe(cajaId, estado, limite) {
  const { data, error } = await getSupabase().from('cierres_caja').select(COLS_CIERRE)
    .eq('caja_id', cajaId).eq('estado', estado)
    .order('contado_en', { ascending: false }).order('id', { ascending: false }).limit(limite)
  falla(error)
  return conHijos(data || [])
}

export async function cierreAbierto(cajaId) {
  return (await cierresDe(cajaId, 'CONTADO', 1))[0] || null
}

export async function ultimoCierreCerrado(cajaId) {
  return (await cierresDe(cajaId, 'CERRADO', 1))[0] || null
}

/** Del más nuevo al más viejo, sin REABIERTO. */
export async function listarCierres(cajaId, { limite = 60 } = {}) {
  const { data, error } = await getSupabase().from('cierres_caja').select(COLS_CIERRE)
    .eq('caja_id', cajaId).neq('estado', 'REABIERTO')
    .order('contado_en', { ascending: false }).order('id', { ascending: false }).limit(limite)
  falla(error)
  return conHijos(data || [])
}

/** El SOBRE/DEPOSITO vigente de un cierre, o null. */
export async function salidaDeCierre(cierreId) {
  const { data, error } = await getSupabase().from('movimientos_caja').select(COLS_MOV)
    .eq('cierre_id', cierreId).in('tipo', ['SOBRE', 'DEPOSITO']).eq('anulado', false)
    .order('id', { ascending: false }).limit(1)
  falla(error)
  return movOut((data || [])[0] || null)
}

// ─── COBROS Y TRANSFERENCIAS ─────────────────────────────────────────────────

/** pago_id de cierres vigentes (no REABIERTO) de la caja. */
async function pagosEnCierres(cajaId) {
  const { data: cierres, error } = await getSupabase().from('cierres_caja').select('id')
    .eq('caja_id', cajaId).neq('estado', 'REABIERTO')
  falla(error)
  const filas = await leerPorIds('cierre_pagos', 'pago_id', 'cierre_id', (cierres || []).map((c) => c.id))
  return new Set(filas.map((f) => f.pago_id))
}

/** Pagos de un tipo, de la responsable, desde el inicio de la caja. Sin inicio no hay nada. */
async function pagosDesdeInicio(caja, tipo) {
  if (!caja || !caja.inicio) return []
  const filas = await leerTodo(() => getSupabase().from('pagos').select(COLS_PAGO)
    .eq('tipo', tipo).eq('estado', 'PAGADO').eq('vendedor_id', caja.responsable_usuario_id)
    .gte('fecha', caja.inicio).order('fecha', { ascending: true }).order('pago_id', { ascending: true }))
  return filas
}

export async function cobrosPendientes(caja) {
  if (!caja || !caja.inicio) return []
  const [pagos, yaEnCierre] = await Promise.all([pagosDesdeInicio(caja, 'EFECTIVO'), pagosEnCierres(caja.id)])
  return seleccionarCobros(pagos, { responsableId: caja.responsable_usuario_id, inicioIso: caja.inicio, yaEnCierre }).map(pagoOut)
}

async function verificacionesDe(pagoIds, resultado) {
  return leerPorIds('verificaciones_banco', 'pago_id,resultado,verificado_por,verificado_por_nombre,verificado_en', 'pago_id', pagoIds,
    resultado ? (q) => q.eq('resultado', resultado) : null)
}

async function transferenciasSinVerificar(caja) {
  const pagos = await pagosDesdeInicio(caja, 'TRANSFERENCIA')
  if (!pagos.length) return []
  const verificados = new Set((await verificacionesDe(pagos.map((p) => p.pago_id))).map((v) => v.pago_id))
  return pagos.filter((p) => !verificados.has(p.pago_id)).map(pagoOut)
}

/** Transferencias que la admin marcó «no llegó» (desde el inicio de la caja). */
export async function transferenciasNoLlegaron(caja) {
  if (!caja || !caja.inicio) return []
  const ver = await leerTodo(() => getSupabase().from('verificaciones_banco').select('pago_id').eq('resultado', 'NO_LLEGO').order('pago_id'))
  if (!ver.length) return []
  const pagos = await leerPorIds('pagos', COLS_PAGO, 'pago_id', ver.map((v) => v.pago_id),
    (q) => q.eq('tipo', 'TRANSFERENCIA').eq('vendedor_id', caja.responsable_usuario_id).gte('fecha', caja.inicio))
  return pagos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).map(pagoOut)
}

// ─── MOVIMIENTOS ─────────────────────────────────────────────────────────────

/** Movimientos de un tipo (SALIDA o REPOSICION) que aún no están en un cierre. */
export async function movimientosSinCierre(cajaId, tipo) {
  const { data, error } = await getSupabase().from('movimientos_caja').select(COLS_MOV)
    .eq('caja_id', cajaId).eq('tipo', tipo).is('cierre_id', null).eq('anulado', false)
    .order('creado_en', { ascending: true }).order('id', { ascending: true })
  falla(error)
  return (data || []).map(movOut)
}

export async function crearMovimiento({ cajaId, tipo, montoC, motivo, fotoUrl, usuario }) {
  const { data, error } = await getSupabase().from('movimientos_caja').insert({
    caja_id: cajaId, tipo, monto: aDolares(montoC), motivo: motivo || null, foto_url: fotoUrl || null,
    creado_por: usuario?.id || null, creado_por_nombre: usuario?.nombre || null,
  }).select(COLS_MOV).single()
  falla(error)
  return movOut(data)
}

/** Solo si el movimiento es de su caja y todavía no tiene foto. */
export async function ponerFotoMovimiento(movId, fotoUrl, usuarioId) {
  const caja = await cajaDeResponsable(usuarioId)
  if (!caja) throw conStatus('No tienes una caja asignada', 403)
  const { data, error } = await getSupabase().from('movimientos_caja').update({ foto_url: fotoUrl })
    .eq('id', movId).eq('caja_id', caja.id).is('foto_url', null).select(COLS_MOV)
  falla(error)
  if (!data || !data.length) throw conStatus('El movimiento no existe, no es de tu caja o ya tiene foto', 409)
  return movOut(data[0])
}

/** Sobres/depósitos sin confirmar y transferencias sin verificar. */
export async function porConfirmar(caja) {
  const { data, error } = await getSupabase().from('movimientos_caja').select(COLS_MOV)
    .eq('caja_id', caja.id).in('tipo', ['SOBRE', 'DEPOSITO']).eq('confirmacion', 'PENDIENTE').eq('anulado', false)
    .order('creado_en', { ascending: true }).order('id', { ascending: true })
  falla(error)
  return { movimientos: (data || []).map(movOut), transferencias: await transferenciasSinVerificar(caja) }
}

export async function confirmarMovimiento(movId, { resultado, montoRealC, admin }) {
  if (resultado !== 'OK' && resultado !== 'NO_CUADRA') throw conStatus('Resultado no válido', 400)
  const sb = getSupabase()
  const { data: previo, error: e1 } = await sb.from('movimientos_caja').select(COLS_MOV).eq('id', movId).maybeSingle()
  falla(e1)
  if (!previo || previo.anulado) throw conStatus('Movimiento no encontrado', 404)
  const confirmado = resultado === 'OK' ? previo.monto : (montoRealC != null ? aDolares(montoRealC) : null)
  const { data, error } = await sb.from('movimientos_caja').update({
    confirmacion: resultado, monto_confirmado: confirmado,
    confirmado_por: admin?.id || null, confirmado_en: ahora(),
  }).eq('id', movId).eq('confirmacion', 'PENDIENTE').eq('anulado', false).select(COLS_MOV)
  falla(error)
  if (!data || !data.length) throw conStatus('Este movimiento ya fue confirmado', 409)
  return movOut(data[0])
}

export async function verificarTransferencia(pagoId, { resultado, admin }) {
  if (resultado !== 'LLEGO' && resultado !== 'NO_LLEGO') throw conStatus('Resultado no válido', 400)
  const { data, error } = await getSupabase().from('verificaciones_banco').upsert({
    pago_id: pagoId, resultado, verificado_por: admin?.id || null,
    verificado_por_nombre: admin?.nombre || null, verificado_en: ahora(),
  }, { onConflict: 'pago_id' }).select('pago_id,resultado,verificado_por,verificado_por_nombre,verificado_en').single()
  falla(error)
  return data
}

// ─── CREAR / CERRAR / REABRIR ────────────────────────────────────────────────

/**
 * Guarda el conteo. `calc` es la salida de calcularCierre (centavos); `cobros` son filas de pago;
 * `salidas` y las REPOSICION sin cierre quedan amarradas a este cierre. Si falla un paso, se deshace lo de este request.
 */
export async function crearCierreContado({ caja, tipo, aperturaC, cobros = [], salidas = [], contadoC, calc = {}, usuario }) {
  const sb = getSupabase()
  const dol = (c) => (c == null ? null : aDolares(c))
  const esArranque = tipo === 'ARRANQUE'
  const { data, error } = await sb.from('cierres_caja').insert({
    caja_id: caja.id, tipo, estado: 'CONTADO',
    apertura: esArranque ? null : dol(aperturaC),
    cobros_efectivo: dol(calc.cobrosEfectivoC), salidas: dol(calc.salidasC),
    esperado: dol(calc.esperadoC), contado: dol(contadoC), diferencia: dol(calc.diferenciaC),
    firmado_por: null, firmado_por_nombre: null,
  }).select(COLS_CIERRE).single()
  if (error) {
    if (error.code === '23505') throw conStatus('Ya hay un conteo guardado sin cerrar', 409)
    throw new Error(error.message)
  }
  const cierreId = data.id
  const deshacer = async () => {
    try {
      await sb.from('movimientos_caja').update({ cierre_id: null }).eq('cierre_id', cierreId).in('tipo', ['SALIDA', 'REPOSICION'])
      await sb.from('cierre_pagos').delete().eq('cierre_id', cierreId)
      await sb.from('cierres_caja').delete().eq('id', cierreId)
    } catch { /* mejor esfuerzo */ }
  }
  try {
    if (cobros.length) {
      const filas = cobros.map((p) => ({ cierre_id: cierreId, pago_id: p.pago_id, pedido_id: p.pedido_id ?? null, monto: num(p.monto) }))
      for (const lote of trozos(filas)) {
        const { error: e } = await sb.from('cierre_pagos').insert(lote)
        falla(e)
      }
    }
    const reposiciones = await movimientosSinCierre(caja.id, 'REPOSICION')
    const ids = [...salidas.map((s) => s.id), ...reposiciones.map((r) => r.id)]
    for (const lote of trozos(ids)) {
      const { error: e } = await sb.from('movimientos_caja').update({ cierre_id: cierreId }).in('id', lote)
      falla(e)
    }
  } catch (err) {
    await deshacer()
    throw err
  }
  return (await conHijos([data]))[0]
}

/** Firma el cierre (solo si está CONTADO) y crea el sobre/depósito si lo hay. */
export async function cerrarCierre(cierreId, { motivo, salida, usuario } = {}) {
  const sb = getSupabase()
  const { data: previo, error: e0 } = await sb.from('cierres_caja').select(COLS_CIERRE).eq('id', cierreId).maybeSingle()
  falla(e0)
  if (!previo) throw conStatus('Cierre no encontrado', 404)
  if (previo.estado !== 'CONTADO') throw conStatus('Este cierre ya está cerrado', 409)

  let mov = null
  if (salida && salida.montoC > 0) {
    const { data, error } = await sb.from('movimientos_caja').insert({
      caja_id: previo.caja_id, cierre_id: cierreId, tipo: salida.tipo, monto: aDolares(salida.montoC),
      foto_url: salida.fotoUrl || null, creado_por: usuario?.id || null, creado_por_nombre: usuario?.nombre || null,
    }).select(COLS_MOV).single()
    falla(error)
    mov = data
  }
  const cerradoEn = ahora()
  const { data: filas, error } = await sb.from('cierres_caja').update({
    estado: 'CERRADO', motivo: motivo || null, cerrado_en: cerradoEn,
    firmado_por: usuario?.id || null, firmado_por_nombre: usuario?.nombre || null,
  }).eq('id', cierreId).eq('estado', 'CONTADO').select(COLS_CIERRE)
  if (error || !filas || !filas.length) {
    if (mov) await sb.from('movimientos_caja').delete().eq('id', mov.id).then(() => {}, () => {})
    falla(error)
    throw conStatus('Este cierre ya está cerrado', 409)
  }
  const cierre = filas[0]
  if (cierre.tipo === 'ARRANQUE') {
    const { error: e } = await sb.from('cajas').update({ inicio: cierre.contado_en }).eq('id', cierre.caja_id)
    if (e) {
      // sin inicio la caja no arranca: volver el cierre a CONTADO y quitar el movimiento
      try {
        await sb.from('cierres_caja').update({ estado: 'CONTADO', cerrado_en: null, firmado_por: null, firmado_por_nombre: null, motivo: previo.motivo }).eq('id', cierreId)
        if (mov) await sb.from('movimientos_caja').delete().eq('id', mov.id)
      } catch { /* mejor esfuerzo */ }
      throw new Error(e.message)
    }
  }
  return (await conHijos([cierre]))[0]
}

/**
 * Reabre un cierre: pasa a REABIERTO, suelta salidas y reposiciones, anula el sobre/depósito pendiente.
 * cierre_pagos se conserva (queda fuera por el estado). Falla con 409 si el sobre/depósito ya fue confirmado.
 */
export async function reabrirCierre(cierreId, admin) {
  const sb = getSupabase()
  const { data: previo, error: e0 } = await sb.from('cierres_caja').select(COLS_CIERRE).eq('id', cierreId).maybeSingle()
  falla(e0)
  if (!previo) throw conStatus('Cierre no encontrado', 404)
  if (previo.estado === 'REABIERTO') throw conStatus('Este cierre ya está reabierto', 409)

  const salida = await salidaDeCierre(cierreId)
  if (salida && salida.confirmacion !== 'PENDIENTE') throw conStatus('El sobre/depósito ya fue confirmado', 409)

  if (salida) {
    const { error } = await sb.from('movimientos_caja').update({ anulado: true, anulado_por: admin?.id || null, anulado_en: ahora() })
      .eq('id', salida.id).eq('confirmacion', 'PENDIENTE')
    falla(error)
  }
  const deshacerAnulado = async () => {
    if (salida) await sb.from('movimientos_caja').update({ anulado: false, anulado_por: null, anulado_en: null }).eq('id', salida.id).then(() => {}, () => {})
  }
  const { data, error } = await sb.from('cierres_caja').update({
    estado: 'REABIERTO', reabierto_por: admin?.id || null, reabierto_en: ahora(),
  }).eq('id', cierreId).neq('estado', 'REABIERTO').select(COLS_CIERRE)
  if (error || !data || !data.length) {
    await deshacerAnulado()
    falla(error)
    throw conStatus('Este cierre ya está reabierto', 409)
  }
  const { error: e2 } = await sb.from('movimientos_caja').update({ cierre_id: null })
    .eq('cierre_id', cierreId).in('tipo', ['SALIDA', 'REPOSICION'])
  let e3 = null
  if (!e2 && previo.tipo === 'ARRANQUE') {
    // el próximo conteo vuelve a ser ARRANQUE
    ;({ error: e3 } = await sb.from('cajas').update({ inicio: null }).eq('id', previo.caja_id))
  }
  if (e2 || e3) {
    try {
      await sb.from('cierres_caja').update({ estado: previo.estado, reabierto_por: null, reabierto_en: null }).eq('id', cierreId)
      await deshacerAnulado()
    } catch { /* mejor esfuerzo */ }
    throw new Error((e2 || e3).message)
  }
  return cierreBase(data[0])
}

/** Pagos de los últimos cierres firmados y cómo están hoy, para detectar ediciones o borrados (pagosCambiados). */
export async function snapshotYActuales(cajaId, { limite = 60 } = {}) {
  const { data, error } = await getSupabase().from('cierres_caja').select('id')
    .eq('caja_id', cajaId).eq('estado', 'CERRADO')
    .order('contado_en', { ascending: false }).order('id', { ascending: false }).limit(limite)
  falla(error)
  const filas = await leerPorIds('cierre_pagos', 'cierre_id,pago_id,monto', 'cierre_id', (data || []).map((c) => c.id))
  const snapshot = filas.map((f) => ({ cierre_id: f.cierre_id, pago_id: f.pago_id, monto: num(f.monto) }))
  const pagos = await leerPorIds('pagos', 'pago_id,tipo,estado,monto', 'pago_id', snapshot.map((s) => s.pago_id))
  return { snapshot, actuales: new Map(pagos.map((p) => [p.pago_id, { ...p, monto: num(p.monto) }])) }
}
