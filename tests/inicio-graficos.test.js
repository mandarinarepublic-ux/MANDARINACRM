// Los dos graficos de barras del panel de Inicio.
//
// Lo que se fija aca no es el diseño, son las formas de MENTIR con un grafico
// que ya nos costarian caro en este CRM:
//
//  ☠️ Un dia sin ventas que desaparece en vez de salir en cero. Es el bug mas
//     reincidente de la casa en otra ropa: "sin dato" pintado como "no pasa
//     nada". Un feriado que se come su columna deforma el ritmo del mes.
//  ☠️ Un mes a medias comparado contra meses completos. Junio arranca el 18
//     (primer pedido del CRM) y el mes en curso todavia no termina: las dos
//     barras son cortas por el calendario, no por las ventas.
//  ☠️ Recortar un ISO para sacar el dia. A las 19:00 Supabase manda UTC y el
//     pedido salta al dia siguiente.
//
// `node --test` no entiende `@/`: por eso el import es relativo.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  alturaBarra, esUltimoDiaDelMes, etiquetaDiaLarga, etiquetaMesLarga, formatoMonto,
  indicesEje, indicesEtiquetados, maxSerie, notaMeses, serieDias, serieMeses,
  topeDeEscala, totalSerie, capitalizar,
} from '../lib/grafico.js'

const inicio = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
const grafico = readFileSync(new URL('../components/GraficoBarras.js', import.meta.url), 'utf8')
const ventas = readFileSync(new URL('../components/GraficosVentas.js', import.meta.url), 'utf8')
// El panel de cada rol, recortado, para preguntar quien monta los graficos.
const panelDe = (nombre) => {
  const desde = inicio.indexOf(`function ${nombre}(`)
  if (desde < 0) throw new Error(`no existe ${nombre}`)
  const resto = inicio.slice(desde + 1)
  const corte = /^function /m.exec(resto)
  return corte ? resto.slice(0, corte.index) : resto
}

// ─── Las fechas no pueden enganiar ──────────────────────────────────────────

