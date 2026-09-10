// La SALIDA de la cotizacion: el PDF y el enlace de WhatsApp.
//
// ☠️ «Exportar PDF» no generaba ningun PDF: hacia setMode('vista') + un
// setTimeout de 400 ms + window.print(). Paginaba el NAVEGADOR, con sus
// margenes y su cabecera, asi que una cotizacion de UNA prenda salia en DOS
// hojas —la segunda casi vacia—. Y los 400 ms eran una apuesta a que React
// hubiera pintado y las fotos de Cloudinary hubieran bajado: cuando no, se
// imprimia la pantalla de edicion, o el documento sin las fotos.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { encajeEnA4, A4_MM, TOLERANCIA_UNA_HOJA } from '../lib/generarPdf.js'
import { numeroWhatsApp, textoWhatsAppCotizacion } from '../lib/cotizacion.js'

// Un lienzo de 794 px de ancho es lo que captura H2C_OPTS (A4 a 96 dpi).
const ANCHO = 794
/** El alto, en px, que ocupa exactamente una hoja A4 a ese ancho. */
const UNA_HOJA_PX = ANCHO * (A4_MM.alto / A4_MM.ancho)   // ≈ 1122.9

// ── Que quepa en una hoja cuando se puede ───────────────────────────────────

test('☠️ una cotizacion de una prenda entra en UNA hoja, a tamaño natural', () => {
  // ~975 px es lo que mide el documento con una sola prenda.
  const e = encajeEnA4(ANCHO, 975)
  assert.equal(e.modo, 'una-hoja')
  assert.equal(e.hojas, 1)
  assert.equal(e.escala, 1, 'si cabe, no se encoge nada')
  assert.ok(e.alto <= A4_MM.alto, 'no se sale de la hoja')
  assert.equal(e.ancho, A4_MM.ancho)
})

test('justo del alto de una hoja sigue siendo una hoja', () => {
  const e = encajeEnA4(ANCHO, UNA_HOJA_PX)
  assert.equal(e.hojas, 1)
  assert.ok(Math.abs(e.alto - A4_MM.alto) < 0.01)
})

test('si se pasa poco se encoge, pero sigue siendo UNA hoja', () => {
  const e = encajeEnA4(ANCHO, UNA_HOJA_PX * 1.15)
  assert.equal(e.modo, 'encogida')
  assert.equal(e.hojas, 1)
  assert.ok(e.escala < 1 && e.escala > 0.8, `escala rara: ${e.escala}`)
  assert.ok(e.alto <= A4_MM.alto + 0.01, 'no se sale de la hoja')
  assert.ok(e.ancho < A4_MM.ancho, 'se dibuja mas angosto')
  // Centrado: lo que sobra se reparte igual a los dos lados.
  assert.ok(Math.abs(e.x - (A4_MM.ancho - e.ancho) / 2) < 0.01)
})

test('si se pasa mucho se pagina, en vez de quedar ilegible', () => {
  const e = encajeEnA4(ANCHO, UNA_HOJA_PX * 3)
  assert.equal(e.modo, 'paginada')
  assert.equal(e.hojas, 3, 'tres hojas justas, no tres y una franja')
  assert.ok(e.altoHojaPx > 0)
})

test('☠️ una sobra de subpixel NO se lleva una hoja entera', () => {
  // Con Math.floor cada corte quedaba una fraccion corto; a la tercera hoja la
  // deuda sumaba 3 px y salia una CUARTA hoja en blanco. El mismo defecto que
  // este modulo existe para evitar, un piso mas abajo.
  for (const n of [2, 3, 4, 5, 8]) {
    const e = encajeEnA4(ANCHO, UNA_HOJA_PX * n)
    assert.equal(e.hojas, n, `${n} hojas exactas dan ${e.hojas}`)
  }
})

test('paginar no pierde contenido: las hojas cubren todo el lienzo', () => {
  for (const alto of [2500, 3369, 4000, 5555, 9001]) {
    const e = encajeEnA4(ANCHO, alto)
    if (e.modo !== 'paginada') continue
    const cubierto = e.hojas * e.altoHojaPx
    assert.ok(cubierto >= alto - e.sobra, `se pierde contenido con alto ${alto}`)
  }
})

