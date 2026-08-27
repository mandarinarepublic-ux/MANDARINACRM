// La cabecera compartida de las bandejas.
//
// POR QUÉ SE COMPARTE: este bloque estaba copiado en cinco pantallas, ocupaba el
// 25% del alto y, por estar duplicado, se desincronizó — Expandir/Contraer
// acabaron en sitios distintos en cada una.
//
// ☠️ Plegar los filtros solo es aceptable si lo que esconden SIGUE VIÉNDOSE. Una
// bandeja filtrada es idéntica a una completa; aquí ya costó 21 pedidos
// invisibles durante 14 días. Los chips son la única señal con el panel cerrado.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const barra = readFileSync(new URL('../components/BarraFiltros.js', import.meta.url), 'utf8')
const lee = (p) => readFileSync(new URL(`../app/dashboard/${p}/page.js`, import.meta.url), 'utf8')

const BANDEJAS = ['historial', 'despacho', 'produccion', 'corte', 'impresion']
// Las que tienen tarjetas plegables; Corte e Impresión no.
const CON_EXPANDIR = ['historial', 'despacho', 'produccion']

for (const pantalla of BANDEJAS) {
  test(`${pantalla}: usa la cabecera compartida, no una copia propia`, () => {
    const src = lee(pantalla)
    assert.ok(src.includes('<BarraFiltros'), 'tiene que pintar BarraFiltros')
    assert.ok(!/className="sticky top-0 z-10 bg-gray-950/.test(src),
      'la cabecera propia sobra: se desincroniza en cuanto alguien toca una sola pantalla')
  })

  test(`${pantalla}: con el panel cerrado los chips dicen qué está filtrado`, () => {
    const src = lee(pantalla)
    assert.ok(/chips=\{chips(De\(CHIP_\w+\))?\}/.test(src),
      'sin chips, plegar el panel deja filtrando a ciegas')
    assert.ok(/onQuitarChip=\{quitarFiltro\}/.test(src), 'cada chip se quita con su ×')
  })
}

for (const pantalla of CON_EXPANDIR) {
  test(`${pantalla}: Expandir/Contraer van en la fila, no en una fila propia`, () => {
    const src = lee(pantalla)
    assert.ok(/onExpandir=\{/.test(src) && /onContraer=\{/.test(src),
      'se pasan a la cabecera compartida')
    assert.ok(!/⊞ Expandir/.test(src),
      'ya no se pintan a mano en la pantalla: los pinta BarraFiltros como iconos')
  })
}

// ─── El componente ──────────────────────────────────────────────────────────

test('los chips se pintan aunque el panel esté cerrado', () => {
  // El bloque de chips no puede estar dentro de la condición del panel.
  const iChips = barra.indexOf('chips.map')
  const iPanel = barra.indexOf('{abierto && children')
  assert.ok(iChips > 0 && iPanel > 0)
  assert.ok(iChips < iPanel,
    'los chips van ANTES del panel y fuera de su condicion: son la señal que queda cuando esta cerrado')
  assert.ok(/nFiltros > 0 &&/.test(barra), 'y solo ocupan sitio si hay algo que decir')
})

test('el numero del boton sale de los chips, no de una cuenta aparte', () => {
  // Dos cuentas distintas se desincronizan: el boton diria "2" con tres chips.
  assert.ok(/const nFiltros = chips\.length/.test(barra))
})

test('todo va en UNA fila: buscador, filtros y acciones', () => {
  // Se ancla al marcador del JSX, no al comentario de cabecera del archivo.
  const fila = barra.slice(barra.indexOf('{/* UNA fila'), barra.indexOf('{/* Los chips'))
  for (const pieza of ['onBusqueda', 'onAlternarPanel', 'onExpandir', 'onContraer']) {
    assert.ok(fila.includes(pieza), `${pieza} tiene que ir en la fila del buscador`)
  }
})

test('Expandir/Contraer son iconos sin texto', () => {
  assert.ok(/aria-label="Expandir todos"/.test(barra) && /aria-label="Contraer todos"/.test(barra),
    'sin texto visible hacen falta aria-label y title, o el boton no se entiende')
  assert.ok(/title="Expandir todos"/.test(barra))
})

test('lo que lleva datos no se pliega nunca', () => {
  // Los contadores de Corte y el "N/30 seleccionados" de Impresion.
  assert.ok(/\{debajo && /.test(barra), 'la zona fija existe')
  const iDebajo = barra.indexOf('{debajo &&')
  assert.ok(iDebajo < barra.indexOf('{abierto && children'),
    'la zona fija va fuera —y antes— del panel plegable')
  assert.ok(lee('corte').includes('debajo={'), 'Corte: los contadores no se esconden')
  assert.ok(lee('impresion').includes('debajo={'), 'Impresion: el contador del lote no se esconde')
})
