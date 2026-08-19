// lib/reintento-pedido.js
//
// Dos vendedores grabando en el mismo instante pueden pedir el mismo número.
// Con 10 vendedores eso deja de ser hipotético.
//
// La garantía de que no habrá duplicados NO es este código: es el índice único
// `pedidos_unique_id_key` de la base, que rechaza al segundo. Esto solo se
// encarga de que ese segundo vendedor no vea un error, sino su pedido guardado
// con el número siguiente.
//
// ⚠️ Y como la fila rechazada nunca llegó a escribirse, el número que ese
// intento usó sigue libre: reintentar NO deja huecos en la numeración.
//
// Vive aparte y sin dependencias para que `node --test` pueda importarlo.

/** Cuántas veces se vuelve a intentar antes de rendirse y mostrar el error. */
export const MAX_INTENTOS = 5;

/**
 * ¿Este error es "ese número ya está ocupado"?
 *
 * Postgres devuelve 23505 (unique_violation). Se mira también el texto porque
 * según por dónde venga el error el código puede llegar vacío, y confundir un
 * fallo de red con una colisión haría reintentar algo que nunca va a funcionar.
 */
export function esNumeroOcupado(error) {
  if (!error) return false;
  if (String(error.code) === '23505') return true;
  const texto = String(error.message || error).toLowerCase();
  return texto.includes('duplicate key') || texto.includes('unique constraint') || texto.includes('pedidos_unique_id');
}

/** Cambia el número final de `MAN-JAC-5678` por otro, dejando el prefijo igual. */
export function conNumero(pedidoId, numero) {
  const partes = String(pedidoId ?? '').split('-');
  if (partes.length < 2) return String(numero);
  partes[partes.length - 1] = String(numero);
  return partes.join('-');
}

/**
 * Intenta crear el pedido; si el número está ocupado, pide el siguiente y repite.
 *
 * @param {string} pedidoId       el `MAN-JAC-5678` del primer intento
 * @param {number} uniqueId       su número
 * @param {(pedidoId: string, uniqueId: number) => Promise<any>} crear
 * @param {() => Promise<number>} siguienteNumero  de dónde sale el número nuevo
 * @returns {Promise<{pedidoId: string, uniqueId: number, intentos: number}>}
 */
export async function crearPedidoConReintento(pedidoId, uniqueId, crear, siguienteNumero) {
  let id = pedidoId;
  let num = uniqueId;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      await crear(id, num);
      return { pedidoId: id, uniqueId: num, intentos: intento };
    } catch (e) {
      // Cualquier otro fallo (red, permisos, datos malos) se propaga TAL CUAL.
      // Reintentar a ciegas convertiría un error claro en cinco intentos y un
      // mensaje peor.
      if (!esNumeroOcupado(e) || intento === MAX_INTENTOS) throw e;

      const siguiente = await siguienteNumero();
      // Si la base devuelve el mismo número que acaba de fallar, se avanza a
      // mano: sin esto, un desfase de lectura daría vueltas hasta agotar los
      // intentos y el vendedor se quedaría sin poder guardar.
      num = siguiente > num ? siguiente : num + 1;
      id = conNumero(id, num);
    }
  }

  // Inalcanzable: el último intento propaga o devuelve.
  throw new Error('No se pudo asignar un numero de pedido libre');
}
