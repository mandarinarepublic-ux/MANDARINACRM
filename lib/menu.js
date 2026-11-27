// Menú lateral del CRM: qué ve cada quien, en qué grupo va y cómo se busca.
// Puro (sin React) para poder probarlo con node --test. Lo pinta
// app/dashboard/layout.js.
//
// 24-nov-2026: el admin veía ~29 opciones en una sola lista y no encontraba
// «Caja». Desde AGRUPAR_DESDE opciones el menú va en grupos con título y lleva
// un buscador. Con menos (vendedores, taller) se ve igual que siempre.

export const AGRUPAR_DESDE = 16

// Orden en que salen los grupos. «Inicio» va siempre primero y sin título.
export const GRUPOS = [
  { id: 'general', titulo: 'General' },
  { id: 'ventas',  titulo: 'Ventas' },
  { id: 'dinero',  titulo: 'Dinero' },
  { id: 'taller',  titulo: 'Taller' },
  { id: 'tienda',  titulo: 'Catálogo y pauta' },
  { id: 'sistema', titulo: 'Sistema' },
  { id: 'apps',    titulo: 'Otras apps' },
]

const TODOS = ['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE']
const VENTA = ['ADMIN','VENDEDOR','VENDEDOR_YAW']
const PRODUCCION = ['ADMIN','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','CORTE']

