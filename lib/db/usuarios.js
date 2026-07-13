// lib/db/usuarios.js
// Repositorio de USUARIOS. Expone las MISMAS operaciones que hoy usan las rutas
// (app/api/usuarios/route.js y el login), detrás del switch DATA_BACKEND.
//
// Compatibilidad de contraseñas durante la migración:
//  - Legado: PASSWORD_HASH guarda la contraseña en TEXTO PLANO → se compara ===.
//  - Nuevo:  password_hash es un hash bcrypt ($2a/$2b/$2y$...) → se compara con bcrypt.
//  Así el backfill puede hashear sin romper a quien aún no fue re-hasheado.

import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { readSheet, appendRow, findRow, updateCell } from '../sheets';
import { getSupabase } from '../supabase';
import { read, write, toBool, boolStr, csvToArray, arrayToCsv } from './_backend';

// Columnas REALES de la hoja USUARIOS (orden del appendRow):
// A USUARIO_ID · B NOMBRE · C CODIGO · D EMAIL · E PASSWORD_HASH · F ROL
// G AREAS · H TIENDAS · I ACTIVO · J FECHA_CREADO · K USERNAME
const COL = { rol: 'F', areas: 'G', tiendas: 'H', activo: 'I' };

function esBcrypt(hash) {
  return typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
}

async function passwordCoincide(almacenado, ingresado) {
  if (esBcrypt(almacenado)) {
    try {
      return await bcrypt.compare(ingresado, almacenado);
    } catch {
      return false;
    }
  }
  // Legado texto plano.
  return almacenado === ingresado;
}

/** Normaliza una fila (venga de Sheets o de Supabase) al shape que usa la UI. */
function toUsuarioPublico(u) {
  return {
    USUARIO_ID: u.USUARIO_ID ?? u.usuario_id,
    NOMBRE: u.NOMBRE ?? u.nombre,
    CODIGO: u.CODIGO ?? u.codigo,
    EMAIL: u.EMAIL ?? u.email,
    USERNAME: u.USERNAME ?? u.username,
    ROL: u.ROL ?? u.rol,
    AREAS: u.AREAS ?? arrayToCsv(u.areas),
    TIENDAS: u.TIENDAS ?? arrayToCsv(u.tiendas),
    ACTIVO: u.ACTIVO ?? boolStr(u.activo),
    FECHA: u.FECHA_CREADO ?? u.FECHA ?? u.fecha,   // header real = FECHA_CREADO
    PASSWORD_HASH: undefined, // nunca se expone
  };
}

// ─── LECTURAS ────────────────────────────────────────────────────────────────

/** Todos los usuarios (sin contraseña). */
export async function listUsuarios() {
  return read({
    sheets: async () => (await readSheet('USUARIOS')).map(toUsuarioPublico),
    supabase: async () => {
      const { data, error } = await getSupabase().from('usuarios').select('*');
      if (error) throw error;
      return data.map(toUsuarioPublico);
    },
  });
}

/** Lectura SOLO Supabase (para lecturas-sombra): todos los usuarios (sin password). */
export async function listUsuariosSupabase() {
  const { data, error } = await getSupabase().from('usuarios').select('*');
  if (error) throw error;
  return data.map(toUsuarioPublico);
}

/**
 * Valida credenciales. `identifier` = username | email | nombre.
 * Devuelve la sesión (id, nombre, codigo, email, rol, areas[], tiendas[]) o null.
 */
export async function validateLogin(identifier, password) {
  const id = String(identifier || '').toLowerCase();

  const row = await read({
    sheets: async () => {
      const usuarios = await readSheet('USUARIOS');
      return usuarios.find(
        (u) =>
          (u.USERNAME?.toLowerCase() === id ||
            u.EMAIL?.toLowerCase() === id ||
            u.NOMBRE?.toLowerCase() === id) &&
          u.ACTIVO === 'TRUE'
      );
    },
    supabase: async () => {
      const { data, error } = await getSupabase()
        .from('usuarios')
        .select('*')
        .eq('activo', true);
      if (error) throw error;
      return data.find(
        (u) =>
          u.username?.toLowerCase() === id ||
          u.email?.toLowerCase() === id ||
          u.nombre?.toLowerCase() === id
      );
    },
  });

  if (!row) return null;

  const hashAlmacenado = row.PASSWORD_HASH ?? row.password_hash;
  if (!(await passwordCoincide(hashAlmacenado, password))) return null;

  const areas = row.AREAS !== undefined ? csvToArray(row.AREAS) : row.areas || [];
  const tiendas = row.TIENDAS !== undefined ? csvToArray(row.TIENDAS) : row.tiendas || [];

  return {
    id: row.USUARIO_ID ?? row.usuario_id,
    nombre: row.NOMBRE ?? row.nombre,
    codigo: row.CODIGO ?? row.codigo,
    email: row.EMAIL ?? row.email,
    rol: row.ROL ?? row.rol,
    areas,
    tiendas,
  };
}

// ─── ESCRITURAS (dual-write) ─────────────────────────────────────────────────

/** Crea un usuario. La contraseña se hashea con bcrypt antes de guardar. */
export async function createUsuario({ nombre, codigo, email, username, password, rol, areas, tiendas }) {
  const id = uuid();
  const nowIso = new Date().toISOString();
  const passwordHash = await bcrypt.hash(String(password ?? ''), 10);
  const areasArr = csvToArray(areas);
  const tiendasArr = csvToArray(tiendas);

  await write({
    sheets: async () =>
      appendRow('USUARIOS', [
        id,
        nombre,
        codigo,
        email,
        passwordHash, // ⚠️ ahora hasheada también en la hoja
        rol,
        arrayToCsv(areasArr),
        arrayToCsv(tiendasArr),
        'TRUE',
        nowIso,
        username || '',   // K USERNAME (la hoja tiene 11 columnas)
      ]),
    supabase: async () => {
      const { error } = await getSupabase().from('usuarios').insert({
        usuario_id: id,
        nombre,
        codigo,
        email,
        username: username || null,
        password_hash: passwordHash,
        rol,
        areas: areasArr,
        tiendas: tiendasArr,
        activo: true,
        fecha: nowIso,
      });
      if (error) throw error;
    },
  });

  return { id };
}

/** Actualiza campos editables (rol, areas, tiendas, activo). Parcial. */
export async function updateUsuario(id, { rol, areas, tiendas, activo }) {
  await write({
    sheets: async () => {
      const { index } = await findRow('USUARIOS', 'USUARIO_ID', id);
      if (index < 0) throw new Error('Usuario no encontrado');
      if (rol !== undefined) await updateCell('USUARIOS', index, COL.rol, rol);
      if (areas !== undefined) await updateCell('USUARIOS', index, COL.areas, arrayToCsv(areas));
      if (tiendas !== undefined) await updateCell('USUARIOS', index, COL.tiendas, arrayToCsv(tiendas));
      if (activo !== undefined) await updateCell('USUARIOS', index, COL.activo, boolStr(toBool(activo)));
    },
    supabase: async () => {
      const patch = {};
      if (rol !== undefined) patch.rol = rol;
      if (areas !== undefined) patch.areas = csvToArray(areas);
      if (tiendas !== undefined) patch.tiendas = csvToArray(tiendas);
      if (activo !== undefined) patch.activo = toBool(activo);
      if (Object.keys(patch).length === 0) return;
      const { error } = await getSupabase().from('usuarios').update(patch).eq('usuario_id', id);
      if (error) throw error;
    },
  });

  return { ok: true };
}
