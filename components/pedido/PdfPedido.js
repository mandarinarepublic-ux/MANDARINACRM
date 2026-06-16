'use client'

// ─── HOJA 1: AGRADECIMIENTO AL CLIENTE ───────────────────────────────────────
export function PdfGracias({ pedido, items, cliente, tiendaColor }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const pagado = pedido?.ESTADO_PAGO === 'PAGADO'
  const nombreCorto = cliente?.NOMBRE?.split(' ')[0] || 'Cliente'

  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      backgroundColor: '#fff', width: '794px', minHeight: '1123px',
      position: 'relative', overflow: 'hidden', pageBreakAfter: 'always',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* PANEL SUPERIOR — exterior (se ve al doblar) */}
      <div style={{ backgroundColor: tiendaColor, minHeight: '374px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 60px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position:'absolute', top:'-60px', right:'-60px', width:'200px', height:'200px', borderRadius:'50%', backgroundColor:'rgba(255,255,255,0.07)' }} />
        <div style={{ position:'absolute', bottom:'-40px', left:'-40px', width:'160px', height:'160px', borderRadius:'50%', backgroundColor:'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '40px', justifyContent: 'center' }}>
          <div style={{ flex: 1, maxWidth: '420px' }}>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '12px' }}>
              {esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}
            </div>
            <div style={{ fontSize: '42px', fontWeight: '900', color: '#fff', lineHeight: 1.1, marginBottom: '16px' }}>
              ¡Gracias,<br />{nombreCorto}!
            </div>
            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: '20px' }}>
              {esMandarina
                ? 'Tu pedido fue confeccionado con mucho cariño. Esperamos que lo disfrutes tanto como nosotros disfrutamos haciéndolo.'
                : 'Tu pedido fue preparado especialmente para ti. ¡Gracias por elegirnos!'}
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.25)' }}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px' }}>🎁 Tenemos un regalo para ti</div>
              <div style={{ fontSize: '13px', color: '#fff', fontWeight: '700', marginBottom: '2px' }}>10% de descuento en tu próxima compra</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>
                Usa el cupón <strong style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '6px', letterSpacing: '1px' }}>MANDI</strong> en mandarinaec.com
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '12px', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=106x106&data=${encodeURIComponent('https://www.mandarinaec.com?coupon=MANDI')}&color=1a1a1a&bgcolor=ffffff&margin=0`} style={{ width: '106px', height: '106px' }} alt="QR MANDI" />
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '8px' }}>Escanea para tu</div>
            <div style={{ fontSize: '11px', color: '#fff', fontWeight: '700' }}>10% de descuento</div>
          </div>
        </div>
      </div>

      {/* Línea de doblez */}
      <div style={{ borderTop: '1.5px dashed #ccc' }} />

      {/* PANEL INFERIOR — interior */}
      <div style={{ flex: 1, padding: '28px 48px 80px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px', border: '2px solid #e5e5e5' }}>
          <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Datos de envío</div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#1a1a1a', marginBottom: '12px', lineHeight: 1.1 }}>{cliente?.NOMBRE || '-'}</div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {cliente?.CELULAR && (
              <div style={{ backgroundColor: '#f5f5f5', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #e5e5e5' }}>
                <div style={{ fontSize: '18px' }}>📱</div>
                <div>
                  <div style={{ fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Celular</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#1a1a1a', fontFamily: 'monospace' }}>{cliente.CELULAR}</div>
                </div>
              </div>
            )}
            {cliente?.CEDULA && (
              <div style={{ backgroundColor: '#f5f5f5', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #e5e5e5' }}>
                <div style={{ fontSize: '18px' }}>🆔</div>
                <div>
                  <div style={{ fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Cédula</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#1a1a1a', fontFamily: 'monospace' }}>{cliente.CEDULA}</div>
                </div>
              </div>
            )}
          </div>
          {(pedido?.DIRECCION_TEXTO || pedido?.DIRECCION_PEDIDO) && (
            <div style={{ backgroundColor: tiendaColor + '12', borderRadius: '10px', padding: '12px 16px', borderLeft: `4px solid ${tiendaColor}` }}>
              <div style={{ fontSize: '9px', color: tiendaColor, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px', fontWeight: '700' }}>Dirección de entrega</div>
              <div style={{ fontSize: '13px', color: '#1a1a1a', fontWeight: '600', lineHeight: 1.5 }}>
                {(pedido.DIRECCION_TEXTO || pedido.DIRECCION_PEDIDO).replace(/\n/g, ' · ')}
              </div>
            </div>
          )}
        </div>

        <div style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>
          Contenido del pedido · {(items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)} prenda(s)
        </div>
        {(items||[]).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '16px', marginBottom: '12px', padding: '12px', backgroundColor: '#fafafa', borderRadius: '12px', border: '1px solid #f0f0f0', alignItems: 'center' }}>
            <div style={{ flexShrink: 0 }}>
              {item.FOTO_PECHO_URL
                ? <img src={item.FOTO_PECHO_URL} style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee' }} />
                : <div style={{ width: '70px', height: '70px', backgroundColor: '#eee', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#bbb' }}>Sin foto</div>
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>{item.PRODUCTO_NOMBRE}</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {item.COLOR && <span style={{ fontSize: '11px', backgroundColor: '#f0f0f0', padding: '2px 8px', borderRadius: '20px', color: '#555' }}>Color: <strong>{item.COLOR}</strong></span>}
                {item.TALLA && <span style={{ fontSize: '11px', backgroundColor: '#f0f0f0', padding: '2px 8px', borderRadius: '20px', color: '#555' }}>Talla: <strong>{item.TALLA}</strong></span>}
                <span style={{ fontSize: '11px', backgroundColor: tiendaColor+'15', padding: '2px 8px', borderRadius: '20px', color: tiendaColor, fontWeight: '700' }}>x{item.CANTIDAD}</span>
              </div>
            </div>
          </div>
        ))}

        <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '10px', backgroundColor: pagado ? '#dcfce7' : '#fef3c7', border: `1px solid ${pagado ? '#86efac' : '#fde68a'}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '20px' }}>{pagado ? '✅' : '💳'}</div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '800', color: pagado ? '#15803d' : '#92400e' }}>
              {pagado ? 'Pedido pagado — listo para entregar' : 'Pendiente de pago al recibir'}
            </div>
            {!pagado && <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>Cobrar el saldo al momento de la entrega</div>}
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 48px', backgroundColor: '#f9f9f9', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '10px', color: '#bbb' }}>{pedido?.PEDIDO_ID}</div>
        <div style={{ fontSize: '10px', color: '#bbb' }}>{esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}</div>
      </div>
    </div>
  )
}