export const NAV_ALL = [
  { href:'/dashboard',              label:'Inicio',       icon:'🏠', roles:TODOS },
  { href:'/dashboard/tablero',      label:'Tablero',      icon:'📊', roles:TODOS, grupo:'general' },
  // Plan de fábrica (9-nov-2026): CORTE · DISEÑO · CONFECCIÓN + QUÉ SE HACE HOY. Solo guía.
  { href:'/dashboard/plan-fabrica', label:'Plan de fábrica', icon:'🏭', roles:TODOS, grupo:'general' },
  { href:'/dashboard/calendario',   label:'Calendario',   icon:'📅', roles:TODOS, grupo:'general' },
  // `oAcceso`: ademas del rol, lo ve quien tenga ese permiso marcado por persona.
  // Asi los de DISEÑO pueden vender sin dejar de ser produccion (21-ago-2026).
  { href:'/dashboard/nuevo-pedido', label:'Nueva Venta',  icon:'➕', roles:VENTA, oAcceso:'VENTAS', grupo:'ventas' },
  // Link de pago Payphone (10-nov-2026): celular + valor → se manda por el WhatsApp del vendedor.
  { href:'/dashboard/link-pago',    label:'Link de pago', icon:'💳', roles:VENTA, oAcceso:'VENTAS', grupo:'dinero' },
  { href:'/dashboard/mis-pedidos',  label:'Mis Pedidos',  icon:'📦', roles:['VENDEDOR'], oAcceso:'VENTAS', grupo:'ventas' },
  { href:'/dashboard/historial',    label:'Historial',    icon:'📋', roles:TODOS, grupo:'general' },
  // Consultar guías (20-nov-2026): ¿ya salió?, ¿con qué guía? Solo lectura, con el alcance del Historial.
  { href:'/dashboard/guias',        label:'Guías',        icon:'🔎', roles:[...VENTA,'DESPACHO'], oAcceso:'VENTAS', grupo:'ventas' },
  { href:'/dashboard/catalogo',     label:'Catálogo',     icon:'🛍️', roles:['ADMIN','VENDEDOR'], grupo:'tienda' },
  { href:'/dashboard/producto-nuevo', label:'Subir producto', icon:'🏷️', roles:['ADMIN'], grupo:'tienda' },
  { href:'/dashboard/cotizacion',   label:'Cotización',   icon:'📄', roles:VENTA, grupo:'ventas' },
  { href:'/dashboard/corte',        label:'Corte',        icon:'✂️', roles:['ADMIN','CORTE'], grupo:'taller' },
  { href:'/dashboard/produccion',   label:'Producción',   icon:'🏭', roles:PRODUCCION, grupo:'taller' },
  { href:'/dashboard/impresion',    label:'Imprimir',     icon:'🖨️', roles:PRODUCCION, grupo:'taller' },
  { href:'/dashboard/despacho',     label:'Despacho',     icon:'🚚', roles:['ADMIN','DESPACHO'], grupo:'taller' },
  { href:'/dashboard/tipos-prenda', label:'Tipos de prenda', icon:'👕', roles:['ADMIN'], grupo:'tienda' },
  { href:'/dashboard/promo-seguimiento', label:'Promo del seguimiento', icon:'🎁', roles:['ADMIN'], grupo:'tienda' },
  { href:'/dashboard/auto',         label:'AUTO',         icon:'🤖', roles:['ADMIN'], grupo:'sistema' },
  { href:'/dashboard/pauta',        label:'Pauta',        icon:'📣', roles:['ADMIN'], grupo:'tienda' },
  // Caja de la tienda (23-nov-2026): la responsable cierra el día; el admin controla. Permiso CAJA.
  { href:'/dashboard/caja',         label:'Caja',         icon:'💵', roles:['ADMIN'], oAcceso:'CAJA', grupo:'dinero' },
  // Reporte de links de pago Payphone + dLocal (13-nov-2026): ¿se pagan? + balance. Solo ADMIN.
  { href:'/dashboard/reporte-pagos', label:'Reporte de pagos', icon:'💰', roles:['ADMIN'], grupo:'dinero' },
  { href:'/dashboard/errores',      label:'Errores',      icon:'🩺', roles:['ADMIN'], grupo:'sistema' },
  { href:'/dashboard/tareas',       label:'Tareas automáticas', icon:'⏱️', roles:['ADMIN'], grupo:'sistema' },
  { href:'/dashboard/usuarios',     label:'Usuarios',     icon:'👥', roles:['ADMIN'], grupo:'sistema' },
  // Los inbox son OTRAS aplicaciones: se abren en pestaña nueva y no se pintan
  // como "activas" nunca. Quién las ve NO depende del rol sino de `accesos`,
  // que se marca por persona en la pantalla de Usuarios.
  { href:'https://inbox.apps.mandarinaec.com',     label:'Inbox Mandarina', icon:'🍊', externo:true, acceso:'INBOX_MANDARINA', grupo:'apps' },
  { href:'https://ind-inbox.apps.mandarinaec.com', label:'Inbox Indstore',  icon:'🏪', externo:true, acceso:'INBOX_INDSTORE', grupo:'apps' },
  // El panel del club de premios (15-oct-2026) es otra app en premios.apps.mandarinaec.com:
  // entra con esta MISMA sesión (cookie de .apps.mandarinaec.com) y relee el rol en la base.
  { href:'https://premios.apps.mandarinaec.com/admin', label:'Club de premios', icon:'🎁', externo:true, roles:['ADMIN'], oAcceso:['CLUB_MANDARINA','CLUB_INDSTORE'], grupo:'apps' },
  // Lector del QR de los comprobantes de transferencia (20-oct-2026): página aparte,
  // sin sesión, todo se lee en el celular. Repo: Desktop\LECTOR-QR-PAGOS.
  { href:'https://lector-qr-pagos.vercel.app', label:'Validar comprobante', icon:'🧾', externo:true, roles:VENTA, oAcceso:'VENTAS', grupo:'ventas' },
]

// Orden del menú plano (cuando NO va en grupos): lo de cada rol, arriba.
export const ROL_PRIORITY = {
  VENDEDOR:    ['nuevo-pedido','link-pago','mis-pedidos','lector-qr','historial','guias','cotizacion','catalogo','tablero'],
  VENDEDOR_YAW:['nuevo-pedido','link-pago','lector-qr','historial','guias','cotizacion','tablero'],
  DISEÑO:      ['produccion','plan-fabrica','tablero','historial','impresion'],
  ESTAMPADO:   ['produccion','plan-fabrica','tablero','historial','impresion'],
  SUBLIMACION: ['produccion','plan-fabrica','tablero','historial','impresion'],
  BORDADO:     ['produccion','plan-fabrica','tablero','historial','impresion'],
  CORTE:       ['corte','plan-fabrica','tablero','historial'],
  DESPACHO:    ['despacho','guias','plan-fabrica','tablero','historial'],
  ADMIN:       ['tablero','plan-fabrica','nuevo-pedido','link-pago','historial','produccion','despacho','usuarios'],
}