test('el limite entre encoger y paginar es la tolerancia, no un numero suelto', () => {
  const justoDentro = encajeEnA4(ANCHO, UNA_HOJA_PX * (TOLERANCIA_UNA_HOJA - 0.01))
  const justoFuera  = encajeEnA4(ANCHO, UNA_HOJA_PX * (TOLERANCIA_UNA_HOJA + 0.01))
  assert.equal(justoDentro.hojas, 1)
  assert.equal(justoFuera.modo, 'paginada')
})

test('nunca se dibuja nada fuera de la hoja, mida lo que mida', () => {
  for (let alto = 200; alto <= 5000; alto += 37) {
    const e = encajeEnA4(ANCHO, alto)
    if (e.modo === 'paginada') continue
    assert.ok(e.x >= 0, `x negativa con alto ${alto}`)
    assert.ok(e.x + e.ancho <= A4_MM.ancho + 0.01, `se sale de ancho con alto ${alto}`)
    assert.ok(e.y + e.alto <= A4_MM.alto + 0.01, `se sale de alto con alto ${alto}`)
  }
})

test('un lienzo sin tamaño no devuelve una cuenta imposible: lanza', () => {
  // Un canvas de 0 px es un fallo de captura. Devolver NaN aqui pondria un
  // addImage con medidas invalidas y un PDF en blanco, sin que nadie se entere.
  assert.throws(() => encajeEnA4(0, 500))
  assert.throws(() => encajeEnA4(794, 0))
})

// ── El enlace de WhatsApp ───────────────────────────────────────────────────

test('el celular se normaliza al formato de wa.me', () => {
  assert.equal(numeroWhatsApp('0991234567'), '593991234567')
  assert.equal(numeroWhatsApp('+593 99 123 4567'), '593991234567')
  assert.equal(numeroWhatsApp('099-123-4567'), '593991234567')
  assert.equal(numeroWhatsApp('991234567'), '593991234567')
})

test('☠️ a un numero que YA trae el 593 no se le antepone otro', () => {
  // La version de la pantalla del pedido hace '593' + cel y produce '593593…',
  // un enlace que abre WhatsApp con un contacto inexistente.
  const n = numeroWhatsApp('593991234567')
  assert.equal(n, '593991234567')
  assert.ok(!n.startsWith('593593'), 'codigo de pais duplicado')
})

test('sin celular devuelve vacio, no un enlace roto', () => {
  assert.equal(numeroWhatsApp(''), '')
  assert.equal(numeroWhatsApp(null), '')
  assert.equal(numeroWhatsApp(undefined), '')
  assert.equal(numeroWhatsApp('sin numero'), '')
})

test('el mensaje lleva el numero de cotizacion y el total', () => {
  const t = textoWhatsAppCotizacion(
    { cliente_nombre: 'Ana', numero: 'COT-20260910-042', validez_dias: 15 }, 123.456,
  )
  assert.ok(t.includes('Ana'))
  assert.ok(t.includes('COT-20260910-042'))
  assert.ok(t.includes('$123.46'), 'el total va formateado como dinero')
  assert.ok(t.includes('15 días'))
})

test('☠️ el mensaje NUNCA dice undefined', () => {
  // Va a un cliente REAL por WhatsApp y no se puede editar despues.
  for (const c of [{}, null, { numero: 'COT-1' }, { cliente_nombre: '  ' }]) {
    const t = textoWhatsAppCotizacion(c, undefined)
    assert.ok(!/undefined|NaN|null/.test(t), `mensaje con basura: ${t}`)
  }
})

test('sin validez no se deja una linea vacia de mas', () => {
  const t = textoWhatsAppCotizacion({ numero: 'COT-1', validez_dias: 0 }, 10)
  assert.ok(!t.includes('Válida por'))
  assert.ok(!/\n\n\n/.test(t), 'hueco doble en el mensaje')
})

// ── Que no vuelva el window.print() ─────────────────────────────────────────

