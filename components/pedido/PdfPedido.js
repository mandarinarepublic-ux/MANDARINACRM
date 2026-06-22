'use client'

// URLs de logos
const LOGO_MANDARINA = '/logos/logo_mandarina.png'
const LOGO_INDSTORE  = '/logos/logo_indstore.png'

// Cupones por tienda
const CUPON = {
  MANDARINA: { codigo: 'MANDI',     url: 'https://www.mandarinaec.com?coupon=MANDI',    web: 'mandarinaec.com' },
  INDSTORE:  { codigo: 'INDLOVERS', url: 'https://indlovers.com/discount/INDLOVERS',     web: 'indlovers.com' },
}

// ─── HOJA 1: AGRADECIMIENTO AL CLIENTE ───────────────────────────────────────
export function PdfGracias({ pedido, items, cliente, tiendaColor }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const pagado = pedido?.ESTADO_PAGO === 'PAGADO'
  const nombreCorto = cliente?.NOMBRE?.split(' ')[0] || 'Cliente'
  const logo = esMandarina ? LOGO_MANDARINA : LOGO_INDSTORE
  const cupon = esMandarina ? CUPON.MANDARINA : CUPON.INDSTORE
  const bgGradient = esMandarina
    ? 'linear-gradient(135deg, #c94800 0%, #e85d04 40%, #ff8c00 100%)'
    : 'linear-gradient(135deg, #6a0dad 0%, #c2185b 50%, #e91e8c 100%)'

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", backgroundColor: '#fff', width: '794px', minHeight: '1123px', position: 'relative', overflow: 'hidden', pageBreakAfter: 'always', display: 'flex', flexDirection: 'column' }}>

      {/* PANEL SUPERIOR — exterior */}
      <div style={{ background: bgGradient, minHeight: '374px', display: 'table', width: '100%', position: 'relative', overflow: 'hidden' }}>
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

      {/* PANEL INFERIOR — interior */}
      <div style={{ flex: 1, padding: '24px 48px 80px' }}>
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
        {/* Productos */}
        <div style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>
          Contenido · {(items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)} prenda(s)
        </div>
        {(items||[]).map((item, idx) => (
          <div key={idx} style={{ display: 'table', width: '100%', marginBottom: '10px', backgroundColor: '#fafafa', borderRadius: '12px', border: '1px solid #f0f0f0' }}>
            <div style={{ display: 'table-cell', width: '76px', verticalAlign: 'middle', padding: '10px 8px 10px 12px' }}>
              {item.FOTO_PECHO_URL
                ? <img src={item.FOTO_PECHO_URL} style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee', display: 'block' }} />
                : <div style={{ width: '64px', height: '64px', backgroundColor: '#eee', borderRadius: '8px' }} />
              }
            </div>
            <div style={{ display: 'table-cell', verticalAlign: 'middle', padding: '10px 12px 10px 4px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1a1a1a', marginBottom: '5px' }}>{item.PRODUCTO_NOMBRE}</div>
              <div style={{ display: 'table' }}>
                {item.COLOR && <span style={{ display: 'table-cell', paddingRight: '6px', fontSize: '10px', color: '#555' }}>Color: <strong>{item.COLOR}</strong></span>}
                {item.TALLA && <span style={{ display: 'table-cell', paddingRight: '6px', fontSize: '10px', color: '#555' }}>Talla: <strong>{item.TALLA}</strong></span>}
                <span style={{ display: 'table-cell', fontSize: '10px', color: tiendaColor, fontWeight: '700' }}>x{item.CANTIDAD}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Estado pago con semáforo */}
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
            </div>
          )
        })()}
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 48px', backgroundColor: '#f9f9f9', borderTop: '1px solid #eee', display: 'table', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'table-cell', fontSize: '9px', color: '#bbb' }}>{pedido?.PEDIDO_ID}</div>
        <div style={{ display: 'table-cell', textAlign: 'right', fontSize: '9px', color: '#bbb' }}>{esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}</div>
      </div>
    </div>
  )
}

