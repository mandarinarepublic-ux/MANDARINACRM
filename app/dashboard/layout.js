'use client'
// v2
import { useState, useEffect, Suspense, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useNuevosPedidos } from '@/lib/useNuevosPedidos'
import { NotifContainer, useNotifs } from '@/components/NotifToast'
import ConnectionBanner from '@/components/ConnectionBanner'
import ToastHost from '@/components/ToastHost'

const NAV_ALL = [
  { href:'/dashboard',              label:'Inicio',       icon:'🏠', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE'] },
  { href:'/dashboard/tablero',      label:'Tablero',      icon:'📊', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE'] },
  { href:'/dashboard/calendario',   label:'Calendario',   icon:'📅', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE'] },
  { href:'/dashboard/nuevo-pedido', label:'Nueva Venta',  icon:'➕', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW'] },
  { href:'/dashboard/mis-pedidos',  label:'Mis Pedidos',  icon:'📦', roles:['VENDEDOR'] },
  { href:'/dashboard/historial',    label:'Historial',    icon:'📋', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO','CORTE'] },
  { href:'/dashboard/catalogo',     label:'Catálogo',     icon:'🛍️', roles:['ADMIN','VENDEDOR'] },
  { href:'/dashboard/cotizacion',   label:'Cotización',   icon:'📄', roles:['ADMIN','VENDEDOR','VENDEDOR_YAW'] },
  { href:'/dashboard/corte',       label:'Corte',        icon:'✂️', roles:['ADMIN','CORTE'] },
  { href:'/dashboard/produccion',   label:'Producción',   icon:'🏭', roles:['ADMIN','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','CORTE'] },
  { href:'/dashboard/impresion',    label:'Imprimir',     icon:'🖨️', roles:['ADMIN','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','CORTE'] },
  { href:'/dashboard/despacho',     label:'Despacho',     icon:'🚚', roles:['ADMIN','DESPACHO'] },
  { href:'/dashboard/tipos-prenda', label:'Tipos de prenda', icon:'👕', roles:['ADMIN'] },
  { href:'/dashboard/pauta',        label:'Pauta',        icon:'📣', roles:['ADMIN'] },
  { href:'/dashboard/errores',      label:'Errores',      icon:'🩺', roles:['ADMIN'] },
  { href:'/dashboard/usuarios',     label:'Usuarios',     icon:'👥', roles:['ADMIN'] },
  // Los inbox son OTRAS aplicaciones: se abren en pestaña nueva y no se pintan
  // como "activas" nunca. Quién las ve NO depende del rol sino de `accesos`,
  // que se marca por persona en la pantalla de Usuarios.
  { href:'https://inbox.apps.mandarinaec.com',     label:'Inbox Mandarina', icon:'🍊', externo:true, acceso:'INBOX_MANDARINA' },
  { href:'https://ind-inbox.apps.mandarinaec.com', label:'Inbox Indstore',  icon:'🏪', externo:true, acceso:'INBOX_INDSTORE' },
]

const ROL_PRIORITY = {
  VENDEDOR:    ['nuevo-pedido','mis-pedidos','historial','cotizacion','catalogo','tablero'],
  VENDEDOR_YAW:['nuevo-pedido','historial','cotizacion','tablero'],
  DISEÑO:      ['produccion','tablero','historial','impresion'],
  ESTAMPADO:   ['produccion','tablero','historial','impresion'],
  SUBLIMACION: ['produccion','tablero','historial','impresion'],
  BORDADO:     ['produccion','tablero','historial','impresion'],
  CORTE:       ['corte','tablero','historial'],
  DESPACHO:    ['despacho','tablero','historial'],
  ADMIN:       ['tablero','nuevo-pedido','historial','produccion','despacho','usuarios'],
}

function getNavItems(user) {
  const rol = user?.rol
  const accesos = Array.isArray(user?.accesos) ? user.accesos : []
  // Un ítem con `acceso` se muestra solo si la persona lo tiene marcado; el
  // resto sigue filtrándose por rol, igual que siempre.
  const all = NAV_ALL.filter(n => (n.acceso ? accesos.includes(n.acceso) : n.roles.includes(rol)))
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
           ? 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all'
           : 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all'}>
        <span>{item.icon}</span>
        <span className="text-sm">{item.label}</span>
        <span className="ml-auto text-xs text-gray-600">↗</span>
      </a>
    )
  }

  if (variant === 'sidebar') {
    return (
      <Link href={item.href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
          ${active ? 'bg-mandarina-500/20 text-mandarina-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
        <span className="text-base">{item.icon}</span>{item.label}
      </Link>
    )
  }
  if (variant === 'menu') {
    return (
      <Link href={item.href} onClick={() => setMenuOpen(false)}
        className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all
          ${active ? 'bg-mandarina-500 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
        <span className="text-xl w-7 text-center">{item.icon}</span>{item.label}
      </Link>
    )
  }
  return null
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

  if (!user) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (esEmbed) {
    // Ojo: se conserva el fondo para que el iframe no se vea blanco sobre el
    // panel oscuro del inbox mientras carga.
    return <main className="min-h-screen bg-gray-950">{children}</main>
  }

  const navItems = getNavItems(user)

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Banner de conexión (offline / reconectado) — fijo arriba */}
      <ConnectionBanner />

      {/* MOBILE TOP BAR */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-mandarina-500 flex items-center justify-center text-white font-bold text-sm">M</div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">Mandarina Pro</div>
              <div className="text-gray-500 text-xs">{user.nombre}</div>
            </div>
          </Link>
          <button onClick={() => setMenuOpen(!menuOpen)} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition-all text-xl">
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER — deslizable de izquierda a derecha */}
      {/* Fondo oscuro semitransparente */}
      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300
          ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
      />
      {/* Panel lateral */}
      <div
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-gray-900 flex flex-col
          shadow-2xl transition-transform duration-300 ease-in-out
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-mandarina-500 flex items-center justify-center text-white font-bold text-base">
              {user.nombre?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">{user.nombre}</div>
              <div className="text-xs text-gray-500 mt-0.5">{user.rol}</div>
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white rounded-lg hover:bg-gray-800 transition-all text-lg"
          >✕</button>
        </div>

        {/* Nav items */}
        {/* min-h-0 es CRUCIAL en flex-col: permite que flex-1 comprima el nav en lugar de estirarlo */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(item => (
            <Suspense key={item.href} fallback={
              <div className="flex items-center gap-4 px-4 py-3.5 text-gray-500 text-sm">{item.icon} {item.label}</div>
            }>
              <ActiveLink item={item} rol={user.rol} menuOpen={menuOpen} setMenuOpen={setMenuOpen} variant="menu" />
            </Suspense>
          ))}
        </nav>

        {/* Footer del drawer */}
        <div className="border-t border-gray-800 px-3 py-4 space-y-1">
          {/* Toggle letra grande */}
          <button
            onClick={toggleLetraGrande}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium text-gray-300 hover:bg-gray-800 transition-all"
          >
            <span className="flex items-center gap-4">
              <span className="text-xl w-7 text-center">🔡</span>
              Letra grande
            </span>
            <span className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${letraGrande ? 'bg-mandarina-500' : 'bg-gray-700'}`}>
              <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${letraGrande ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
          </button>
          <button onClick={logout} className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all">
            <span className="text-xl w-7 text-center">🚪</span>Cerrar sesión
          </button>
        </div>
      </div>


      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 border-r border-gray-800 p-4 fixed h-full z-30">
        <Link href="/dashboard" className="flex items-center gap-3 mb-8 px-2 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-xl bg-mandarina-500 flex items-center justify-center text-white font-bold text-sm">M</div>
          <div>
            <div className="text-white font-display font-semibold text-sm">Mandarina Pro</div>
            <div className="text-gray-500 text-xs truncate">{user.nombre}</div>
          </div>
        </Link>
        {/* min-h-0 es CRUCIAL en flex-col: permite que flex-1 comprima el nav en lugar de estirarlo */}
        <nav className="flex-1 min-h-0 overflow-y-auto space-y-1">
          {navItems.map(item => (
            <Suspense key={item.href} fallback={
              <div className="flex items-center gap-3 px-3 py-2.5 text-gray-500 text-sm">{item.icon} {item.label}</div>
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
          <button onClick={logout} className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all">
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="md:ml-56 pt-16 md:pt-0 min-h-screen">{children}</main>

      {/* Notificaciones de nuevos pedidos — esquina inferior derecha */}
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
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardChrome>{children}</DashboardChrome>
    </Suspense>
  )
}
