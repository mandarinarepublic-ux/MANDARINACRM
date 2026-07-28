// lib/imagenes.js
// Ajuste de tamaño para las imágenes que se PINTAN en pantalla o en el PDF.
//
// Las fotos del catálogo llegan del CDN de Shopify en su tamaño original: PNG de
// 1 a 4 MB cada una. La lista de búsqueda pintaba decenas a la vez y el navegador
// se quedaba bajando megas — los recuadros se veían vacíos y parecía que las
// imágenes "no cargaban". El CDN acepta ?width= y devuelve la misma imagen
// redimensionada (120 px ≈ 38 KB, contra 3,6 MB del original).
//
// IMPORTANTE: esto solo afecta al `src` que se muestra. La URL que se guarda en
// el pedido sigue siendo la original, sin recortar.

/**
 * Devuelve la URL para mostrar la imagen a un ancho dado.
 * Si no es del CDN de Shopify (Cloudinary, data: URI…) la deja igual.
 *
 * @param {string} url    URL original
 * @param {number} width  ancho en píxeles (usa ~2x el tamaño en pantalla)
 */
export function imagenAncho(url, width) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('cdn.shopify.com')) return url;
  if (/[?&]width=/.test(url)) return url; // ya viene dimensionada
  return `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
}

/**
 * Foto que representa a la prenda donde solo hay sitio para UNA (la hoja del
 * cliente, las miniaturas de las listas). Prioridad: pecho → espalda → mangas.
 *
 * La hoja del cliente leía únicamente FOTO_PECHO_URL y dejaba el recuadro gris
 * cuando el diseño iba en otra parte: si el estampado es de espalda, el vendedor
 * sube la foto en ESPALDA y Pecho queda vacío — correcto de su lado, pero el
 * cliente recibía la hoja sin ninguna imagen. En MAN-JAC-5445 pasó en las 5
 * prendas y por eso saltó a la vista; había 42 ítems así en 29 pedidos, donde
 * solo se perdían 1 o 2 fotos y nadie lo notaba.
 *
 * La hoja de confección nunca falló porque ahí se pintan las cuatro fotos.
 */
export function fotoPrincipal(item) {
  return item?.FOTO_PECHO_URL || item?.FOTO_ESPALDA_URL
      || item?.FOTO_MANGA_D_URL || item?.FOTO_MANGA_I_URL || '';
}
