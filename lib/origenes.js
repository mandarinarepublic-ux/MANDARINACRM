// Los orígenes de nuestras aplicaciones. UNA sola fuente, a propósito.
//
// Tres cosas distintas dependen de esta lista y las tres son de seguridad:
//   1. `lib/volver.js`  → a dónde se puede mandar a alguien después del login
//   2. `next.config.js` → quién puede enmarcar el CRM (frame-ancestors)
//   3. `lib/aviso-padre.js` → a quién se le manda el postMessage del pedido
//
// Tenerlas copiadas en tres lados es cómo nacen los redirects abiertos: se
// arregla una, se olvidan las otras dos, y nadie se entera hasta que alguien lo
// aprovecha.
//
// ⚠️ Se compara el ORIGEN COMPLETO (protocolo + host), nunca "empieza con" ni
// "contiene": `https://inbox.apps.mandarinaec.com.evil.com` pasaría esas dos.

/** Los inbox. Pueden enmarcar al CRM y reciben el aviso del pedido creado. */
export const ORIGENES_INBOX = Object.freeze([
  'https://inbox.apps.mandarinaec.com',
  'https://ind-inbox.apps.mandarinaec.com',
])

/** El CRM. Se enmarca a sí mismo por 'self'; NO es destino de avisos. */
export const ORIGEN_CRM = 'https://crm.apps.mandarinaec.com'

/** Solo los hostnames, que es lo que compara `volver.js`. */
export const HOSTS_PERMITIDOS = new Set(
  [...ORIGENES_INBOX, ORIGEN_CRM].map((o) => new URL(o).hostname),
)

/** ¿Este `event.origin` es uno de nuestros inbox? Nunca lanza. */
export function esOrigenInbox(origen) {
  return ORIGENES_INBOX.includes(String(origen || ''))
}