// ─── HOJA 2: ORDEN DE CONFECCIÓN ─────────────────────────────────────────────
export function PdfConfeccion({ pedido, items, tiendaColor }) {
  const now = new Date()
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const logo = esMandarina ? LOGO_MANDARINA : LOGO_INDSTORE
  const entrega = pedido?.FECHA_ENTREGA_PROMETIDA ? new Date(pedido.FECHA_ENTREGA_PROMETIDA) : null
  const diasRestantes = entrega ? Math.ceil((entrega - now) / 86400000) : null
  const urgente = diasRestantes !== null && diasRestantes <= 2

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", backgroundColor: '#fff', width: '794px', minHeight: '1123px', position: 'relative', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ borderBottom: `3px solid ${tiendaColor}`, padding: '14px 48px', display: 'table', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
          <div style={{ display: 'table' }}>
            <div style={{ display: 'table-cell', width: '52px', verticalAlign: 'middle', paddingRight: '12px' }}>
              <img src={logo} style={{ width: '44px', height: '44px', objectFit: 'contain', display: 'block' }} alt="logo" />
            </div>
            <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
              <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '2px' }}>Orden de Producción Interna</div>
              <div style={{ fontSize: '22px', fontWeight: '900', color: '#1a1a1a', fontFamily: 'monospace' }}>{pedido?.PEDIDO_ID}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'right' }}>
          {urgente && <div style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: '800', padding: '4px 12px', borderRadius: '20px', marginBottom: '4px', textTransform: 'uppercase', display: 'inline-block' }}>🚨 URGENTE</div>}
          <div style={{ fontSize: '10px', color: '#999', marginBottom: '2px' }}>Entrega comprometida</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: urgente ? '#ef4444' : '#1a1a1a' }}>
            {entrega ? entrega.toLocaleDateString('es-EC', {day:'numeric', month:'long', year:'numeric'}) : '-'}
          </div>
          {diasRestantes !== null && (
            <div style={{ fontSize: '10px', color: urgente ? '#ef4444' : '#999', marginTop: '2px' }}>
              {diasRestantes > 0 ? `${diasRestantes} día(s) restante(s)` : diasRestantes === 0 ? '¡ENTREGA HOY!' : `${Math.abs(diasRestantes)} día(s) de retraso`}
            </div>
          )}
        </div>
      </div>

      {/* Barra info */}
      <div style={{ backgroundColor: '#f5f5f5', padding: '8px 48px', borderBottom: '1px solid #e5e5e5', display: 'table', width: '100%', boxSizing: 'border-box' }}>
        {[['VENDEDOR', pedido?.VENDEDOR_ID||'-'], ['PRENDAS', (items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)], ['ÁREAS', [...new Set((items||[]).map(i=>i.AREA).filter(Boolean))].join(', ')||'-']].map(([k,v]) => (
          <div key={k} style={{ display: 'table-cell', paddingRight: '24px' }}>
            <span style={{ fontSize: '10px', color: '#999' }}>{k}: </span>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#1a1a1a' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Ítems */}
      <div style={{ padding: '16px 48px' }}>
        {(items||[]).map((item, idx) => {
          const fotos = [
            { url: item.FOTO_PECHO_URL,   label: 'PECHO'   },
            { url: item.FOTO_ESPALDA_URL, label: 'ESPALDA' },
            { url: item.FOTO_MANGA_D_URL, label: 'M. DER'  },
            { url: item.FOTO_MANGA_I_URL, label: 'M. IZQ'  },
          ].filter(f => f.url)

          // Cuadrícula adaptativa: 1→1 cuadrado, 2→1x2, 3→2+1, 4→2x2
          const fotoSize = fotos.length === 1 ? '150px' : fotos.length <= 2 ? '120px' : '100px'
          const fotoRows = fotos.length <= 2
            ? [fotos]
            : fotos.length === 3 ? [fotos.slice(0,2), fotos.slice(2,3)] : [fotos.slice(0,2), fotos.slice(2,4)]

          return (
            <div key={idx} style={{ marginBottom: '20px', border: '2px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden' }}>
              {/* Header ítem */}
              <div style={{ backgroundColor: '#f9f9f9', borderBottom: `3px solid ${tiendaColor}`, padding: '8px 14px', display: 'table', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
                  <span style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '11px', fontWeight: '800', padding: '2px 10px', borderRadius: '20px', marginRight: '10px' }}>#{idx+1}</span>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#1a1a1a' }}>{item.PRODUCTO_NOMBRE}</span>
                </div>
                <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'right' }}>
                  <span style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' }}>{item.AREA}</span>
                </div>
              </div>

              {/* Cuerpo ítem — tabla para html2pdf */}
              <div style={{ padding: '12px 14px', display: 'table', width: '100%', boxSizing: 'border-box' }}>
                {/* Columna izquierda: fichas */}
                <div style={{ display: 'table-cell', width: '195px', verticalAlign: 'top', paddingRight: '12px' }}>
                  <div style={{ display: 'table', width: '100%', marginBottom: '8px' }}>
                    {[['COLOR', item.COLOR||'—'], ['TALLA', item.TALLA||'—'], ['CANTIDAD', item.CANTIDAD], ['SUBESTADO', item.SUBESTADO||'SOLICITADO']].map(([k,v], ki) => (
                      <div key={k} style={{ display: ki%2===0 ? 'table-row' : undefined }}>
                        {ki%2===0 ? (
                          <>
                            <div style={{ display: 'table-cell', padding: '4px', width: '50%' }}>
                              <div style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '7px 9px', border: '1px solid #eee' }}>
                                <div style={{ fontSize: '8px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{k}</div>
                                <div style={{ fontSize: k==='CANTIDAD'?'18px':'11px', fontWeight: '800', color: k==='CANTIDAD'?tiendaColor:'#1a1a1a', lineHeight: 1 }}>{v}</div>
                              </div>
                            </div>
                            <div style={{ display: 'table-cell', padding: '4px', width: '50%' }}>
                              {[['COLOR', item.COLOR||'—'], ['TALLA', item.TALLA||'—'], ['CANTIDAD', item.CANTIDAD], ['SUBESTADO', item.SUBESTADO||'SOLICITADO']][ki+1] && (() => {
                                const [k2,v2] = [['COLOR', item.COLOR||'—'], ['TALLA', item.TALLA||'—'], ['CANTIDAD', item.CANTIDAD], ['SUBESTADO', item.SUBESTADO||'SOLICITADO']][ki+1]
                                return (
                                  <div style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '7px 9px', border: '1px solid #eee' }}>
                                    <div style={{ fontSize: '8px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{k2}</div>
                                    <div style={{ fontSize: k2==='CANTIDAD'?'18px':'11px', fontWeight: '800', color: k2==='CANTIDAD'?tiendaColor:'#1a1a1a', lineHeight: 1 }}>{v2}</div>
                                  </div>
                                )
                              })()}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )).filter(Boolean)}
                  </div>
                  {item.DETALLE_PERSONALIZADO && (
                    <div style={{ backgroundColor: '#fff8e1', borderRadius: '8px', padding: '8px', border: '1px solid #ffe082', marginBottom: '6px' }}>
                      <div style={{ fontSize: '8px', color: '#f59e0b', fontWeight: '700', textTransform: 'uppercase', marginBottom: '3px' }}>📋 Instrucciones</div>
                      <div style={{ fontSize: '10px', color: '#1a1a1a', lineHeight: 1.4 }}>{item.DETALLE_PERSONALIZADO}</div>
                    </div>
                  )}
                  {item.NOTAS_AREA && (
                    <div style={{ backgroundColor: '#eff6ff', borderRadius: '8px', padding: '8px', border: '1px solid #bfdbfe', marginBottom: '6px' }}>
                      <div style={{ fontSize: '8px', color: '#3b82f6', fontWeight: '700', textTransform: 'uppercase', marginBottom: '3px' }}>📝 Nota de área</div>
                      <div style={{ fontSize: '10px', color: '#1a1a1a', lineHeight: 1.4 }}>{item.NOTAS_AREA}</div>
                    </div>
                  )}
                  {item.ARCHIVO_DISENO_URL && (
                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '7px 9px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '8px', color: '#16a34a', fontWeight: '700', marginBottom: '2px' }}>📎 Archivo AI/PSD</div>
                      <div style={{ fontSize: '8px', color: '#888', wordBreak: 'break-all' }}>{item.ARCHIVO_DISENO_URL.split('/').pop()}</div>
                    </div>
                  )}
                </div>

                {/* Columna derecha: fotos cuadrícula adaptativa */}
                <div style={{ display: 'table-cell', verticalAlign: 'top' }}>
                  {fotos.length > 0 ? (
                    <div style={{ display: 'table', margin: '0 auto' }}>
                      {fotoRows.map((row, ri) => (
                        <div key={ri} style={{ display: 'table-row' }}>
                          {row.map((f, fi) => (
                            <div key={fi} style={{ display: 'table-cell', textAlign: 'center', padding: '3px' }}>
                              <img src={f.url} style={{ width: fotoSize, height: fotoSize, objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee', backgroundColor: '#f9f9f9', display: 'block' }} />
                              <div style={{ fontSize: '8px', color: '#bbb', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.label}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ width: '160px', height: '160px', margin: '0 auto', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px dashed #ddd', textAlign: 'center', paddingTop: '55px' }}>
                      <div style={{ fontSize: '20px', marginBottom: '4px' }}>✏️</div>
                      <div style={{ fontSize: '9px', color: '#bbb' }}>Sin archivos de diseño</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Checkboxes */}
              <div style={{ backgroundColor: '#f9f9f9', padding: '7px 14px', borderTop: '1px solid #eee', display: 'table', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'table-cell', fontSize: '9px', color: '#999', fontWeight: '600', paddingRight: '16px', width: '70px', verticalAlign: 'middle' }}>CONTROL:</div>
                {['Confeccionado', 'Diseño aplicado', 'Revisado', 'Listo para despacho'].map(step => (
                  <div key={step} style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: '16px' }}>
                    <div style={{ display: 'table' }}>
                      <div style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: '5px' }}>
                        <div style={{ width: '13px', height: '13px', border: '2px solid #ccc', borderRadius: '3px' }} />
                      </div>
                      <div style={{ display: 'table-cell', verticalAlign: 'middle', fontSize: '9px', color: '#666', whiteSpace: 'nowrap' }}>{step}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 48px', backgroundColor: '#f5f5f5', borderTop: '1px solid #eee', display: 'table', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
          <div style={{ display: 'table' }}>
            <div style={{ display: 'table-cell', verticalAlign: 'middle', paddingRight: '8px' }}>
              <img src={logo} style={{ width: '22px', height: '22px', objectFit: 'contain', opacity: 0.5, display: 'block' }} alt="logo" />
            </div>
            <div style={{ display: 'table-cell', verticalAlign: 'middle', fontSize: '9px', color: '#999' }}>{esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}</div>
          </div>
        </div>
        <div style={{ display: 'table-cell', textAlign: 'center', fontSize: '9px', color: '#999', verticalAlign: 'middle' }}>USO INTERNO — NO INCLUYE PRECIOS</div>
        <div style={{ display: 'table-cell', textAlign: 'right', fontSize: '9px', color: '#999', verticalAlign: 'middle' }}>{pedido?.PEDIDO_ID}</div>
      </div>
    </div>
  )
}
