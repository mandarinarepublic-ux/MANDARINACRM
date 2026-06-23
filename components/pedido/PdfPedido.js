'use client'

// URLs de logos
const LOGO_MANDARINA = '/logos/logo_mandarina.png'
const LOGO_INDSTORE  = '/logos/logo_indstore.png'

// Cupones por tienda
const CUPON = {
  MANDARINA: { codigo: 'MANDI',     url: 'https://www.mandarinaec.com?coupon=MANDI',    web: 'mandarinaec.com' },
  INDSTORE:  { codigo: 'INDLOVERS', url: 'https://indlovers.com/discount/INDLOVERS',     web: 'indlovers.com' },
}

// ─── HELPER: dividir array en chunks ─────────────────────────────────────────
function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

// ─── HOJA 1: AGRADECIMIENTO AL CLIENTE ───────────────────────────────────────
export function PdfGracias({ pedido, items, cliente, tiendaColor }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const nombreCorto = cliente?.NOMBRE?.split(' ')[0] || 'Cliente'
  const logo = esMandarina ? LOGO_MANDARINA : LOGO_INDSTORE
  const cupon = esMandarina ? CUPON.MANDARINA : CUPON.INDSTORE
  const bgGradient = esMandarina
    ? 'linear-gradient(135deg, #c94800 0%, #e85d04 40%, #ff8c00 100%)'
    : 'linear-gradient(135deg, #6a0dad 0%, #c2185b 50%, #e91e8c 100%)'

  const totalPrendas = (items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", backgroundColor: '#fff', width: '794px', minHeight: '1123px', position: 'relative', overflow: 'hidden', pageBreakAfter: 'always', display: 'table', tableLayout: 'fixed' }}>
      <div style={{ display: 'table-row' }}>
        <div style={{ display: 'table-cell' }}>

          {/* PANEL SUPERIOR */}
          <div style={{ background: bgGradient, display: 'table', width: '100%', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position:'absolute', top:'-80px', right:'-80px', width:'280px', height:'280px', borderRadius:'50%', backgroundColor:'rgba(0,0,0,0.12)' }} />
            <div style={{ position:'absolute', bottom:'-60px', left:'30%', width:'200px', height:'200px', borderRadius:'50%', backgroundColor:'rgba(255,255,255,0.06)' }} />
            <div style={{ display: 'table-cell', verticalAlign: 'middle', padding: '36px 48px', position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'table', width: '100%' }}>
                {/* LOGO */}
                <div style={{ display: 'table-cell', width: '160px', verticalAlign: 'middle', paddingRight: '24px' }}>
                  <img src={logo} style={{ width: '150px', height: '150px', objectFit: 'contain', filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.4))' }} alt="logo" />
                </div>
                {/* TEXTO */}
                <div style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: '24px' }}>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '8px' }}>
                    {esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}
                  </div>
                  <div style={{ fontSize: '40px', fontWeight: '900', color: '#fff', lineHeight: 1.05, marginBottom: '12px', letterSpacing: '-1px', textShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>
                    ¡Gracias,<br />{nombreCorto}!
                  </div>
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: '10px', padding: '10px 14px', maxWidth: '260px' }}>
                    <div style={{ fontSize: '12px', color: '#fff', lineHeight: 1.7, fontWeight: '500' }}>
                      {esMandarina
                        ? 'Tu pedido fue confeccionado con mucho cariño. Esperamos que lo disfrutes tanto como nosotros disfrutamos haciéndolo.'
                        : 'Tu pedido fue preparado especialmente para ti. ¡Gracias por elegirnos!'}
                    </div>
                  </div>
                </div>
                {/* CUPÓN */}
                <div style={{ display: 'table-cell', verticalAlign: 'middle', width: '220px' }}>
                  <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px 18px', position: 'relative', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                    <div style={{ position:'absolute', left:'-9px', top:'50%', marginTop:'-9px', width:'18px', height:'18px', borderRadius:'50%', backgroundColor: esMandarina?'#c94800':'#6a0dad' }} />
                    <div style={{ position:'absolute', right:'-9px', top:'50%', marginTop:'-9px', width:'18px', height:'18px', borderRadius:'50%', backgroundColor: esMandarina?'#c94800':'#6a0dad' }} />
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '5px' }}>🎁 Tenemos un regalo para ti:</div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px', lineHeight: 1.3 }}>10% de descuento en<br />tu próxima compra</div>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '10px' }}>
                      Usa el cupón <strong style={{ color: '#1a1a1a' }}>{cupon.codigo}</strong> en {cupon.web}
                    </div>
                    <div style={{ borderTop: '1.5px dashed #ddd', marginBottom: '10px' }} />
                    <div style={{ textAlign: 'center', marginBottom: '5px' }}>
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(cupon.url)}&color=1a1a1a&bgcolor=ffffff&margin=2`}
                        style={{ width: '90px', height: '90px', borderRadius: '6px', display: 'inline-block' }} alt="QR" />
                    </div>
                    <div style={{ fontSize: '9px', color: '#999', textAlign: 'center' }}>↗ Escanea para tu descuento</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Línea de doblez */}
          <div style={{ borderTop: '1.5px dashed #ccc' }} />

          {/* PANEL INFERIOR */}
          <div style={{ padding: '24px 48px 90px' }}>

            {/* Datos de envío */}
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px 20px', marginBottom: '20px', border: '2px solid #e5e5e5' }}>
              <div style={{ display: 'table', width: '100%', marginBottom: '10px' }}>
                <div style={{ display: 'table-cell', verticalAlign: 'middle', fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '2px' }}>Datos de envío</div>
                <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'right' }}>
                  <span style={{ display: 'inline-block', backgroundColor: tiendaColor, color: '#fff', fontSize: '13px', fontWeight: '800', fontFamily: 'monospace', padding: '4px 12px', borderRadius: '8px', letterSpacing: '0.5px', lineHeight: 1 }}>
                    {pedido?.PEDIDO_ID || ''}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#1a1a1a', marginBottom: '10px', lineHeight: 1.1 }}>{cliente?.NOMBRE || '-'}</div>
              <div style={{ display: 'table', marginBottom: '10px' }}>
                {cliente?.CELULAR && (
                  <div style={{ display: 'table-cell', paddingRight: '12px' }}>
                    <div style={{ backgroundColor: '#f5f5f5', borderRadius: '10px', padding: '8px 14px', border: '1px solid #e5e5e5', display: 'table' }}>
                      <div style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: '8px', fontSize: '16px', lineHeight: 1 }}>📱</div>
                      <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '8px', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px', lineHeight: 1 }}>Celular</div>
                        <div style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a1a', fontFamily: 'monospace', lineHeight: 1 }}>{cliente.CELULAR}</div>
                      </div>
                    </div>
                  </div>
                )}
                {cliente?.CEDULA && (
                  <div style={{ display: 'table-cell' }}>
                    <div style={{ backgroundColor: '#f5f5f5', borderRadius: '10px', padding: '8px 14px', border: '1px solid #e5e5e5', display: 'table' }}>
                      <div style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: '8px', fontSize: '16px', lineHeight: 1 }}>🆔</div>
                      <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '8px', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px', lineHeight: 1 }}>Cédula</div>
                        <div style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a1a', fontFamily: 'monospace', lineHeight: 1 }}>{cliente.CEDULA}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {(pedido?.DIRECCION_TEXTO || pedido?.DIRECCION_PEDIDO) && (
                <div style={{ backgroundColor: tiendaColor + '10', borderRadius: '10px', padding: '10px 14px', borderLeft: `4px solid ${tiendaColor}` }}>
                  <div style={{ fontSize: '8px', color: tiendaColor, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px', fontWeight: '700', lineHeight: 1 }}>Dirección de entrega</div>
                  <div style={{ fontSize: '12px', color: '#1a1a1a', fontWeight: '600', lineHeight: 1.4 }}>
                    {(pedido.DIRECCION_TEXTO || pedido.DIRECCION_PEDIDO).replace(/\n/g, ' · ')}
                  </div>
                </div>
              )}
            </div>

            {/* Título sección productos */}
            <div style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>
              Contenido · {totalPrendas} prenda(s)
            </div>

            {/* Grid de productos — 2 columnas para aprovechar espacio */}
            <div style={{ display: 'table', width: '100%', borderCollapse: 'separate', borderSpacing: '0 0' }}>
              {chunkArray(items||[], 2).map((fila, fi) => (
                <div key={fi} style={{ display: 'table-row' }}>
                  {fila.map((item, ci) => (
                    <div key={ci} style={{ display: 'table-cell', width: '50%', paddingRight: ci===0 ? '8px' : '0', paddingBottom: '10px', verticalAlign: 'top' }}>
                      <div style={{ backgroundColor: '#fafafa', borderRadius: '12px', border: '1px solid #f0f0f0', display: 'table', width: '100%' }}>
                        {/* Foto prenda — más grande que antes (88px vs 64px) */}
                        <div style={{ display: 'table-cell', width: '108px', verticalAlign: 'middle', padding: '10px 8px 10px 12px' }}>
                          {item.FOTO_PECHO_URL
                            ? <img src={item.FOTO_PECHO_URL} style={{ width: '92px', height: '92px', objectFit: 'cover', borderRadius: '10px', border: '2px solid #e5e5e5', display: 'block' }} />
                            : <div style={{ width: '92px', height: '92px', backgroundColor: '#eee', borderRadius: '10px' }} />
                          }
                        </div>
                        {/* Datos */}
                        <div style={{ display: 'table-cell', verticalAlign: 'middle', padding: '10px 12px 10px 4px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '800', color: '#1a1a1a', marginBottom: '6px', lineHeight: 1.3 }}>{item.PRODUCTO_NOMBRE}</div>
                          <div style={{ display: 'table', marginBottom: '6px' }}>
                            {item.COLOR && <span style={{ display: 'table-cell', paddingRight: '8px', fontSize: '9px', color: '#555' }}>Color: <strong>{item.COLOR}</strong></span>}
                            {item.TALLA && <span style={{ display: 'table-cell', paddingRight: '8px', fontSize: '9px', color: '#555' }}>Talla: <strong>{item.TALLA}</strong></span>}
                          </div>
                          <div style={{ backgroundColor: tiendaColor + '18', borderRadius: '6px', padding: '3px 8px', display: 'inline-block' }}>
                            <span style={{ fontSize: '13px', fontWeight: '900', color: tiendaColor }}>x{item.CANTIDAD}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Celda vacía si la fila tiene solo 1 item */}
                  {fila.length === 1 && <div style={{ display: 'table-cell', width: '50%' }} />}
                </div>
              ))}
            </div>

            {/* Estado pago */}
            {(() => {
              const total = parseFloat(pedido?.MONTO_TOTAL || 0)
              const abonado = parseFloat(pedido?.MONTO_ABONADO || 0)
              const saldo = total - abonado
              const pct = total > 0 ? Math.round((abonado / total) * 100) : 100
              const isPagado = pedido?.ESTADO_PAGO === 'PAGADO' || saldo < 0.01
              return (
                <div style={{ marginTop: '14px', padding: '12px 16px', borderRadius: '10px',
                  backgroundColor: isPagado ? '#dcfce7' : '#fee2e2',
                  border: `2px solid ${isPagado ? '#86efac' : '#fca5a5'}`,
                  display: 'table', width: '100%', boxSizing: 'border-box' }}>
                  <div style={{ display: 'table-cell', width: '32px', verticalAlign: 'middle', fontSize: '20px', lineHeight: 1 }}>
                    {isPagado ? '✅' : '🔴'}
                  </div>
                  <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
                    {isPagado ? (
                      <div style={{ fontSize: '13px', fontWeight: '800', color: '#15803d', lineHeight: 1 }}>PAGO COMPLETO</div>
                    ) : (
                      <>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#b91c1c' }}>
                          ABONO DEL {pct}% — SALDO PENDIENTE
                        </div>
                        <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px', fontWeight: '700' }}>
                          Cobrar ${saldo.toFixed(2)} al motorizado
                        </div>
                      </>
                    )}
                  </div>
                  {!isPagado && total > 0 && (
                    <div style={{ display: 'table-cell', textAlign: 'right', verticalAlign: 'middle' }}>
                      <div style={{ fontSize: '10px', color: '#999', marginBottom: '2px' }}>Total pedido</div>
                      <div style={{ fontSize: '16px', fontWeight: '900', color: '#1a1a1a' }}>${total.toFixed(2)}</div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 48px', backgroundColor: '#f9f9f9', borderTop: '1px solid #eee', display: 'table', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'table-cell', fontSize: '9px', color: '#bbb' }}>{pedido?.PEDIDO_ID}</div>
            <div style={{ display: 'table-cell', textAlign: 'right', fontSize: '9px', color: '#bbb' }}>{esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}</div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── HOJA 2: ORDEN DE CONFECCIÓN ─────────────────────────────────────────────
// Máximo ITEMS_POR_PAGINA productos por página — pedidos grandes generan
// múltiples páginas limpias en lugar de aplastarse en una sola.
const ITEMS_POR_PAGINA = 3

export function PdfConfeccion({ pedido, items, tiendaColor }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const logo = esMandarina ? LOGO_MANDARINA : LOGO_INDSTORE
  const now = new Date()
  const entrega = pedido?.FECHA_ENTREGA_PROMETIDA ? new Date(pedido.FECHA_ENTREGA_PROMETIDA) : null
  const diasRestantes = entrega ? Math.ceil((entrega - now) / 86400000) : null
  const urgente = diasRestantes !== null && diasRestantes <= 2

  const paginas = chunkArray(items||[], ITEMS_POR_PAGINA)
  const totalPaginas = paginas.length
  const totalPrendas = (items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)
  const areas = [...new Set((items||[]).map(i=>i.AREA).filter(Boolean))].join(', ') || '—'

  return (
    <>
      {paginas.map((itemsPagina, pIdx) => (
        <ConfeccionPagina
          key={pIdx}
          pedido={pedido}
          items={itemsPagina}
          tiendaColor={tiendaColor}
          logo={logo}
          esMandarina={esMandarina}
          entrega={entrega}
          diasRestantes={diasRestantes}
          urgente={urgente}
          paginaActual={pIdx + 1}
          totalPaginas={totalPaginas}
          esUltimaPagina={pIdx === totalPaginas - 1}
          offsetIdx={pIdx * ITEMS_POR_PAGINA}
          totalPrendas={totalPrendas}
          areas={areas}
        />
      ))}
    </>
  )
}

function ConfeccionPagina({ pedido, items, tiendaColor, logo, esMandarina, entrega, diasRestantes, urgente, paginaActual, totalPaginas, esUltimaPagina, offsetIdx, totalPrendas, areas }) {
  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      backgroundColor: '#fff',
      width: '794px',
      minHeight: '1123px',
      position: 'relative',
      pageBreakAfter: esUltimaPagina ? 'auto' : 'always',
      display: 'table',
      tableLayout: 'fixed',
    }}>
      <div style={{ display: 'table-row' }}>
        <div style={{ display: 'table-cell' }}>

          {/* ── HEADER ── */}
          <div style={{ borderBottom: `4px solid ${tiendaColor}`, padding: '12px 48px', display: 'table', width: '100%', boxSizing: 'border-box', backgroundColor: '#fafafa' }}>
            <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
              <div style={{ display: 'table' }}>
                <div style={{ display: 'table-cell', width: '52px', verticalAlign: 'middle', paddingRight: '12px' }}>
                  <img src={logo} style={{ width: '44px', height: '44px', objectFit: 'contain', display: 'block' }} alt="logo" />
                </div>
                <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
                  <div style={{ fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '2px' }}>Orden de Producción Interna</div>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: '#1a1a1a', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>{pedido?.PEDIDO_ID}</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'center' }}>
              {urgente && (
                <div style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: '800', padding: '4px 12px', borderRadius: '20px', marginBottom: '6px', textTransform: 'uppercase', display: 'inline-block' }}>
                  🚨 URGENTE
                </div>
              )}
              {totalPaginas > 1 && (
                <div style={{ backgroundColor: tiendaColor + '15', border: `1px solid ${tiendaColor}40`, borderRadius: '8px', padding: '4px 14px', display: 'inline-block' }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: tiendaColor }}>Página {paginaActual} / {totalPaginas}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'right' }}>
              <div style={{ fontSize: '9px', color: '#999', marginBottom: '2px' }}>Entrega comprometida</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: urgente ? '#ef4444' : '#1a1a1a' }}>
                {entrega ? entrega.toLocaleDateString('es-EC', {day:'numeric', month:'long', year:'numeric'}) : '—'}
              </div>
              {diasRestantes !== null && (
                <div style={{ fontSize: '10px', color: urgente ? '#ef4444' : '#999', marginTop: '2px' }}>
                  {diasRestantes > 0 ? `${diasRestantes} día(s) restante(s)` : diasRestantes === 0 ? '¡ENTREGA HOY!' : `${Math.abs(diasRestantes)} día(s) de retraso`}
                </div>
              )}
            </div>
          </div>

          {/* ── BARRA INFO (solo primera página) ── */}
          {paginaActual === 1 && (
            <div style={{ backgroundColor: '#f0f0f0', padding: '7px 48px', borderBottom: '1px solid #e0e0e0', display: 'table', width: '100%', boxSizing: 'border-box' }}>
              {[
                ['VENDEDOR', pedido?.VENDEDOR_ID || '—'],
                ['PRENDAS TOTALES', totalPrendas],
                ['ÁREAS', areas],
              ].map(([k,v]) => (
                <div key={k} style={{ display: 'table-cell', paddingRight: '28px' }}>
                  <span style={{ fontSize: '9px', color: '#999' }}>{k}: </span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#1a1a1a' }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── ÍTEMS ── */}
          <div style={{ padding: '14px 48px 90px' }}>
            {items.map((item, idx) => {
              const globalIdx = offsetIdx + idx
              const fotos = [
                { url: item.FOTO_PECHO_URL,   label: 'PECHO'   },
                { url: item.FOTO_ESPALDA_URL, label: 'ESPALDA' },
                { url: item.FOTO_MANGA_D_URL, label: 'M.DER'   },
                { url: item.FOTO_MANGA_I_URL, label: 'M.IZQ'   },
              ].filter(f => f.url)

              // Tamaños generosos según cantidad de fotos disponibles
              const FOTO_SIZES = { 1: 220, 2: 195, 3: 165, 4: 150 }
              const fotoSizePx = FOTO_SIZES[fotos.length] || 150
              const fotoSize = `${fotoSizePx}px`

              // Máx 2 fotos por fila
              const fotoRows = fotos.length <= 2
                ? [fotos]
                : fotos.length === 3
                  ? [fotos.slice(0,2), fotos.slice(2)]
                  : [fotos.slice(0,2), fotos.slice(2,4)]

              return (
                <div key={idx} style={{ marginBottom: '16px', border: '2px solid #e5e5e5', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

                  {/* Header ítem */}
                  <div style={{ backgroundColor: tiendaColor + '12', borderBottom: `3px solid ${tiendaColor}`, padding: '9px 16px', display: 'table', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
                      <span style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '10px', fontWeight: '900', padding: '2px 10px', borderRadius: '20px', marginRight: '10px', fontFamily: 'monospace' }}>#{globalIdx+1}</span>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a1a' }}>{item.PRODUCTO_NOMBRE}</span>
                    </div>
                    <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'right' }}>
                      {item.AREA && (
                        <span style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '10px', fontWeight: '700', padding: '3px 12px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {item.AREA}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cuerpo: FOTOS izquierda (grande) | DATOS derecha */}
                  <div style={{ padding: '14px 16px', display: 'table', width: '100%', boxSizing: 'border-box' }}>

                    {/* COLUMNA IZQUIERDA: FOTOS */}
                    <div style={{ display: 'table-cell', verticalAlign: 'top', paddingRight: '16px' }}>
                      {fotos.length > 0 ? (
                        <div>
                          {fotoRows.map((row, ri) => (
                            <div key={ri} style={{ display: 'table', marginBottom: ri < fotoRows.length - 1 ? '6px' : '0' }}>
                              {row.map((f, fi) => (
                                <div key={fi} style={{ display: 'table-cell', textAlign: 'center', paddingRight: fi < row.length - 1 ? '6px' : '0' }}>
                                  <img
                                    src={f.url}
                                    style={{
                                      width: fotoSize,
                                      height: fotoSize,
                                      objectFit: 'cover',
                                      borderRadius: '10px',
                                      border: '2px solid #ddd',
                                      backgroundColor: '#f5f5f5',
                                      display: 'block',
                                    }}
                                  />
                                  <div style={{ fontSize: '9px', color: '#999', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{f.label}</div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ width: '190px', height: '190px', backgroundColor: '#f5f5f5', borderRadius: '12px', border: '2px dashed #ddd', textAlign: 'center', paddingTop: '60px', boxSizing: 'border-box' }}>
                          <div style={{ fontSize: '30px', marginBottom: '8px' }}>✏️</div>
                          <div style={{ fontSize: '10px', color: '#bbb', fontWeight: '600' }}>Sin imágenes de diseño</div>
                        </div>
                      )}
                    </div>

                    {/* COLUMNA DERECHA: DATOS */}
                    <div style={{ display: 'table-cell', verticalAlign: 'top', width: '218px' }}>

                      {/* Fichas en cuadrícula 2×2 */}
                      <div style={{ display: 'table', width: '100%', marginBottom: '10px' }}>
                        {(() => {
                          const fichas = [
                            ['COLOR',    item.COLOR    || '—'],
                            ['TALLA',    item.TALLA    || '—'],
                            ['CANTIDAD', item.CANTIDAD        ],
                            ['ESTADO',   item.SUBESTADO || 'SOLICITADO'],
                          ]
                          return fichas.filter((_,i)=>i%2===0).map(([k,v], rowIdx) => {
                            const par = fichas[rowIdx*2+1]
                            return (
                              <div key={k} style={{ display: 'table-row' }}>
                                <div style={{ display: 'table-cell', width: '50%', paddingRight: '5px', paddingBottom: '6px' }}>
                                  <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '8px 10px', border: '1px solid #ebebeb' }}>
                                    <div style={{ fontSize: '8px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{k}</div>
                                    <div style={{ fontSize: k==='CANTIDAD'?'24px':'12px', fontWeight: '900', color: k==='CANTIDAD'?tiendaColor:'#1a1a1a', lineHeight: 1 }}>{v}</div>
                                  </div>
                                </div>
                                {par && (
                                  <div style={{ display: 'table-cell', width: '50%', paddingBottom: '6px' }}>
                                    <div style={{ backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '8px 10px', border: '1px solid #ebebeb' }}>
                                      <div style={{ fontSize: '8px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{par[0]}</div>
                                      <div style={{ fontSize: par[0]==='CANTIDAD'?'24px':'12px', fontWeight: '900', color: par[0]==='CANTIDAD'?tiendaColor:'#1a1a1a', lineHeight: 1 }}>{par[1]}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })
                        })()}
                      </div>

                      {/* Instrucciones / Notas */}
                      {item.DETALLE_PERSONALIZADO && (
                        <div style={{ backgroundColor: '#fff8e1', borderRadius: '8px', padding: '9px 10px', border: '1px solid #ffe082', marginBottom: '8px' }}>
                          <div style={{ fontSize: '8px', color: '#f59e0b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>📋 Instrucciones</div>
                          <div style={{ fontSize: '11px', color: '#1a1a1a', lineHeight: 1.5 }}>{item.DETALLE_PERSONALIZADO}</div>
                        </div>
                      )}
                      {item.NOTAS_AREA && (
                        <div style={{ backgroundColor: '#eff6ff', borderRadius: '8px', padding: '9px 10px', border: '1px solid #bfdbfe', marginBottom: '8px' }}>
                          <div style={{ fontSize: '8px', color: '#3b82f6', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>📝 Nota de área</div>
                          <div style={{ fontSize: '11px', color: '#1a1a1a', lineHeight: 1.5 }}>{item.NOTAS_AREA}</div>
                        </div>
                      )}
                      {item.ARCHIVO_DISENO_URL && (
                        <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '8px 10px', border: '1px solid #bbf7d0' }}>
                          <div style={{ fontSize: '8px', color: '#16a34a', fontWeight: '800', marginBottom: '2px' }}>📎 Archivo AI/PSD</div>
                          <div style={{ fontSize: '8px', color: '#555', wordBreak: 'break-all', lineHeight: 1.4 }}>{item.ARCHIVO_DISENO_URL.split('/').pop()}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checkboxes control calidad */}
                  <div style={{ backgroundColor: '#f9f9f9', padding: '8px 16px', borderTop: '1px solid #eee', display: 'table', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'table-cell', fontSize: '8px', color: '#999', fontWeight: '700', paddingRight: '14px', width: '55px', verticalAlign: 'middle', textTransform: 'uppercase' }}>Control</div>
                    {['Confeccionado', 'Diseño aplicado', 'Revisado', 'Listo para despacho'].map(step => (
                      <div key={step} style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: '14px' }}>
                        <div style={{ display: 'table' }}>
                          <div style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: '5px' }}>
                            <div style={{ width: '14px', height: '14px', border: '2px solid #ccc', borderRadius: '3px' }} />
                          </div>
                          <div style={{ display: 'table-cell', verticalAlign: 'middle', fontSize: '9px', color: '#555', whiteSpace: 'nowrap' }}>{step}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              )
            })}
          </div>

          {/* ── FOOTER ── */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '9px 48px', backgroundColor: '#f5f5f5', borderTop: '2px solid #e5e5e5', display: 'table', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
              <div style={{ display: 'table' }}>
                <div style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: '8px' }}>
                  <img src={logo} style={{ width: '20px', height: '20px', objectFit: 'contain', opacity: 0.45, display: 'block' }} alt="logo" />
                </div>
                <div style={{ display: 'table-cell', verticalAlign: 'middle', fontSize: '9px', color: '#aaa' }}>{esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}</div>
              </div>
            </div>
            <div style={{ display: 'table-cell', textAlign: 'center', fontSize: '9px', color: '#bbb', verticalAlign: 'middle', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              USO INTERNO — NO INCLUYE PRECIOS
            </div>
            <div style={{ display: 'table-cell', textAlign: 'right', fontSize: '9px', color: '#aaa', verticalAlign: 'middle' }}>
              {pedido?.PEDIDO_ID}
              {totalPaginas > 1 && <span style={{ marginLeft: '8px', color: tiendaColor, fontWeight: '700' }}>p.{paginaActual}/{totalPaginas}</span>}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
