// Guardián contra el tope de 1000 de PostgREST.
//
// PostgREST devuelve como mucho 1000 filas y NO avisa: `error` viene en null.
// Una lectura sin acotar sobre una tabla que crece no falla — miente, y sigue
// mintiendo durante semanas. Así se perdieron 21 pedidos en Producción durante
// 14 días, 1.391 conversaciones en el inbox, 314 prendas en `/api/pedidos` y el
// conteo de usos de "Tipos de prenda".
//
// Esta prueba recorre `lib/` y `app/` y falla si aparece una consulta a una tabla
// GRANDE sin tope, rango, filtro por clave o agregado.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

// Tablas pequeñas y estables: leerlas enteras es legítimo y no van a crecer.
// Medidas el 21-ago-2026. Si alguna se dispara, sácala de aquí.
const PEQUENAS = new Set([
  'usuarios',            // 14
  'dias_entrega',        // 8
  'vendedores_tienda',   // 1
  'pauta_cuentas',       // 2
  'sucursal',            // 147
  'productos_catalogo',  // 188
  'uso_tipos_prenda',    // 208 — vista agrupada, una fila por nombre
  'cotizaciones',        // 1
])

// Lo que hace que una consulta esté acotada.
const ACOTADA = /\.limit\(|\.range\(|\.eq\(|\.in\(|\.single\(|\.maybeSingle\(|head:\s*true|\.gte\(|\.lte\(|\.not\(|\.or\(|\.like\(|\.ilike\(/
const ESCRITURA = /\.insert\(|\.update\(|\.delete\(|\.upsert\(/

function archivos(dir, out = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) {
      if (!/node_modules|\.next/.test(ruta)) archivos(ruta, out)
    } else if (nombre.endsWith('.js')) out.push(ruta)
  }
  return out
}

const raiz = (rel) => new URL(`../${rel}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

test('ninguna lectura de una tabla grande viene sin acotar', () => {
  const culpables = []

  for (const ruta of [...archivos(raiz('lib')), ...archivos(raiz('app'))]) {
    const src = readFileSync(ruta, 'utf8')
    for (const m of src.matchAll(/from\('([a-z_]+)'\)[\s\S]{0,400}?;/g)) {
      const consulta = m[0]
      const tabla = m[1]
      if (PEQUENAS.has(tabla)) continue
      if (ESCRITURA.test(consulta)) continue
      if (ACOTADA.test(consulta)) continue
      culpables.push(`${ruta.split(sep).slice(-3).join('/')} -> ${tabla}`)
    }
  }

  assert.deepStrictEqual(culpables, [],
    'PostgREST corta en 1000 filas SIN avisar. Estas lecturas mienten cuando la tabla crece:\n' +
    culpables.join('\n'))
})

test('la lista blanca no esconde una tabla que crece', () => {
  // `pedidos`, `detalle_pedido`, `clientes`, `pagos`, `logs_pedidos` y
  // `eventos_sistema` NO pueden entrar acá: crecen con cada venta.
  for (const grande of ['pedidos', 'detalle_pedido', 'clientes', 'pagos', 'logs_pedidos', 'eventos_sistema', 'guias_despacho', 'pauta_dia', 'productos_shopify']) {
    assert.ok(!PEQUENAS.has(grande), `${grande} crece: no puede estar en la lista blanca`)
  }
})
