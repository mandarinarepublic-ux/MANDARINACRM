'use client'

// URLs de logos
const LOGO_MANDARINA = '/logos/logo_mandarina.png'
const LOGO_INDSTORE  = '/logos/logo_indstore.png'

// Cupones por tienda
const CUPON = {
  MANDARINA: { codigo: 'MANDI',     url: 'https://www.mandarinaec.com?coupon=MANDI',     web: 'mandarinaec.com' },
  INDSTORE:  { codigo: 'INDLOVERS', url: 'https://indlovers.com/discount/INDLOVERS',      web: 'indlovers.com' },
}

// ─── HOJA 1: AGRADECIMIENTO AL CLIENTE ───────────────────────────────────────
export function PdfGracias({ pedido, items, cliente, tiendaColor }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const pagado = pedido?.ESTADO_PAGO === 'PAGADO'
  const nombreCorto = cliente?.NOMBRE?.split(' ')[0] || 'Cliente'
  const logo = esMandarina ? LOGO_MANDARINA : LOGO_INDSTORE
  const cupon = esMandarina ? CUPON.MANDARINA : CUPON.INDSTORE

  // Gradiente de fondo inspirado en el diseño de referencia
  const bgGradient = esMandarina
    ? 'linear-gradient(135deg, #c94800 0%, #e85d04 40%, #ff8c00 100%)'
    : 'linear-gradient(135deg, #6a0dad 0%, #c2185b 50%, #e91e8c 100%)'

  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      backgroundColor: '#fff',
      width: '794px',
      minHeight: '1123px',
      position: 'relative',
      overflow: 'hidden',
      pageBreakAfter: 'always',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ═══ PANEL SUPERIOR — exterior (se ve al doblar) ═══ */}
      <div style={{
        background: bgGradient,
        minHeight: '374px',
        display: 'flex', alignItems: 'center',
        padding: '36px 48px',
        position: 'relative', overflow: 'hidden',
        gap: '32px',
      }}>
        {/* Círculos decorativos */}
        <div style={{ position:'absolute', top:'-80px', right:'-80px', width:'280px', height:'280px', borderRadius:'50%', backgroundColor:'rgba(0,0,0,0.12)' }} />
        <div style={{ position:'absolute', bottom:'-60px', left:'30%', width:'200px', height:'200px', borderRadius:'50%', backgroundColor:'rgba(255,255,255,0.06)' }} />

        {/* LOGO */}
        <div style={{ flexShrink: 0, width: '160px', position: 'relative', zIndex: 2 }}>
          <img src={logo}
            style={{ width: '160px', height: '160px', objectFit: 'contain', filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.4))' }}
            alt={esMandarina ? 'Mandarina Republic' : 'Indstore'} />
        </div>

        {/* TEXTO AGRADECIMIENTO */}
        <div style={{ flex: 1, position: 'relative', zIndex: 2 }}>
          {/* Ícono decorativo */}
          <div style={{ fontSize: '20px', marginBottom: '8px', opacity: 0.9 }}>🧵✂️</div>
          <div style={{ fontSize: '42px', fontWeight: '900', color: '#fff', lineHeight: 1.05, marginBottom: '12px', letterSpacing: '-1px',
            textShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>
            ¡Gracias,<br />{nombreCorto}!
          </div>
          {/* Texto con fondo oscuro para contraste sobre naranja */}
          <div style={{
            backgroundColor: 'rgba(0,0,0,0.28)',
            borderRadius: '10px',
            padding: '10px 14px',
            maxWidth: '280px',
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{ fontSize: '13px', color: '#fff', lineHeight: 1.7, fontWeight: '500' }}>
              {esMandarina
                ? 'Tu pedido fue confeccionado con mucho cariño. Esperamos que lo disfrutes tanto como nosotros disfrutamos haciéndolo.'
                : 'Tu pedido fue preparado especialmente para ti. ¡Gracias por elegirnos!'}
            </div>
          </div>
        </div>

        {/* CUPÓN + QR */}
        <div style={{ flexShrink: 0, position: 'relative', zIndex: 2 }}>
          {/* Ticket de cupón */}
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '18px 20px',
            width: '210px',
            position: 'relative',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }}>
            {/* Muescas del ticket */}
            <div style={{ position:'absolute', left:'-10px', top:'50%', transform:'translateY(-50%)', width:'20px', height:'20px', borderRadius:'50%', backgroundColor: esMandarina ? '#c94800' : '#6a0dad' }} />
            <div style={{ position:'absolute', right:'-10px', top:'50%', transform:'translateY(-50%)', width:'20px', height:'20px', borderRadius:'50%', backgroundColor: esMandarina ? '#c94800' : '#6a0dad' }} />

            <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>🎁 Tenemos un regalo para ti:</div>
            <div style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a1a', marginBottom: '4px', lineHeight: 1.3 }}>10% de descuento en<br />tu próxima compra</div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>
              Usa el cupón <strong style={{ color: '#1a1a1a' }}>{cupon.codigo}</strong> en {cupon.web}
            </div>
            {/* Línea punteada divisoria */}
            <div style={{ borderTop: '1.5px dashed #ddd', marginBottom: '10px' }} />
            {/* QR */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(cupon.url)}&color=1a1a1a&bgcolor=ffffff&margin=2`}
                style={{ width: '90px', height: '90px', borderRadius: '6px' }}
                alt={`QR ${cupon.codigo}`}
              />
            </div>
            <div style={{ fontSize: '10px', color: '#999', textAlign: 'center' }}>↗ Escanea para tu descuento</div>
          </div>
        </div>
      </div>

      {/* Línea de doblez */}
      <div style={{ borderTop: '1.5px dashed #ccc' }} />

      {/* ═══ PANEL INFERIOR — interior ═══ */}
      <div style={{ flex: 1, padding: '24px 48px 80px' }}>

        {/* Datos de envío — fondo blanco, texto negro */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px 20px', marginBottom: '20px', border: '2px solid #e5e5e5' }}>
          <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px' }}>Datos de envío</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#1a1a1a', marginBottom: '10px', lineHeight: 1.1 }}>{cliente?.NOMBRE || '-'}</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {cliente?.CELULAR && (
              <div style={{ backgroundColor: '#f5f5f5', borderRadius: '10px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e5e5e5' }}>
                <div style={{ fontSize: '16px' }}>📱</div>
                <div>
                  <div style={{ fontSize: '8px', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1px' }}>Celular</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a1a', fontFamily: 'monospace' }}>{cliente.CELULAR}</div>
                </div>
              </div>
            )}
            {cliente?.CEDULA && (
              <div style={{ backgroundColor: '#f5f5f5', borderRadius: '10px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e5e5e5' }}>
                <div style={{ fontSize: '16px' }}>🆔</div>
                <div>
                  <div style={{ fontSize: '8px', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1px' }}>Cédula</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a1a', fontFamily: 'monospace' }}>{cliente.CEDULA}</div>
                </div>
              </div>
            )}
          </div>
          {(pedido?.DIRECCION_TEXTO || pedido?.DIRECCION_PEDIDO) && (
            <div style={{ backgroundColor: tiendaColor + '10', borderRadius: '10px', padding: '10px 14px', borderLeft: `4px solid ${tiendaColor}` }}>
              <div style={{ fontSize: '8px', color: tiendaColor, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px', fontWeight: '700' }}>Dirección de entrega</div>
              <div style={{ fontSize: '12px', color: '#1a1a1a', fontWeight: '600', lineHeight: 1.5 }}>
                {(pedido.DIRECCION_TEXTO || pedido.DIRECCION_PEDIDO).replace(/\n/g, ' · ')}
              </div>
            </div>
          )}
        </div>

        {/* Productos — sin precios */}
        <div style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>
          Contenido · {(items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)} prenda(s)
        </div>
        {(items||[]).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '14px', marginBottom: '10px', padding: '10px', backgroundColor: '#fafafa', borderRadius: '12px', border: '1px solid #f0f0f0', alignItems: 'center' }}>
            <div style={{ flexShrink: 0 }}>
              {item.FOTO_PECHO_URL
                ? <img src={item.FOTO_PECHO_URL} style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee' }} />
                : <div style={{ width: '64px', height: '64px', backgroundColor: '#eee', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#bbb' }}>Sin foto</div>
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>{item.PRODUCTO_NOMBRE}</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {item.COLOR && <span style={{ fontSize: '10px', backgroundColor: '#f0f0f0', padding: '2px 7px', borderRadius: '20px', color: '#555' }}>Color: <strong>{item.COLOR}</strong></span>}
                {item.TALLA && <span style={{ fontSize: '10px', backgroundColor: '#f0f0f0', padding: '2px 7px', borderRadius: '20px', color: '#555' }}>Talla: <strong>{item.TALLA}</strong></span>}
                <span style={{ fontSize: '10px', backgroundColor: tiendaColor+'15', padding: '2px 7px', borderRadius: '20px', color: tiendaColor, fontWeight: '700' }}>x{item.CANTIDAD}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Estado pago */}
        <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '10px', backgroundColor: pagado ? '#dcfce7' : '#fef3c7', border: `1px solid ${pagado ? '#86efac' : '#fde68a'}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '18px' }}>{pagado ? '✅' : '💳'}</div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '800', color: pagado ? '#15803d' : '#92400e' }}>
              {pagado ? 'Pedido pagado — listo para entregar' : 'Pendiente de pago al recibir'}
            </div>
            {!pagado && <div style={{ fontSize: '10px', color: '#92400e', marginTop: '1px' }}>Cobrar el saldo al momento de la entrega</div>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 48px', backgroundColor: '#f9f9f9', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '9px', color: '#bbb' }}>{pedido?.PEDIDO_ID}</div>
        <div style={{ fontSize: '9px', color: '#bbb' }}>{esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}</div>
      </div>
    </div>
  )
}

