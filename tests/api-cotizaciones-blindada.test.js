// /api/cotizaciones: el mismo agujero que /api/pedidos, dos meses despues.
//
// ☠️ El GET aceptaba `?rol=ADMIN` y `?createdBy=<id>` del NAVEGADOR, y
// `listCotizaciones` decidia con eso quien ve que. Cualquiera con sesion —un
// VENDEDOR_YAW, por ejemplo— pedia `?rol=ADMIN` y se llevaba las cotizaciones
// de TODOS, con nombre, cedula, telefono y email de cada cliente.
//
// ☠️ Y las rutas por id no comprobaban NADA: con un id se leia, y se ESCRIBIA,
// la cotizacion de cualquier otro vendedor.
//
// Es la misma trampa que api-pedidos-blindada.test.js ya vigila para
// /api/pedidos. Se repitio porque el modulo se escribio aparte y nadie miro
// aquel arreglo. Esta prueba existe para que no haya una tercera vez.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

const lista = sinComentarios(readFileSync(new URL('../app/api/cotizaciones/route.js', import.meta.url), 'utf8'))
const porId = sinComentarios(readFileSync(new URL('../app/api/cotizaciones/[id]/route.js', import.meta.url), 'utf8'))

const corte = lista.indexOf('export async function POST')
const get = lista.slice(0, corte)
const post = lista.slice(corte)

test('☠️ el GET ya no lee NINGUN parametro de identidad de la url', () => {
  for (const p of ['rol', 'createdBy', 'created_by', 'vendedor', 'scope']) {
    assert.ok(!new RegExp(`searchParams\\.get\\('${p}'\\)`).test(get),
      `sigue leyendo ?${p}= del navegador`)
  }
  // Ni siquiera abre la URL: no hay nada legitimo que mandar.
  assert.ok(!/new URL\(req\.url\)/.test(get), 'el GET no necesita mirar la url')
})

test('la identidad sale de la cookie firmada, releida de la base', () => {
  assert.ok(/usuarioDeSesion\(\)/.test(get), 'quien pregunta se sabe por la cookie')
  assert.ok(/usuario\.USUARIO_ID/.test(get) && /usuario\.ROL/.test(get),
    'el dueño y el rol salen del usuario verificado, no de la url')
})

test('☠️ el POST no deja firmar una cotizacion a nombre de otro', () => {
  assert.ok(/usuarioDeSesion\(\)/.test(post), 'el POST tambien exige sesion de persona')
  // El body se expande PRIMERO y el dueño se pisa despues: si el orden se
  // invierte, un `created_by` del cuerpo vuelve a ganar.
  const orden = post.indexOf('...body')
  const dueño = post.indexOf('created_by: quien.usuario.USUARIO_ID')
  assert.ok(orden >= 0 && dueño > orden,
    'created_by tiene que pisarse DESPUES de expandir el body')
})

test('☠️ leer o editar por id exige ser dueño (o ADMIN)', () => {
  assert.ok(/usuarioDeSesion\(\)/.test(porId), 'las rutas por id ya no son anonimas entre usuarios')
  assert.ok(/ROL === 'ADMIN'/.test(porId), 'el admin sigue viendo todo')
  assert.ok(/created_by === quien\.usuario\.USUARIO_ID/.test(porId), 'el resto, solo lo suyo')

  // Las dos rutas pasan por el mismo guardia. Si alguna se salta la
  // comprobacion, vuelve el agujero entero.
  for (const metodo of ['GET', 'PATCH']) {
    const i = porId.indexOf(`export async function ${metodo}`)
    assert.ok(i >= 0, `falta el ${metodo}`)
    const cuerpo = porId.slice(i, porId.indexOf('export async function', i + 10) + 1 || undefined)
    assert.ok(/cotizacionPermitida\(params\.id\)/.test(cuerpo),
      `el ${metodo} no pasa por el guardia de permiso`)
  }
})

test('sin permiso se responde 404, no 403', () => {
  // Un 403 confirmaria que ese id existe, y probar ids hasta que uno deje de
  // dar 404 es el mapa que no hay que regalar.
  assert.ok(!/status: 403/.test(porId), 'un 403 delata que la cotizacion existe')
  assert.ok(/status: 404, error: 'no encontrada'/.test(porId), 'para quien no es dueño, no esta')
})

test('☠️ el PATCH no deja reasignar el dueño', () => {
  // `created_by` esta en la whitelist de columnas escribibles porque el POST lo
  // necesita: sin esto, un PATCH regala la cotizacion a otro id.
  const i = porId.indexOf('export async function PATCH')
  const cuerpo = porId.slice(i)
  assert.ok(/created_by: permiso\.row\.created_by/.test(cuerpo),
    'el dueño se pisa con el de la fila')
  const patch = cuerpo.indexOf('...patch')
  const dueño = cuerpo.indexOf('created_by: permiso.row.created_by')
  assert.ok(patch >= 0 && dueño > patch, 'y se pisa DESPUES de expandir el patch')
})

test('☠️ ninguna pantalla vuelve a mandar su rol por la url', () => {
  const raiz = new URL('../app/dashboard', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const pantallas = []
  ;(function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (n.endsWith('.js')) pantallas.push(p)
    }
  })(raiz)

  for (const p of pantallas) {
    const t = readFileSync(p, 'utf8')
    for (const m of t.matchAll(/\/api\/cotizaciones\?([^`'"]*)/g)) {
      assert.ok(!/\brol=|\bcreatedBy=/.test(m[1]),
        `${p} le sigue diciendo al servidor quien es: ?${m[1]}`)
    }
  }
})
