'use client'
// components/producto-nuevo/ResultadoPublicacion.js
export default function ResultadoPublicacion({ res, onDespublicar, onCorregir, onOtro }) {
  // ☠️ Son TRES estados, no dos. La ruta puede devolver `activado: true` con
  // `ok: false` cuando el producto se activo pero no se pudo publicar al canal:
  // esta ACTIVO por API y aun asi INVISIBLE para los clientes. Con solo dos
  // titulos, ese caso salia en verde «Publicado y activo» encima de una lista
  // roja de fallos — un mensaje que se contradice a si mismo.
  const titulo = !res.activado
    ? { color: '#c60', texto: '⚠️ Quedó en BORRADOR: la verificación encontró problemas' }
    : res.urlTienda
      ? { color: '#060', texto: '✓ Publicado y visible en la tienda' }
      : { color: '#c60', texto: '⚠️ Activo, pero NO visible para los clientes' }

  return (
    <div>
      <h3 style={{ color: titulo.color }}>{titulo.texto}</h3>

      {!res.ok && (
        <ul style={{ color: '#c00' }}>{res.fallos.map((f) => <li key={f}>{f}</li>)}</ul>
      )}

      {res.sync !== 'ok' && (
        <p>El producto <strong>sí</strong> está en Shopify, pero el catálogo no se refrescó:
          todavía no aparece en los inbox. Se corrige solo en el próximo sync.</p>
      )}

      <p><a href={res.urlAdmin} target="_blank" rel="noreferrer">Abrir en Shopify</a></p>
      {res.urlTienda
        ? <p><a href={res.urlTienda} target="_blank" rel="noreferrer">Ver en la tienda →</a></p>
        : <p><small>Todavía no tiene página pública en la tienda.</small></p>}
      {/* ☠️ Sin esta salida, un fallo dejaba al usuario sin forma de reintentar
          ESTE producto: el bloque de revision ya no se ve, y «Cargar otro» borra
          el id. Volver a subir las mismas fotos mandaria `id: undefined` y
          Shopify CREARIA UN DUPLICADO, dejando huerfano el anterior. */}
      {!res.ok && (
        <button type="button" onClick={onCorregir}>Corregir y reintentar este producto</button>
      )}
      <button type="button" onClick={onDespublicar}>Despublicar</button>
      <button type="button" onClick={onOtro}>Cargar otro producto</button>
    </div>
  )
}
