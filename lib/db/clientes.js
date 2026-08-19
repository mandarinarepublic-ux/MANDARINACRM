// lib/db/clientes.js
// Repositorio de CLIENTES. Expone las MISMAS operaciones que hoy usan las rutas
// (app/api/clientes/route.js, app/api/clientes/[id]/route.js y el upsert por
// cédula de app/api/pedidos/route.js), detrás del switch DATA_BACKEND.
//
// LECTURAS via `read`; ESCRITURAS via `write` (dual-write).
//  - Sheets:   comportamiento actual con helpers de '../sheets'.
//  - Supabase: getSupabase() (schema `crm`), tabla `clientes`
//              (PK `cliente_id` uuid).
//
// ☠️ `cedula` NO es unique — solo tiene `clientes_cedula_idx`, un btree normal.
// Este encabezado decía lo contrario y era falso; ver `findClienteByCedula`.

import { v4 as uuid } from 'uuid';
import { readSheet, appendRow, findRow, updateCell, fechaAhora } from '../sheets';
import { getSupabase } from '../supabase';
import { read, write } from './_backend';
import { normalizarBusqueda } from '../normalizar-busqueda.js';

// Columnas de la hoja CLIENTES (orden del appendRow):
// A CLIENTE_ID · B NOMBRE · C CEDULA · D CELULAR · E EMAIL · F CIUDAD
// G DIRECCION · H FECHA_REGISTRO
const COL = { nombre: 'B', cedula: 'C', celular: 'D', email: 'E', ciudad: 'F', direccion: 'G' };

/** Normaliza una fila (venga de Sheets o de Supabase) al shape UPPERCASE que usa la UI. */
function toCliente(c) {
  if (!c) return null;
  return {
    CLIENTE_ID:     c.CLIENTE_ID     ?? c.cliente_id,
    NOMBRE:         c.NOMBRE         ?? c.nombre,
    CEDULA:         c.CEDULA         ?? c.cedula,
    CELULAR:        c.CELULAR        ?? c.celular,
    EMAIL:          c.EMAIL          ?? c.email,
    CIUDAD:         c.CIUDAD         ?? c.ciudad,
    DIRECCION:      c.DIRECCION      ?? c.direccion,
    FECHA_REGISTRO: c.FECHA_REGISTRO ?? c.fecha_registro,
  };
}

// ─── LECTURAS ────────────────────────────────────────────────────────────────

/**
 * Busca clientes por nombre, cédula o celular. Devuelve como mucho `limite`.
 *
 * ☠️ ANTES traía la tabla ENTERA y filtraba en memoria. Dos cosas malas: a
 * partir de 1000 filas PostgREST corta en silencio y un cliente que existe se
 * ve como nuevo; y `.toLowerCase()` no quita tildes, así que buscar "maria"
 * devolvía 23 de las 50 Marías reales — 27 invisibles.
 *
 * Ahora filtra en la base contra `busqueda`, la columna generada que ya viene
 * sin tildes y con cédula y celular reducidos a dígitos.
 */
export async function searchClientes(q, limite = 10) {
  const term = normalizarBusqueda(q);
  const tope = Math.max(1, Math.min(Number(limite) || 10, 50));

  const filtra = (lista) => {
    if (!term) return lista;
    return lista.filter((c) =>
      normalizarBusqueda(c.NOMBRE).includes(term) ||
      normalizarBusqueda(c.CEDULA).includes(term) ||
      normalizarBusqueda(c.CELULAR).includes(term)
    );
  };

  return read({
    sheets: async () => filtra((await readSheet('CLIENTES')).map(toCliente)).slice(0, tope),
    supabase: async () => {
      // El `.limit()` va desde el principio, no al final: si se aplicara
      // después, bastaría con olvidarlo en una rama para volver a traer la
      // tabla entera. Sin término esto NO es "todos": son los primeros `tope`.
      let consulta = getSupabase().from('clientes').select('*').order('nombre').limit(tope);
      if (term) consulta = consulta.like('busqueda', `%${term}%`);
      const { data, error } = await consulta;
      if (error) throw error;
      return (data || []).map(toCliente);
    },
  });
}

