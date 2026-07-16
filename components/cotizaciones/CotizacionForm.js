'use client'
import { useCotizacion } from './useCotizacion'
import TiendaToggle from './TiendaToggle'
import ProductoCard from './ProductoCard'
import ResumenPanel from './ResumenPanel'
import CotizacionPreview from './CotizacionPreview'

// Formulario completo del módulo. `initial` = cotización existente o undefined (nueva).
export default function CotizacionForm({ initial, user, onCreated }) {
  const h = useCotizacion(initial, user, onCreated)
  const { cotizacion: c, totales } = h

  // % de completitud (cliente, teléfono, 1 producto válido, condiciones)
  const hitos = [
    !!c.cliente_nombre?.trim(),
    !!c.cliente_tel?.trim(),
    c.productos.some((p) => p.nombre?.trim() && (parseFloat(String(p.precio)) || 0) > 0),
    !!c.condiciones_pago?.trim(),
  ]
  const completos = hitos.filter(Boolean).length
  const pct = Math.round((completos / hitos.length) * 100)

  const step = (ok) => ok
    ? { background: 'rgba(255,107,0,.15)', border: '1px solid rgba(255,107,0,.4)', color: '#fb923c' }
    : { background: '#1f2937', border: '1px solid #374151', color: '#9ca3af' }

  return (
    <div className="flex flex-col h-screen md:h-auto md:min-h-screen">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-20 bg-gray-900 border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-auto min-w-0">
            <span className="font-display font-bold text-white text-sm truncate">Cotización</span>
            <span className="text-xs text-gray-500 font-mono truncate">{c.numero}</span>
          </div>
          <TiendaToggle tienda={c.tienda} onChange={h.setTienda} />
          <div className="inline-flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
            <button type="button" onClick={() => h.setMode('edicion')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${h.mode === 'edicion' ? 'bg-mandarina-500 text-white' : 'text-gray-400'}`}>✏️ Editar</button>
            <button type="button" onClick={() => h.setMode('vista')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${h.mode === 'vista' ? 'bg-mandarina-500 text-white' : 'text-gray-400'}`}>👁️ Vista previa</button>
          </div>
          <button type="button" onClick={h.save} disabled={h.saving} className="btn-secondary text-sm py-1.5 px-4">
            {h.saving ? 'Guardando…' : '💾 Guardar'}
          </button>
          <button type="button" onClick={h.exportPDF} className="btn-primary text-sm py-1.5 px-4">📄 Exportar PDF</button>
        </div>
        <div className="h-[3px] bg-gray-800">
          <div className="h-[3px] bg-mandarina-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {h.mode === 'vista' ? (
          <div className="py-6 px-4">
            <CotizacionPreview cotizacion={c} totales={totales} asesor={c.created_by_nombre || user?.nombre} />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-5 pb-24">
            {/* Meta */}
            <div className="card p-4 mb-6 flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="label">Número de cotización</div>
                <input className="input font-mono" value={c.numero} onChange={(e) => h.updCot('numero', e.target.value)} />
              </div>
              <div className="min-w-[150px]">
                <div className="label">Fecha</div>
                <input className="input" type="date" value={c.fecha} onChange={(e) => h.updCot('fecha', e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <span className="badge bg-yellow-500/20 text-yellow-400">⏳ Borrador</span>
                <span className="text-xs text-gray-500">{completos}/4 secciones</span>
              </div>
            </div>

            {/* 01 Cliente */}
            <Section n="01" ok={hitos[0]} step={step} title="Datos del cliente" sub="Nombre, contacto e identificación">
              <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <div className="label">Nombre / Empresa</div>
                  <input className="input text-[15px] font-medium" value={c.cliente_nombre} onChange={(e) => h.updCot('cliente_nombre', e.target.value)} placeholder="Nombre completo o razón social" />
                </div>
                <div><div className="label">Cédula / RUC</div><input className="input font-mono" value={c.cliente_cedula} onChange={(e) => h.updCot('cliente_cedula', e.target.value)} placeholder="0000000000" /></div>
                <div><div className="label">Teléfono</div><input className="input font-mono" type="tel" value={c.cliente_tel} onChange={(e) => h.updCot('cliente_tel', e.target.value)} placeholder="+593 99 000 0000" /></div>
                <div className="sm:col-span-2"><div className="label">Email</div><input className="input" type="email" value={c.cliente_email} onChange={(e) => h.updCot('cliente_email', e.target.value)} placeholder="cliente@empresa.com" /></div>
              </div>
            </Section>

            {/* 02 Productos */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3.5">
                <StepHead n="02" ok={hitos[2]} step={step} title="Productos / Prendas" sub="Detalle de prendas, técnica y diseño por posición" />
                <button type="button" onClick={h.addProducto} className="btn-ghost text-sm">➕ Agregar prenda</button>
              </div>
              {c.productos.map((p, i) => (
                <ProductoCard key={p.id} index={i} producto={p}
                  onUpd={h.updProducto} onTalla={h.updTalla} onToggleTallas={h.toggleTallas}
                  onDup={h.duplicateProducto} onRemove={h.removeProducto} canRemove={c.productos.length > 1} />
              ))}
            </div>

            {/* 03 Resumen */}
            <Section n="03" ok={totales.total > 0} step={step} title="Resumen económico" sub="Subtotal, descuento e IVA">
              <ResumenPanel productos={c.productos} descuento={c.descuento} onDescuento={(v) => h.updCot('descuento', v)} totales={totales} />
            </Section>

            {/* 04 Condiciones */}
            <Section n="04" ok={hitos[3]} step={step} title="Condiciones" sub="Entrega, validez, anticipo y forma de pago">
              <div className="card p-5 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div><div className="label">Entrega (días)</div><input className="input" type="number" min={0} value={c.entrega_dias} onChange={(e) => h.updCot('entrega_dias', parseInt(e.target.value) || 0)} /></div>
                  <div><div className="label">Validez (días)</div><input className="input" type="number" min={0} value={c.validez_dias} onChange={(e) => h.updCot('validez_dias', parseInt(e.target.value) || 0)} /></div>
                  <div><div className="label">Anticipo (%)</div><input className="input" type="number" min={0} max={100} value={c.anticipo_pct} onChange={(e) => h.updCot('anticipo_pct', parseInt(e.target.value) || 0)} /></div>
                </div>
                <div><div className="label">Condiciones de pago</div><textarea className="input min-h-[70px]" value={c.condiciones_pago} onChange={(e) => h.updCot('condiciones_pago', e.target.value)} /></div>
                <div><div className="label">Descripción tiempo de producción</div><input className="input" value={c.tiempo_produccion} onChange={(e) => h.updCot('tiempo_produccion', e.target.value)} /></div>
              </div>
            </Section>

            {/* 05 + 06 Beneficios y Notas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <StepHead n="05" ok step={step} title="Beneficios" sub="Una línea por ítem (aparecen con ✓)" />
                <textarea className="input mt-3 min-h-[120px]" value={c.beneficios} onChange={(e) => h.updCot('beneficios', e.target.value)} />
              </div>
              <div>
                <StepHead n="06" ok step={step} title="Notas" sub="Detalles adicionales del pedido" />
                <textarea className="input mt-3 min-h-[120px]" value={c.notas} onChange={(e) => h.updCot('notas', e.target.value)} placeholder="Notas internas o para el cliente…" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {h.toast && (
        <div className="no-print fixed bottom-5 right-5 z-50 bg-gray-800 border border-gray-700 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          {h.toast}
        </div>
      )}
    </div>
  )
}

function StepHead({ n, ok, step, title, sub }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center font-display text-xs font-bold transition-all" style={step(ok)}>{ok ? '✓' : n}</div>
      <div>
        <div className="text-[13px] font-semibold text-white">{title}</div>
        <div className="text-[11px] text-gray-500">{sub}</div>
      </div>
    </div>
  )
}

function Section({ n, ok, step, title, sub, children }) {
  return (
    <div className="mb-6">
      <div className="mb-3.5"><StepHead n={n} ok={ok} step={step} title={title} sub={sub} /></div>
      {children}
    </div>
  )
}
