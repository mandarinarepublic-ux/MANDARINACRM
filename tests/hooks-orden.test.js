// Una `const` usada antes de declararla mata la pantalla entera.
//
// ☠️ CASO REAL, 19-ago-2026: en el Tablero puse
//     useEffect(() => { loadPedidos() }, [loadPedidos])
// ANTES de `const loadPedidos = useCallback(...)`. La lista de dependencias se
// evalua DURANTE el render, cuando la const sigue en zona muerta temporal, asi
// que lanza ReferenceError y React tumba la pagina completa:
//     "Application error: a client-side exception has occurred"
//
// `next build` compila sin una sola queja. Solo se ve ABRIENDO la pantalla — y
// llego a produccion.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function pantallas(dir, out = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) pantallas(ruta, out)
    else if (nombre === 'page.js') out.push(ruta)
  }
  return out
}

const RAIZ = new URL('../app/dashboard', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

test('ninguna pantalla usa una const de hook antes de declararla', () => {
  const fallos = []

  for (const ruta of pantallas(RAIZ)) {
    const src = readFileSync(ruta, 'utf8')
    // Nombres declarados con `const X = useCallback|useMemo|useState(...)`
    const declaradas = new Map()
    for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*use(?:Callback|Memo)\(/g)) {
      declaradas.set(m[1], m.index)
    }
    if (declaradas.size === 0) continue

    // Cada aparicion del nombre dentro de una lista de dependencias `}, [ ... ])`
    for (const dep of src.matchAll(/\}\s*,\s*\[([^\]]*)\]\s*\)/g)) {
      const posicion = dep.index
      for (const nombre of dep[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const declaradaEn = declaradas.get(nombre)
        if (declaradaEn !== undefined && posicion < declaradaEn) {
          fallos.push(`${ruta.split(/[\\/]/).slice(-3).join('/')}: "${nombre}" se usa como dependencia antes de declararse`)
        }
      }
    }
  }

  assert.deepStrictEqual(fallos, [], 'zona muerta temporal:\n' + fallos.join('\n'))
})

// ─────────────────────────────────────────────────────────────────────────────
// La misma zona muerta, pero FUERA de los hooks.
//
// ☠️ CASO REAL, 26-ago-2026: en Historial escribí, cerca del principio,
//     const hayLista = !loading && filtered.length > 0
// y `filtered` se declara 112 líneas más abajo. El cuerpo del componente corre
// entero en cada render, así que revienta con ReferenceError antes de pintar
// nada: "Application error: a client-side exception has occurred", pantalla en
// blanco. `next build` compiló sin una queja y llegó a producción.
//
// La prueba de arriba solo miraba las LISTAS DE DEPENDENCIAS. Esta mira las
// const del cuerpo del componente, que es donde estaba el fallo de verdad.
//
// Se limita al primer nivel del componente (sangría de exactamente 2 espacios,
// que es el patrón de este repo) para no confundirse con las const de dentro de
// una función o un callback, que sí pueden mirar hacia abajo sin problema.

const DECL = /^ {2}const (?:\{\s*([^}]*?)\s*\}|\[\s*([^\]]*?)\s*\]|(\w+))\s*=/

function nombresDe(m) {
  if (m[3]) return [m[3]]
  const crudo = m[1] || m[2] || ''
  return crudo
    .split(',')
    .map((x) => x.split(':').pop().split('=')[0].trim())
    .filter((x) => x && /^\w+$/.test(x))
}

test('ninguna const del cuerpo usa otra declarada mas abajo', () => {
  const fallos = []
  for (const ruta of pantallas(RAIZ)) {
    const todas = readFileSync(ruta, 'utf8').split('\n')
    // Solo el cuerpo del componente. Antes de `export default function` hay
    // ayudantes del módulo con la misma sangría, y esos viven en otro ámbito:
    // contarlos daba falsos positivos (una `d` de un helper suelto contra otra
    // `d` de dentro del componente).
    const desde = todas.findIndex((l) => /^export default function/.test(l))
    if (desde < 0) continue
    const lineas = todas.slice(desde)

    // Dónde nace cada const de primer nivel.
    const nace = new Map()
    lineas.forEach((l, i) => {
      const m = l.match(DECL)
      if (m) for (const n of nombresDe(m)) if (!nace.has(n)) nace.set(n, i)
    })

    lineas.forEach((l, i) => {
      const m = l.match(DECL)
      if (!m) return
      // Una función se puede llamar antes de estar definida en el orden del
      // render; lo que no se puede es LEER una const antes de su línea.
      if (/=>\s*$|=>\s*[({]|function/.test(l)) return
      const propios = new Set(nombresDe(m))
      for (const u of l.match(/\b[a-zA-Z_$][\w$]*\b/g) || []) {
        if (propios.has(u)) continue
        const linea = nace.get(u)
        if (linea !== undefined && linea > i) {
          const corto = ruta.split(/[\/]/).slice(-3).join('/')
          fallos.push(`${corto}:${desde + i + 1} usa \`${u}\`, declarada en la linea ${desde + linea + 1}`)
        }
      }
    })
  }
  assert.deepStrictEqual(fallos, [],
    'una const leida antes de su declaracion tumba la pantalla entera:\n' + fallos.join('\n'))
})
