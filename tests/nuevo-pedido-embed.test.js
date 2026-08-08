// El ancho del formulario de nuevo-pedido según el modo.
//
// La restricción dura de esta pantalla es que SIN `embed=1` no puede cambiar
// nada: es con la que el equipo crea los pedidos reales todos los días. Estas
// pruebas leen el fuente y fijan que la rama de "suelto en el CRM" siga dando
// exactamente las clases de siempre.
//
// Son pruebas de fuente, no de render, porque montar el componente pediría todo
// el bundler de Next. Lo que vigilan es barato y concreto: que nadie borre el
// `max-w-2xl` creyendo que estorba, ni suelte el `md:left-60` que le deja sitio
// al menú lateral.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/dashboard/nuevo-pedido/page.js', import.meta.url), 'utf8')

test('el ancho suelto en el CRM sigue siendo el tope centrado de siempre', () => {
  const m = src.match(/const anchoContenido = esEmbed \? '([^']*)' : '([^']*)'/)
  assert.ok(m, 'no se encontró la definición de anchoContenido')
  const [, enEmbed, suelto] = m
  assert.strictEqual(suelto, 'max-w-2xl mx-auto', 'sin embed tiene que quedar EXACTAMENTE como antes')
  assert.strictEqual(enEmbed, 'w-full', 'en embed se usa el ancho completo')
})

test('los tres contenedores del formulario usan anchoContenido', () => {
  // Si uno se queda con el tope fijo, en embed los campos salen angostos y el
  // botón ancho: peor que antes de tocar nada.
  const usos = src.match(/anchoContenido/g) || []
  // 1 la definición + 3 los contenedores (cabecera, pasos y cuerpo)
  assert.strictEqual(usos.length, 4, `se esperaban 4 menciones de anchoContenido, hay ${usos.length}`)
})

test('ya no queda ningún max-w-2xl suelto en un className', () => {
  // Solo se miran las líneas que pintan clases: los comentarios de arriba
  // nombran `max-w-2xl` a propósito, para explicar por qué existe.
  const sueltos = src.split('\n').filter(
    (l) => l.includes('max-w-2xl') && l.includes('className'),
  )
  assert.deepStrictEqual(sueltos, [], 'quedó un max-w-2xl sin pasar por anchoContenido')
})

test('la barra de Siguiente conserva el hueco del menú SOLO fuera de embed', () => {
  // `md:left-60` corre la barra 240px para no quedar debajo del menú lateral. En
  // embed no hay menú, y ese hueco era lo que impedía que el botón llegara al
  // borde. Fuera de embed tiene que seguir estando.
  assert.ok(
    /esEmbed \? '' : 'md:left-60'/.test(src),
    'la barra debe soltar md:left-60 solo en embed',
  )
  assert.ok(
    !/right-0 md:left-60/.test(src),
    'quedó un md:left-60 fijo, sin condicionar al modo',
  )
})

test('el modal de "cliente ya existe" no se tocó', () => {
  // Es un diálogo centrado, no un contenedor del formulario: su max-w-md se
  // queda como está.
  assert.ok(src.includes('w-full max-w-md p-5'), 'el modal perdió su ancho propio')
})
