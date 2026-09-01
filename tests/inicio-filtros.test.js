// Los filtros del panel de Inicio: clicar un vendedor o una tienda acota TODA
// la hoja (tarjetas, gráficos y estados).
//
// Lo que se fija aquí son las tres formas de que esto salga caro:
//
//  ☠️ Que el filtro AMPLÍE en vez de acotar. Es la unica manera de que esto sea
//     una fuga: un vendedor mandando `?vendedor=OTRO` a mano. El rol sigue
//     saliendo de la cookie firmada y el filtro se aplica DENTRO de lo suyo;
//     ademas el route ni se los pasa si no eres ADMIN.
//  ☠️ Que un panel filtrado se vea igual que uno completo. $3.768 leidos como
//     las ventas de la casa. Por eso el aviso ambar es obligatorio.
//  ☠️ Que la fila SELECCIONADA desaparezca de su lista y deje el panel trabado
//     sin forma de quitar el filtro.
//
// `node --test` no entiende `@/`: por eso el import es relativo.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { filasSeleccionables, totalFilas } from '../lib/grafico.js'

const inicio = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/inicio/route.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')

// ─── El filtro solo puede ACOTAR ────────────────────────────────────────────

test('los filtros solo los acepta un ADMIN, y el rol nunca viene del navegador', () => {
  const codigo = sinComentarios(api)
  assert.ok(/sesionActual\(\)/.test(codigo), 'quien pregunta se sabe por la cookie firmada')
  assert.ok(!/searchParams\.get\('rol'\)/.test(codigo), 'el ROL NO puede venir por query')
  assert.ok(!/searchParams\.get\('scope'\)/.test(codigo))

  // La puerta: `esAdmin` sale del rol de la COOKIE, y sin eso los filtros son
  // null. Si alguien quita esta guardia, un vendedor podria pedir otro alcance.
  assert.ok(/const esAdmin = rol === 'ADMIN'/.test(codigo), 'falta la guardia de ADMIN')
  assert.ok(/if \(!esAdmin\) return null/.test(codigo),
    'los filtros tienen que morir en seco si no eres ADMIN')

  // Y se le pasan a la base por parametros propios, distintos de la identidad.
  assert.ok(/p_filtro_vendedor:/.test(codigo) && /p_filtro_tienda:/.test(codigo))
  assert.ok(/p_vendedor: vendedor/.test(codigo), 'la identidad sigue saliendo de la sesion')
})

