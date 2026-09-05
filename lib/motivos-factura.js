// lib/motivos-factura.js
//
// Por qué una factura pedida no se emitió.
//
// POR QUÉ UNA LISTA Y NO TEXTO LIBRE. Un motivo escrito a mano cada vez no se
// puede sumar: al año no sabrías si pierdes facturas por clientes que se
// arrepienten o por pedidos anulados, que son problemas distintos y se arreglan
// distinto. Con códigos, `group by` responde solo.
//
// Y la nota libre existe igual, porque ninguna lista cubre todo. La lista sirve
// para contar; la nota, para entender el caso raro.

export const MOTIVOS = [
  { codigo: 'CLIENTE_DESISTIO', label: 'El cliente ya no la quiere' },
  { codigo: 'PEDIDO_ANULADO',   label: 'El pedido se anuló o no se entregó' },
  { codigo: 'FACTURADO_APARTE', label: 'Se facturó por fuera del CRM' },
  { codigo: 'CONSUMIDOR_FINAL', label: 'Va como consumidor final' },
  { codigo: 'DATOS_INCOMPLETOS',label: 'Faltan datos del cliente y no se consiguieron' },
  { codigo: 'ERROR_DE_REGISTRO',label: 'Se marcó "pide factura" por error' },
  { codigo: 'OTRO',             label: 'Otro (explícalo en la nota)' },
]

const PORCODIGO = new Map(MOTIVOS.map((m) => [m.codigo, m.label]))

/** ¿Es uno de los motivos de la lista? */
export function esMotivoValido(codigo) {
  return PORCODIGO.has(String(codigo ?? '').trim().toUpperCase())
}

/**
 * La etiqueta legible de un motivo.
 *
 * ☠️ Un código que no está en la lista se devuelve TAL CUAL, nunca vacío. Si
 * algún día se retira un motivo, los descartes viejos que lo usaban tienen que
 * seguir diciendo algo: en este sistema, una lista blanca que devuelve vacío es
 * exactamente como se han escondido datos cuatro veces.
 */
export function etiquetaMotivo(codigo) {
  const c = String(codigo ?? '').trim()
  if (!c) return ''
  return PORCODIGO.get(c.toUpperCase()) ?? c
}

/**
 * Valida lo que llega del navegador antes de guardarlo.
 * @returns {{ok:true, motivo:string, nota:string}|{ok:false, error:string}}
 */
export function validarDescarte({ motivo, nota } = {}) {
  const cod = String(motivo ?? '').trim().toUpperCase()
  if (!cod) return { ok: false, error: 'Elige un motivo para no emitir la factura' }
  if (!esMotivoValido(cod)) return { ok: false, error: `Motivo desconocido: ${cod}` }
  const texto = String(nota ?? '').trim().slice(0, 300)
  // OTRO sin explicación no dice nada: es exactamente el caso que la lista no
  // supo clasificar, así que la nota es lo único que quedará de él.
  if (cod === 'OTRO' && !texto) return { ok: false, error: 'Con "Otro" hay que escribir la nota' }
  return { ok: true, motivo: cod, nota: texto }
}