test('las etiquetas se arman partiendo la cadena, no parseando el ISO', () => {
  // `new Date('2026-06-18')` es UTC medianoche: en Ecuador (UTC-5) retrocede al
  // 17 de junio. Estas etiquetas tienen que dar igual corra donde corra.
  assert.equal(etiquetaDiaLarga('2026-06-18'), '18 de junio')
  assert.equal(etiquetaMesLarga('2026-01'), 'enero 2026')
  assert.equal(etiquetaMesLarga('2026-12'), 'diciembre 2026')
  assert.ok(!/new Date\(\s*(?:iso|ym|str)/.test(readFileSync(new URL('../lib/grafico.js', import.meta.url), 'utf8')),
    'nada de new Date() sobre la cadena de fecha')
})

test('el ultimo dia del mes se calcula bien, bisiesto incluido', () => {
  assert.equal(esUltimoDiaDelMes('2026-08-31'), true)
  assert.equal(esUltimoDiaDelMes('2026-08-30'), false)
  assert.equal(esUltimoDiaDelMes('2026-02-28'), true)
  assert.equal(esUltimoDiaDelMes('2024-02-29'), true)
  assert.equal(esUltimoDiaDelMes('2024-02-28'), false)
})

// ─── Un dia sin ventas sale en CERO, no desaparece ──────────────────────────

test('los dias sin ventas siguen en la serie', () => {
  const serie = serieDias([
    { dia: '2026-08-01', monto: 500, pedidos: 3 },
    { dia: '2026-08-02', monto: 0, pedidos: 0 },
    { dia: '2026-08-03', monto: 120, pedidos: 1 },
  ], '2026-08-03')

  assert.equal(serie.length, 3, 'el dia en cero NO se filtra')
  assert.equal(serie[1].monto, 0)
  assert.equal(serie[2].actual, true, 'hoy queda marcado')
  assert.equal(serie[0].actual, false)
})

test('un dia en cero se ve distinto de un dia inexistente', () => {
  // La barra en cero deja una marca gris al ras del eje. Sin eso, "no vendi
  // nada" y "ese dia no existe" se pintan exactamente igual.
  assert.ok(/monto > 0 \? color : '#374151'/.test(grafico),
    'el cero tiene su propio color, no la ausencia de barra')
  assert.ok(/height: d\.monto > 0/.test(grafico) && /: '2px'/.test(grafico),
    'el cero conserva una altura minima visible')
})

// ─── Meses parciales ────────────────────────────────────────────────────────

const HISTORICO = [
  { mes: '2026-06', monto: 7462.41, pedidos: 123 },
  { mes: '2026-07', monto: 20099, pedidos: 368 },
  { mes: '2026-08', monto: 15025.14, pedidos: 347 },
]

test('el primer mes del CRM se marca como parcial', () => {
  // El primer pedido es del 18-jun: junio son 13 dias, no 30.
  const s = serieMeses(HISTORICO, '2026-06-18', '2026-08-31')
  assert.equal(s[0].parcial, 'inicio', 'junio arranca a mitad de mes')
  assert.ok(notaMeses(s, '2026-06-18').includes('18'), 'la nota dice desde que dia')
})

test('al vendedor la nota le habla de SU primer pedido, no del CRM', () => {
  // ☠️ La serie de un vendedor arranca en SU primer pedido. A GRACE VEGA, que
  // empezo el 22-jun, decirle "primer pedido del CRM" es sencillamente falso:
  // el CRM arranco el 18. La advertencia tiene que nombrar el hito real.
  const suya = serieMeses(
    [{ mes: '2026-06', monto: 448.5, pedidos: 11 }, { mes: '2026-07', monto: 0, pedidos: 0 }],
    '2026-06-22', '2026-07-31',
  )
  const paraElla = notaMeses(suya, '2026-06-22', 'tu primer pedido')
  assert.ok(paraElla.includes('tu primer pedido'), paraElla)
  assert.ok(!paraElla.includes('del CRM'), 'no es el primer pedido del CRM, es el suyo')
  assert.ok(paraElla.includes('22'), 'y dice desde que dia')

  // Un ADMIN que FILTRA por ella esta viendo lo mismo, y tampoco puede leer
  // "primer pedido del CRM": el CRM arranco el 18, ella el 22.
  const filtrado = notaMeses(suya, '2026-06-22', 'primer pedido de GRACE VEGA')
  assert.ok(filtrado.includes('primer pedido de GRACE VEGA'), filtrado)
  assert.ok(!filtrado.includes('del CRM'))

  // Sin filtro y sin ser vendedor, SI es el hito del CRM. Es el valor por defecto.
  assert.ok(notaMeses(suya, '2026-06-22').includes('primer pedido del CRM'))
})

test('el mes en curso se marca — salvo el dia que lo cierra', () => {
  // El 5 de septiembre la barra de septiembre es diminuta al lado de agosto y
  // se lee como un derrumbe. No lo es: al mes le faltan 25 dias.
  const conSept = [...HISTORICO, { mes: '2026-09', monto: 900, pedidos: 12 }]
  const enCurso = serieMeses(conSept, '2026-06-18', '2026-09-05')
  assert.equal(enCurso[3].parcial, 'curso')
  assert.ok(notaMeses(enCurso, '2026-06-18').includes('en curso'))

  // Hoy es 31-ago: agosto YA esta completo y no lleva advertencia sobrante.
  const cerrado = serieMeses(HISTORICO, '2026-06-18', '2026-08-31')
  assert.equal(cerrado[2].parcial, null, 'el ultimo dia del mes lo deja completo')
  assert.ok(!notaMeses(cerrado, '2026-06-18').includes('en curso'))
})

test('sin datos no se inventan advertencias', () => {
  const s = serieMeses([], null, '2026-08-31')
  assert.deepEqual(s, [])
  assert.equal(notaMeses(s, null), '')
})

// ─── La escala y las etiquetas ──────────────────────────────────────────────

test('un panel sin ventas NO pinta barras al tope', () => {
  // Con el maximo en 0, dividir por el maximo daria NaN o Infinity y las barras
  // se irian arriba: un mes muerto se veria como el mejor del anio.
  assert.equal(alturaBarra(0, 0), 0)
  assert.equal(alturaBarra(100, 0), 0)
  assert.equal(maxSerie([{ monto: 0 }, { monto: 0 }]), 0)
  assert.equal(maxSerie([]), 0)
})

test('la altura es proporcional al monto y nunca se pasa de 100', () => {
  assert.equal(alturaBarra(50, 100), 50)
  assert.equal(alturaBarra(100, 100), 100)
  assert.equal(alturaBarra(150, 100), 100)
  assert.equal(alturaBarra(-5, 100), 0)
})

test('la barra mas alta deja sitio para su propia etiqueta', () => {
  // Si la barra maxima llegara al techo, su numero se montaria sobre el titulo
  // de la tarjeta. Se le reserva una franja arriba.
  const serie = [{ monto: 100 }, { monto: 50 }]
  const tope = topeDeEscala(serie)
  const alta = alturaBarra(100, tope)
  assert.ok(alta < 95, `la barra maxima tapa la cabecera: ${alta}%`)
  assert.ok(alta > 75, `se desaprovecha demasiado alto: ${alta}%`)
  // La proporcion entre barras NO cambia: 50 sigue siendo la mitad de 100.
  assert.equal(Math.round(alturaBarra(50, tope) * 2), Math.round(alta))
  // Sin ventas no hay escala que inventar.
  assert.equal(topeDeEscala([{ monto: 0 }]), 0)
})

test('en español solo se capitaliza la primera letra', () => {
  // La clase `capitalize` de Tailwind capitaliza CADA palabra: dejaba
  // "19 De Agosto" y "Septiembre 2026 En Curso".
  assert.equal(capitalizar('junio 2026'), 'Junio 2026')
  assert.equal(capitalizar('18 de junio'), '18 de junio')
  assert.equal(capitalizar(''), '')
  assert.ok(!/className="[^"]*capitalize/.test(grafico),
    'nada de la clase capitalize de Tailwind en este componente')
})