// ─── HOJA 2: ORDEN DE CONFECCIÓN (fondo blanco, sin precios) ─────────────────
export function PdfConfeccion({ pedido, items, tiendaColor }) {
  const now = new Date()
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const logo = esMandarina ? LOGO_MANDARINA : LOGO_INDSTORE
  const entrega = pedido?.FECHA_ENTREGA_PROMETIDA ? new Date(pedido.FECHA_ENTREGA_PROMETIDA) : null
  const diasRestantes = entrega ? Math.ceil((entrega - now) / 86400000) : null
  const urgente = diasRestantes !== null && diasRestantes <= 2

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", backgroundColor: '#fff', width: '794px', minHeight: '1123px', position: 'relative', overflow: 'hidden' }}>

      {/* Header — fondo blanco con borde inferior color tienda */}
      <div style={{ borderBottom: `3px solid ${tiendaColor}`, padding: '16px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Logo pequeño */}
          <img src={logo} style={{ width: '48px', height: '48px', objectFit: 'contain' }} alt="logo" />
          <div>
            <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '2px' }}>Orden de Producción Interna</div>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#1a1a1a', fontFamily: 'monospace' }}>{pedido?.PEDIDO_ID}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
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
      <div style={{ backgroundColor: '#f5f5f5', padding: '8px 48px', display: 'flex', gap: '32px', borderBottom: '1px solid #e5e5e5' }}>
        {[
          ['VENDEDOR', pedido?.VENDEDOR_ID||'-'],
          ['PRENDAS', (items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)],
          ['ÁREAS', [...new Set((items||[]).map(i=>i.AREA).filter(Boolean))].join(', ')||'-']
        ].map(([k,v]) => (
          <div key={k}><span style={{ fontSize: '10px', color: '#999' }}>{k}: </span><span style={{ fontSize: '11px', fontWeight: '700', color: '#1a1a1a' }}>{v}</span></div>
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

          return (
            <div key={idx} style={{ marginBottom: '20px', border: '2px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden' }}>
              {/* Header ítem — fondo gris claro con borde color tienda */}
              <div style={{ backgroundColor: '#f9f9f9', borderBottom: `3px solid ${tiendaColor}`, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '11px', fontWeight: '800', padding: '2px 10px', borderRadius: '20px' }}>#{idx+1}</div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#1a1a1a' }}>{item.PRODUCTO_NOMBRE}</div>
                </div>
                <div style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' }}>{item.AREA}</div>
              </div>

              <div style={{ padding: '12px 14px', display: 'flex', gap: '14px' }}>
                <div style={{ flex: '0 0 190px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                    {[['COLOR', item.COLOR||'—'], ['TALLA', item.TALLA||'—'], ['CANTIDAD', item.CANTIDAD], ['SUBESTADO', item.SUBESTADO||'SOLICITADO']].map(([k,v]) => (
                      <div key={k} style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '7px 9px', border: '1px solid #eee' }}>
                        <div style={{ fontSize: '8px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{k}</div>
                        <div style={{ fontSize: k==='CANTIDAD'?'18px':'11px', fontWeight: '800', color: k==='CANTIDAD'?tiendaColor:'#1a1a1a', lineHeight: 1 }}>{v}</div>
                      </div>
                    ))}
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

                <div style={{ flex: 1 }}>
                  {fotos.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(fotos.length,2)}, 1fr)`, gap: '6px' }}>
                      {fotos.map((f,i) => (
                        <div key={i} style={{ textAlign: 'center' }}>
                          <img src={f.url} style={{ width: '100%', height: fotos.length<=2?'130px':'90px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #eee', backgroundColor: '#f9f9f9' }} />
                          <div style={{ fontSize: '8px', color: '#bbb', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ height: '100px', backgroundColor: '#f9f9f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ddd' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', marginBottom: '3px' }}>✏️</div>
                        <div style={{ fontSize: '9px', color: '#bbb' }}>Sin archivos de diseño</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Checkboxes */}
              <div style={{ backgroundColor: '#f9f9f9', padding: '7px 14px', borderTop: '1px solid #eee', display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ fontSize: '9px', color: '#999', fontWeight: '600' }}>CONTROL:</div>
                {['Confeccionado', 'Diseño aplicado', 'Revisado', 'Listo para despacho'].map(step => (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '13px', height: '13px', border: '2px solid #ccc', borderRadius: '3px', flexShrink: 0 }} />
                    <span style={{ fontSize: '8px', color: '#666' }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer con logo pequeño */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 48px', backgroundColor: '#f5f5f5', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src={logo} style={{ width: '24px', height: '24px', objectFit: 'contain', opacity: 0.6 }} alt="logo" />
          <div style={{ fontSize: '9px', color: '#999' }}>{esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}</div>
        </div>
        <div style={{ fontSize: '9px', color: '#999' }}>USO INTERNO — NO INCLUYE PRECIOS</div>
        <div style={{ fontSize: '9px', color: '#999' }}>{pedido?.PEDIDO_ID}</div>
      </div>
    </div>
  )
}