test('la pantalla manda los filtros, nunca el rol ni el vendedor', () => {
  const codigo = sinComentarios(inicio)
  assert.ok(/qs\.set\('vendedor', f\.vendedor\)/.test(codigo))
  assert.ok(/qs\.set\('tienda', f\.tienda\)/.test(codigo))
  assert.ok(!/qs\.set\('rol'/.test(codigo), 'el rol jamas viaja por query')
  assert.ok(/cache: 'no-store'/.test(codigo), 'sin esto Next congela la lectura')
})

// ─── Un panel filtrado NO puede parecer completo ────────────────────────────

test('con filtro puesto hay un aviso imposible de no ver', () => {
  assert.ok(/hayFiltro &&/.test(inicio), 'el aviso se pinta solo cuando hay filtro')
  assert.ok(/No estás viendo todo/.test(inicio), 'y lo dice sin rodeos')
  assert.ok(/border-amber-500/.test(inicio), 'en ámbar, como el resto de avisos del CRM')
  assert.ok(/Ver todo/.test(inicio), 'y se puede quitar de un toque')

  // ⚠️ El aviso NO puede quedar dentro del bloque que se atenúa al refrescar:
  // se leeria a medias justo cuando mas importa.
  const avisoEn = inicio.indexOf('No estás viendo todo')
  const atenuaEn = inicio.indexOf("refrescando ? 'opacity-50")
  assert.ok(avisoEn > 0 && atenuaEn > 0 && avisoEn < atenuaEn,
    'el aviso va ANTES del bloque que se atenúa')
})

test('el filtro NO se guarda entre visitas', () => {
  // Devolverle a alguien un filtro que él no acaba de poner es fabricar el
  // engaño que este aviso existe para evitar. Inicio se abre siempre completo.
  const codigo = sinComentarios(inicio)
  assert.ok(/useState\(\{ vendedor: null, tienda: null, mes: null \}\)/.test(codigo),
    'arranca sin filtro y en el mes en curso')
  assert.ok(!/localStorage[^\n]*filtro|filtro[^\n]*localStorage/i.test(codigo),
    'el filtro de Inicio no se persiste')
})

test('al cambiar de filtro no se parpadea a esqueleto', () => {
  const codigo = sinComentarios(inicio)
  // `loading` (el spinner que borra la pantalla) solo se enciende en la primera
  // carga y al reintentar; el refresco por filtro usa `refrescando`.
  assert.ok(/setRefrescando\(true\)/.test(codigo))
  assert.ok(!/setLoading\(true\)[^\n]*\n[^\n]*qs\.set/.test(codigo))
  assert.ok(/opacity-50/.test(codigo), 'se mantiene lo anterior atenuado')
})

// ─── La fila seleccionada nunca desaparece ──────────────────────────────────

test('la fila seleccionada sobrevive aunque no tenga ventas', () => {
  // ☠️ EL CASO QUE TRABA EL PANEL: un ADMIN filtra por JACKELINE, que este mes
  // no vendió en INDSTORE. INDSTORE se cae de la lista de tiendas — y con ella
  // el único botón capaz de quitar ese filtro. Sin recargar, no hay salida.
  const soloMandarina = { MANDARINA: { monto: 3768.51, count: 83 } }
  const filas = filasSeleccionables(soloMandarina, 'INDSTORE')

  const seleccionada = filas.find((f) => f.clave === 'INDSTORE')
  assert.ok(seleccionada, 'INDSTORE tiene que seguir ahí para poder desmarcarla')
  assert.equal(seleccionada.monto, 0, 'en cero, que es la verdad')
  assert.equal(seleccionada.ausente, true, 'y marcada como que no está en los datos')
})

test('la seleccionada entra aunque quede fuera del top 5', () => {
  const mapa = {}
  for (let i = 1; i <= 8; i++) mapa[`V${i}`] = { monto: i * 10, count: i }
  const filas = filasSeleccionables(mapa, 'V1', 5)

  assert.equal(filas.length, 5, 'el tope se respeta')
  assert.ok(filas.some((f) => f.clave === 'V1'), 'V1 vende poquísimo pero está marcado: entra')
  assert.equal(filas[0].clave, 'V8', 'y el orden por monto se mantiene arriba')
})

test('sin seleccion, las filas van de mayor a menor y respetan el tope', () => {
  const mapa = { A: { monto: 10 }, B: { monto: 30 }, C: { monto: 20 } }
  assert.deepEqual(filasSeleccionables(mapa).map((f) => f.clave), ['B', 'C', 'A'])
  assert.deepEqual(filasSeleccionables(mapa, null, 2).map((f) => f.clave), ['B', 'C'])
  assert.deepEqual(filasSeleccionables(null), [])
  assert.deepEqual(filasSeleccionables({}, null, 5), [])
  assert.equal(totalFilas(filasSeleccionables(mapa)), 60)
  assert.equal(totalFilas(null), 0)
})

// ─── YAW ya no se cae de la tarjeta de tiendas ──────────────────────────────

test('las tiendas salen de los DATOS, no de una lista escrita a mano', () => {
  // ☠️ Hasta el 1-sep la tarjeta pintaba dos tiendas fijas y **YAW no aparecía**:
  // en agosto eran $2.779 y 53 pedidos que contaban en el total de arriba y en
  // ninguna barra. Nadie lo notó porque las barras se medían contra el total y
  // simplemente nunca llegaban al 100%.
  const codigo = sinComentarios(inicio)
  assert.ok(/filasSeleccionables\(data\.porTienda/.test(codigo),
    'las filas salen del mapa que manda la base')
  assert.ok(!/\[\{tienda:'MANDARINA'/.test(codigo), 'ya no hay lista escrita a mano')
  assert.ok(!/data\.porTienda\[/.test(codigo), 'ni se indexa por claves conocidas')

  // Una tienda desconocida NO puede desaparecer: se pinta con color por defecto.
  assert.ok(/TIENDAS\[t\.clave\] \|\| \{/.test(codigo),
    'la tabla de nombres es solo el vestuario, con salida por defecto')

  // El denominador es la propia lista, no `ventasMes`: con un filtro de
  // vendedor puesto la lista de tiendas ya NO suma ventasMes a proposito.
  assert.ok(/t\.monto \/ \(totalTiendas/.test(codigo))
  assert.ok(!/monto\/\(data\.ventasMes\|\|1\)/.test(codigo))
})

test('YAW tiene nombre y color propios, como las otras dos', () => {
  assert.ok(/YAW:\s*\{\s*label:/.test(inicio), 'YAW está en la tabla de tiendas')
  for (const t of ['MANDARINA', 'INDSTORE', 'YAW']) {
    assert.ok(new RegExp(`${t}:\\s*\\{[^}]*color:`).test(inicio), `${t} necesita color`)
  }
})

// ─── Lo que se puede clicar ─────────────────────────────────────────────────

test('vendedores y tiendas son botones de verdad, no divs con onClick', () => {
  const codigo = sinComentarios(inicio)
  assert.ok((codigo.match(/onClick=\{\(\) => alternar\('tienda'/g) || []).length >= 1)
  assert.ok((codigo.match(/onClick=\{\(\) => alternar\('vendedor'/g) || []).length >= 1)
  // `aria-pressed` para que se sepa cuál está marcado sin depender del color.
  assert.ok((codigo.match(/aria-pressed=\{sel\}/g) || []).length >= 2)
})

test('volver a tocar lo marcado lo quita', () => {
  // Un filtro que solo se pone y no se saca deja al usuario atrapado.
  assert.ok(/f\[clave\] === valor \? null : valor/.test(inicio),
    'alternar tiene que apagar lo que ya estaba encendido')
})

test('cada lista dice de qué alcance habla cuando hay un filtro cruzado', () => {
  // ☠️ Sin esto se lee como una contradicción: con JACKELINE + INDSTORE puestos,
  // arriba dice «Ventas del mes $0» y la tarjeta de tiendas dice «Mandarina
  // $3.769». No es un descuadre: esa lista ignora el filtro de TIENDA a
  // propósito —es el mando para saltar de una a otra— pero sí obedece al de
  // vendedor. Si no lo dice, parece un error de cuentas.
  assert.ok(/filtro\.vendedor \? `De \$\{filtro\.vendedor\}/.test(inicio),
    'la lista de tiendas debe decir de quién son esos montos')
  assert.ok(/filtro\.tienda \? `En \$\{filtro\.tienda\}/.test(inicio),
    'la lista de vendedores debe decir de qué tienda son')
})

test('el vacío nombra el mes del que habla, no se lee como avería', () => {
  // Las listas son del mes que se MIRA. El día 1 del mes en curso, hasta la
  // primera venta, están vacías y no hay nada que clicar. Medido el 1-sep-2026:
  // porTienda y porVendedor llegaron `{}`. Decir "Sin datos" suena a avería.
  assert.ok(/Sin ventas en \$\{mesVisto\}/.test(inicio),
    'el vacío tiene que nombrar el mes del que habla')
  assert.ok(/const mesVisto = etiquetaMesLarga/.test(inicio))
})

test('los gráficos se enteran del alcance para no mentir en la nota', () => {
  // Con filtro puesto, `primerPedido` es el del vendedor/tienda, no el del CRM.
  assert.ok(/<GraficosVentas data=\{data\} alcance=/.test(inicio))
  assert.ok(/const alcance = \[filtro\.vendedor, filtro\.tienda\]/.test(inicio))
})

// ─── El histórico manda sobre el diario ─────────────────────────────────────

const ventas = readFileSync(new URL('../components/GraficosVentas.js', import.meta.url), 'utf8')
const barras = readFileSync(new URL('../components/GraficoBarras.js', import.meta.url), 'utf8')

test('tocar un mes del histórico cambia el gráfico diario', () => {
  assert.ok(/onSeleccionar=\{onMes\}/.test(ventas), 'el histórico es el mando')
  assert.ok(/seleccionada=\{onMes \? mesDelDiario/.test(ventas), 'y marca el mes elegido')
  assert.ok(/qs\.set\('mes', f\.mes\)/.test(inicio), 'el mes viaja a la API')
  assert.ok(/p_filtro_mes: mes/.test(api), 'y de ahí a la base')
})

test('el histórico NO se filtra a sí mismo: si no, no habría cómo cambiar de mes', () => {
  // Solo el gráfico DIARIO obedece al mes. Si el histórico también lo hiciera,
  // se quedaría con una barra sola y el mando desaparecería bajo su propio uso.
  const conMes = ventas.split('\n').filter((l) => /serieMeses\(/.test(l)).join('\n')
  assert.ok(!/filtro\.mes|mesDelDiario/.test(conMes), 'la serie mensual ignora el mes elegido')
})

test('volver a tocar el mes marcado devuelve al mes en curso', () => {
  assert.ok((inicio.match(/\(f\.mes \|\| data\.hoyEcuador\?\.slice\(0, 7\)\) === mes \? null : mes/g) || []).length >= 2,
    'en los dos paneles: el mismo botón entra y sale')
})

test('«Ver todo» borra TAMBIÉN el mes', () => {
  // ⚠️ ESTA PRUEBA DECÍA LO CONTRARIO y es a propósito. Cuando el mes solo movía
  // el gráfico diario, no escondía nada y dejarlo fuera de «Ver todo» era lo
  // correcto. Desde que el mes acota el panel entero, sí esconde: dejarlo
  // puesto tras pulsar «Ver todo» sería justo el engaño que el aviso evita.
  // Si alguien vuelve a sacarlo de aquí, que sea decidiéndolo, no por inercia.
  assert.ok(/limpiar = \(\) => setFiltro\(\{ vendedor: null, tienda: null, mes: null \}\)/.test(inicio),
    '«Ver todo» tiene que limpiar los tres')
  // Y por lo mismo el mes cuenta para que aparezca el aviso ámbar.
  assert.ok(/const hayFiltro = Boolean\(filtro\.vendedor \|\| filtro\.tienda \|\| mesElegido\)/.test(inicio),
    'un mes elegido también enciende el aviso')
})

test('el mes que se anuncia es el que la BASE entendió, no el de la pantalla', () => {
  // ☠️ Un `?mes=` con basura cae al mes en curso en la base. Si el título se
  // pintara con el estado local, prometería «agosto» sobre barras de
  // septiembre. La base devuelve lo que entendió y eso es lo que se rotula.
  assert.ok(/const mesDelDiario = data\.filtro\?\.mes \|\| claveDeHoy/.test(ventas))
  assert.ok(/descripcion=\{etiquetaDelDiario\}/.test(ventas))
})

test('la nota del diario dice la verdad sobre las tarjetas de arriba', () => {
  // ☠️ ESTA NOTA YA DIJO LO CONTRARIO. Cuando el mes solo movía este gráfico,
  // avisaba de que las tarjetas seguían en el mes en curso. Ahora el mes acota
  // el panel entero, así que esa frase pasó a ser FALSA. Una nota que miente es
  // peor que no tener nota: si la regla vuelve a cambiar, esto también.
  assert.ok(/const notaDiaria = esMesEnCurso/.test(ventas))
  assert.ok(!/siguen siendo del mes en curso/.test(ventas),
    'esa frase ya no es verdad: las tarjetas SÍ siguen al mes')
  assert.ok(/que también pasó a \$\{etiquetaDelDiario\}/.test(ventas),
    'y la nota dice que las tarjetas se movieron con él')
})

test('las cuatro cajas siguen al mes elegido, en los DOS paneles', () => {
  // Si se quedaran con las etiquetas fijas estarían poniéndole a los números de
  // agosto el nombre de septiembre.
  assert.ok(/label: mesElegido \? `Ventas de \$\{mesVisto\}`/.test(inicio), 'ADMIN')
  assert.ok(/label: mesElegido \? `Mis ventas de \$\{mesVisto\}`/.test(inicio), 'VENDEDOR')
  assert.ok((inicio.match(/const mesElegido = Boolean\(data\.filtro\?\.mesElegido\)/g) || []).length === 2,
    'los dos paneles leen si hay mes elegido')
  // Y las dos listas dicen de qué mes hablan.
  assert.ok((inicio.match(/\(\{mesVisto\}\)/g) || []).length >= 2, 'tiendas y vendedores rotulan el mes')
})

test('«Ventas hoy» no se pinta en un mes pasado', () => {
  // ☠️ Hoy no está en agosto: esa caja valdría $0 y se leería como un día malo.
  // Pasa a ser el promedio por día, que es lo que sirve para comparar meses.
  assert.ok((inicio.match(/\(mesElegido && !esMesEnCurso\)/g) || []).length === 2,
    'los dos paneles cambian esa caja')
  assert.ok(/label:'Promedio por día'/.test(inicio))
  // El divisor sale de la serie diaria, que trae justo los días del mes mirado.
  assert.ok((inicio.match(/const diasDelMes = data\.ventasPorDia\?\.length \|\| 0/g) || []).length === 2,
    'el divisor no se puede desalinear del numerador')
})

test('el mes no pasa por la guardia de ADMIN, y es correcto que no pase', () => {
  // Es una ventana de TIEMPO, no una identidad: elegir agosto no puede enseñar
  // ni un pedido que el rol no dejara ver ya. Un vendedor mira su propio agosto.
  const codigo = sinComentarios(api)
  assert.ok(/const mes = \(consulta\.get\('mes'\)/.test(codigo))
  assert.ok(!/parametro\('mes'\)/.test(codigo), 'el mes no usa la guardia de ADMIN')
  // Pero vendedor y tienda SÍ siguen detrás de ella.
  assert.ok(/parametro\('vendedor'\)/.test(codigo) && /parametro\('tienda'\)/.test(codigo))
})

test('las barras solo son botones cuando sirven de mando', () => {
  // Con 31 días, volver cada columna un botón metería 31 paradas de tabulador
  // en un gráfico que no se puede clicar.
  assert.ok(/const Columna = onSeleccionar \? 'button' : 'div'/.test(barras))
  assert.ok(/aria-pressed': marcada/.test(barras), 'y se sabe cuál está marcado sin mirar el color')
})
