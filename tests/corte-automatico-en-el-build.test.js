// La regla del corte automático, verificada EN EL BUNDLE.
//
// POR QUÉ mirar el bundle y no el fuente: el 19-ago-2026 este repo perdió media
// jornada con el taller parado porque el build se comió una coma que en el
// fuente siempre estuvo. La cadena de verificación no termina en "mi commit está
// desplegado", termina en "y lo que ese build contiene es lo que escribí".
//
// QUÉ VIGILA. `implicaCorte` decide si una prenda se marca CORTADO sola. La lista
// blanca es EN_PROCESO y LISTO. Si alguien agrega ENVIADO_APROBACION —que es la
// tentación obvia, porque "el área ya avanzó"— el sistema empieza a sacar de la
// bandeja de Corte prendas que SÍ hay que cortar. Medido el 4-sep-2026: serían
// 42 prendas vivas, borradas en silencio de la cola de un empleado.
//
// El error barato es dejar una prenda de más en Corte. El caro es borrarla.
//
// Necesita un `npm run build` previo; si no lo hay, se salta avisando en vez de
// dar un falso verde.
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

// El Set de la lista blanca, tal como queda tras el minificado.
const SET_LISTA_BLANCA = /new Set\(\[([^\]]*"EN_PROCESO"[^\]]*)\]\)/g

test('la lista blanca del corte automático sobrevive al build y NO incluye ENVIADO_APROBACION', () => {
  const rutas = archivos(RAIZ)
  if (rutas.length === 0) {
    console.log('  (saltada: no hay .next/server — corre `npm run build` antes)')
    return
  }

  let encontrada = false
  for (const ruta of rutas) {
    const bundle = readFileSync(ruta, 'utf8')
    for (const m of bundle.matchAll(SET_LISTA_BLANCA)) {
      encontrada = true
      const dentro = m[1]
      assert.ok(dentro.includes('"LISTO"'),
        `en ${path.basename(ruta)} la lista blanca perdió LISTO: ${m[0]}`)
      assert.ok(!dentro.includes('ENVIADO_APROBACION'),
        `☠️ ${path.basename(ruta)}: ENVIADO_APROBACION entró en la lista blanca del corte ` +
        `automático (${m[0]}). Mandar el arte a aprobar NO significa que la tela esté ` +
        `cortada: esto borraría prendas de la bandeja de Corte que sí hay que cortar.`)
      assert.ok(!dentro.includes('SOLICITADO'),
        `☠️ ${path.basename(ruta)}: SOLICITADO entró en la lista blanca del corte automático (${m[0]})`)
    }
  }

  assert.ok(encontrada,
    'no se encontró la lista blanca del corte automático en el bundle: o el build es viejo, ' +
    'o `implicaCorte` dejó de compilarse a un Set y esta prueba ya no vigila nada')
})
