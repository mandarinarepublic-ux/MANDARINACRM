'use client'
// components/producto-nuevo/ResultadoPublicacion.js
export default function ResultadoPublicacion({ res, onDespublicar, onCorregir, onOtro }) {
  // ☠️ Son CUATRO estados, no tres. La ruta puede devolver `activado: true` con
  // `ok: false` cuando el producto se activo pero no se pudo publicar al canal:
  // esta ACTIVO por API y aun asi INVISIBLE para los clientes. Y un despublicado
  // EXITOSO (lo pidio el usuario) pone `activado: false` igual que un fallo de
  // verificacion — sin distinguirlos, un despublicado bueno se veia como
  // «⚠️ encontró problemas», que es justo lo contrario de lo que paso.
  const titulo = res.despublicado
    ? { clase: 'bg-gray-800 border-gray-700 text-gray-300', texto: '◻️ Despublicado: el producto volvió a borrador' }
    : !res.activado
      ? { clase: 'bg-amber-500/10 border-amber-500/30 text-amber-400', texto: '⚠️ Quedó en BORRADOR: la verificación encontró problemas' }
      : res.urlTienda
        ? { clase: 'bg-green-500/10 border-green-500/30 text-green-400', texto: '✓ Publicado y visible en la tienda' }
        : { clase: 'bg-amber-500/10 border-amber-500/30 text-amber-400', texto: '⚠️ Activo, pero NO visible para los clientes' }

  return (
    <div className="card p-5 space-y-4">
      <p className={`text-sm font-semibold px-4 py-3 rounded-xl border ${titulo.clase}`}>{titulo.texto}</p>

      {!res.ok && (
        <ul className="text-red-400 text-sm list-disc pl-5 space-y-1">
          {res.fallos.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}

      {res.sync !== 'ok' && (
        <p className="text-sm text-gray-400">El producto <strong className="text-white">sí</strong> está en Shopify, pero el catálogo no se refrescó:
          todavía no aparece en los inbox. Se corrige solo en el próximo sync.</p>
      )}

      <div className="space-y-1 text-sm">
        {res.urlAdmin && <p><a href={res.urlAdmin} target="_blank" rel="noreferrer" className="text-mandarina-400 hover:underline">Abrir en Shopify</a></p>}
        {res.urlTienda
          ? <p><a href={res.urlTienda} target="_blank" rel="noreferrer" className="text-mandarina-400 hover:underline">Ver en la tienda →</a></p>
          : <p className="text-gray-500">Todavía no tiene página pública en la tienda.</p>}
      </div>

      <div className="flex gap-3 flex-wrap pt-1">
        {/* ☠️ Sin esta salida, un fallo dejaba al usuario sin forma de reintentar
            ESTE producto: el bloque de revision ya no se ve, y «Cargar otro» borra
            el id. Volver a subir las mismas fotos mandaria `id: undefined` y
            Shopify CREARIA UN DUPLICADO, dejando huerfano el anterior. */}
        {!res.ok && (
          <button type="button" onClick={onCorregir} className="btn-primary">Corregir y reintentar este producto</button>
        )}
        {/* Despublicar solo tiene sentido si el producto llegó a estar activo: si
            nunca salió de borrador no hay nada que despublicar. */}
        {res.activado && (
          <button type="button" onClick={onDespublicar} className="btn-secondary">Despublicar</button>
        )}
        <button type="button" onClick={onOtro} className="btn-ghost">Cargar otro producto</button>
      </div>
    </div>
  )
}