/**
 * Los clientes de una lista concreta de ids. Para Impresión, que necesita los
 * datos de los pedidos que tiene en pantalla y antes pedía los 900 con `?all=1`.
 *
 * ⚠️ Se pide de 200 en 200: la lista viaja en la URL y `.in()` con cientos de
 * ids la vuelve gigante. Nunca puede acercarse a las 1000 filas de PostgREST.
 */
export async function listClientesPorIds(ids) {
  const limpios = [...new Set((Array.isArray(ids) ? ids : []).map((i) => String(i || '').trim()).filter(Boolean))];
  if (limpios.length === 0) return [];

  const pedidos = new Set(limpios);

  return read({
    // En Sheets no hay `in`: se lee la hoja y se filtra, que es lo que hacía la
    // pantalla igualmente. Se respeta el backend para no dejar un camino roto
    // si algún día se vuelve al respaldo.
    sheets: async () => (await readSheet('CLIENTES')).map(toCliente)
      .filter((c) => c && pedidos.has(String(c.CLIENTE_ID))),
    supabase: async () => {
      const TANDA = 200;
      const salida = [];
      for (let i = 0; i < limpios.length; i += TANDA) {
        const tanda = limpios.slice(i, i + TANDA);
        const { data, error } = await getSupabase().from('clientes').select('*').in('cliente_id', tanda);
        if (error) throw error;
        salida.push(...(data || []).map(toCliente));
      }
      return salida;
    },
  });
}

// Acá vivían `listClientesSupabase()` y `listClientes()`: "TODOS los clientes,
// la ruta aplica filtros/slices". Ese "la ruta recorta DESPUÉS" era el problema
// entero — las 900 filas ya habían viajado, y a partir de 1000 PostgREST corta
// en silencio y el recorte se hace sobre una lista incompleta.
//
// Se borran, no se arreglan: no las llamaba nadie más y dejarlas ahí es dejar
// la trampa lista para el próximo que necesite "la lista de clientes".
// Para eso están `searchClientes(q, tope)` y `listClientesPorIds(ids)`.

/** Un cliente por su CLIENTE_ID, o null. */
export async function getClienteById(id) {
  return read({
    sheets: async () => {
      const rows = await readSheet('CLIENTES');
      return toCliente(rows.find((c) => c.CLIENTE_ID === id) || null);
    },
    supabase: async () => {
      const { data, error } = await getSupabase()
        .from('clientes')
        .select('*')
        .eq('cliente_id', id)
        .maybeSingle();
      if (error) throw error;
      return toCliente(data);
    },
  });
}

/**
 * Un cliente por su CEDULA, o null.
 *
 * ☠️ NO usa `.maybeSingle()`. `crm.clientes.cedula` NO tiene índice único —solo
 * un btree normal (`clientes_cedula_idx`)— y `.maybeSingle()` DEVUELVE ERROR
 * cuando encuentra más de una fila. Como de acá cuelga `upsertClienteByCedula`,
 * que es lo primero que hace `POST /api/pedidos`, una cédula repetida no daba un
 * dato raro: **tumbaba la creación del pedido entera**.
 *
 * La migración de Sheets del 12-jun-2026 dejó 20 filas así (limpiadas el
 * 19-ago, respaldo en `crm.respaldo_clientes_dup_20260819`). Ninguna de esas
 * personas llegó a pedir, y por eso nunca explotó — pura suerte.
 *
 * Con `.limit(1)` y un orden estable, una cédula repetida devuelve SIEMPRE la
 * misma ficha (la más antigua) en vez de reventar. Vender vale más que tener
 * razón sobre lo limpios que están los datos.
 */
export async function findClienteByCedula(cedula) {
  const ced = String(cedula ?? '');
  return read({
    sheets: async () => {
      const { row } = await findRow('CLIENTES', 'CEDULA', ced);
      return toCliente(row);
    },
    supabase: async () => {
      const { data, error } = await getSupabase()
        .from('clientes')
        .select('*')
        .eq('cedula', ced)
        .order('fecha_registro', { ascending: true })
        .order('cliente_id', { ascending: true })
        .limit(1);
      if (error) throw error;
      return toCliente((data || [])[0] ?? null);
    },
  });
}

