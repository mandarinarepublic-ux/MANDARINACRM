// lib/inboxAuth.js
// Primera capa de auth para las rutas del inbox. La app no tiene sesión/token
// server-side (el login guarda el user en localStorage), así que validamos la
// identidad enviada en el header `x-mp-user-id` contra la tabla usuarios de
// Supabase (activo + rol permitido). No es criptográficamente fuerte, pero corta
// el acceso anónimo y es consistente con el modelo de confianza actual de la app.
//
// TODO (endurecer): sesión firmada (JWT/cookie httpOnly) app-wide.

import { getSupabase, supabaseConfigured } from './supabase';

const ROLES_INBOX = ['ADMIN', 'VENDEDOR', 'VENDEDOR_YAW'];

/**
 * Valida al usuario del dashboard a partir del header `x-mp-user-id`.
 * @returns {Promise<{ok:true, user}|{ok:false, status:number, error:string}>}
 */
export async function requireUser(req) {
  const id = req.headers.get('x-mp-user-id') || new URL(req.url).searchParams.get('uid');
  if (!id) return { ok: false, status: 401, error: 'no autenticado' };

  // Sin Supabase configurado no podemos validar → permitir (dev/local).
  if (!supabaseConfigured()) return { ok: true, user: { usuario_id: id, rol: 'ADMIN' } };

  try {
    const { data, error } = await getSupabase()
      .from('usuarios')
      .select('usuario_id, nombre, rol, activo')
      .eq('usuario_id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.activo === false) return { ok: false, status: 401, error: 'usuario inválido' };
    if (!ROLES_INBOX.includes(data.rol)) return { ok: false, status: 403, error: 'sin permiso para el inbox' };
    return { ok: true, user: data };
  } catch (e) {
    return { ok: false, status: 500, error: e.message };
  }
}

/** Helper para responder el error de auth de forma uniforme. */
export function authError(check) {
  return Response.json({ error: check.error }, { status: check.status });
}