test('☠️ la salida ya no depende de que el navegador pagine', () => {
  const hook = readFileSync(new URL('../components/cotizaciones/useCotizacion.js', import.meta.url), 'utf8')
  const sinComentarios = hook.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  assert.ok(!/window\.print\(\)/.test(sinComentarios), 'volvio el window.print()')
  assert.ok(!/setTimeout\(\(\) => window\.print/.test(sinComentarios))
  assert.ok(/pdfDeDocumento\('cot-doc-pdf'/.test(sinComentarios), 'el PDF se arma con jsPDF, de la copia oculta')
  assert.ok(!/pdfDeDocumento\('cot-doc'/.test(sinComentarios), '☠️ volvio a capturar el documento VISIBLE')
  // Al ancho de DISEÑO: sin esto, el mismo boton da un PDF distinto desde un
  // celular que desde un escritorio, y H2C_OPTS le recortaria el borde derecho.
  assert.ok(/anchoPx: ANCHO_DOC_COTIZACION/.test(sinComentarios), 'se captura al ancho de diseño')
  assert.ok(/dejarPintar\(\)/.test(sinComentarios), 'se espera al render antes de capturar')
})

test('los dos botones sacan el MISMO pdf', () => {
  const hook = readFileSync(new URL('../components/cotizaciones/useCotizacion.js', import.meta.url), 'utf8')
  const sinComentarios = hook.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  // Si cada boton armara el suyo, un dia se separarian y el cliente recibiria
  // algo distinto de lo que el vendedor reviso.
  assert.equal((sinComentarios.match(/await armarPdf\(\)/g) || []).length, 2)
  assert.equal((sinComentarios.match(/pdfDeDocumento\(/g) || []).length, 1)
})

test('☠️ el PDF sale de una copia oculta a ANCHO FIJO, no del documento visible', () => {
  // html2canvas clona la pagina entera en un iframe de 820 px; a ese ancho
  // aparece la barra lateral (md:flex w-56) y el documento visible queda con
  // lo que sobre. Desde el celular salia al 58% de la hoja, con un tercio en
  // blanco a la derecha.
  const form = readFileSync(new URL('../components/cotizaciones/CotizacionForm.js', import.meta.url), 'utf8')
  const sinComentarios = form.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')
  assert.ok(/id="cot-doc-pdf"/.test(sinComentarios), 'existe la copia para el PDF')
  const zona = sinComentarios.slice(sinComentarios.indexOf('h.pdfOcupado && ('), sinComentarios.indexOf('id="cot-doc-pdf"'))
  assert.ok(/position: 'fixed'/.test(zona), 'fuera del flujo: la barra lateral no la toca')
  assert.ok(/width: ANCHO_DOC_COTIZACION/.test(zona), 'ancho FIJO, el mismo que se le pasa a html2canvas')
  // Las dos copias son el MISMO componente con los MISMOS datos.
  assert.equal((sinComentarios.match(/<CotizacionPreview /g) || []).length, 2)
})

test('una hoja EXACTA, con el redondeo de subpixel, sigue siendo una hoja a tamaño natural', () => {
  // El documento se dibuja con proporcion A4 exacta; el redondeo lo deja en
  // 297.02 mm. Eso no puede caer en «encogida» al 99.99%.
  const e = encajeEnA4(ANCHO, UNA_HOJA_PX + 0.4)
  assert.equal(e.modo, 'una-hoja')
  assert.equal(e.x, 0)
  assert.ok(e.alto <= A4_MM.alto)
})

test('☠️ el documento tiene forma de hoja A4 y el pie va abajo', () => {
  const prev = readFileSync(new URL('../components/cotizaciones/CotizacionPreview.js', import.meta.url), 'utf8')
  const sinComentarios = prev.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')
  assert.ok(new RegExp(`aspectRatio: '${A4_MM.ancho} / ${A4_MM.alto}'`).test(sinComentarios), 'la proporcion es la de A4_MM')
  assert.ok(/flexDirection: 'column'/.test(sinComentarios))
  assert.ok(/marginTop: 'auto', background: th\.gradient/.test(sinComentarios), 'el pie se va al borde inferior')
})
