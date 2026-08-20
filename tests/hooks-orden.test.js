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
