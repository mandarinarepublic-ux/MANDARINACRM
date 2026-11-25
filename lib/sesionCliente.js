// Lo que el navegador guarda del usuario (`mp_user`) y la versión que corre.
// Puro (sin React) para probarlo con node --test. Lo usa app/dashboard/layout.js
// con lo que devuelve GET /api/auth/yo.
//
// 24-nov-2026: a Jackeline se le dio el permiso CAJA y no le salía en el menú,
// porque el menú lee la copia que se guardó AL ENTRAR. Ahora esa copia se
// refresca desde la base cada vez que se abre el CRM (y cada pocos minutos).

const lista = (v) => Array.isArray(v)
  ? v.map((x) => String(x).trim()).filter(Boolean)
  : String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

/**
 * Usuario de la base (forma de toUsuarioPublico: USUARIO_ID, ROL, TIENDAS en
 * texto…) → la MISMA forma que devuelve el login y que la UI guarda en mp_user.
 */
export function usuarioParaCliente(u) {
  if (!u) return null
  return {
    id: u.USUARIO_ID ?? u.id ?? null,
    nombre: u.NOMBRE ?? u.nombre ?? '',
    codigo: u.CODIGO ?? u.codigo ?? '',
    email: u.EMAIL ?? u.email ?? '',
    rol: u.ROL ?? u.rol ?? '',
    areas: lista(u.AREAS ?? u.areas),
    tiendas: lista(u.TIENDAS ?? u.tiendas),
    accesos: lista(u.ACCESOS ?? u.accesos),
  }
}

const CAMPOS = ['id', 'nombre', 'codigo', 'email', 'rol', 'areas', 'tiendas', 'accesos']

/**
 * Lo guardado en el navegador con lo que manda el servidor encima. Devuelve
 * null si no cambió nada (así no se repinta el menú en cada consulta), o si
 * el servidor habla de OTRA persona (no se pisa una sesión con otra).
 */
export function refrescarUsuario(guardado, delServidor) {
  if (!guardado || !delServidor?.id) return null
  if (guardado.id && guardado.id !== delServidor.id) return null
  const nuevo = { ...guardado }
  for (const c of CAMPOS) if (delServidor[c] !== undefined) nuevo[c] = delServidor[c]
  const igual = CAMPOS.every((c) => JSON.stringify(guardado[c] ?? null) === JSON.stringify(nuevo[c] ?? null))
  return igual ? null : nuevo
}

/**
 * ¿La pestaña corre un código distinto del que está publicado? Vacío en
 * cualquiera de los dos lados (en local, o si falla la consulta) = no se sabe,
 * y no se avisa nada.
 */
export function hayVersionNueva(buildCliente, buildServidor) {
  return !!(buildCliente && buildServidor && buildCliente !== buildServidor)
}
