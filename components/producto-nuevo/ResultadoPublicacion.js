'use client'

// Bloque final: que quedo del intento de publicar y que hacer despues.
// ☠️ `res.ok` no es "se creo o no": es "quedo activo y visible en la tienda".
// Un producto puede EXISTIR en Shopify (tiene productoId) y aun asi salir en
// borrador si la verificacion encontro algo mal — por eso el titulo distingue
// "activo" de "publicado con problemas" en vez de un simple exito/fracaso.
export default function ResultadoPublicacion({ res, onDespublicar, onOtro }) {
  return (
    <div>
      {res.activado
        ? <h3 style={{ color: '#060' }}>✓ Publicado y activo en la tienda</h3>
        : <h3 style={{ color: '#c60' }}>⚠️ Quedó en BORRADOR: la verificación encontró problemas</h3>}

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
      <button type="button" onClick={onDespublicar}>Despublicar</button>
      <button type="button" onClick={onOtro}>Cargar otro producto</button>
    </div>
  )
}
