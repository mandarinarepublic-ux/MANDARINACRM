// Sesión firmada en cookie — reemplaza a "confiar en lo que diga el navegador".
//
// Hasta ahora la identidad vivía en localStorage (`mp_user`, texto plano editable)
// y algunas rutas la recibían en la cabecera `x-mp-usuario-id`. Cualquiera que
// supiera un id de admin podía suplantarlo, y quien conociera la URL de producción
// podía leer o escribir sin ser nadie.
//
// Ahora el servidor emite al hacer login un token `<payload>.<firma>` con HMAC
// SHA-256 y lo guarda en una cookie HttpOnly: el navegador la manda sola en cada
// petición del mismo origen, y el contenido no se puede alterar sin la llave.
//
// Se usa Web Crypto (no `node:crypto`) a propósito: el middleware corre en el
// runtime Edge, donde `node:crypto` no existe.

export const COOKIE_SESION = 'mp_sesion'
export const DIAS_VALIDEZ = 30

const enc = new TextEncoder()

function aBase64Url(bytes) {
  let bin = ''
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deBase64Url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function llaveHmac(secreto) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** Emite el token de sesión. `datos` = { id, rol } — nada sensible. */
export async function firmarSesion(datos, secreto, dias = DIAS_VALIDEZ) {
  const payload = {
    ...datos,
    exp: Date.now() + dias * 24 * 60 * 60 * 1000,
  }
  const cuerpo = aBase64Url(enc.encode(JSON.stringify(payload)))
  const firma = await crypto.subtle.sign('HMAC', await llaveHmac(secreto), enc.encode(cuerpo))
  return `${cuerpo}.${aBase64Url(firma)}`
}

/**
 * Devuelve el contenido de la sesión, o null si el token falta, fue alterado o
 * caducó. Nunca lanza: un token corrupto es simplemente "no hay sesión".
 */
export async function verificarSesion(token, secreto) {
  if (!token || !secreto) return null
  const [cuerpo, firma] = String(token).split('.')
  if (!cuerpo || !firma) return null

  try {
    // crypto.subtle.verify compara en tiempo constante.
    const valida = await crypto.subtle.verify(
      'HMAC',
      await llaveHmac(secreto),
      deBase64Url(firma),
      enc.encode(cuerpo),
    )
    if (!valida) return null

    const datos = JSON.parse(new TextDecoder().decode(deBase64Url(cuerpo)))
    if (!datos?.exp || Date.now() > datos.exp) return null
    return datos
  } catch {
    return null
  }
}

/**
 * Dominio de la cookie. Vacío = host-only (lo de siempre).
 *
 * Se pone `.apps.mandarinaec.com` para que la MISMA sesión valga en el CRM y en
 * los inbox: son subdominios del mismo sitio. Un nivel más abajo que
 * `.mandarinaec.com` a propósito — ese es el dominio de la tienda Shopify, y la
 * cookie viajaría también a Shopify sin ninguna necesidad.
 */
export function dominioCookie() {
  return String(process.env.COOKIE_DOMINIO || '').replace(/[^\x21-\x7E]/g, '')
}

/** Cabecera Set-Cookie de la sesión. HttpOnly = el JS de la página no la lee. */
export function cookieSesion(token) {
  const partes = [
    `${COOKIE_SESION}=${token}`,
    'Path=/',
    `Max-Age=${DIAS_VALIDEZ * 24 * 60 * 60}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  const dom = dominioCookie()
  if (dom) partes.push(`Domain=${dom}`)
  if (process.env.NODE_ENV === 'production') partes.push('Secure')
  return partes.join('; ')
}

/** Cabecera Set-Cookie que BORRA la sesión. */
export function cookieBorrada() {
  const partes = [
    `${COOKIE_SESION}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ]
  const dom = dominioCookie()
  if (dom) partes.push(`Domain=${dom}`)
  if (process.env.NODE_ENV === 'production') partes.push('Secure')
  return partes.join('; ')
}

/** Secreto de firma. Sin él no se emite ni se acepta ninguna sesión. */
export function secretoSesion() {
  // Limpia el BOM invisible que PowerShell le mete a las variables de Vercel:
  // sin esto la firma se calcularía con una llave distinta solo en producción.
  return String(process.env.SESSION_SECRET || '').replace(/[^\x21-\x7E]/g, '')
}
