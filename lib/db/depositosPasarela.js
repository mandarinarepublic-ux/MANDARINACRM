// lib/db/depositosPasarela.js — Depósitos de una pasarela al banco, anotados a mano (19-nov-2026).
// Payphone no informa sus depósitos por API: el ADMIN los anota en el Reporte de pagos.
// Tabla crm.depositos_pasarela (docs/sql/2026-11-19-depositos-pasarela.sql). Borrado lógico.
import { getSupabase } from '../supabase'

const COLS = 'id,creado_en,proveedor,fecha,monto,nota,creado_por_nombre'

/** Los depósitos vigentes de una pasarela, del más nuevo al más viejo. */
export async function listarDepositos(proveedor = 'PAYPHONE') {
  const { data, error } = await getSupabase().from('depositos_pasarela')
    .select(COLS).eq('proveedor', proveedor).eq('eliminado', false)
    .order('fecha', { ascending: false }).order('id', { ascending: false })
    .range(0, 999)
  if (error) throw new Error(error.message)
  return (data || []).map((d) => ({ ...d, monto: Number(d.monto) }))
}

export async function crearDeposito({ proveedor = 'PAYPHONE', fecha, monto, nota, usuarioId, usuarioNombre }) {
  const { data, error } = await getSupabase().from('depositos_pasarela')
    .insert({ proveedor, fecha, monto, nota: nota || null, creado_por: usuarioId || null, creado_por_nombre: usuarioNombre || null })
    .select(COLS).single()
  if (error) throw new Error(error.message)
  return { ...data, monto: Number(data.monto) }
}

/** Borrado lógico. Devuelve true si había algo que borrar. */
export async function borrarDeposito(id, usuarioId) {
  const { data, error } = await getSupabase().from('depositos_pasarela')
    .update({ eliminado: true, eliminado_en: new Date().toISOString(), eliminado_por: usuarioId || null })
    .eq('id', id).eq('eliminado', false).select('id')
  if (error) throw new Error(error.message)
  return (data || []).length > 0
}
