/**
 * Pruebas de la lógica de la sección USUARIOS.
 * Ejecutar:  node scripts/test-usuarios.mjs
 *
 * Cubre lo que rompía en producción: usuarios duplicados que dejaban a alguien
 * sin poder entrar, y la lista de roles desfasada respecto al menú.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'test-usuarios-'))
async function cargar(rel) {
  const destino = join(dir, rel.replace(/\//g, '_') + '.mjs')
  writeFileSync(destino, readFileSync(new URL(rel, import.meta.url), 'utf8'))
  return import(pathToFileURL(destino).href)
}

const { ROLES, ROL_LABEL, AREAS, esRolValido, usaAreas, avisoSinAreas } = await cargar('../lib/roles.js')
const { filtrarPedidosPorTienda, puedeVerTienda, tiendasDisponibles } = await cargar('../lib/tiendasUsuario.js')

let ok = 0, fail = 0
function check(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ok   ${nombre}`) }
  else { fail++; console.log(`  FALLA ${nombre}${detalle ? ` -- ${detalle}` : ''}`) }
}

console.log('\n== Roles: la lista debe cubrir TODO lo que usa el menu ==')
{
  // Se leen los roles reales del menú en vez de repetirlos aquí: si alguien
  // agrega una entrada con un rol nuevo, esta prueba lo detecta.
  const layout = readFileSync(new URL('../app/dashboard/layout.js', import.meta.url), 'utf8')
  const enMenu = new Set()
  for (const m of layout.matchAll(/roles:\s*\[([^\]]*)\]/g)) {
    for (const r of m[1].split(',')) {
      const limpio = r.trim().replace(/^['"]|['"]$/g, '')
      if (limpio) enMenu.add(limpio)
    }
  }
  check('el menu declara roles', enMenu.size > 0, `${enMenu.size}`)

  const faltan = [...enMenu].filter(r => !ROLES.includes(r))
  check('ningun rol del menu falta en ROLES', faltan.length === 0, faltan.join(', '))

  const sobran = ROLES.filter(r => !enMenu.has(r))
  check('ningun rol de ROLES es desconocido para el menu', sobran.length === 0, sobran.join(', '))

  // Los que existen HOY en produccion y que el formulario viejo no ofrecía.
  for (const r of ['CORTE', 'VENDEDOR_YAW', 'ESTAMPADO', 'SUBLIMACION', 'BORDADO']) {
    check(`${r} es asignable`, esRolValido(r))
  }
  check('rol inventado se rechaza', !esRolValido('SUPERVISOR'))
  check('rol vacio se rechaza', !esRolValido('') && !esRolValido(undefined))
  check('todo rol tiene etiqueta', ROLES.every(r => ROL_LABEL[r]))

  check('DISEÑO usa areas', usaAreas('DISEÑO'))
  check('CORTE usa areas', usaAreas('CORTE'))
  check('VENDEDOR no usa areas', !usaAreas('VENDEDOR'))
  check('ADMIN no usa areas', !usaAreas('ADMIN'))
  check('las areas son las 3 de produccion', AREAS.length === 3 && AREAS.includes('BORDADO'))
}

console.log('\n== Deteccion de duplicados (el bug de MAJO) ==')
{
  // Réplica de la lógica de buscarConflicto, que no se puede importar tal cual
  // porque el módulo real arrastra Supabase y Google Sheets.
  const norm = (v) => String(v ?? '').trim().toLowerCase()
  function hayConflicto(nuevo, existentes, excluirId) {
    const login = [norm(nuevo.nombre), norm(nuevo.username), norm(nuevo.email)].filter(Boolean)
    const cod = norm(nuevo.codigo)
    for (const u of existentes) {
      if (excluirId && u.USUARIO_ID === excluirId) continue
      const suyos = [norm(u.NOMBRE), norm(u.USERNAME), norm(u.EMAIL)].filter(Boolean)
      if (login.find(v => suyos.includes(v))) return true
      if (cod && norm(u.CODIGO) === cod) return true
    }
    return false
  }

  const base = [
    { USUARIO_ID: 'uuid-008', NOMBRE: 'MARIA JOSÉ', CODIGO: 'MAJO', USERNAME: 'MAJO', EMAIL: 'MAJO@IN.COM' },
    { USUARIO_ID: 'uuid-001', NOMBRE: 'Andrés Admin', CODIGO: 'AND', USERNAME: 'AND', EMAIL: 'a@a.com' },
  ]

  // El caso exacto que ocurrió: se creó "MAJO" cuando ya existía username MAJO.
  check('detecta el duplicado real de MAJO',
    hayConflicto({ nombre: 'MAJO', codigo: 'MAJ', username: 'MAJO', email: 'MAJO@IN.COM' }, base))

  // Lo que una comprobación columna-por-columna dejaría pasar: el NOMBRE de uno
  // choca con el USERNAME de otro, y el login acepta ambos como identificador.
  check('detecta nombre que choca con el username de otro',
    hayConflicto({ nombre: 'MAJO', codigo: 'ZZZ', username: 'OTRO', email: 'otro@x.com' }, base))
  check('detecta username que choca con el nombre de otro',
    hayConflicto({ nombre: 'Otra', codigo: 'ZZZ', username: 'MARIA JOSÉ', email: 'otra@x.com' }, base))

  check('detecta email repetido',
    hayConflicto({ nombre: 'X', codigo: 'ZZZ', username: 'XX', email: 'majo@in.com' }, base))
  check('detecta codigo repetido',
    hayConflicto({ nombre: 'X', codigo: 'and', username: 'XX', email: 'x@x.com' }, base))
  check('ignora mayusculas y espacios',
    hayConflicto({ nombre: '  maria josé ', codigo: 'ZZZ', username: 'ZZ', email: 'z@z.com' }, base))

  check('un usuario totalmente nuevo NO da conflicto',
    !hayConflicto({ nombre: 'Pedro Ruiz', codigo: 'PED', username: 'PEDRO', email: 'p@p.com' }, base))

  // Al editar, uno choca consigo mismo: hay que excluirse.
  check('al editarse a si mismo no hay conflicto',
    !hayConflicto({ nombre: 'MARIA JOSÉ', codigo: 'MAJO', username: 'MAJO', email: 'MAJO@IN.COM' },
      base, 'uuid-008'))
  check('al editarse sigue detectando choque con OTRO',
    hayConflicto({ nombre: 'MARIA JOSÉ', codigo: 'AND', username: 'MAJO', email: 'MAJO@IN.COM' },
      base, 'uuid-008'))
}

console.log('\n== Permisos por area en Produccion ==')
{
  // Réplica de itemEsDeUsuario (app/dashboard/produccion/page.js).
  function itemEsDeUsuario(itemArea, u) {
    if (!itemArea) return false
    if (u.rol === 'ADMIN') return true
    if (u.rol === 'CORTE') return true
    const areas = u.areas || []
    if (areas.length === 1 && areas[0] === 'TODAS') return true
    if (areas.length > 0) return areas.some(a => itemArea.includes(a))
    if (u.rol === 'ESTAMPADO')   return itemArea.includes('ESTAMPADO')
    if (u.rol === 'SUBLIMACION') return itemArea.includes('SUBLIMACION')
    if (u.rol === 'BORDADO')     return itemArea.includes('BORDADO')
    if (u.rol === 'DISEÑO') return false
    return true
  }

  // El bug: quitarle las áreas a un diseñador le daba acceso a TODO.
  check('DISEÑO sin areas NO ve nada',
    !itemEsDeUsuario('BORDADO', { rol: 'DISEÑO', areas: [] }))
  check('DISEÑO con BORDADO ve bordado',
    itemEsDeUsuario('BORDADO', { rol: 'DISEÑO', areas: ['BORDADO'] }))
  check('DISEÑO con BORDADO no ve estampado',
    !itemEsDeUsuario('ESTAMPADO', { rol: 'DISEÑO', areas: ['BORDADO'] }))
  check('DISEÑO con TODAS ve todo',
    itemEsDeUsuario('ESTAMPADO', { rol: 'DISEÑO', areas: ['TODAS'] }))
  check('ADMIN ve todo', itemEsDeUsuario('BORDADO', { rol: 'ADMIN', areas: [] }))
  check('CORTE ve todo', itemEsDeUsuario('BORDADO', { rol: 'CORTE', areas: [] }))
  check('rol de area sin areas usa su propio rol',
    itemEsDeUsuario('ESTAMPADO', { rol: 'ESTAMPADO', areas: [] }) &&
    !itemEsDeUsuario('BORDADO', { rol: 'ESTAMPADO', areas: [] }))
  check('item sin area no es de nadie', !itemEsDeUsuario('', { rol: 'ADMIN' }))
}

console.log('\n== Dashboard por rol: CORTE no debe ver el panel financiero ==')
{
  const src = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
  check('CORTE tiene su caso explicito', /rol === 'CORTE'/.test(src))
  check('hay red de seguridad para roles no contemplados',
    /rol !== 'ADMIN'/.test(src))
}

console.log('\n== Editar un usuario YA duplicado no debe quedar bloqueado ==')
{
  // El PATCH solo valida contra duplicados los campos que REALMENTE cambian.
  // Si revalidara todo en cada guardado, los dos usuarios MAJO que ya existen en
  // producción quedarían imposibles de editar: ni resetear su clave, ni
  // desactivarlos. Réplica de la lógica de app/api/usuarios/route.js.
  const norm = (v) => String(v ?? '').trim().toLowerCase()
  function camposQueCambian(body, actual) {
    const cambios = {}
    if (body.email !== undefined && norm(body.email) !== norm(actual.EMAIL)) cambios.email = body.email
    if (body.username !== undefined && norm(body.username) !== norm(actual.USERNAME)) cambios.username = body.username
    return cambios
  }

  const majo = { USUARIO_ID: 'uuid-013', NOMBRE: 'MAJO', CODIGO: 'MAJ', USERNAME: 'MAJO', EMAIL: 'MAJO@IN.COM' }

  // Caso real: resetear la contraseña sin tocar identificadores.
  check('guardar sin cambiar identificadores no dispara validacion',
    Object.keys(camposQueCambian({ username: 'MAJO', email: 'MAJO@IN.COM' }, majo)).length === 0)
  check('desactivar a un duplicado no dispara validacion',
    Object.keys(camposQueCambian({ activo: false, username: 'MAJO', email: 'MAJO@IN.COM' }, majo)).length === 0)
  check('la mayuscula/espacio no cuenta como cambio',
    Object.keys(camposQueCambian({ username: ' majo ', email: 'majo@in.com' }, majo)).length === 0)

  // Pero si de verdad cambia, sí se valida.
  check('cambiar el username SI se valida',
    camposQueCambian({ username: 'MAJO2' }, majo).username === 'MAJO2')
  check('cambiar el email SI se valida',
    camposQueCambian({ email: 'otro@x.com' }, majo).email === 'otro@x.com')
}

console.log('\n== Guardia del ultimo ADMIN ==')
{
  // toBool: 'false' como string debe desactivar igual que el booleano.
  const toBool = (v) => {
    if (typeof v === 'boolean') return v
    const s = String(v ?? '').trim().toUpperCase()
    return s === 'TRUE' || s === '1' || s === 'SI' || s === 'SÍ' || s === 'YES'
  }
  function bloquea(actual, body, adminsActivos) {
    const activo = body.activo !== undefined ? toBool(body.activo) : undefined
    const deja = actual.ROL === 'ADMIN' && actual.ACTIVO === 'TRUE' &&
      ((body.rol !== undefined && body.rol !== 'ADMIN') || (activo !== undefined && !activo))
    return deja && adminsActivos <= 1
  }
  const adminActivo   = { ROL: 'ADMIN', ACTIVO: 'TRUE' }
  const adminInactivo = { ROL: 'ADMIN', ACTIVO: 'FALSE' }

  check('bloquea degradar al ultimo admin activo', bloquea(adminActivo, { rol: 'VENDEDOR' }, 1))
  check('bloquea desactivar al ultimo admin activo', bloquea(adminActivo, { activo: false }, 1))
  check("'false' como texto tambien se detecta", bloquea(adminActivo, { activo: 'false' }, 1))
  check('permite si hay otros admins', !bloquea(adminActivo, { rol: 'VENDEDOR' }, 3))
  // El que ya está inactivo no puede ser "el último activo": bloquearlo era un falso positivo.
  check('permite degradar a un admin YA inactivo', !bloquea(adminInactivo, { rol: 'VENDEDOR' }, 1))
  check('cambiar solo la clave nunca bloquea', !bloquea(adminActivo, { password: 'xxxxxx' }, 1))
}

console.log('\n== Aviso de areas segun el rol ==')
{
  check('DISEÑO sin areas: avisa que no vera nada',
    /no verá ninguna prenda/i.test(avisoSinAreas('DISEÑO')))
  // Era falso decirle esto a CORTE: ve todo igual, y el admin "arreglaba" algo sano.
  check('CORTE: NO dice que no vera nada',
    !/no verá ninguna prenda/i.test(avisoSinAreas('CORTE')) && avisoSinAreas('CORTE') !== '')
  check('ESTAMPADO: explica que vera lo suyo',
    /únicamente las prendas de ESTAMPADO/i.test(avisoSinAreas('ESTAMPADO')))
  check('VENDEDOR no tiene aviso de areas', avisoSinAreas('VENDEDOR') === '')
}

console.log('\n== Acceso por tienda ==')
{
  const ADMIN   = { rol: 'ADMIN', tiendas: ['MANDARINA'] }
  const GRACE   = { rol: 'VENDEDOR', tiendas: ['MANDARINA'] }          // caso real
  const MAJO    = { rol: 'VENDEDOR', tiendas: ['INDSTORE'] }           // caso real
  const CLEVER  = { rol: 'VENDEDOR', tiendas: ['INDSTORE', 'MANDARINA'] }
  const SIN     = { rol: 'VENDEDOR', tiendas: [] }
  const BORDA   = { rol: 'DISEÑO', tiendas: ['MANDARINA'] }            // Christian Garzon
  const CORTE_U = { rol: 'CORTE', tiendas: ['MANDARINA'] }

  const pedidos = [
    { PEDIDO_ID: 'MAN-1', TIENDA_ID: 'MANDARINA' },
    { PEDIDO_ID: 'IND-1', TIENDA_ID: 'INDSTORE' },
    { PEDIDO_ID: 'YAW-1', TIENDA_ID: 'YAW' },
  ]
  const ids = (u) => filtrarPedidosPorTienda(u, pedidos).map(p => p.PEDIDO_ID).join(',')

  check('ADMIN ve todo aunque tenga una sola tienda', ids(ADMIN) === 'MAN-1,IND-1,YAW-1', ids(ADMIN))
  check('vendedor de Mandarina solo ve Mandarina', ids(GRACE) === 'MAN-1', ids(GRACE))
  check('vendedor de Indstore solo ve Indstore', ids(MAJO) === 'IND-1', ids(MAJO))
  check('vendedor con ambas ve ambas', ids(CLEVER) === 'MAN-1,IND-1', ids(CLEVER))

  // Deliberado: sin tiendas asignadas NO se restringe. Un dato faltante no debe
  // dejar a nadie sin ver su trabajo.
  check('vendedor SIN tiendas asignadas ve todo', ids(SIN) === 'MAN-1,IND-1,YAW-1', ids(SIN))

  // El trabajo de fábrica es transversal: Christian Garzon borda para las dos
  // tiendas aunque tenga solo MANDARINA marcada.
  check('DISEÑO no se filtra por tienda', ids(BORDA) === 'MAN-1,IND-1,YAW-1', ids(BORDA))
  check('CORTE no se filtra por tienda', ids(CORTE_U) === 'MAN-1,IND-1,YAW-1', ids(CORTE_U))

  check('puedeVerTienda respeta al vendedor',
    puedeVerTienda(GRACE, 'MANDARINA') && !puedeVerTienda(GRACE, 'INDSTORE'))
  check('puedeVerTienda no restringe al admin', puedeVerTienda(ADMIN, 'INDSTORE'))
  check('acepta tiendas como texto CSV',
    puedeVerTienda({ rol: 'VENDEDOR', tiendas: 'MANDARINA, INDSTORE' }, 'INDSTORE'))
  check('ignora mayusculas', puedeVerTienda({ rol: 'VENDEDOR', tiendas: ['indstore'] }, 'INDSTORE'))

  const TODAS = ['MANDARINA', 'INDSTORE']
  check('el selector de Nueva Venta se limita', tiendasDisponibles(MAJO, TODAS).join() === 'INDSTORE')
  check('el admin ve las dos en el selector', tiendasDisponibles(ADMIN, TODAS).join() === 'MANDARINA,INDSTORE')
  // Si la config no cuadra con lo que ofrece la pantalla, mejor todas que un
  // selector vacío con el que no se pueda trabajar.
  check('config incoherente no deja el selector vacio',
    tiendasDisponibles({ rol: 'VENDEDOR', tiendas: ['YAW'] }, TODAS).length === 2)
  check('nadie queda sin ninguna tienda para elegir',
    [ADMIN, GRACE, MAJO, CLEVER, SIN].every(u => tiendasDisponibles(u, TODAS).length > 0))
}

console.log('\n== Despacho: que cuenta como cerrado ==')
{
  const src = readFileSync(new URL('../app/dashboard/despacho/page.js', import.meta.url), 'utf8')
  const m = src.match(/const ESTADOS_CERRADOS = \[([^\]]*)\]/)
  const cerrados = m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : []

  check('COMPLETADO cierra', cerrados.includes('COMPLETADO'))
  check('ENTREGADO cierra', cerrados.includes('ENTREGADO'))
  check('CANCELADO cierra', cerrados.includes('CANCELADO'))
  // El fondo del problema: DESPACHO lo pone el auto-avance cuando produccion
  // marca el ultimo item LISTO. No significa que haya salido.
  check('DESPACHO NO cierra', !cerrados.includes('DESPACHO'))
  check('EN_FABRICA NO cierra', !cerrados.includes('EN_FABRICA'))

  // Ya no se exige que los items esten en LISTO para que el pedido aparezca:
  // los disenadores no siempre los marcan.
  check('la lista no exige items en LISTO',
    !/every\(i => i\.SUBESTADO === 'LISTO'\)/.test(src))
  check('existe el cierre sin guia', /completarSinGuia/.test(src))
  check('el cierre sin guia deja nota en bitacora',
    /completarSinGuia[\s\S]{0,900}NOTA:/.test(src))
  check('el cierre sin guia avisa del saldo pendiente',
    /completarSinGuia[\s\S]{0,600}MONTO_PENDIENTE/.test(src))

  // La API debe aceptar esa nota, o el rastro se perderia en silencio.
  const api = readFileSync(new URL('../app/api/pedidos/[id]/route.js', import.meta.url), 'utf8')
  check('el PATCH acepta body.NOTA', /if \(body\.NOTA\)/.test(api))
}

console.log(`\n${ok} pasaron, ${fail} fallaron\n`)
process.exit(fail === 0 ? 0 : 1)
