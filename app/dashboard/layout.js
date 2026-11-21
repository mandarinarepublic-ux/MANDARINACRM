'use client'
// v2
import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useNuevosPedidos } from '@/lib/useNuevosPedidos'
import { NotifContainer, useNotifs } from '@/components/NotifToast'
import ConnectionBanner from '@/components/ConnectionBanner'
import ToastHost from '@/components/ToastHost'

const NAV_ALL = [
  { href:'/dashboard',              label:'Inicio',       icon:'🏠', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE'] },
  { href:'/dashboard/tablero',      label:'Tablero',      icon:'📊', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE'] },
  // Plan de fábrica (9-nov-2026): CORTE · DISEÑO · CONFECCIÓN + QUÉ SE HACE HOY. Solo guía.
  { href:'/dashboard/plan-fabrica', label:'Plan de fábrica', icon:'🏭', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE'] },
  { href:'/dashboard/calendario',   label:'Calendario',   icon:'📅', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE'] },
  // `oAcceso`: ademas del rol, lo ve quien tenga ese permiso marcado por persona.
  // Asi los de DISEÑO pueden vender sin dejar de ser produccion (21-ago-2026).
  { href:'/dashboard/nuevo-pedido', label:'Nueva Venta',  icon:'➕', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW'], oAcceso:'VENTAS' },
  // Link de pago Payphone (10-nov-2026): celular + valor → se manda por el WhatsApp del vendedor.
  { href:'/dashboard/link-pago',    label:'Link de pago', icon:'💳', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW'], oAcceso:'VENTAS' },
  { href:'/dashboard/mis-pedidos',  label:'Mis Pedidos',  icon:'📦', roles:['VENDEDOR'], oAcceso:'VENTAS' },
  { href:'/dashboard/historial',    label:'Historial',    icon:'📋', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE'] },
  // Consultar guías (20-nov-2026): ¿ya salió?, ¿con qué guía? Solo lectura, con el alcance del Historial.
  { href:'/dashboard/guias',        label:'Guías',        icon:'🔎', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','DESPACHO'], oAcceso:'VENTAS' },
  { href:'/dashboard/catalogo',     label:'Catálogo',     icon:'🛍️', roles:['ADMIN','VENDEDOR'] },
  { href:'/dashboard/producto-nuevo', label:'Subir producto', icon:'🏷️', roles:['ADMIN'] },
  { href:'/dashboard/cotizacion',   label:'Cotización',   icon:'📄', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW'] },
  { href:'/dashboard/corte',       label:'Corte',        icon:'✂️', roles:['ADMIN','CORTE'] },
  { href:'/dashboard/produccion',   label:'Producción',   icon:'🏭', roles:['ADMIN','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','CORTE'] },
  { href:'/dashboard/impresion',    label:'Imprimir',     icon:'🖨️', roles:['ADMIN','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','CORTE'] },
  { href:'/dashboard/despacho',     label:'Despacho',     icon:'🚚', roles:['ADMIN','DESPACHO'] },
  { href:'/dashboard/tipos-prenda', label:'Tipos de prenda', icon:'👕', roles:['ADMIN'] },
  { href:'/dashboard/promo-seguimiento', label:'Promo del seguimiento', icon:'🎁', roles:['ADMIN'] },
  { href:'/dashboard/auto',         label:'AUTO',         icon:'🤖', roles:['ADMIN'] },
  { href:'/dashboard/pauta',        label:'Pauta',        icon:'📣', roles:['ADMIN'] },
  // Reporte de links de pago Payphone + dLocal (13-nov-2026): ¿se pagan? + balance. Solo ADMIN.
  { href:'/dashboard/reporte-pagos', label:'Reporte de pagos', icon:'💰', roles:['ADMIN'] },
  { href:'/dashboard/errores',      label:'Errores',      icon:'🩺', roles:['ADMIN'] },
  { href:'/dashboard/tareas',       label:'Tareas automáticas', icon:'⏱️', roles:['ADMIN'] },
  { href:'/dashboard/usuarios',     label:'Usuarios',     icon:'👥', roles:['ADMIN'] },
  // Los inbox son OTRAS aplicaciones: se abren en pestaña nueva y no se pintan
  // como "activas" nunca. Quién las ve NO depende del rol sino de `accesos`,
  // que se marca por persona en la pantalla de Usuarios.
  { href:'https://inbox.apps.mandarinaec.com',     label:'Inbox Mandarina', icon:'🍊', externo:true, acceso:'INBOX_MANDARINA' },
  { href:'https://ind-inbox.apps.mandarinaec.com', label:'Inbox Indstore',  icon:'🏪', externo:true, acceso:'INBOX_INDSTORE' },
  // El panel del club de premios (15-oct-2026) es otra app en premios.apps.mandarinaec.com:
  // entra con esta MISMA sesión (cookie de .apps.mandarinaec.com) y relee el rol en la base.
  { href:'https://premios.apps.mandarinaec.com/admin', label:'Club de premios', icon:'🎁', externo:true, roles:['ADMIN'], oAcceso:['CLUB_MANDARINA','CLUB_INDSTORE'] },
  // Lector del QR de los comprobantes de transferencia (20-oct-2026): página aparte,
  // sin sesión, todo se lee en el celular. Repo: Desktop\LECTOR-QR-PAGOS.
  { href:'https://lector-qr-pagos.vercel.app', label:'Validar comprobante', icon:'🧾', externo:true, roles:['ADMIN','VENDEDOR','VENDEDOR_YAW'], oAcceso:'VENTAS' },
]

const ROL_PRIORITY = {
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

function getNavItems(user) {
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

// Componente separado con useSearchParams — DEBE estar en <Suspense>
function ActiveLink({ item, rol, menuOpen, setMenuOpen, variant }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const fromHistorial = searchParams?.get('from') === 'historial'

  function isActive(itemHref) {
    if (itemHref === '/dashboard') return pathname === '/dashboard'
    if (pathname.startsWith('/dashboard/pedido/')) {
      if (itemHref === '/dashboard/historial') return fromHistorial
      if (itemHref === '/dashboard/mis-pedidos') return !fromHistorial && rol === 'VENDEDOR'
      return false
    }
    if (pathname.startsWith('/dashboard/editar-pedido/')) {
      if (itemHref === '/dashboard/mis-pedidos') return true
      return false
    }
    return pathname.startsWith(itemHref)
  }

  const active = isActive(item.href)

  // Enlace a otra aplicación: <a> con target y rel, nunca <Link> (que intentaría
  // navegar dentro del CRM). `noopener` evita que la pestaña nueva pueda tocar
  // esta ventana.
  if (item.externo) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer"
         onClick={() => setMenuOpen(false)}
         className={variant === 'menu'
           ? 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors'
           : 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors'}>
        <span aria-hidden="true">{item.icon}</span>
        <span className="text-sm">{item.label}</span>
        {/* La flecha solo se VE; el lector de pantalla necesita oírlo. */}
        <span aria-hidden="true" className="ml-auto text-xs text-gray-600">↗</span>
        <span className="sr-only">(abre en otra pestaña)</span>
      </a>
    )
  }

  // aria-current: la pantalla actual se anuncia como tal, no solo con color.
  if (variant === 'sidebar') {
    return (
      <Link href={item.href} aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
          ${active ? 'bg-mandarina-500/20 text-mandarina-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
        <span aria-hidden="true" className="text-base">{item.icon}</span>{item.label}
      </Link>
    )
  }
  if (variant === 'menu') {
    return (
      <Link href={item.href} onClick={() => setMenuOpen(false)} aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-medium transition-colors
          ${active ? 'bg-mandarina-500 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
        <span aria-hidden="true" className="text-xl w-7 text-center">{item.icon}</span>{item.label}
      </Link>
    )
  }
  return null
}

// Spinner de pantalla completa mientras se lee la sesión. role="status" + texto
// oculto: sin eso un lector de pantalla no dice nada y parece colgado.
function CargandoPantalla() {
  return (
    <div role="status" className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div aria-hidden="true" className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

// "Letra grande" como INTERRUPTOR de verdad (role="switch" + aria-checked): el
// lector dice "Letra grande, activado". Va en el menú del celular y TAMBIÉN en
// la barra lateral de escritorio: las PCs compartidas de fábrica son las que
// más lo necesitan y antes solo existía en el celular.
function InterruptorLetraGrande({ activo, onCambiar, compacto = false }) {
  return (
    <button type="button" role="switch" aria-checked={activo} onClick={onCambiar}
      className={compacto
        ? 'w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors'
        : 'w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors'}>
      <span className={compacto ? 'flex items-center gap-2' : 'flex items-center gap-4'}>
        <span aria-hidden="true" className={compacto ? '' : 'text-xl w-7 text-center'}>🔡</span>
        Letra grande
      </span>
      <span aria-hidden="true"
        className={`${compacto ? 'w-9 h-5' : 'w-11 h-6'} rounded-full transition-colors flex items-center px-0.5 flex-shrink-0 ${activo ? 'bg-mandarina-500' : 'bg-gray-700'}`}>
        <span className={`${compacto ? 'w-4 h-4' : 'w-5 h-5'} rounded-full bg-white shadow motion-safe:transition-transform ${activo ? (compacto ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

function DashboardChrome({ children }) {
  const router = useRouter()
  // Con ?embed=1 esta pantalla vive dentro del panel del inbox: sin menú lateral,
  // sin cabecera y sin los márgenes que dejan sitio para ellos. Es un cambio de
  // presentación, NO de permisos: la sesión y el rol siguen decidiéndose igual.
  const searchParams = useSearchParams()
  const esEmbed = searchParams?.get('embed') === '1'
  const [user, setUser] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [letraGrande, setLetraGrande] = useState(false)

  // Foco del menú del celular: al abrir entra al menú (✕), al cerrar vuelve al
  // ☰. Sin esto, con teclado o lector de pantalla el foco quedaba DETRÁS del
  // menú abierto, recorriendo una página tapada.
  const botonMenuRef = useRef(null)
  const cajonRef = useRef(null)
  const cerrarMenuRef = useRef(null)
  const estabaAbierto = useRef(false)

  useEffect(() => {
    if (menuOpen) {
      estabaAbierto.current = true
      cerrarMenuRef.current?.focus()
      const alTeclear = (e) => {
        if (e.key === 'Escape') { setMenuOpen(false); return }
        // Tab no se escapa del menú mientras está abierto (es modal).
        if (e.key !== 'Tab' || !cajonRef.current) return
        const enfocables = cajonRef.current.querySelectorAll('a[href], button:not([disabled])')
        if (!enfocables.length) return
        const primero = enfocables[0]
        const ultimo = enfocables[enfocables.length - 1]
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
      }
      document.addEventListener('keydown', alTeclear)
      return () => document.removeEventListener('keydown', alTeclear)
    }
    if (estabaAbierto.current) {
      estabaAbierto.current = false
      // Solo se devuelve el foco si estaba en el menú (o perdido): si alguien ya
      // tocó otra cosa, no se le arrebata.
      const activo = document.activeElement
      if (!activo || activo === document.body || cajonRef.current?.contains(activo)) {
        botonMenuRef.current?.focus()
      }
    }
  }, [menuOpen])

  useEffect(() => {
    const lg = localStorage.getItem('mp_letra_grande') === 'true'
    setLetraGrande(lg)
    document.documentElement.classList.toggle('letra-grande', lg)
  }, [])

  function toggleLetraGrande() {
    const nuevo = !letraGrande
    setLetraGrande(nuevo)
    localStorage.setItem('mp_letra_grande', String(nuevo))
    document.documentElement.classList.toggle('letra-grande', nuevo)
  }

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
  }, [])

  // Cerrar sesión de verdad: además de olvidar al usuario en el navegador, hay
  // que pedirle al servidor que borre la cookie firmada, que es la credencial.
  async function logout() {
    localStorage.removeItem('mp_user')
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
    router.push('/')
  }

  const { notifs, addNotif, removeNotif } = useNotifs()
  const handleNuevoPedido = useCallback((pedido) => addNotif(pedido), [addNotif])
  useNuevosPedidos(user, handleNuevoPedido)

  if (!user) return <CargandoPantalla />

  if (esEmbed) {
    // Ojo: se conserva el fondo para que el iframe no se vea blanco sobre el
    // panel oscuro del inbox mientras carga.
    return <main id="contenido" className="min-h-screen bg-gray-950">{children}</main>
  }

  const navItems = getNavItems(user)

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Primer elemento con Tab: salta el menú (20+ enlaces) y va directo a la
          pantalla. Invisible hasta que recibe el foco. */}
      <a href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-[calc(0.5rem+env(safe-area-inset-top,0px))] focus:z-[300] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-mandarina-500 focus:text-white focus:text-sm focus:font-semibold">
        Saltar al contenido
      </a>

      {/* Banner de conexión (offline / reconectado) — fijo arriba */}
      <ConnectionBanner />

      {/* MOBILE TOP BAR
          paddingTop = margen seguro: con la PWA a pantalla completa
          (viewport-fit=cover + black-translucent) la barra quedaba debajo de la
          hora/notch. El contenido baja lo mismo con .contenido-bajo-cabecera. */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div aria-hidden="true" className="w-8 h-8 rounded-xl bg-mandarina-500 flex items-center justify-center text-white font-bold text-sm">M</div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">Mandarina Pro</div>
              <div className="text-gray-500 text-xs">{user.nombre}</div>
            </div>
          </Link>
          {/* 40×40: el ☰ medía 36px, justo por debajo de lo que se toca bien. */}
          <button ref={botonMenuRef} type="button" onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen} aria-controls="menu-movil"
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition-colors text-xl">
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER — deslizable de izquierda a derecha */}
      {/* Fondo oscuro semitransparente */}
      <div
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none
          ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
      />
      {/* Panel lateral.
          - Abierto: diálogo modal (role="dialog" + aria-modal), Escape lo cierra.
          - Cerrado: `inert`. Solo se corre fuera de la pantalla, y sin inert sus
            25 enlaces seguían recibiendo Tab y el lector los leía, invisibles.
            React 18 no conoce `inert` como booleano: con "" el atributo se
            pone, con undefined se quita.
          - Márgenes seguros arriba y abajo por el notch y la barra de gestos. */}
      <div
        id="menu-movil"
        ref={cajonRef}
        role={menuOpen ? 'dialog' : undefined}
        aria-modal={menuOpen ? true : undefined}
        aria-label="Menú"
        inert={menuOpen ? undefined : ''}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-gray-900 flex flex-col
          shadow-2xl transition-transform duration-300 ease-in-out motion-reduce:transition-none
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="w-10 h-10 rounded-xl bg-mandarina-500 flex items-center justify-center text-white font-bold text-base">
              {user.nombre?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">{user.nombre}</div>
              <div className="text-xs text-gray-500 mt-0.5">{user.rol}</div>
            </div>
          </div>
          <button
            ref={cerrarMenuRef}
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white rounded-lg hover:bg-gray-800 transition-colors text-lg"
          ><span aria-hidden="true">✕</span></button>
        </div>

        {/* Nav items */}
        {/* min-h-0 es CRUCIAL en flex-col: permite que flex-1 comprima el nav en lugar de estirarlo.
            overscroll-contain: al llegar al final de la lista, el dedo no arrastra
            la página de atrás (ni dispara el "tirar para recargar"). */}
        <nav aria-label="Menú principal" className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-1">
          {navItems.map(item => (
            <Suspense key={item.href} fallback={
              <div className="flex items-center gap-4 px-4 py-3.5 text-gray-500 text-sm"><span aria-hidden="true">{item.icon}</span> {item.label}</div>
            }>
              <ActiveLink item={item} rol={user.rol} menuOpen={menuOpen} setMenuOpen={setMenuOpen} variant="menu" />
            </Suspense>
          ))}
        </nav>

        {/* Footer del drawer */}
        <div className="border-t border-gray-800 px-3 py-4 space-y-1">
          <InterruptorLetraGrande activo={letraGrande} onCambiar={toggleLetraGrande} />
          <button type="button" onClick={logout} className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors">
            <span aria-hidden="true" className="text-xl w-7 text-center">🚪</span>Cerrar sesión
          </button>
        </div>
      </div>


      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 border-r border-gray-800 p-4 fixed h-full z-30">
        <Link href="/dashboard" className="flex items-center gap-3 mb-8 px-2 hover:opacity-80 transition-opacity">
          <div aria-hidden="true" className="w-9 h-9 rounded-xl bg-mandarina-500 flex items-center justify-center text-white font-bold text-sm">M</div>
          <div>
            <div className="text-white font-display font-semibold text-sm">Mandarina Pro</div>
            <div className="text-gray-500 text-xs truncate">{user.nombre}</div>
          </div>
        </Link>
        {/* min-h-0 es CRUCIAL en flex-col: permite que flex-1 comprima el nav en lugar de estirarlo */}
        <nav aria-label="Menú principal" className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1">
          {navItems.map(item => (
            <Suspense key={item.href} fallback={
              <div className="flex items-center gap-3 px-3 py-2.5 text-gray-500 text-sm"><span aria-hidden="true">{item.icon}</span> {item.label}</div>
            }>
              <ActiveLink item={item} rol={user.rol} menuOpen={menuOpen} setMenuOpen={setMenuOpen} variant="sidebar" />
            </Suspense>
          ))}
        </nav>
        <div className="border-t border-gray-800 pt-4 mt-4">
          <div className="px-3 py-2 mb-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">ROL</div>
            <div className="text-sm text-gray-300">{user.rol}</div>
          </div>
          <div className="mb-1">
            <InterruptorLetraGrande activo={letraGrande} onCambiar={toggleLetraGrande} compacto />
          </div>
          <button type="button" onClick={logout} className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors">
            <span aria-hidden="true">🚪</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* tabIndex=-1: el "Saltar al contenido" mueve el foco aquí de verdad (sin
          él, algunos navegadores solo hacen scroll y el siguiente Tab vuelve al
          menú). No muestra contorno: no es un control. */}
      <main id="contenido" tabIndex={-1} className="md:ml-56 contenido-bajo-cabecera md:pt-0 min-h-screen focus:outline-none">{children}</main>

      {/* Notificaciones de nuevos pedidos — arriba (ver .avisos-arriba en globals.css) */}
      <NotifContainer notifs={notifs} onClose={removeNotif} />

      {/* Toasts de confirmación (✅ Guardado en cambios de producción) */}
      <ToastHost />
    </div>
  )
}

// useSearchParams() exige un <Suspense> encima o el build falla. Mismo patrón
// que ActiveLink, más arriba en este archivo.
export default function DashboardLayout({ children }) {
  return (
    <Suspense fallback={<CargandoPantalla />}>
      <DashboardChrome>{children}</DashboardChrome>
    </Suspense>
  )
}
