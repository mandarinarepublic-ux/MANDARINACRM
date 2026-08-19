// El código que corre en producción NO es el que escribes: es el que sale del build.
//
// El 19-ago-2026 el select de /api/produccion se armaba concatenando plantillas:
//
//     `${COLS_PEDIDO},` + `prendas_en_taller(${COLS_PRENDA}),` + `clientes(...)`
//
// En el fuente la coma estaba. En `.next/server/app/api/produccion/route.js`
// quedaba `direccion_pedidoprendas`. El mismo carácter perdido dio tres síntomas
// distintos que costaron media jornada con el taller parado:
//
//   · con alias  → PostgREST lo leía como el alias `direccion_pedidoprendas`, así
//                  que las prendas venían undefined: 64 pedidos marcados
//                  "incompletos" y una alarma falsa por Telegram.
//   · idem tras mitigar → todos caían en el `continue` de "sin prendas de tu área"
//                  y la bandeja se quedó en 0 ítems.
//   · sin alias  → no existe esa relación y el endpoint devolvía 500.
//
// Revisar el fuente no lo cazaba: el fuente SIEMPRE estuvo bien. Probar la
// consulta con curl tampoco: la sintaxis SIEMPRE fue válida. Solo se ve mirando
// el bundle.
//
// Esta prueba mira el bundle. Necesita un `npx next build` previo; si no lo hay,
// se salta avisando en vez de dar un falso verde.
import test from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const RAIZ = new URL('../.next/server', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function archivos(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) archivos(p, out)
    else if (/\.(js|mjs)$/.test(f)) out.push(p)
  }
  return out
}

// Las columnas que van al FINAL de una lista de un select: son las que quedan
// pegadas a lo siguiente cuando el build se come el separador.
//
// ⚠️ Vigilar la COLUMNA y no el recurso. Un control negativo (19-ago-2026) demostró
// que buscar solo `algoRECURSO(` deja pasar el caso con alias
// —`direccion_pedidoprendas:prendas_en_taller(...)`— que es justo el que produjo
// los 64 falsos positivos: ahí el recurso queda limpio tras los dos puntos y lo
// único pegado es el alias.
const COLUMNAS = [
  'direccion_pedido', 'fecha_entrega_prometida', 'archivo_diseno', 'notas_area',
  'foto_manga_i_url', 'pedido_id', 'item_id', 'cliente_id',
]

test('ningun select del bundle tiene una columna pegada a lo siguiente', (t) => {
  const files = archivos(RAIZ)
  if (files.length === 0) {
    t.skip('no hay build: corre `npx next build` antes para que esta prueba valga')
    return
  }

  const rotos = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const col of COLUMNAS) {
      // La columna seguida INMEDIATAMENTE de una letra. Lo legítimo es que venga
      // seguida de coma, paréntesis, comilla o fin.
      const re = new RegExp(`${col}[a-z]`, 'g')
      for (const hallazgo of src.match(re) || []) {
        // Descarta los nombres que legítimamente empiezan igual (p. ej. `pedido_ids`).
        if (/^(pedido_ids|item_ids|cliente_ids)$/.test(hallazgo)) continue
        rotos.push(`${path.relative(RAIZ, f)} → ...${hallazgo}...`)
      }
    }
  }

  assert.deepEqual(rotos, [],
    'Hay un select donde el build junto dos nombres. Arma el select con un ' +
    'array.join(",") en vez de concatenar plantillas. Ver el encabezado de esta prueba.')
})

test('el select de produccion se arma con join, no concatenando plantillas', () => {
  const src = readFileSync(new URL('../lib/db/produccion.js', import.meta.url), 'utf8')

  // Sin los comentarios: el propio comentario que documenta este bug contiene el
  // patrón prohibido, y hacía fallar la prueba por citarse a sí misma.
  const codigo = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

  assert.ok(/const SELECT = \[[\s\S]*?\]\.join\(','\)/.test(codigo),
    'el SELECT debe armarse con un array.join(",") — es lo unico que el minificador no puede romper')
  assert.ok(!/`\$\{COLS_PEDIDO\},`\s*\+/.test(codigo),
    'no volver a concatenar plantillas para armar el select: el build se come el separador')
})
