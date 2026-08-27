// Prueba de FUENTE: montar las pantallas pediría el bundler entero de Next. Lo
// que se vigila es barato y concreto — que no vuelvan las dos formas de perder
// lo que el usuario tenía puesto.
//
// ☠️ CASO REAL (19-ago-2026): el refresco al volver a la pestaña llamaba a
// `loadItems()` a secas, y esa función arranca con `setLoading(true)`. El render
// es `loading ? <spinner> : <lista>`, así que la lista se desmontaba entera y el
// contenedor con scroll se colapsaba: cada vez que alguien miraba otra pestaña,
// al volver estaba de nuevo en el tope. En Despacho era peor — sin nada guardado,
// un remonte (salir y volver, descarte de pestaña de Chrome, arranque en frío de
// la PWA) borraba tambien los filtros.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const lee = (p) => readFileSync(new URL(`../app/dashboard/${p}/page.js`, import.meta.url), 'utf8')

// Las bandejas: listas largas donde perder el sitio cuesta tiempo de verdad.
const BANDEJAS = ['despacho', 'produccion', 'corte', 'impresion', 'historial', 'mis-pedidos', 'tablero', 'calendario']

// Las que refrescan solas al volver a la pestaña.
const REFRESCAN_AL_VOLVER = ['produccion', 'corte']

for (const pantalla of BANDEJAS) {
  test(`${pantalla}: guarda y devuelve lo que tenias puesto`, () => {
    const src = lee(pantalla)
    assert.ok(src.includes('useEstadoPantalla'),
      'sin esto, cualquier remonte borra filtros, paginacion y scroll')
    assert.ok(src.includes('useScrollGuardado') && src.includes('ref={contenedorRef}'),
      'el scroll se guarda en el contenedor con overflow, no en la ventana')
  })

  test(`${pantalla}: si restaura filtros, lo AVISA`, () => {
    const src = lee(pantalla)
    // Una bandeja filtrada se ve igual de sana que una completa. Devolver un
    // filtro que el usuario no acaba de poner, sin decirlo, fabrica ese engano.
    assert.ok(src.includes('<AvisoFiltros'),
      'quien restaura filtros tiene que pintar AvisoFiltros')
    assert.ok(/onLimpiar=\{limpiarFiltros\}/.test(src),
      'y tiene que poder limpiarlos de un clic')
  })

  test(`${pantalla}: no repone el efecto que borraba la paginacion restaurada`, () => {
    const src = lee(pantalla)
    // `useEffect(() => setVisibles(N), [busqueda, ...])` parece inofensivo, pero
    // al restaurar los filtros pasan de vacios a puestos y el efecto se dispara
    // solo, tirando la pagina que acabamos de devolver. Eso ahora lo hace
    // `setFiltro`, que cambia el filtro y reinicia en el mismo golpe.
    //
    // Lo que se prohibe es que las DEPENDENCIAS sean filtros. Un
    // `useEffect(() => setVisibles(15), [pedidos.length])` — el de cada columna
    // del Tablero — es otra cosa: reinicia cuando cambian los DATOS, que es
    // correcto y no tiene nada que ver con lo restaurado.
    const efectos = src.match(/useEffect\(\(\)\s*=>\s*\{?\s*setVisibles\([^)]*\)\s*\}?,\s*\[([^\]]*)\]/g) || []
    const sobreFiltros = efectos.filter((e) => /busqueda|filtro|fecha|orden/i.test(e.slice(e.lastIndexOf('['))))
    assert.deepStrictEqual(sobreFiltros, [],
      'reiniciar la paginacion va en setFiltro, no en un efecto sobre los filtros')
  })
}

for (const pantalla of REFRESCAN_AL_VOLVER) {
  const src = lee(pantalla)

  test(`${pantalla}: al volver a la pestana refresca SIN spinner`, () => {
    assert.ok(/visibilitychange/.test(src), 'esta pantalla refresca al volver')
    assert.ok(/loadItems\(true\)/.test(src),
      'tiene que pedirlo en silencio: loadItems() a secas desmonta la lista y pierde el scroll')
  })

  test(`${pantalla}: el spinner solo sale cuando NO es silencioso`, () => {
    assert.ok(/if \(!silencioso\)/.test(src),
      'setLoading/setEstado(CARGANDO) tienen que ir detras de la condicion')
    // Que la condicion no se quede a medias: `if (!x) a(); b()` deja b() suelto.
    assert.ok(!/if \(!silencioso\) setLoading\(true\);\s*setEstado/.test(src),
      'sin llaves, setEstado(CARGANDO) corre igual y el spinner vuelve')
  })
}

test('el aviso de filtros existe y ofrece limpiarlos', () => {
  const src = readFileSync(new URL('../components/AvisoFiltros.js', import.meta.url), 'utf8')
  assert.ok(/No estás viendo todo/.test(src), 'tiene que decir lo que importa, sin rodeos')
  assert.ok(/onLimpiar/.test(src))
})
