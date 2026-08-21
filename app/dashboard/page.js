'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ESTADO_LABELS, ESTADO_COLORS } from '@/lib/labels'
import { parseFecha, fechaISOEcuador, hoyEcuador, formatFechaDia } from '@/lib/parseFecha'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorTexto, setErrorTexto] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    loadData(u)
  }, [])

  async function loadData() {
    setErrorTexto('')
    try {
      // Los agregados los calcula la BASE. Antes se traian los 690 pedidos con
      // sus cinco tablas y se sumaba aca — y `detalle_pedido` pedia 1314 filas
      // cuando PostgREST devuelve 1000 como mucho: 314 prendas ya se perdian,
      // falseando el conteo por area y pudiendo dar por LISTO un pedido al que
      // solo le faltaban prendas por cargar.
      //
      // Y NO se manda `?rol=`: el alcance sale de la cookie firmada.
      const res = await fetch('/api/inicio', { cache: 'no-store' })
      if (!res.ok) {
        const detalle = await res.json().catch(() => ({}))
        setErrorTexto(detalle.error || `HTTP ${res.status}`)
        return
      }
      const d = await res.json()
      setData(d.resumen || null)
    } catch (e) {
      // Una respuesta que no es JSON tambien es un fallo, no un panel en cero.
      setErrorTexto(e?.message || 'Error de conexion')
    } finally { setLoading(false) }
  }

  if (!user || loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // Un fallo NO es un panel en cero. Antes cualquier error dejaba `data` en null
  // y la pantalla pintaba ceros, que se leen como "hoy no se vendió nada".
  if (errorTexto || !data) return (
    <div className="max-w-md mx-auto mt-10 card p-8 text-center border-red-500/40">
      <div className="text-4xl mb-3">⚠️</div>
      <div className="font-medium text-white">No se pudo cargar el panel</div>
      <div className="text-sm text-gray-500 mt-1">{errorTexto || 'Sin datos'}</div>
      <div className="text-xs text-gray-600 mt-2">No es que no haya ventas: es que no pudimos leerlas.</div>
      <button onClick={() => { setLoading(true); loadData() }} className="btn-primary text-sm px-4 py-2 mt-4">
        Reintentar
      </button>
    </div>
  )

  const rol = user.rol
  // CORTE entra aquí a propósito: al no estar contemplado caía en el `return` de
  // abajo y veía el panel de ADMIN completo, con ventas, cobrado y saldo por
  // cobrar. El panel de producción es el que le corresponde.
  if (rol === 'DISEÑO' || rol === 'ESTAMPADO' || rol === 'SUBLIMACION' || rol === 'BORDADO' || rol === 'CORTE') {
    return <DashboardDiseno data={data} user={user} />
  }
  if (rol === 'DESPACHO') return <DashboardDespacho data={data} user={user} />
  if (rol === 'VENDEDOR') return <DashboardVendedor data={data} user={user} />
  if (rol === 'VENDEDOR_YAW') return <DashboardYAW data={data} user={user} />
  // Solo ADMIN debería llegar hasta acá. Cualquier rol nuevo que se agregue sin
  // su caso NO debe caer en el panel financiero por descuido.
  if (rol !== 'ADMIN') return <DashboardDiseno data={data} user={user} />
  return <DashboardAdmin data={data} user={user} />
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function DashboardAdmin({ data, user }) {
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-6 pt-2">
        <h1 className="text-2xl font-display font-bold text-white">Dashboard Admin</h1>
        <p className="text-gray-500 text-sm capitalize">{new Date().toLocaleDateString('es-EC',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label:'Ventas hoy',    value:`$${data.ventasHoy.toFixed(0)}`,      sub:`${data.pedidosHoy} pedido(s)`,                          color:'text-mandarina-400' },
          { label:'Ventas del mes',value:`$${data.ventasMes.toFixed(0)}`,      sub:`${data.totalPedidos} total`,                            color:'text-white' },
          { label:'Cobrado mes',   value:`$${data.cobradoMes.toFixed(0)}`,     sub:`${Math.round(data.cobradoMes/(data.ventasMes||1)*100)}%`,color:'text-green-400' },
          { label:'Por cobrar',    value:`$${data.pendienteTotal.toFixed(0)}`, sub:'saldo pendiente',                                       color:data.pendienteTotal>0?'text-yellow-400':'text-green-400' },
        ].map(k => (
          <div key={k.label} className="card p-4">
            <div className={`text-2xl font-bold font-display ${k.color}`}>{k.value}</div>
            <div className="text-xs text-gray-500 mt-1">{k.label}</div>
            <div className="text-xs text-gray-600">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="card p-4">
          <h3 className="font-semibold text-white mb-3 text-sm">📊 Estado de pedidos</h3>
          <div className="space-y-2">
            {[
              { label:'Pend. enviar a fábrica', key:'PENDIENTE_FABRICA', color:'bg-yellow-500', href:'/dashboard/produccion' },
              { label:'En producción',          key:'EN_FABRICA',        color:'bg-blue-500',   href:'/dashboard/produccion' },
              { label:'Para despacho',          key:'DESPACHO',          color:'bg-purple-500', href:'/dashboard/despacho' },
              { label:'Entregados',             key:'ENTREGADO',         color:'bg-green-500',  href:'/dashboard/historial' },
            ].map(e => (
              <Link key={e.key} href={e.href} className="flex items-center gap-3 hover:bg-gray-800/50 px-2 py-1.5 rounded-lg transition-all">
                <div className={`w-2 h-2 rounded-full ${e.color}`} />
                <span className="text-gray-400 text-xs flex-1">{e.label}</span>
                <span className="text-white font-bold">{data.porEstado[e.key] || 0}</span>
              </Link>
            ))}
          </div>
          {data.atrasados.length > 0 && (
            <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
              <div className="text-red-400 text-xs font-medium">🚨 {data.atrasados.length} pedido(s) atrasado(s)</div>
            </div>
          )}
        </div>
        <div className="card p-4">
          <h3 className="font-semibold text-white mb-3 text-sm">🏪 Ventas por tienda (mes)</h3>
          {[{tienda:'MANDARINA',label:'🍊 Mandarina Republic',color:'#FF6B00'},{tienda:'INDSTORE',label:'Indstore',color:'#E91E8C'}].map(t => {
            const monto = data.porTienda[t.tienda]||0
            const pct = Math.round((monto/(data.ventasMes||1))*100)
            return (
              <div key={t.tienda} className="mb-3">
                <div className="flex justify-between text-sm mb-1"><span className="text-gray-400">{t.label}</span><span className="text-white">${monto.toFixed(0)}</span></div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${pct}%`,backgroundColor:t.color}} /></div>
              </div>
            )
          })}
          <h3 className="font-semibold text-white mt-4 mb-3 text-sm">👥 Top vendedores (mes)</h3>
          <div className="space-y-1.5">
            {Object.entries(data.porVendedor).sort((a,b)=>b[1].monto-a[1].monto).slice(0,5).map(([id,v])=>(
              <div key={id} className="flex justify-between text-xs">
                <span className="text-gray-400 font-mono">{id}</span>
                <span className="text-white">${v.monto.toFixed(0)} · {v.count} pedidos</span>
              </div>
            ))}
            {!Object.keys(data.porVendedor).length && <div className="text-gray-600 text-xs">Sin datos este mes</div>}
          </div>
        </div>
      </div>
      <Link href="/dashboard/tablero" className="card p-4 mb-3 flex items-center gap-4 border-mandarina-500/30 hover:border-mandarina-500/60 transition-all group">
        <div className="w-11 h-11 rounded-xl bg-mandarina-500/20 flex items-center justify-center text-xl flex-shrink-0">📊</div>
        <div className="flex-1">
          <div className="font-semibold text-white text-sm">Tablero de Producción</div>
          <div className="text-xs text-gray-500">Dónde está cada pedido: corte · producción · despacho</div>
        </div>
        <span className="text-gray-600 group-hover:text-mandarina-400 text-xl">→</span>
      </Link>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {href:'/dashboard/nuevo-pedido',icon:'➕',label:'Nueva Venta'},
          {href:'/dashboard/impresion',   icon:'🖨️',label:'Imprimir'},
          {href:'/dashboard/despacho',    icon:'🚚',label:'Despachos'},
          {href:'/dashboard/usuarios',    icon:'👥',label:'Usuarios'},
        ].map(a=>(
          <Link key={a.href} href={a.href} className="card p-4 flex flex-col items-center gap-2 hover:border-gray-600 transition-all">
            <span className="text-2xl">{a.icon}</span>
            <span className="text-xs text-gray-400 text-center">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── VENDEDOR ─────────────────────────────────────────────────────────────────
function DashboardVendedor({ data, user }) {
  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-6 pt-2">
        <h1 className="text-2xl font-display font-bold text-white">Hola, {user.nombre.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm">{new Date().toLocaleDateString('es-EC',{weekday:'long',day:'numeric',month:'long'})}</p>
      </div>
      <Link href="/dashboard/nuevo-pedido" className="flex items-center gap-4 card p-5 mb-6 border-mandarina-500/30 hover:border-mandarina-500/60 transition-all group">
        <div className="w-12 h-12 bg-mandarina-500 rounded-xl flex items-center justify-center text-xl group-hover:scale-105 transition-transform">➕</div>
        <div><div className="font-semibold text-white">Nueva Venta</div><div className="text-gray-500 text-sm">Registrar un pedido nuevo</div></div>
        <div className="ml-auto text-gray-600 group-hover:text-mandarina-400 text-xl">→</div>
      </Link>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          {label:'Mis ventas hoy',value:`$${data.ventasHoy.toFixed(0)}`,sub:`${data.pedidosHoy} pedidos`,      color:'text-mandarina-400'},
          {label:'Mes actual',    value:`$${data.ventasMes.toFixed(0)}`,sub:`${data.totalPedidos} pedidos`,    color:'text-white'},
          {label:'Cobrado',       value:`$${data.cobradoMes.toFixed(0)}`,sub:'este mes',                       color:'text-green-400'},
          {label:'Por cobrar',    value:`$${data.pendienteTotal.toFixed(0)}`,sub:'saldo pendiente',            color:data.pendienteTotal>0?'text-yellow-400':'text-green-400'},
        ].map(k=>(
          <div key={k.label} className="card p-4">
            <div className={`text-xl font-bold font-display ${k.color}`}>{k.value}</div>
            <div className="text-xs text-gray-500 mt-1">{k.label}</div>
            <div className="text-xs text-gray-600">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white text-sm">Mis pedidos recientes</h2>
          <Link href="/dashboard/historial" className="text-mandarina-400 text-xs hover:underline">Ver todos →</Link>
        </div>
        {data.misRecientes.length === 0
          ? <div className="p-8 text-center text-gray-600 text-sm">No hay pedidos aún</div>
          : <div className="divide-y divide-gray-800">
              {data.misRecientes.map(p=>(
                <Link key={p.PEDIDO_ID} href={`/dashboard/pedido/${p.PEDIDO_ID}`} className="px-5 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-all block">
                  <div>
                    <div className="font-mono text-sm text-white">{p.PEDIDO_ID}</div>
                    <div className="text-xs text-gray-500">{formatFechaDia(p.FECHA_PEDIDO)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_COLORS[p.ESTADO_PEDIDO]||'text-gray-400 bg-gray-800'}`}>{ESTADO_LABELS[p.ESTADO_PEDIDO]||p.ESTADO_PEDIDO}</span>
                    <span className="text-white text-sm font-medium">${parseFloat(p.MONTO_TOTAL||0).toFixed(0)}</span>
                  </div>
                </Link>
              ))}
            </div>
        }
      </div>
    </div>
  )
}

// ─── DESPACHO ─────────────────────────────────────────────────────────────────
function DashboardDespacho({ data, user }) {
  // Ahora son NÚMEROS, no arreglos: la base los cuenta y manda el conteo.
  //
  // ☠️ `listos` se calcula con NOT EXISTS sobre la tabla completa. En el
  // navegador dependía de que las prendas hubieran llegado, y con el tope de
  // 1000 de PostgREST podían faltar: un pedido incompleto parecía tenerlo todo
  // LISTO y aparecía como listo para despachar sin estarlo.
  const listos = data.listos || 0
  const enDespacho = data.enDespacho || 0
  return (
    <div className="max-w-xl mx-auto px-4 pt-4 pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-white">Hola, {user.nombre.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm capitalize">{new Date().toLocaleDateString('es-EC',{weekday:'long',day:'numeric',month:'long'})}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card p-4 text-center"><div className="text-3xl font-bold text-yellow-400">{listos}</div><div className="text-xs text-gray-500 mt-1">Listos para despacho</div></div>
        <div className="card p-4 text-center"><div className="text-3xl font-bold text-purple-400">{enDespacho}</div><div className="text-xs text-gray-500 mt-1">En despacho</div></div>
      </div>
      <Link href="/dashboard/despacho" className="card p-4 flex items-center justify-between hover:border-gray-700 transition-all block mb-3">
        <div className="flex items-center gap-3"><span className="text-2xl">🚚</span><div><div className="text-white font-semibold text-sm">Módulo de despacho</div><div className="text-xs text-gray-500">Gestionar guías y entregas</div></div></div>
        <span className="text-gray-600">→</span>
      </Link>
      <Link href="/dashboard/historial" className="card p-4 flex items-center justify-between hover:border-gray-700 transition-all block">
        <div className="flex items-center gap-3"><span className="text-2xl">📋</span><div><div className="text-white font-semibold text-sm">Historial</div><div className="text-xs text-gray-500">Ver todos los pedidos</div></div></div>
        <span className="text-gray-600">→</span>
      </Link>
    </div>
  )
}

// ─── YAW ─────────────────────────────────────────────────────────────────────
function DashboardYAW({ data, user }) {
  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-6 pt-2">
        <h1 className="text-2xl font-display font-bold text-white">YAW</h1>
        <p className="text-gray-500 text-sm capitalize">{new Date().toLocaleDateString('es-EC',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
      </div>
      <Link href="/dashboard/nuevo-pedido" className="flex items-center gap-4 card p-5 mb-6 border-purple-500/30 hover:border-purple-500/60 transition-all group">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl group-hover:scale-105 transition-transform" style={{backgroundColor:'#6C3FC5'}}>➕</div>
        <div><div className="font-semibold text-white">Nueva Venta</div><div className="text-gray-500 text-sm">Registrar un pedido nuevo</div></div>
        <div className="ml-auto text-gray-600 group-hover:text-purple-400 text-xl">→</div>
      </Link>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          {label:'Ventas hoy',    value:`${data.ventasHoy.toFixed(0)}`,       sub:`${data.pedidosHoy} pedidos`,   color:'text-purple-400'},
          {label:'Mes actual',    value:`${data.ventasMes.toFixed(0)}`,        sub:`${data.totalPedidos} pedidos`, color:'text-white'},
          {label:'Cobrado',       value:`${data.cobradoMes.toFixed(0)}`,       sub:'este mes',                     color:'text-green-400'},
          {label:'Por cobrar',    value:`${data.pendienteTotal.toFixed(0)}`,   sub:'saldo pendiente',              color:data.pendienteTotal>0?'text-yellow-400':'text-green-400'},
        ].map(k=>(
          <div key={k.label} className="card p-4">
            <div className={`text-xl font-bold font-display ${k.color}`}>{k.value}</div>
            <div className="text-xs text-gray-500 mt-1">{k.label}</div>
            <div className="text-xs text-gray-600">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="card p-4 mb-4">
        <h3 className="font-semibold text-white mb-3 text-sm">📊 Estado de pedidos YAW</h3>
        <div className="space-y-2">
          {[
            { label:'En producción', key:'EN_FABRICA',        color:'bg-blue-500'   },
            { label:'Para despacho', key:'DESPACHO',          color:'bg-purple-500' },
            { label:'Entregados',    key:'ENTREGADO',         color:'bg-green-500'  },
          ].map(e=>(
            <div key={e.key} className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${e.color}`} />
              <span className="text-gray-400 text-xs flex-1">{e.label}</span>
              <span className="text-white font-bold">{data.porEstado[e.key] || 0}</span>
            </div>
          ))}
        </div>
        {data.atrasados.length > 0 && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            <div className="text-red-400 text-xs font-medium">🚨 {data.atrasados.length} pedido(s) atrasado(s)</div>
          </div>
        )}
      </div>
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white text-sm">Pedidos recientes</h2>
          <Link href="/dashboard/historial" className="text-purple-400 text-xs hover:underline">Ver todos →</Link>
        </div>
        {data.misRecientes.length === 0
          ? <div className="p-8 text-center text-gray-600 text-sm">No hay pedidos aún</div>
          : <div className="divide-y divide-gray-800">
              {data.misRecientes.map(p=>(
                <Link key={p.PEDIDO_ID} href={`/dashboard/pedido/${p.PEDIDO_ID}`} className="px-5 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-all block">
                  <div>
                    <div className="font-mono text-sm text-white">{p.PEDIDO_ID}</div>
                    <div className="text-xs text-gray-500">{formatFechaDia(p.FECHA_PEDIDO)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_COLORS[p.ESTADO_PEDIDO]||'text-gray-400 bg-gray-800'}`}>{ESTADO_LABELS[p.ESTADO_PEDIDO]||p.ESTADO_PEDIDO}</span>
                    <span className="text-white text-sm font-medium">${parseFloat(p.MONTO_TOTAL||0).toFixed(0)}</span>
                  </div>
                </Link>
              ))}
            </div>
        }
      </div>
    </div>
  )
}
function DashboardDiseno({ data, user }) {
  // Suma las prendas pendientes de las áreas de este usuario.
  //
  // Antes se filtraba `data.allItems`, que traía TODAS las prendas del CRM al
  // navegador — y ademas venían recortadas por el tope de 1000 de PostgREST.
  // Ahora la base entrega los conteos ya agrupados por área.
  const sumaDeMisAreas = (mapa) => {
    const areas = (user.areas || [])
    const todas = areas.length === 0 || (areas.length === 1 && areas[0] === 'TODAS')
    return Object.entries(mapa || {}).reduce((total, [area, n]) => {
      if (todas) return total + n
      return areas.some(a => String(area).toUpperCase().includes(String(a).toUpperCase()))
        ? total + n : total
    }, 0)
  }
  const totalPendientes = sumaDeMisAreas(data.porArea)
  // ☠️ Los urgentes salen de `porAreaUrgente`, calculado en la base con la fecha
  // de entrega del PEDIDO. Antes se leía `i.fechaEntrega` de cada prenda — un
  // campo que los ítems NO tienen —, así que este número era SIEMPRE 0.
  const urgentes = sumaDeMisAreas(data.porAreaUrgente)
  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-6 pt-2">
        <h1 className="text-2xl font-display font-bold text-white">Hola, {user.nombre.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm">{new Date().toLocaleDateString('es-EC',{weekday:'long',day:'numeric',month:'long'})}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card p-5"><div className={`text-4xl font-bold font-display ${totalPendientes>0?'text-yellow-400':'text-green-400'}`}>{totalPendientes}</div><div className="text-sm text-gray-400 mt-1">Prendas pendientes</div><div className="text-xs text-gray-600">por producir</div></div>
        <div className="card p-5"><div className={`text-4xl font-bold font-display ${urgentes>0?'text-red-400':'text-green-400'}`}>{urgentes}</div><div className="text-sm text-gray-400 mt-1">Urgentes</div><div className="text-xs text-gray-600">entrega en ≤2 días</div></div>
      </div>
      {Object.keys(data.porArea).length > 0 && (
        <div className="card p-4 mb-4">
          <h3 className="font-semibold text-white mb-3 text-sm">📊 Pendientes por área</h3>
          <div className="space-y-2">
            {Object.entries(data.porArea).sort((a,b)=>b[1]-a[1]).map(([area,count])=>{
              const isMyArea = user.areas?.some(a=>area.includes(a))
              return (
                <div key={area} className={`flex items-center justify-between px-3 py-2 rounded-xl ${isMyArea?'bg-mandarina-500/10 border border-mandarina-500/30':'bg-gray-800/50'}`}>
                  <div><span className={`text-sm font-medium ${isMyArea?'text-mandarina-400':'text-gray-300'}`}>{area}</span>{isMyArea&&<span className="ml-2 text-xs text-mandarina-500">← tu área</span>}</div>
                  <span className={`text-lg font-bold ${isMyArea?'text-mandarina-400':'text-gray-400'}`}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {totalPendientes===0 && <div className="card p-8 text-center"><div className="text-4xl mb-3">✅</div><div className="font-semibold text-white mb-1">¡Todo al día!</div><div className="text-gray-500 text-sm">No hay prendas pendientes</div></div>}
      <Link href="/dashboard/produccion" className="flex items-center gap-4 card p-5 mt-4 hover:border-gray-600 transition-all group">
        <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-xl">🏭</div>
        <div><div className="font-semibold text-white">Ver producción</div><div className="text-gray-500 text-sm">Gestionar prendas pendientes</div></div>
        <div className="ml-auto text-gray-600 group-hover:text-white text-xl">→</div>
      </Link>
    </div>
  )
}
