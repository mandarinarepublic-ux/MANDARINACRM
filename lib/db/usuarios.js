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
const COL = {
  nombre: 'B', codigo: 'C', email: 'D', password: 'E',
  rol: 'F', areas: 'G', tiendas: 'H', activo: 'I', username: 'K',
};

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

/** Compara por nombre, para que la lista no salte de posición tras cada edición. */
function porNombre(a, b) {
  return String(a.NOMBRE || '').localeCompare(String(b.NOMBRE || ''), 'es');
}

/** Todos los usuarios (sin contraseña), ordenados por nombre. */
export async function listUsuarios() {
  return read({
    sheets: async () => (await readSheet('USUARIOS')).map(toUsuarioPublico).sort(porNombre),
    supabase: async () => {
      // order() en la consulta: sin ORDER BY, Postgres devuelve el orden físico del
      // heap, que cambia tras cada UPDATE y hacía saltar las filas en pantalla.
      const { data, error } = await getSupabase().from('usuarios').select('*').order('nombre');
      if (error) throw error;
      return data.map(toUsuarioPublico);
    },
  });
}

/** Un usuario por id (sin contraseña). Lo usa requireAdmin para verificar sesión. */
export async function getUsuarioById(id) {
  if (!id) return null;
  return read({
    sheets: async () => {
      const usuarios = await readSheet('USUARIOS');
      const row = usuarios.find((u) => u.USUARIO_ID === id);
      return row ? toUsuarioPublico(row) : null;
    },
    supabase: async () => {
      const { data, error } = await getSupabase()
        .from('usuarios').select('*').eq('usuario_id', id).maybeSingle();
      if (error) throw error;
      return data ? toUsuarioPublico(data) : null;
    },
  });
}

/**
 * Busca un usuario que CHOQUE con los identificadores dados.
 *
 * Cruza los cuatro campos entre sí a propósito: el login empata contra
 * username OR email OR nombre (ver validateLogin), así que el nombre de una
 * persona puede colisionar con el username de otra. Comprobar columna por
 * columna dejaría pasar justo el caso que rompió el login en producción
 * (una fila con nombre 'MAJO' y otra con username 'MAJO').
 *
 * @param {{nombre?:string, username?:string, email?:string, codigo?:string}} datos
 * @param {string} [excluirId] - id a ignorar (al editar, uno choca consigo mismo)
 * @returns {Promise<{usuario:object, campo:string}|null>}
 */
export async function buscarConflicto({ nombre, username, email, codigo }, excluirId) {
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const login = [norm(nombre), norm(username), norm(email)].filter(Boolean);
  const cod = norm(codigo);
  if (login.length === 0 && !cod) return null;

  const todos = await listUsuarios();
  for (const u of todos) {
    if (excluirId && u.USUARIO_ID === excluirId) continue;

    const suyos = [norm(u.NOMBRE), norm(u.USERNAME), norm(u.EMAIL)].filter(Boolean);
    const choque = login.find((v) => suyos.includes(v));
    if (choque) return { usuario: u, campo: choque };

    if (cod && norm(u.CODIGO) === cod) return { usuario: u, campo: cod };
  }
  return null;
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
  // trim(): hay nombres guardados con espacio final (p.ej. 'Clever '), y sin
  // recortar el identificador esa persona no podía entrar escribiendo su nombre.
  const id = String(identifier || '').trim().toLowerCase();
  const coincide = (u) =>
    String(u.username ?? u.USERNAME ?? '').trim().toLowerCase() === id ||
    String(u.email ?? u.EMAIL ?? '').trim().toLowerCase() === id ||
    String(u.nombre ?? u.NOMBRE ?? '').trim().toLowerCase() === id;

  const row = await read({
    sheets: async () => {
      const usuarios = await readSheet('USUARIOS');
      return usuarios.filter((u) => u.ACTIVO === 'TRUE' && coincide(u))[0];
    },
    supabase: async () => {
      // order(): sin ORDER BY el orden es el físico del heap y cambia tras
      // cualquier UPDATE. Con usuarios duplicados eso hacía que el login
      // funcionara unas veces sí y otras no, sin tocar nada.
      const { data, error } = await getSupabase()
        .from('usuarios')
        .select('*')
        .eq('activo', true)
        .order('usuario_id');
      if (error) throw error;
      return data.filter(coincide)[0];
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

/**
 * Actualiza campos editables. Parcial: solo se escribe lo que venga definido.
 *
 * `password` es opcional; si viene vacío la contraseña NO se toca (así el editor
 * puede guardar cambios de rol sin pedirla). Antes no había forma de cambiarla:
 * si alguien la olvidaba, el único camino era editar la base a mano.
 */
export async function updateUsuario(
  id,
  { rol, areas, tiendas, activo, nombre, codigo, email, username, password }
) {
  // Se hashea UNA sola vez, fuera de write(): si cada rama hasheara por su
  // cuenta saldrían hashes distintos (bcrypt usa salt aleatorio) y Sheets y
  // Supabase quedarían imposibles de reconciliar.
  const cambiaPassword = typeof password === 'string' && password.trim() !== '';
  const passwordHash = cambiaPassword ? await bcrypt.hash(password, 10) : undefined;

  await write({
    sheets: async () => {
      const { index } = await findRow('USUARIOS', 'USUARIO_ID', id);
      if (index < 0) throw new Error('Usuario no encontrado');
      if (rol !== undefined) await updateCell('USUARIOS', index, COL.rol, rol);
      if (areas !== undefined) await updateCell('USUARIOS', index, COL.areas, arrayToCsv(areas));
      if (tiendas !== undefined) await updateCell('USUARIOS', index, COL.tiendas, arrayToCsv(tiendas));
      if (activo !== undefined) await updateCell('USUARIOS', index, COL.activo, boolStr(toBool(activo)));
      if (nombre !== undefined) await updateCell('USUARIOS', index, COL.nombre, nombre);
      if (codigo !== undefined) await updateCell('USUARIOS', index, COL.codigo, codigo);
      if (email !== undefined) await updateCell('USUARIOS', index, COL.email, email);
      if (username !== undefined) await updateCell('USUARIOS', index, COL.username, username);
      if (passwordHash) await updateCell('USUARIOS', index, COL.password, passwordHash);
    },
    supabase: async () => {
      const patch = {};
      if (rol !== undefined) patch.rol = rol;
      if (areas !== undefined) patch.areas = csvToArray(areas);
      if (tiendas !== undefined) patch.tiendas = csvToArray(tiendas);
      if (activo !== undefined) patch.activo = toBool(activo);
      if (nombre !== undefined) patch.nombre = nombre;
      if (codigo !== undefined) patch.codigo = codigo;
      if (email !== undefined) patch.email = email;
      if (username !== undefined) patch.username = username || null;
      if (passwordHash) patch.password_hash = passwordHash;
      if (Object.keys(patch).length === 0) return;
      const { error } = await getSupabase().from('usuarios').update(patch).eq('usuario_id', id);
      if (error) throw error;
    },
  });

  return { ok: true, passwordCambiada: cambiaPassword };
}

/** ¿Cuántos ADMIN activos quedan? Para no dejar el sistema sin administrador. */
export async function contarAdminsActivos() {
  const todos = await listUsuarios();
  return todos.filter((u) => u.ROL === 'ADMIN' && u.ACTIVO === 'TRUE').length;
}
