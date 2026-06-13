'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const NAV = [
  { href: '/dashboard',              label: 'Inicio',       icon: '🏠', roles: ['ADMIN','VENDEDOR','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO'] },
  { href: '/dashboard/nuevo-pedido', label: 'Nueva Venta',  icon: '➕', roles: ['ADMIN','VENDEDOR'] },
  { href: '/dashboard/mis-pedidos',  label: 'Mis Pedidos',  icon: '📦', roles: ['ADMIN','VENDEDOR'] },
  { href: '/dashboard/historial',    label: 'Historial',    icon: '📋', roles: ['ADMIN','VENDEDOR','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO','DESPACHO'] },
  { href: '/dashboard/catalogo',     label: 'Catálogo',     icon: '🛍️', roles: ['ADMIN','VENDEDOR'] },
  { href: '/dashboard/produccion',   label: 'Producción',   icon: '🏭', roles: ['ADMIN','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO'] },
  { href: '/dashboard/impresion',    label: 'Imprimir',     icon: '🖨️', roles: ['ADMIN','ESTAMPADO','SUBLIMACION','BORDADO','DISEÑO'] },
  { href: '/dashboard/despacho',     label: 'Despacho',     icon: '🚚', roles: ['ADMIN','DESPACHO'] },
  { href: '/dashboard/usuarios',     label: 'Usuarios',     icon: '👥', roles: ['ADMIN'] },
]

function isActive(itemHref, pathname) {
  if (itemHref === '/dashboard') return pathname === '/dashboard'
  return pathname.startsWith(itemHref)
}

export default function DashboardLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
  }, [])

  function logout() {
    localStorage.removeItem('mp_user')
    router.push('/')
  }

  if (!user) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const navItems = NAV.filter(n => n.roles.includes(user.rol))

  return (
    <div className="min-h-screen bg-gray-950">

      {/* ── MOBILE TOP BAR ── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-mandarina-500 flex items-center justify-center text-white font-bold text-sm">M</div>
            <div>
              <div className="text-white font-semibold text-sm leading-none">Mandarina Pro</div>
              <div className="text-gray-500 text-xs">{user.nombre}</div>
            </div>
          </Link>
          <button onClick={() => setMenuOpen(!menuOpen)}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition-all text-xl">
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* ── MOBILE MENU OVERLAY ── */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-gray-950" onClick={() => setMenuOpen(false)}>
          <div className="pt-16 px-4 pb-8" onClick={e => e.stopPropagation()}>
            {/* User card */}
            <div className="bg-gray-800/50 rounded-2xl p-4 mb-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-mandarina-500 flex items-center justify-center text-white font-bold text-lg">
                {user.nombre?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <div className="text-white font-semibold">{user.nombre}</div>
                <div className="text-xs text-gray-500">{user.rol}</div>
              </div>
            </div>

            <nav className="space-y-1">
              {navItems.map(item => (
                <Link key={item.href} href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all
                    ${isActive(item.href, pathname)
                      ? 'bg-mandarina-500 text-white'
                      : 'text-gray-300 hover:bg-gray-800'}`}>
                  <span className="text-xl w-7 text-center">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>

            <button onClick={logout}
              className="mt-4 w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all">
              <span className="text-xl w-7 text-center">🚪</span>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE BOTTOM NAV (max 5 items) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 safe-area-pb">
        <div className="flex items-center justify-around px-2 py-1">
          {navItems.slice(0, 5).map(item => (
            <Link key={item.href} href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl transition-all min-w-0
                ${isActive(item.href, pathname) ? 'text-mandarina-400' : 'text-gray-600'}`}>
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs truncate max-w-[52px] text-center leading-tight">{item.label}</span>
            </Link>
          ))}
          {navItems.length > 5 && (
            <button onClick={() => setMenuOpen(true)}
              className="flex flex-col items-center gap-0.5 px-2 py-2 text-gray-600">
              <span className="text-xl">⋯</span>
              <span className="text-xs">Más</span>
            </button>
          )}
        </div>
      </nav>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 border-r border-gray-800 p-4 fixed h-full z-30">
        <Link href="/dashboard" className="flex items-center gap-3 mb-8 px-2 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-xl bg-mandarina-500 flex items-center justify-center text-white font-bold text-sm">M</div>
          <div>
            <div className="text-white font-display font-semibold text-sm">Mandarina Pro</div>
            <div className="text-gray-500 text-xs truncate">{user.nombre}</div>
          </div>
        </Link>
        <nav className="flex-1 space-y-1">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive(item.href, pathname)
                  ? 'bg-mandarina-500/20 text-mandarina-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
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

      {/* ── MAIN CONTENT ── */}
      <main className="md:ml-56 pt-16 pb-24 md:pt-0 md:pb-0 min-h-screen">
        {children}
      </main>
    </div>
  )
}
