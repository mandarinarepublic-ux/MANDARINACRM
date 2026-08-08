// El ancho de las pantallas que se ven dentro del panel del inbox.
//
// Son DOS y van juntas en el mismo recorrido: se crea el pedido en
// `nuevo-pedido` y se aterriza en `pedido/[id]`. Las dos tienen el mismo par de
// problemas cuando se las mete en un iframe angosto:
//   1. `max-w-2xl mx-auto` (tope de 672px) solo agrega vacío a los lados.
//   2. `md:left-60` corre la barra fija 240px para dejarle sitio a un menú
//      lateral que en embed NO existe.
//
// La restricción dura es que SIN `embed=1` las dos queden idénticas: con una se
// crean los pedidos reales y con la otra se consulta, se imprime y se despacha.
// Estas pruebas fijan que la rama de "suelto en el CRM" siga dando exactamente
// las clases de siempre.
//
// Son pruebas de fuente, no de render, porque montar los componentes pediría
// todo el bundler de Next. Lo que vigilan es barato y concreto: que nadie borre
// el `max-w-2xl` creyendo que estorba, ni suelte el `md:left-60` que le deja
// sitio al menú.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const PANTALLAS = [
  {
    nombre: 'nuevo-pedido',
    ruta: '../app/dashboard/nuevo-pedido/page.js',
    // Cabecera, barra de pasos y cuerpo del formulario.
    contenedores: 3,
  },
  {
    nombre: 'pedido/[id]',
    ruta: '../app/dashboard/pedido/[id]/page.js',
    // Cabecera y cuerpo. Acá no hay barra de pasos.
    contenedores: 2,
  },
]

for (const p of PANTALLAS) {
  const src = readFileSync(new URL(p.ruta, import.meta.url), 'utf8')

  test(`[${p.nombre}] el ancho suelto en el CRM sigue siendo el tope centrado de siempre`, () => {
    const m = src.match(/const anchoContenido = esEmbed \? '([^']*)' : '([^']*)'/)
    assert.ok(m, 'no se encontró la definición de anchoContenido')
    const [, enEmbed, suelto] = m
    assert.strictEqual(suelto, 'max-w-2xl mx-auto', 'sin embed tiene que quedar EXACTAMENTE como antes')
    assert.strictEqual(enEmbed, 'w-full', 'en embed se usa el ancho completo')
  })

  test(`[${p.nombre}] todos los contenedores usan anchoContenido`, () => {
    // Si uno se queda con el tope fijo, en embed una parte sale angosta y la otra
    // ancha: se ve peor que antes de tocar nada.
    const usos = src.match(/anchoContenido/g) || []
    const esperados = p.contenedores + 1 // + la definición
    assert.strictEqual(usos.length, esperados, `se esperaban ${esperados} menciones, hay ${usos.length}`)
  })

  test(`[${p.nombre}] no queda ningún max-w-2xl suelto en un className`, () => {
    // Solo se miran las líneas que pintan clases: los comentarios nombran
    // `max-w-2xl` a propósito, para explicar por qué existe.
    const sueltos = src.split('\n').filter((l) => l.includes('max-w-2xl') && l.includes('className'))
    assert.deepStrictEqual(sueltos, [], 'quedó un max-w-2xl sin pasar por anchoContenido')
  })

  test(`[${p.nombre}] la barra fija conserva el hueco del menú SOLO fuera de embed`, () => {
    assert.ok(
      /esEmbed \? '' : 'md:left-60'/.test(src),
      'la barra debe soltar md:left-60 solo en embed',
    )
    assert.ok(
      !/right-0 md:left-60/.test(src),
      'quedó un md:left-60 fijo, sin condicionar al modo',
    )
  })

  test(`[${p.nombre}] lee el modo embed de la URL`, () => {
    assert.ok(
      /const esEmbed = searchParams\??\.?get\('embed'\) === '1'/.test(src),
      'falta leer ?embed=1 de la URL',
    )
  })
}

// ── Cosas que NO son contenedores del contenido y no se tocaron ───────────────

test('[nuevo-pedido] el modal de "cliente ya existe" conserva su ancho propio', () => {
  const src = readFileSync(new URL('../app/dashboard/nuevo-pedido/page.js', import.meta.url), 'utf8')
  assert.ok(src.includes('w-full max-w-md p-5'), 'el modal perdió su ancho propio')
})

test('[pedido/[id]] los diálogos y la vista previa del PDF conservan su ancho', () => {
  // Son superposiciones centradas sobre la pantalla entera, no contenedores del
  // contenido: la vista previa del PDF va a 3xl porque ese ancho es el del
  // documento, no el del panel. Tocarlas deformaría el PDF.
  const src = readFileSync(new URL('../app/dashboard/pedido/[id]/page.js', import.meta.url), 'utf8')
  assert.ok(src.includes('max-w-3xl mx-auto'), 'la vista previa del PDF perdió su ancho')
  assert.ok(src.includes('w-full max-w-md p-5'), 'el modal perdió su ancho propio')
  assert.ok(src.includes('max-w-md mx-auto px-4 py-16'), 'el aviso de "pedido no disponible" perdió su ancho')
})