// ─── ESCRITURAS (dual-write) ─────────────────────────────────────────────────

/** Crea un cliente y devuelve su id. */
export async function createCliente({ nombre, cedula, celular, email, ciudad, direccion }) {
  const id = uuid();
  // crm.clientes.fecha_registro es timestamptz → Sheets guarda el string Ecuador
  // ("12Jul2026 20:53:00") y Supabase el ISO (mismo instante). NO pasar el string
  // Ecuador a Postgres: no lo parsea.
  const nowSheet = fechaAhora();
  const nowIso = new Date().toISOString();

  await write({
    sheets: async () =>
      appendRow('CLIENTES', [
        id,
        nombre,
        String(cedula ?? ''),
        String(celular ?? ''),
        email || '',
        ciudad || '',
        direccion || '',
        nowSheet,
      ]),
    supabase: async () => {
      const { error } = await getSupabase().from('clientes').insert({
        cliente_id: id,
        nombre,
        cedula: String(cedula ?? ''),
        celular: String(celular ?? ''),
        email: email || '',
        ciudad: ciudad || '',
        direccion: direccion || '',
        fecha_registro: nowIso,
      });
      if (error) throw error;
    },
  });

  return id;
}

/** Actualiza campos editables (nombre, cedula, celular, email, ciudad, direccion). Parcial. */
export async function updateCliente(id, { nombre, cedula, celular, email, ciudad, direccion } = {}) {
  await write({
    sheets: async () => {
      const { index } = await findRow('CLIENTES', 'CLIENTE_ID', id);
      if (index < 0) throw new Error('Cliente no encontrado');
      if (nombre    !== undefined) await updateCell('CLIENTES', index, COL.nombre,    nombre);
      if (cedula    !== undefined) await updateCell('CLIENTES', index, COL.cedula,    String(cedula));
      if (celular   !== undefined) await updateCell('CLIENTES', index, COL.celular,   String(celular));
      if (email     !== undefined) await updateCell('CLIENTES', index, COL.email,     email);
      if (ciudad    !== undefined) await updateCell('CLIENTES', index, COL.ciudad,    ciudad);
      if (direccion !== undefined) await updateCell('CLIENTES', index, COL.direccion, direccion);
    },
    supabase: async () => {
      const patch = {};
      if (nombre    !== undefined) patch.nombre    = nombre;
      if (cedula    !== undefined) patch.cedula    = String(cedula);
      if (celular   !== undefined) patch.celular   = String(celular);
      if (email     !== undefined) patch.email     = email;
      if (ciudad    !== undefined) patch.ciudad    = ciudad;
      if (direccion !== undefined) patch.direccion = direccion;
      if (Object.keys(patch).length === 0) return;
      const { error } = await getSupabase().from('clientes').update(patch).eq('cliente_id', id);
      if (error) throw error;
    },
  });
}

/**
 * Upsert por cédula (comportamiento del POST de pedidos):
 *  - Si el cliente EXISTE: actualiza nombre/celular/email/ciudad/direccion
 *    conservando el valor previo cuando el nuevo venga vacío. La cédula NO se
 *    toca (es la clave de búsqueda). Devuelve su CLIENTE_ID.
 *  - Si NO existe: lo crea. Devuelve el nuevo id.
 */
export async function upsertClienteByCedula(cedula, data = {}) {
  const existente = await findClienteByCedula(cedula);

  if (!existente) {
    return createCliente({ cedula, ...data });
  }

  const id = existente.CLIENTE_ID;
  // Conserva lo previo cuando el nuevo venga vacío (mismo criterio que hoy).
  await updateCliente(id, {
    nombre:    data.nombre    || existente.NOMBRE,
    celular:   String(data.celular || existente.CELULAR || ''),
    email:     data.email     || existente.EMAIL,
    ciudad:    data.ciudad    || existente.CIUDAD,
    direccion: data.direccion || existente.DIRECCION,
  });

  return id;
}