// Lo que ve un usuario, en el orden del menú plano.
export function getNavItems(user) {
  const rol = user?.rol
  const accesos = Array.isArray(user?.accesos) ? user.accesos : []
  // Tres formas de ganarse un item del menu:
  //   `acceso`  → SOLO por permiso de persona (los inbox, que no son del CRM).
  //   `oAcceso` → por rol O por permiso: la venta, que hace DISEÑO ademas de
  //                su trabajo. Sin este 'o' habria que darles rol VENDEDOR y
  //                perderian la bandeja de Produccion.
  //   `roles`   → solo por rol, como siempre.
  const all = NAV_ALL.filter(n => {
    if (n.acceso) return accesos.includes(n.acceso)
    if (n.roles?.includes(rol)) return true
    // `oAcceso` puede ser uno o varios: basta tener cualquiera (el club: Mandarina o IND).
    return n.oAcceso ? [].concat(n.oAcceso).some(a => accesos.includes(a)) : false
  })
  const priority = ROL_PRIORITY[rol] || []
  if (!priority.length) return all
  const inicio = all.find(n => n.href === '/dashboard')
  const prioItems = priority.map(slug => all.find(n => n.href.includes(slug))).filter(Boolean)
  const rest = all.filter(n => n.href !== '/dashboard' && !prioItems.includes(n))
  return [inicio, ...prioItems, ...rest].filter(Boolean)
}

// Secciones para pintar en grupos, o null si son pocas opciones (menú plano).
// Cada sección: { id, titulo, items }. «Inicio» va primero, sin título; dentro
// de cada grupo, el orden de NAV_ALL. Un item sin grupo conocido cae en General.
export function agruparMenu(items) {
  if (!Array.isArray(items) || items.length < AGRUPAR_DESDE) return null
  const enNav = (a, b) => NAV_ALL.indexOf(a) - NAV_ALL.indexOf(b)
  const conocidos = new Set(GRUPOS.map(g => g.id))
  const grupoDe = (n) => conocidos.has(n.grupo) ? n.grupo : 'general'
  const inicio = items.filter(n => n.href === '/dashboard')
  const secciones = inicio.length ? [{ id: 'inicio', titulo: null, items: inicio }] : []
  for (const g of GRUPOS) {
    const del = items.filter(n => n.href !== '/dashboard' && grupoDe(n) === g.id).sort(enNav)
    if (del.length) secciones.push({ id: g.id, titulo: g.titulo, items: del })
  }
  return secciones
}

// Sin tildes ni mayúsculas: «produccion» encuentra «Producción».
export function normalizarBusqueda(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Opciones cuyo nombre (o el título de su grupo) contiene TODAS las palabras
// escritas. Texto vacío → []. Mantiene el orden de `items`.
export function buscarEnMenu(items, texto) {
  const palabras = normalizarBusqueda(texto).split(/\s+/).filter(Boolean)
  if (!palabras.length || !Array.isArray(items)) return []
  const tituloDe = Object.fromEntries(GRUPOS.map(g => [g.id, g.titulo]))
  return items.filter(n => {
    const donde = normalizarBusqueda(`${n.label} ${tituloDe[n.grupo] || ''}`)
    return palabras.every(p => donde.includes(p))
  })
}

// ── Pedidos desde el buscador del menú (27-nov-2026) ─────────────────────────
// «6738», «IND-XAV-6738» o «ind-6738» abren el pedido sin pasar por el Historial.
// La búsqueda la hace /api/guias (mismo alcance que el Historial: un vendedor
// solo encuentra sus pedidos). Un número largo también sirve: celular o guía.

export const MAX_PEDIDOS_MENU = 6

/** ¿Lo escrito parece un número de pedido (o un celular/guía)? */
export function pareceBusquedaDePedido(texto) {
  const t = String(texto ?? '').trim()
  if (/^(MAN|IND|YAW)-/i.test(t)) return true
  return /^[\d\s+-]+$/.test(t) && t.replace(/\D/g, '').length >= 4
}
