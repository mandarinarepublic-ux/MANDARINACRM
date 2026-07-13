// lib/db/clientes.js
// Repositorio de CLIENTES. Expone las MISMAS operaciones que hoy usan las rutas
// (app/api/clientes/route.js, app/api/clientes/[id]/route.js y el upsert por
// cédula de app/api/pedidos/route.js), detrás del switch DATA_BACKEND.
//
// LECTURAS via `read`; ESCRITURAS via `write` (dual-write).
//  - Sheets:   comportamiento actual con helpers de '../sheets'.
//  - Supabase: getSupabase() (schema `crm`), tabla `clientes`
//              (PK `cliente_id` uuid; `cedula` unique).

import { v4 as uuid } from 'uuid';
import { readSheet, appendRow, findRow, updateCell, fechaAhora } from '../sheets';
import { getSupabase } from '../supabase';
import { read, write } from './_backend';

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
 * Busca clientes cuyo nombre/cédula/celular incluyan `q` (case-insensitive).
 * Sin `q` devuelve TODOS (la ruta se encarga de recortar/paginar).
 */
export async function searchClientes(q) {
  const term = String(q ?? '').toLowerCase();

  const filtra = (lista) => {
    if (!term) return lista;
    return lista.filter((c) =>
      String(c.NOMBRE ?? '').toLowerCase().includes(term) ||
      String(c.CEDULA ?? '').toLowerCase().includes(term) ||
      String(c.CELULAR ?? '').toLowerCase().includes(term)
    );
  };

  return read({
    sheets: async () => filtra((await readSheet('CLIENTES')).map(toCliente)),
    supabase: async () => {
      const { data, error } = await getSupabase().from('clientes').select('*');
      if (error) throw error;
      return filtra(data.map(toCliente));
    },
  });
}

/** Lectura SOLO Supabase (para lecturas-sombra): todos los clientes normalizados. */
export async function listClientesSupabase() {
  const { data, error } = await getSupabase().from('clientes').select('*');
  if (error) throw error;
  return data.map(toCliente);
}

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

/** Un cliente por su CEDULA, o null. */
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
        .maybeSingle();
      if (error) throw error;
      return toCliente(data);
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
