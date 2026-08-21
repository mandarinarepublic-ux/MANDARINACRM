// GET /api/pedidos: la puerta que estuvo abierta meses.
//
// ☠️ Aceptaba `?rol=ADMIN` del NAVEGADOR. Cualquiera con una sesion —de
// cualquier rol— podia pedirla y llevarse los 690 pedidos con nombre, cedula y
// celular de cada cliente. El servidor obedecia: quien preguntaba decia quien
// era.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const api = readFileSync(new URL('../app/api/pedidos/route.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const get = sinComentarios(api).slice(0, sinComentarios(api).indexOf('export async function POST'))

test('☠️ el GET ya no lee NINGUN parametro de identidad de la url', () => {
  for (const p of ['rol', 'vendedor', 'vendedorId', 'scope']) {
    assert.ok(!new RegExp(`searchParams\\.get\\('${p}'\\)`).test(get),
      `sigue leyendo ?${p}= del navegador`)
  }
  // Ni siquiera abre la URL: no hay nada legitimo que mandar.
  assert.ok(!/new URL\(req\.url\)/.test(get), 'el GET no necesita mirar la url')
})

test('la identidad sale de la cookie firmada', () => {
  assert.ok(/sesionActual\(\)/.test(get), 'quien pregunta se sabe por la cookie')
  assert.ok(/getUsuarioById\(sesion\.id\)/.test(get), 'y se relee de la base, no se confia en la cookie')
  assert.ok(/usuario\.ACTIVO !== 'TRUE'/.test(get), 'un usuario desactivado no pasa')
})

test('un VENDEDOR sigue viendo solo lo suyo', () => {
  assert.ok(/scope: rol === 'VENDEDOR' \? 'mios' : null/.test(get),
    'el alcance se decide por el rol REAL, no por lo que diga la url')
})

test('☠️ NINGUNA pantalla vuelve a pedir la lista completa', () => {
  // Cada una tiene su cola acotada. Si alguien revive esta llamada, vuelve el
  // tope de 1000 y la fuga de datos de cliente.
  const raiz = new URL('../app/dashboard', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const pantallas = []
  ;(function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (n === 'page.js') pantallas.push(p)
    }
  })(raiz)

  const culpables = []
  for (const ruta of pantallas) {
    const codigo = sinComentarios(readFileSync(ruta, 'utf8'))
    // `/api/pedidos/algo` (detalle por id) esta bien; `/api/pedidos?` o
    // `/api/pedidos'` (la lista) no.
    if (/['"`]\/api\/pedidos(\?|['"`])/.test(codigo)) {
      culpables.push(ruta.split(/[\\/]/).slice(-2).join('/'))
    }
  }
  // nuevo-pedido hace POST a /api/pedidos: ese es el unico uso legitimo.
  const sinPermiso = culpables.filter((c) => !c.startsWith('nuevo-pedido/'))
  assert.deepStrictEqual(sinPermiso, [], `estas pantallas piden la lista completa: ${sinPermiso.join(', ')}`)
})
