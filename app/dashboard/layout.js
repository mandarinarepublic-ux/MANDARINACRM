'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const NAV = [
  { href: '/dashboard/nuevo-pedido', label: 'Nueva Venta',  icon: '➕', roles: ['ADMIN','VENDEDOR'] },
  { href: '/dashboard/historial',    label: 'Historial',    icon: '📋', roles: ['ADMIN','VENDEDOR'] },
  { href: '/dashboard/produccion',   label: 'Producción',   icon: '🏭', roles: ['ADMIN','DISEÑO'] },
  { href: '/dashboard/impresion',    label: 'Imprimir',     icon: '🖨️', roles: ['ADMIN','DISEÑO'] },
  { href: '/dashboard/despacho',     label: 'Despacho',     icon: '🚚', roles: ['ADMIN','DESPACHO'] },
  { href: '/dashboard/usuarios',     label: 'Usuarios',     icon: '👥', roles: ['ADMIN'] },
]

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
  const tiendaColor = '#FF6B00'

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 border-r border-gray-800 p-4 fixed h-full z-30">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm bg-mandarina-500">M</div>
          <div>
            <div className="text-white font-display font-semibold text-sm">Mandarina Pro</div>
            <div className="text-gray-500 text-xs truncate">{user.nombre}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${pathname.startsWith(item.href)
                  ? 'bg-mandarina-500/20 text-mandarina-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-gray-800 pt-4 mt-4">
          <div className="px-3 py-2 mb-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Rol</div>
            <div className="text-sm text-gray-300">{user.rol}</div>
          </div>
          <button onClick={logout} className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all">
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-mandarina-500 flex items-center justify-center text-white font-bold text-xs">M</div>
          <span className="font-display font-semibold text-sm text-white">Mandarina Pro</span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-gray-400 p-1 text-xl">
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-gray-950/98 pt-14 p-4">
          <nav className="space-y-1">
            {navItems.map(item => (
              <Link key={item.href} href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                  ${pathname.startsWith(item.href) ? 'bg-mandarina-500/20 text-mandarina-400' : 'text-gray-300'}`}>
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            ))}
            <button onClick={logout} className="w-full text-left px-4 py-3 text-sm text-red-400 mt-4">
              🚪 Cerrar sesión
            </button>
          </nav>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-56 pt-14 md:pt-0 min-h-screen">
        {children}
      </main>
    </div>
  )
}
