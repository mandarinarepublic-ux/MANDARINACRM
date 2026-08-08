// A dónde mandar a alguien después del login.
//
// El destino viaja en la URL (`?volver=…`) porque el inbox, que es OTRA
// aplicación, necesita recuperar a la persona después de autenticarla acá. Eso
// significa aceptar URLs absolutas — y aceptar URLs absolutas sin filtrar es
// exactamente un redirect abierto: alguien manda a tu equipo un enlace a TU
// página de login que termina depositándolos en otro sitio.
//
// Por eso la lista es cerrada y se compara el HOST COMPLETO, nunca "empieza
// con" ni "contiene": `inbox.apps.mandarinaec.com.evil.com` pasaría esas dos.

// ⚠️ Import RELATIVO, no `@/lib/origenes`. El alias `@/` lo define jsconfig.json
// y **solo lo entiende el bundler de Next**: `node --test` carga este archivo
// directo y con el alias falla con ERR_MODULE_NOT_FOUND, tumbando la suite. Que
// nunca haya dado problemas es porque hasta hoy ni volver.js ni sesion.js
// importaban nada. Regla: un `lib/` que tenga prueba unitaria se importa entre
// sí con ruta relativa.
import { HOSTS_PERMITIDOS } from './origenes.js'

const DESTINO_POR_DEFECTO = '/dashboard'

export function volverSeguro(destino) {
  const d = String(destino || '').trim()
  if (!d) return DESTINO_POR_DEFECTO

  // Ruta interna. Se exige que empiece por '/' y que el segundo carácter NO sea
  // '/' ni '\': '//evil.com' y '/\evil.com' son absolutas disfrazadas.
  if (d.startsWith('/')) {
    return (d[1] === '/' || d[1] === '\\') ? DESTINO_POR_DEFECTO : d
  }

  try {
    const u = new URL(d)
    if (u.protocol !== 'https:') return DESTINO_POR_DEFECTO
    if (!HOSTS_PERMITIDOS.has(u.hostname)) return DESTINO_POR_DEFECTO
    return u.toString()
  } catch {
    return DESTINO_POR_DEFECTO
  }
}
