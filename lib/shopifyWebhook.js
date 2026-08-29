// Verificación de webhooks de Shopify. Dos tiendas, cada una con su secreto.
import { getTiendasConfig } from './shopify.js'

/**
 * De qué tienda vino el webhook, según X-Shopify-Shop-Domain.
 * Devuelve null si no corresponde a ninguna configurada — y entonces es 401.
 */
export function tiendaPorDominio(dominio) {
  const d = String(dominio || '').trim().toLowerCase()
  if (!d) return null
  return getTiendasConfig().find(t => String(t.store || '').toLowerCase() === d) || null
}

/**
 * ⚠️ El HMAC se calcula sobre el cuerpo CRUDO. Si se hace req.json() y luego se
 * re-serializa, la firma no cuadra NUNCA: el orden de las claves y los espacios
 * cambian.
 * Comparación en tiempo constante para no filtrar la firma por temporización.
 */
export async function firmaValida(cuerpoCrudo, cabecera, secreto) {
  if (!secreto || !cabecera) return false
  const llave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const firma = await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(cuerpoCrudo))
  const esperado = Buffer.from(new Uint8Array(firma)).toString('base64')
  const a = Buffer.from(esperado)
  const b = Buffer.from(String(cabecera))
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i]
  return dif === 0
}