// ─── HOJA 2: ORDEN DE CONFECCIÓN (fondo blanco, sin precios) ─────────────────
export function PdfConfeccion({ pedido, items, tiendaColor }) {
  const now = new Date()
  const entrega = pedido?.FECHA_ENTREGA_PROMETIDA ? new Date(pedido.FECHA_ENTREGA_PROMETIDA) : null
  const diasRestantes = entrega ? Math.ceil((entrega - now) / 86400000) : null
  const urgente = diasRestantes !== null && diasRestantes <= 2

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", backgroundColor: '#fff', width: '794px', minHeight: '1123px', position: 'relative', overflow: 'hidden' }}>

      {/* Header — fondo BLANCO con borde inferior negro */}
      <div style={{ borderBottom: '3px solid #1a1a1a', padding: '20px 48px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>Orden de Producción Interna</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#1a1a1a', fontFamily: 'monospace' }}>{pedido?.PEDIDO_ID}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {urgente && <div style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: '800', padding: '4px 12px', borderRadius: '20px', marginBottom: '6px', textTransform: 'uppercase' }}>🚨 URGENTE</div>}
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
      <div style={{ backgroundColor: '#f5f5f5', padding: '10px 48px', display: 'flex', gap: '32px', borderBottom: '1px solid #e5e5e5' }}>
        {[
          ['VENDEDOR', pedido?.VENDEDOR_ID||'-'],
          ['PRENDAS', (items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)],
          ['ÁREAS', [...new Set((items||[]).map(i=>i.AREA).filter(Boolean))].join(', ')||'-']
        ].map(([k,v]) => (
          <div key={k}><span style={{ fontSize: '10px', color: '#999' }}>{k}: </span><span style={{ fontSize: '11px', fontWeight: '700', color: '#1a1a1a' }}>{v}</span></div>
        ))}
      </div>

      {/* Ítems */}
      <div style={{ padding: '20px 48px' }}>
        {(items||[]).map((item, idx) => {
          const fotos = [
            { url: item.FOTO_PECHO_URL,   label: 'PECHO'   },
            { url: item.FOTO_ESPALDA_URL, label: 'ESPALDA' },
            { url: item.FOTO_MANGA_D_URL, label: 'M. DER'  },
            { url: item.FOTO_MANGA_I_URL, label: 'M. IZQ'  },
          ].filter(f => f.url)

          return (
            <div key={idx} style={{ marginBottom: '24px', border: '2px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden' }}>
              {/* Header ítem — fondo gris claro, borde color tienda (no negro) */}
              <div style={{ backgroundColor: '#f9f9f9', borderBottom: `3px solid ${tiendaColor}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '11px', fontWeight: '800', padding: '2px 10px', borderRadius: '20px' }}>#{idx+1}</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a1a' }}>{item.PRODUCTO_NOMBRE}</div>
                </div>
                <div style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' }}>{item.AREA}</div>
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', gap: '16px' }}>
                <div style={{ flex: '0 0 200px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    {[['COLOR', item.COLOR||'—'], ['TALLA', item.TALLA||'—'], ['CANTIDAD', item.CANTIDAD], ['SUBESTADO', item.SUBESTADO||'SOLICITADO']].map(([k,v]) => (
                      <div key={k} style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '8px 10px', border: '1px solid #eee' }}>
                        <div style={{ fontSize: '9px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{k}</div>
                        <div style={{ fontSize: k==='CANTIDAD'?'20px':'12px', fontWeight: '800', color: k==='CANTIDAD'?tiendaColor:'#1a1a1a', lineHeight: 1 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {item.DETALLE_PERSONALIZADO && (
                    <div style={{ backgroundColor: '#fff8e1', borderRadius: '8px', padding: '10px', border: '1px solid #ffe082' }}>
                      <div style={{ fontSize: '9px', color: '#f59e0b', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>📋 Instrucciones</div>
                      <div style={{ fontSize: '11px', color: '#1a1a1a', lineHeight: 1.4 }}>{item.DETALLE_PERSONALIZADO}</div>
                    </div>
                  )}
                  {item.NOTAS_AREA && (
                    <div style={{ marginTop: '8px', backgroundColor: '#eff6ff', borderRadius: '8px', padding: '10px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '9px', color: '#3b82f6', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>📝 Nota de área</div>
                      <div style={{ fontSize: '11px', color: '#1a1a1a', lineHeight: 1.4 }}>{item.NOTAS_AREA}</div>
                    </div>
                  )}
                  {item.ARCHIVO_DISENO_URL && (
                    <div style={{ marginTop: '8px', backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '8px 10px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '9px', color: '#16a34a', fontWeight: '700', marginBottom: '2px' }}>📎 Archivo AI/PSD</div>
                      <div style={{ fontSize: '9px', color: '#888', wordBreak: 'break-all' }}>{item.ARCHIVO_DISENO_URL.split('/').pop()}</div>
                    </div>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  {fotos.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(fotos.length,2)}, 1fr)`, gap: '8px' }}>
                      {fotos.map((f,i) => (
                        <div key={i} style={{ textAlign: 'center' }}>
                          <img src={f.url} style={{ width: '100%', height: fotos.length<=2?'140px':'100px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #eee', backgroundColor: '#f9f9f9' }} />
                          <div style={{ fontSize: '9px', color: '#bbb', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ height: '120px', backgroundColor: '#f9f9f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ddd' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', marginBottom: '4px' }}>✏️</div>
                        <div style={{ fontSize: '10px', color: '#bbb' }}>Sin archivos de diseño</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ backgroundColor: '#f9f9f9', padding: '8px 16px', borderTop: '1px solid #eee', display: 'flex', gap: '24px', alignItems: 'center' }}>
                <div style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>CONTROL:</div>
                {['Confeccionado', 'Diseño aplicado', 'Revisado', 'Listo para despacho'].map(step => (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '14px', height: '14px', border: '2px solid #ccc', borderRadius: '3px', flexShrink: 0 }} />
                    <span style={{ fontSize: '9px', color: '#666' }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 48px', backgroundColor: '#f5f5f5', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '10px', color: '#999' }}>Impreso: {now.toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'})}</div>
        <div style={{ fontSize: '10px', color: '#999' }}>USO INTERNO — NO INCLUYE PRECIOS</div>
        <div style={{ fontSize: '10px', color: '#999' }}>{pedido?.PEDIDO_ID}</div>
      </div>
    </div>
  )
}
