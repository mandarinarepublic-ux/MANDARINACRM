'use client'
import { themeFor } from '@/lib/tiendaTheme'
import {
  TALLAS, tecnicaLabel, calcSubtotalProducto, fmtUSD, IVA_RATE, FIRMA_COTIZACION, ANCHO_DOC_COTIZACION,
  rangoTotales, precioUnitarioConIva, descripcionEsBloque,
} from '@/lib/cotizacion'

const TALLA_LABEL = { XS: 'XS', S: 'S', M: 'M', L: 'L', XL: 'XL', XXL: '2XL', XXXL: '3XL' }

function fechaLarga(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-').map(Number)
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  if (!y || !m || !d) return iso
  return `${d} de ${meses[m - 1]} de ${y}`
}

// Documento blanco que se envía al cliente (y se imprime como PDF).
//
// ⚠️ Ya NO recibe quién lo armó. Lo recibía y lo imprimía como firma, pero ese
// era el nombre de la CUENTA del CRM que creó la cotización; ahora el documento
// lo firma la gerencia (ver FIRMA_COTIZACION en lib/cotizacion.js). El vendedor
// se sigue guardando en la fila (`created_by`, `created_by_nombre`) para saber
// de quién es puertas adentro.
//
// `id` es un prop porque el documento vive DOS veces en la pantalla: el que se
// ve («Vista previa», `cot-doc`, con el CSS de impresión colgado de ese id) y
// una copia fuera de pantalla a ancho fijo de la que sale el PDF
// (`cot-doc-pdf`, ver CotizacionForm). Mismo componente, mismos datos: lo que
// se manda es lo que se ve.
export default function CotizacionPreview({ cotizacion: c, totales, id = 'cot-doc' }) {
  const th = themeFor(c.tienda)
  // Los totales YA NO son un bloque único: cada opción tiene el suyo. Con una
  // sola opción `rango.porOpcion` tiene un solo elemento y el documento se ve
  // exactamente como antes — lo único nuevo es el precio con IVA.
  const rango = rangoTotales(c)
  const posiciones = (p) => [
    ['Pecho', p.diseno_pecho], ['Espalda', p.diseno_espalda],
    ['Manga der.', p.manga_derecha], ['Manga izq.', p.manga_izquierda],
  ].filter(([, v]) => v && String(v).trim())

  // Con la PROPORCIÓN de una hoja A4 (210 × 297, ver A4_MM en
  // lib/generarPdf.js) y el pie pegado abajo. Antes el documento medía lo que
  // midiera su contenido: una cotización de una prenda era una tira que
  // terminaba a los dos tercios de la hoja, con el resto en blanco. Con
  // `aspect-ratio` la hoja tiene SIEMPRE su forma; si el contenido es más alto
  // que eso, crece (min-height:auto no lo recorta) y ahí sí se pagina.
  return (
    <div id={id} className="mx-auto bg-white text-gray-900 shadow-xl"
      style={{ maxWidth: ANCHO_DOC_COTIZACION, fontFamily: 'var(--font-inter), system-ui, sans-serif', display: 'flex', flexDirection: 'column', aspectRatio: '210 / 297' }}>
      {/* Header con gradiente de la tienda */}
      <div style={{ background: th.gradient, color: '#fff', padding: '26px 40px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <img src={th.logo} alt={th.nombre} style={{ height: 48, objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '.02em' }}>COTIZACIÓN</div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, opacity: .9 }}>{c.numero}</div>
          </div>
        </div>
        {/* Barra oscura semitransparente */}
        <div style={{ marginTop: 20, background: 'rgba(0,0,0,.18)', borderRadius: '10px 10px 0 0', padding: '10px 16px', display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12 }}>
          <span><b>Cliente:</b> {c.cliente_nombre || '—'}</span>
          <span><b>Fecha:</b> {fechaLarga(c.fecha)}</span>
          <span><b>Validez:</b> {c.validez_dias} días</span>
          <span style={{ marginLeft: 'auto' }}>
            <b>Total:</b> {rango.varias ? `${fmtUSD(rango.min.total)} – ${fmtUSD(rango.max.total)}` : fmtUSD(rango.min.total)}
          </span>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ padding: '32px 44px 40px' }}>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Propuesta exclusiva para {c.cliente_nombre || 'nuestro cliente'}</p>
        <p style={{ fontSize: 14, marginTop: 14 }}>Estimad@s {c.cliente_nombre || 'cliente'},</p>
        <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6 }}>
          En <b>{th.nombre}</b> nos complace presentarle la siguiente propuesta de personalización textil,
          elaborada a la medida de sus necesidades con acabados premium.
        </p>

        {/* Detalle de productos */}
        <div style={{ marginTop: 22, fontSize: 12, fontWeight: 800, letterSpacing: '.05em', color: th.accentText }}>
          DETALLE DE LOS PRODUCTOS SOLICITADOS
        </div>
        {rango.porOpcion.map(({ opcion, totales }) => (
          <div key={opcion.id}>
            {/* Encabezado de la opción: solo si hay varias. Con una sola,
                el documento se ve EXACTAMENTE como antes de este cambio. */}
            {rango.varias && (
              <div style={{ marginTop: 18, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #111', paddingBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800 }}>
                  {opcion.nombre || 'Opción'}
                </span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>entrega {opcion.entrega_dias} días</span>
              </div>
            )}
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {opcion.productos.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: 14, border: '1px solid #eee', borderLeft: `3px solid ${th.accent}`, borderRadius: 10, overflow: 'hidden', background: '#fff', breakInside: 'avoid' }}>
                  {p.foto
                    ? <img src={p.foto} alt="" style={{ width: 140, height: 140, objectFit: 'cover', background: '#f3f4f6', flexShrink: 0 }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    : <div style={{ width: 140, height: 140, background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, color: '#cbd5e1' }}>👕</div>}
                  <div style={{ flex: 1, minWidth: 0, padding: '12px 14px 12px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{p.nombre || 'Prenda'}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>· {tecnicaLabel(p.tecnica)}</span>
                    </div>
                    {p.color && (descripcionEsBloque(p.color) ? (
                      <div style={{ marginTop: 5, fontSize: 11, color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                        {p.color}
                      </div>
                    ) : (
                      <span style={{ display: 'inline-block', marginTop: 5, fontSize: 11, padding: '2px 9px', borderRadius: 999, background: th.accentLight, color: th.accentText, border: `1px solid ${th.accentBorder}` }}>{p.color}</span>
                    ))}
                    {posiciones(p).length > 0 && (
                      <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {posiciones(p).map(([lbl, v]) => (
                          <span key={lbl} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e5e7eb', color: '#475569' }}><b>{lbl}:</b> {v}</span>
                        ))}
                      </div>
                    )}
                    {p.conTallas && (
                      <div style={{ marginTop: 7, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {TALLAS.filter((t) => (p.tallas?.[t] || 0) > 0).map((t) => (
                          <span key={t} style={{ fontSize: 10.5, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 6, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>{TALLA_LABEL[t]}: {p.tallas[t]}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {p.cantidad || 0} uds × {fmtUSD(parseFloat(String(p.precio)) || 0)} + IVA
                        {'  ·  '}
                        <b style={{ color: '#111' }}>{fmtUSD(precioUnitarioConIva(p))} c/u con IVA</b>
                        {totales.desc > 0 && ' (antes del descuento)'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: th.accent }}>{fmtUSD(calcSubtotalProducto(p))}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totales de esta opción */}
            <div style={{ marginTop: 16, marginLeft: 'auto', width: 280, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: '#6b7280' }}>Subtotal</span><span>{fmtUSD(totales.subtotal)}</span></div>
              {totales.desc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: '#6b7280' }}>Descuento</span><span>-{fmtUSD(totales.desc)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span style={{ color: '#6b7280' }}>IVA ({Math.round(IVA_RATE * 100)}%)</span><span>{fmtUSD(totales.iva)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #111', marginTop: 5, paddingTop: 7 }}>
                <span style={{ fontWeight: 700 }}>TOTAL</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: th.accent }}>{fmtUSD(totales.total)}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Beneficios y notas.
            ⚠️ Las notas van en su PROPIA condición, no anidadas en la de los
            beneficios. Lo estaban: si el vendedor vaciaba «Beneficios», las
            notas —que es donde se escriben los acuerdos del pedido— se caían
            del documento con ellas, sin aviso ni hueco, y del lado del
            formulario seguían escritas y llenas. */}
        {(c.beneficios?.trim() || c.notas?.trim()) && (
          <div style={{ marginTop: 24, background: th.accentLight, border: `1px solid ${th.accentBorder}`, borderRadius: 12, padding: '14px 18px' }}>
            {c.beneficios?.trim() && (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: th.accentText, marginBottom: 6 }}>🎁 BENEFICIOS EXCLUSIVOS</div>
                {c.beneficios.split('\n').filter((l) => l.trim()).map((l, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: '#374151', padding: '1px 0' }}>✓ {l}</div>
                ))}
              </>
            )}
            {c.notas?.trim() && (
              <div style={{ marginTop: c.beneficios?.trim() ? 8 : 0, fontSize: 12.5, color: '#374151' }}><b>Detalles del pedido:</b> {c.notas}</div>
            )}
          </div>
        )}

        {/* Condiciones */}
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, fontSize: 12 }}>
          <div><div style={{ fontWeight: 700, color: th.accentText, marginBottom: 3 }}>Forma de pago</div><div style={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{c.condiciones_pago}</div></div>
          <div><div style={{ fontWeight: 700, color: th.accentText, marginBottom: 3 }}>Tiempo de producción</div><div style={{ color: '#374151' }}>{c.entrega_dias} {c.tiempo_produccion}</div></div>
          <div><div style={{ fontWeight: 700, color: th.accentText, marginBottom: 3 }}>Validez</div><div style={{ color: '#374151' }}>{c.validez_dias} días desde la fecha de emisión</div></div>
        </div>

        {/* Cierre */}
        <p style={{ fontSize: 13, color: '#374151', marginTop: 22, lineHeight: 1.6 }}>
          Quedamos atentos a cualquier consulta y con gusto ajustamos la propuesta a su medida.
        </p>
        <p style={{ fontSize: 13, margin: '10px 0 0' }}>Atentamente,</p>
        <p style={{ fontSize: 13, fontWeight: 700, margin: '2px 0 0' }}>{FIRMA_COTIZACION.nombre}</p>
        <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>{FIRMA_COTIZACION.cargo}</p>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{FIRMA_COTIZACION.telefono} · {th.web}</p>

        {/* Firmas */}
        <div style={{ marginTop: 34, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          {['Cliente', th.nombre].map((l) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, fontSize: 11, color: '#6b7280' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer. `marginTop: auto` lo lleva al borde inferior de la hoja: el
          aire que sobre queda entre las firmas y el pie, como en un membrete. */}
      <div style={{ marginTop: 'auto', background: th.gradient, color: '#fff', textAlign: 'center', padding: '10px', fontSize: 11.5, fontWeight: 600 }}>
        {th.nombre} · {th.web}
      </div>
    </div>
  )
}
