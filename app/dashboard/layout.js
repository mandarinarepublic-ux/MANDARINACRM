'use client'
// v2
import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useNuevosPedidos } from '@/lib/useNuevosPedidos'
import { NotifContainer, useNotifs } from '@/components/NotifToast'
import ConnectionBanner from '@/components/ConnectionBanner'
import ToastHost from '@/components/ToastHost'
// Qué opciones ve cada quien, sus grupos y el buscador: lib/menu.js (con tests).
import { getNavItems, agruparMenu, buscarEnMenu } from '@/lib/menu'
// Permisos al día desde la base y aviso de versión nueva: lib/sesionCliente.js.
import { refrescarUsuario, hayVersionNueva } from '@/lib/sesionCliente'

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

// Lista del menú. Con pocas opciones (vendedores, taller) es la lista plana de
// siempre. Con muchas (admin, 24-nov-2026) va en grupos con título y con un
// buscador arriba: se escribe «caj» y queda solo Caja; Enter abre la primera.
function ListaMenu({ items, rol, menuOpen, setMenuOpen, variant, busqueda, setBusqueda, inputRef, onIr }) {
  const enlace = (item) => (
    <Suspense key={item.href} fallback={variant === 'menu'
      ? <div className="flex items-center gap-4 px-4 py-3.5 text-gray-500 text-sm"><span aria-hidden="true">{item.icon}</span> {item.label}</div>
      : <div className="flex items-center gap-3 px-3 py-2.5 text-gray-500 text-sm"><span aria-hidden="true">{item.icon}</span> {item.label}</div>}>
      <ActiveLink item={item} rol={rol} menuOpen={menuOpen} setMenuOpen={setMenuOpen} variant={variant} />
    </Suspense>
  )
  const secciones = agruparMenu(items)
  if (!secciones) return items.map(enlace)

  const buscando = busqueda.trim() !== ''
  const resultados = buscando ? buscarEnMenu(items, busqueda) : []
  const idInput = `buscar-menu-${variant}`
  return (
    <>
      {/* Pegado arriba: al bajar por el menú, el buscador no se va. */}
      <div className="sticky top-0 z-10 bg-gray-900 pb-2">
        <label htmlFor={idInput} className="sr-only">Buscar en el menú</label>
        <input ref={inputRef} id={idInput} type="search" value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const primero = buscarEnMenu(items, busqueda)[0]
              if (primero) { e.preventDefault(); onIr(primero) }
            } else if (e.key === 'Escape' && busqueda) {
              // Primero borra lo escrito; un segundo Escape ya cierra el menú.
              e.stopPropagation(); setBusqueda('')
            }
          }}
          placeholder={variant === 'sidebar' ? 'Buscar…   Ctrl+K' : 'Buscar en el menú…'}
          autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
          // 16px en el celular: con menos, el iPhone hace zoom al tocar el campo.
          className={`w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-mandarina-500 ${variant === 'menu' ? 'text-base' : 'text-sm'}`} />
        <span className="sr-only" aria-live="polite">
          {buscando ? (resultados.length === 1 ? '1 opción' : `${resultados.length} opciones`) : ''}
        </span>
      </div>
      {buscando
        ? (resultados.length
            ? <div className="space-y-1">{resultados.map(enlace)}</div>
            : <p className="px-3 py-2 text-sm text-gray-500">Nada con «{busqueda.trim()}».</p>)
        : secciones.map(s => (
            <div key={s.id} role={s.titulo ? 'group' : undefined}
              aria-labelledby={s.titulo ? `menu-${variant}-${s.id}` : undefined}>
              {s.titulo && (
                <div id={`menu-${variant}-${s.id}`}
                  className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {s.titulo}
                </div>
              )}
              <div className="space-y-1">{s.items.map(enlace)}</div>
            </div>
          ))}
    </>
  )
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
  // Buscador del menú (solo aparece cuando el menú va en grupos).
  const [busqueda, setBusqueda] = useState('')
  const buscarEscritorioRef = useRef(null)
  const buscarMovilRef = useRef(null)
  const pathname = usePathname()
  // Al cambiar de pantalla, el buscador se limpia y el menú vuelve a sus grupos.
  useEffect(() => { setBusqueda('') }, [pathname])

  // Ctrl+K (⌘K en Mac) lleva al buscador del menú. Si el menú es plano no hay
  // buscador y la tecla queda para el navegador.
  useEffect(() => {
    const alTeclear = (e) => {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== 'k') return
      const escritorio = window.matchMedia('(min-width: 768px)').matches
      if (!(escritorio ? buscarEscritorioRef.current : buscarMovilRef.current)) return
      e.preventDefault()
      if (escritorio) { buscarEscritorioRef.current.focus(); buscarEscritorioRef.current.select() }
      else { setMenuOpen(true); setTimeout(() => buscarMovilRef.current?.focus(), 50) }
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [])

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
        const enfocables = cajonRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')
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

  // Ponerse al día con la base: lo guardado en `mp_user` es una copia de cuando
  // la persona ENTRÓ, así que un permiso marcado después en Usuarios no salía en
  // el menú hasta cerrar sesión (Jackeline y CAJA, 24-nov-2026). Se consulta al
  // abrir, cada 5 minutos y al volver a la pestaña. La misma consulta dice qué
  // versión está publicada; si es otra, sale el botón para actualizar. No se
  // recarga sola: podría haber un pedido a medio llenar.
  const [versionNueva, setVersionNueva] = useState(false)
  useEffect(() => {
    let vivo = true
    async function ponerseAlDia() {
      try {
        const r = await fetch('/api/auth/yo', { cache: 'no-store' })
        const data = await r.json().catch(() => ({}))
        if (!vivo) return
        if (hayVersionNueva(process.env.BUILD_CLIENTE, data?.build)) setVersionNueva(true)
        if (!r.ok || !data?.user) return
        const nuevo = refrescarUsuario(JSON.parse(localStorage.getItem('mp_user') || 'null'), data.user)
        if (nuevo) {
          localStorage.setItem('mp_user', JSON.stringify(nuevo))
          setUser(nuevo)
        }
      } catch {}
    }
    ponerseAlDia()
    const cada5min = setInterval(ponerseAlDia, 5 * 60 * 1000)
    const alVolver = () => { if (document.visibilityState === 'visible') ponerseAlDia() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(cada5min)
      document.removeEventListener('visibilitychange', alVolver)
    }
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
  // Enter en el buscador: abre la primera opción encontrada.
  function irA(item) {
    setBusqueda('')
    setMenuOpen(false)
    if (item.externo) window.open(item.href, '_blank', 'noopener,noreferrer')
    else router.push(item.href)
  }

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

      {versionNueva && (
        <button type="button" onClick={() => window.location.reload()}
          className="fixed z-[250] left-1/2 -translate-x-1/2 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] whitespace-nowrap px-4 py-2.5 rounded-full bg-mandarina-500 hover:bg-mandarina-600 text-white text-sm font-semibold shadow-lg shadow-black/40 transition-colors">
          🔄 Hay una versión nueva · Actualizar
        </button>
      )}

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
          <ListaMenu items={navItems} rol={user.rol} menuOpen={menuOpen} setMenuOpen={setMenuOpen} variant="menu"
            busqueda={busqueda} setBusqueda={setBusqueda} inputRef={buscarMovilRef} onIr={irA} />
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
          <ListaMenu items={navItems} rol={user.rol} menuOpen={menuOpen} setMenuOpen={setMenuOpen} variant="sidebar"
            busqueda={busqueda} setBusqueda={setBusqueda} inputRef={buscarEscritorioRef} onIr={irA} />
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