test('no se escribe un numero sobre CADA barra', () => {
  // Con 31 dias, 31 numeros encimados no los lee nadie: solo el maximo.
  const mes = Array.from({ length: 31 }, (_, i) => ({ monto: (i + 1) * 10, pedidos: 1 }))
  const marcados = indicesEtiquetados(mes)
  assert.equal(marcados.length, 1, 'solo una etiqueta con 31 barras')
  assert.equal(marcados[0], 30, 'y es la mas alta')

  // Con pocas barras (el historico) caben todas y ahorran pasar el mouse.
  assert.deepEqual(indicesEtiquetados([{ monto: 10 }, { monto: 30 }, { monto: 20 }]), [0, 1, 2])
  // Una serie en ceros no lleva etiquetas colgando de la nada.
  assert.deepEqual(indicesEtiquetados([{ monto: 0 }, { monto: 0 }]), [])
})

test('el eje X no intenta pintar 31 numeros y siempre llega a hoy', () => {
  const ejes = indicesEje(31)
  assert.ok(ejes.length <= 10, `demasiadas etiquetas de eje: ${ejes.length}`)
  assert.equal(ejes[0], 0, 'empieza en el dia 1')
  assert.equal(ejes[ejes.length - 1], 30, 'y termina en hoy')
  // Con pocas barras salen todas.
  assert.deepEqual(indicesEje(3), [0, 1, 2])
})

test('el monto se formatea igual en el navegador, en Vercel y aca', () => {
  // A proposito NO se usa toLocaleString: el ICU cambia entre runtimes.
  assert.equal(formatoMonto(15025.14), '$15.025')
  assert.equal(formatoMonto(0), '$0')
  assert.equal(formatoMonto(999), '$999')
  assert.equal(formatoMonto(1000), '$1.000')
  assert.equal(formatoMonto(1234567), '$1.234.567')
  assert.equal(formatoMonto(null), '$0')
  assert.equal(totalSerie(HISTORICO.map((m) => ({ monto: m.monto }))), 42586.55)
})

// ─── Como se pinta ──────────────────────────────────────────────────────────

test('una sola serie, un solo color: nada de rampa por valor', () => {
  // Pintar cada barra mas oscura cuanto mas vende duplica en el color lo que ya
  // dice el alto y quema el unico canal libre que queda.
  const cuerpo = grafico.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  assert.ok(!/monto\s*[/>]\s*max\s*\)?\s*\*/.test(cuerpo.replace(/alturaBarra[^\n]*/g, '')),
    'el color no puede depender del monto')
  assert.ok(/backgroundColor: d\.monto > 0 \? color :/.test(cuerpo),
    'el color es el mismo para toda barra con venta')
})

test('el valor se puede leer sin pasar el mouse', () => {
  // Un globo no puede ser la UNICA via a un numero: hay vista de tabla.
  assert.ok(/setTabla/.test(grafico) && /<table/.test(grafico), 'falta la vista de tabla')
  assert.ok(/onKeyDown=\{teclas\}/.test(grafico), 'las barras se recorren con el teclado')
  assert.ok(/ArrowRight/.test(grafico) && /ArrowLeft/.test(grafico))
})

test('la rejilla es solida, no punteada', () => {
  // El punteado se lee como "proyeccion" o "umbral"; esto es una rejilla.
  assert.ok(!/border-dashed|dashed/.test(grafico))
})

// ─── El panel ───────────────────────────────────────────────────────────────

