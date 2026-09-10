// lib/db/cotizaciones.js — Repositorio de COTIZACIONES.
// Tabla NUEVA `crm.cotizaciones`, SOLO en Supabase (no hay espejo en Sheets).
// getSupabase() ya apunta al schema `crm` con service_role (ver lib/supabase.js).
// Las cotizaciones viven aparte de los pedidos y NUNCA entran a producción.

import { getSupabase } from '../supabase'
import { prefijoNumero, numeroSiguiente } from '../cotizacion.js'

// Columnas escribibles de crm.cotizaciones (whitelist: evita inyectar claves
// que solo existen en el cliente, como `id` en create o campos temporales).
const COLS = [
  'numero', 'fecha', 'tienda', 'estado',
  'cliente_nombre', 'cliente_cedula', 'cliente_tel', 'cliente_email',
  'productos',
  'descuento', 'subtotal', 'iva_monto', 'total',
  'validez_dias', 'entrega_dias', 'anticipo_pct',
  'condiciones_pago', 'tiempo_produccion', 'beneficios', 'notas',
  'created_by', 'created_by_nombre',
]

function pick(obj) {
  const out = {}
  for (const k of COLS) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

/**
 * Lista de cotizaciones. VENDEDOR ve solo las suyas (created_by); ADMIN ve todas.
 * @param {{ createdBy?:string, rol?:string }} opts
 */
export async function listCotizaciones({ createdBy, rol } = {}) {
  let q = getSupabase()
    .from('cotizaciones')
    .select('*')
    .order('created_at', { ascending: false })

  // Solo ADMIN ve todas. Cualquier otro rol (VENDEDOR, VENDEDOR_YAW) se limita a las suyas.
  if (rol !== 'ADMIN') {
    if (!createdBy) return [] // sin dueño identificado → nada
    q = q.eq('created_by', createdBy)
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

/** Una cotización por id. */
export async function getCotizacion(id) {
  const { data, error } = await getSupabase()
    .from('cotizaciones')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Los números que ya existen hoy, para calcular el siguiente.
 *
 * Acotada por el prefijo del día: nunca son más que las cotizaciones de UNA
 * jornada. El `limit` es por el tope de 1000 de PostgREST (ver
 * tests/lecturas-acotadas.test.js), no porque se espere llegar ahí.
 */
async function numerosDelDia(prefijo) {
  const { data, error } = await getSupabase()
    .from('cotizaciones')
    .select('numero')
    .like('numero', `${prefijo}%`)
    .limit(1000)
  if (error) throw error
  return (data || []).map((r) => r.numero)
}

/** Postgres: violación de índice único. */
const UNIQUE_VIOLATION = '23505'

/** Cuántas veces se vuelve a intentar si otro vendedor tomó el número primero. */
const INTENTOS_NUMERO = 5

/**
 * Crea una cotización. Devuelve la fila creada (con id y número).
 *
 * ⚠️ EL NÚMERO LO PONE ESTA FUNCIÓN, y pisa el que venga en `data`. Antes lo
 * inventaba el navegador con `Math.random()` y se guardaba tal cual: con quince
 * cotizaciones en un día había un 10% de que dos llevaran el mismo, y ni el
 * cliente ni la base lo impedían.
 *
 * Es secuencial por día: se leen los números de hoy, se toma el siguiente y se
 * inserta. Entre leer e insertar puede meterse otro vendedor con el mismo
 * siguiente — es una ventana de milisegundos, pero existe—, y para eso está el
 * índice ÚNICO `cotizaciones_numero_unico`: el segundo insert falla con 23505 y
 * acá se vuelve a leer y a intentar. Sin ese índice este bucle sería teatro.
 */
export async function createCotizacion(data) {
  const prefijo = prefijoNumero()
  let ultimoError = null

  for (let intento = 0; intento < INTENTOS_NUMERO; intento++) {
    const numero = numeroSiguiente(prefijo, await numerosDelDia(prefijo))
    const { data: row, error } = await getSupabase()
      .from('cotizaciones')
      .insert({ ...pick(data), numero })
      .select('*')
      .single()
    if (!error) return row
    if (error.code !== UNIQUE_VIOLATION) throw error
    ultimoError = error   // otro tomó ese número entre leer e insertar: de nuevo
  }

  console.error('createCotizacion: sin número libre tras varios intentos:', ultimoError?.message)
  throw new Error('No se pudo asignar un número de cotización, vuelve a intentar')
}

/** Actualiza una cotización por id. Devuelve la fila actualizada. */
export async function updateCotizacion(id, patch) {
  const { data: row, error } = await getSupabase()
    .from('cotizaciones')
    .update(pick(patch))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return row
}