test('los graficos comen de la BASE, no recalculan en el navegador', () => {
  assert.ok(/data\.ventasPorMes/.test(ventas) && /data\.ventasPorDia/.test(ventas),
    'las series llegan agregadas desde resumen_inicio')
  assert.ok(!/\.reduce\(.*monto_total/.test(ventas), 'no se suman pedidos en el cliente')
  assert.ok(/serieMeses\(/.test(ventas) && /serieDias\(/.test(ventas))
})

test('el historico va a la izquierda y el mes en curso a la derecha', () => {
  const mes = ventas.indexOf('por mes')
  const dia = ventas.indexOf('por día')
  assert.ok(mes > 0 && dia > 0, 'los dos graficos existen')
  assert.ok(mes < dia, 'el historico por mes va primero (izquierda / arriba en celular)')
  assert.ok(/md:grid-cols-2/.test(ventas), 'lado a lado en escritorio, apilados en celular')
})

// ─── Quien los ve ───────────────────────────────────────────────────────────

test('los ven ADMIN y los vendedores, nadie mas', () => {
  assert.ok(panelDe('DashboardAdmin').includes('<GraficosVentas'), 'ADMIN los tiene')
  assert.ok(panelDe('DashboardVendedor').includes('<GraficosVentas'), 'el vendedor los tiene')

  // Produccion, corte y despacho NO ven plata, y asi se queda: si a alguno le
  // aparecieran las ventas de la casa, seria una fuga, no una mejora.
  //
  // ⚠️ YAW queda FUERA por decision de Rodrigo (31-ago-2026), no por descuido.
  // Su panel es de venta y la base ya sabria acotarlo a su tienda, asi que es
  // el candidato obvio a que alguien "lo complete" sin preguntar. Si algun dia
  // se decide agregarlo, se borra de esta lista a proposito — no se le da la
  // vuelta a la prueba.
  for (const panel of ['DashboardDiseno', 'DashboardDespacho', 'DashboardYAW']) {
    assert.ok(!panelDe(panel).includes('<GraficosVentas'), `${panel} no lleva graficos de ventas`)
  }
  assert.equal(inicio.split('<GraficosVentas').length - 1, 2, 'solo dos paneles los montan')
})

test('el vendedor ve SOLO lo suyo, y eso lo decide la base', () => {
  // ☠️ El recorte por vendedor NO puede vivir en la pantalla: `/api/inicio` saca
  // la identidad de la cookie firmada y `resumen_inicio` filtra por
  // `vendedor_id`. Si el componente aceptara un vendedor por prop, bastaria con
  // cambiarlo en el navegador para ver las ventas de otro.
  assert.ok(!/vendedor/i.test(ventas.replace(/^\s*\/\/.*$/gm, '')),
    'el componente no toca vendedores: no filtra, pinta lo que le dan')

  // ⚠️ Desde el 1-sep la pantalla SÍ manda `?vendedor=`, pero es el filtro del
  // panel de ADMIN: solo ACOTA, y el route lo tira si la cookie no dice ADMIN
  // (ver tests/inicio-filtros.test.js). Lo que sigue prohibido es mandar la
  // IDENTIDAD: el rol y el alcance salen de la cookie firmada, siempre.
  // ⚠️ Sin quitar los comentarios esto se dispara con el comentario de la propia
  // pantalla, que dice «NO se manda ?rol=». Un texto que EXPLICA la regla no es
  // una violación de la regla.
  const codigo = inicio.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  assert.ok(!/qs\.set\('rol'|\?rol=/.test(codigo), 'el rol no puede viajar por query')

  // `mias` cambia TEXTOS (titulos y como se nombra el hito de la nota), nunca
  // QUE datos se pintan. Si algun dia se colara en la serie, esto se cae.
  assert.ok((ventas.match(/mias \?/g) || []).length >= 2, 'mias se usa para los titulos')
  for (const linea of ventas.split('\n')) {
    if (!/serie=\{|serieDias\(|serieMeses\(|ventasPor/.test(linea)) continue
    assert.ok(!linea.includes('mias'),
      `mias NO puede decidir que datos se pintan: ${linea.trim()}`)
  }
})

test('la nota nombra la tarjeta que el lector tiene delante', () => {
  // El ADMIN ve una tarjeta "Ventas del mes"; el vendedor, una "Mes actual".
  // Mandar a cotejar contra una tarjeta que no existe en su pantalla no sirve.
  assert.ok(/«Ventas del mes»/.test(ventas) && /«Mes actual»/.test(ventas))
  const vendedor = panelDe('DashboardVendedor')
  assert.ok(/Mes actual/.test(vendedor), 'esa tarjeta existe de verdad en el panel del vendedor')
  assert.ok(/Ventas del mes/.test(panelDe('DashboardAdmin')), 'y esta en el de ADMIN')
})
