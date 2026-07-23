'use client'
import { parseFechaCalendario, diasHastaFecha } from '@/lib/parseFecha'
import { paginarItems, paginarItemsCliente, distribuirFilasCliente } from '@/lib/paginarItems'
import { imagenAncho } from '@/lib/imagenes'

// Re-export por compatibilidad: las pantallas ya importaban paginarItems desde aquí.
export { paginarItems, paginarItemsCliente, distribuirFilasCliente, pesoItem, CAPACIDAD_HOJA_CONF } from '@/lib/paginarItems'

const LOGO_MANDARINA = '/logos/logo_mandarina.png'
const LOGO_INDSTORE  = '/logos/logo_indstore.png'

const CUPON = {
  MANDARINA: { codigo: 'MANDI',     url: 'https://www.mandarinaec.com?coupon=MANDI',    web: 'mandarinaec.com' },
  INDSTORE:  { codigo: 'INDLOVERS', url: 'https://indlovers.com/discount/INDLOVERS',     web: 'indlovers.com' },
}

const PAGE_W = 794
const PAGE_H = 1123

// Tope de texto por recuadro en la hoja de confección. La hoja tiene alto fijo
// con overflow:hidden, así que un texto sin límite se cortaba a media palabra y
// nadie se enteraba. Por encima de este tope se corta EXPLÍCITAMENTE, avisando a
// quien confecciona que hay más texto en el sistema.
const MAX_TEXTO_HOJA = 900

function recortarTexto(t) {
  const s = String(t || '')
  if (s.length <= MAX_TEXTO_HOJA) return { texto: s, recortado: false }
  return { texto: s.slice(0, MAX_TEXTO_HOJA).trimEnd() + '…', recortado: true }
}

function BloqueTexto({ valor, titulo, colorTitulo, fondo, borde }) {
  const { texto, recortado } = recortarTexto(valor)
  return (
    <div style={{ backgroundColor:fondo, borderRadius:'7px', padding:'7px 9px', border:`1px solid ${borde}`, marginBottom:'6px' }}>
      <div style={{ fontSize:'7px', color:colorTitulo, fontWeight:'800', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'3px' }}>{titulo}</div>
      <div style={{ fontSize:'10px', color:'#1a1a1a', lineHeight:1.5, fontWeight:'600' }}>{texto}</div>
      {recortado && (
        <div style={{ fontSize:'8px', color:'#b91c1c', fontWeight:'800', marginTop:'3px' }}>
          ⚠️ TEXTO RECORTADO — ver el detalle completo en el sistema
        </div>
      )}
    </div>
  )
}

/**
 * Una prenda en la hoja del cliente. En franja de ancho completo la foto y la
 * tipografía crecen; en media hoja se compacta para que la pareja calce pareja.
 */
function PrendaCliente({ item, numero, tiendaColor, anchoCompleto }) {
  const foto = anchoCompleto ? 92 : 72
  const instrucciones = item.DETALLE_PERSONALIZADO
    ? recortarTexto(item.DETALLE_PERSONALIZADO)
    : null

  return (
    <div style={{ backgroundColor:'#fafafa', borderRadius:'10px', border:'1px solid #e0e0e0', overflow:'hidden' }}>
      <div style={{ float:'left', padding: anchoCompleto ? '11px 12px 11px 12px' : '9px 9px 9px 10px' }}>
        {item.FOTO_PECHO_URL
          ? <img src={imagenAncho(item.FOTO_PECHO_URL, 400)} style={{ width:`${foto}px`, height:`${foto}px`, objectFit:'cover', borderRadius:'8px', border:'2px solid #e0e0e0', display:'block' }} alt="" />
          : <div style={{ width:`${foto}px`, height:`${foto}px`, backgroundColor:'#eee', borderRadius:'8px' }} />
        }
      </div>
      <div style={{ overflow:'hidden', padding: anchoCompleto ? '11px 14px 11px 0' : '9px 10px 9px 0' }}>
        <div style={{ overflow:'hidden', marginBottom:'5px' }}>
          <span style={{ float:'left', fontSize:'8px', fontWeight:'800', color:'#888', fontFamily:'monospace', lineHeight:'15px', marginRight:'6px' }}>#{numero}</span>
          <span style={{ float:'left', fontSize: anchoCompleto ? '13px' : '11px', fontWeight:'800', color:'#1a1a1a', lineHeight:1.25, maxWidth: anchoCompleto ? '430px' : '150px' }}>{item.PRODUCTO_NOMBRE}</span>
          <span style={{ float:'right', backgroundColor:tiendaColor+'18', borderRadius:'6px', padding:'2px 8px' }}>
            <span style={{ fontSize: anchoCompleto ? '13px' : '12px', fontWeight:'900', color:tiendaColor }}>x{item.CANTIDAD}</span>
          </span>
          <div style={{ clear:'both' }} />
        </div>
        <div style={{ marginBottom: instrucciones ? '6px' : '0' }}>
          {item.COLOR && (
            <span style={{ display:'inline-block', backgroundColor:'#fff', border:'1px solid #e0e0e0', borderRadius:'6px', padding:'3px 8px', marginRight:'5px', marginBottom:'3px' }}>
              <span style={{ fontSize:'8.5px', color:'#666' }}>Color </span>
              <span style={{ fontSize:'10px', fontWeight:'800', color:'#1a1a1a' }}>{item.COLOR}</span>
            </span>
          )}
          {item.TALLA && (
            <span style={{ display:'inline-block', backgroundColor:'#fff', border:'1px solid #e0e0e0', borderRadius:'6px', padding:'3px 8px', marginBottom:'3px' }}>
              <span style={{ fontSize:'8.5px', color:'#666' }}>Talla </span>
              <span style={{ fontSize:'10px', fontWeight:'800', color:'#1a1a1a' }}>{item.TALLA}</span>
            </span>
          )}
        </div>
        {instrucciones && (
          <div style={{ backgroundColor:'#fff8e1', borderRadius:'7px', padding:'6px 9px', border:'1px solid #ffe082' }}>
            <div style={{ fontSize:'7px', color:'#b45309', fontWeight:'800', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'3px' }}>📋 Instrucciones</div>
            <div style={{ fontSize:'9.5px', color:'#1a1a1a', lineHeight:1.45, fontWeight:'600' }}>{instrucciones.texto}</div>
            {instrucciones.recortado && <div style={{ fontSize:'8px', color:'#b91c1c', fontWeight:'800', marginTop:'2px' }}>⚠️ Texto recortado</div>}
          </div>
        )}
      </div>
      <div style={{ clear:'both' }} />
    </div>
  )
}

function Ficha({ label, value, color, big }) {
  return (
    <div style={{ backgroundColor:'#f5f5f5', borderRadius:'8px', padding:'8px 12px', border:'1px solid #e0e0e0', marginBottom:'6px', boxSizing:'border-box' }}>
      <div style={{ fontSize:'9px', color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'4px', fontWeight:'600' }}>{label}</div>
      <div style={{ fontSize: big ? '22px' : '13px', fontWeight:'900', color: color || '#1a1a1a', lineHeight:1.2, textAlign:'center' }}>{value}</div>
    </div>
  )
}

export function PdfGraciasPagina({
  pedido, items, filas, cliente, tiendaColor, offsetIdx = 0,
  esPrimera = true, esUltima = true, paginaActual = 1, totalPaginas = 1,
}) {
  // `filas` es lo que se pinta; si solo llega `items` se distribuyen aquí.
  filas = filas || distribuirFilasCliente(items)
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const esYaw       = pedido?.TIENDA_ID === 'YAW'
  const nombreCorto = cliente?.NOMBRE?.split(' ')[0] || 'Cliente'
  const logo = esMandarina ? LOGO_MANDARINA : LOGO_INDSTORE
  const cupon = esMandarina ? CUPON.MANDARINA : CUPON.INDSTORE
  const bgGradient = esMandarina
    ? 'linear-gradient(135deg, #c94800 0%, #e85d04 40%, #ff8c00 100%)'
    : 'linear-gradient(135deg, #6a0dad 0%, #c2185b 50%, #e91e8c 100%)'
  // Sobre TODAS las prendas del pedido, no solo las de esta hoja.
  const totalPrendas = (pedido?.items || items || []).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)

  return (
    <div style={{ fontFamily:"'Helvetica Neue',Arial,sans-serif", backgroundColor:'#fff', width:`${PAGE_W}px`, height:`${PAGE_H}px`, overflow:'hidden', position:'relative', boxSizing:'border-box' }}>

      {esPrimera ? (
      <div style={{ background:bgGradient, width:'100%', position:'relative', overflow:'hidden', padding:'32px 48px', boxSizing:'border-box' }}>
        <div style={{ position:'absolute', top:'-80px', right:'-80px', width:'280px', height:'280px', borderRadius:'50%', backgroundColor:'rgba(0,0,0,0.12)' }} />
        <div style={{ position:'absolute', bottom:'-60px', left:'30%', width:'200px', height:'200px', borderRadius:'50%', backgroundColor:'rgba(255,255,255,0.06)' }} />
        <div style={{ position:'relative', zIndex:2, overflow:'hidden' }}>
          <div style={{ float:'left', width:'140px', marginRight:'20px' }}>
            {esYaw
              ? <div style={{ width:'140px', height:'140px', backgroundColor:'#fff', borderRadius:'16px', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.2)' }}>
                  <span style={{ fontSize:'52px', fontWeight:'900', color:'#1a1a1a', letterSpacing:'-2px' }}>YAW</span>
                </div>
              : <img src={logo} style={{ width:'140px', height:'140px', objectFit:'contain', display:'block' }} alt="logo" />
            }
          </div>
          <div style={{ float:'right', width:'210px' }}>
            {esYaw
              ? <div style={{ backgroundColor:'#fff', borderRadius:'16px', padding:'14px 16px', boxShadow:'0 8px 32px rgba(0,0,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', height:'140px', boxSizing:'border-box' }}>
                  <span style={{ fontSize:'64px', fontWeight:'900', color:'#1a1a1a', letterSpacing:'-3px' }}>YAW</span>
                </div>
              : <div style={{ backgroundColor:'#fff', borderRadius:'16px', padding:'14px 16px', position:'relative', boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}>
                  <div style={{ position:'absolute', left:'-9px', top:'50%', marginTop:'-9px', width:'18px', height:'18px', borderRadius:'50%', backgroundColor:esMandarina?'#c94800':'#6a0dad' }} />
                  <div style={{ position:'absolute', right:'-9px', top:'50%', marginTop:'-9px', width:'18px', height:'18px', borderRadius:'50%', backgroundColor:esMandarina?'#c94800':'#6a0dad' }} />
                  <div style={{ fontSize:'10px', color:'#1a1a1a', marginBottom:'4px', fontWeight:'600' }}>🎁 Tenemos un regalo para ti:</div>
                  <div style={{ fontSize:'12px', fontWeight:'800', color:'#1a1a1a', marginBottom:'4px', lineHeight:1.3 }}>10% de descuento en tu próxima compra</div>
                  <div style={{ fontSize:'10px', color:'#1a1a1a', marginBottom:'8px' }}>Cupón <strong>{cupon.codigo}</strong> en {cupon.web}</div>
                  <div style={{ borderTop:'1.5px dashed #ccc', marginBottom:'8px' }} />
                  <div style={{ textAlign:'center', marginBottom:'4px' }}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(cupon.url)}&color=1a1a1a&bgcolor=ffffff&margin=2`}
                      style={{ width:'80px', height:'80px', borderRadius:'6px', display:'inline-block' }} alt="QR" />
                  </div>
                  <div style={{ fontSize:'9px', color:'#1a1a1a', textAlign:'center' }}>↗ Escanea para tu descuento</div>
                </div>
            }
          </div>
          <div style={{ overflow:'hidden' }}>
            <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.85)', textTransform:'uppercase', letterSpacing:'3px', marginBottom:'6px', fontWeight:'700' }}>{esMandarina?'MANDARINA REPUBLIC':esYaw?'YAW':'INDSTORE'}</div>
            <div style={{ fontSize:'38px', fontWeight:'900', color:'#fff', lineHeight:1.05, marginBottom:'10px', letterSpacing:'-1px', textShadow:'0 2px 8px rgba(0,0,0,0.35)' }}>
              ¡Gracias,<br />{nombreCorto}!
            </div>
            <div style={{ backgroundColor:'rgba(0,0,0,0.28)', borderRadius:'10px', padding:'10px 14px', maxWidth:'240px' }}>
              <div style={{ fontSize:'11px', color:'#fff', lineHeight:1.6, fontWeight:'500' }}>
                {esMandarina ? 'Tu pedido fue confeccionado con mucho cariño. Esperamos que lo disfrutes.' : 'Tu pedido fue preparado especialmente para ti. ¡Gracias por elegirnos!'}
              </div>
            </div>
          </div>
          <div style={{ clear:'both' }} />
        </div>
      </div>
      ) : (
        // Hojas de continuación: cabecera compacta, sin repetir saludo ni cupón.
        <div style={{ borderBottom:`4px solid ${tiendaColor}`, padding:'14px 48px', backgroundColor:'#fafafa', overflow:'hidden', boxSizing:'border-box' }}>
          {!esYaw && <img src={logo} style={{ float:'left', width:'34px', height:'34px', objectFit:'contain', marginRight:'12px' }} alt="logo" />}
          <div style={{ float:'left' }}>
            <div style={{ fontSize:'8px', color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'2px', fontWeight:'700', marginBottom:'2px' }}>Detalle de tu pedido — continuación</div>
            <div style={{ fontSize:'18px', fontWeight:'900', color:'#1a1a1a', fontFamily:'monospace', lineHeight:1 }}>{pedido?.PEDIDO_ID}</div>
          </div>
          <div style={{ clear:'both' }} />
        </div>
      )}

      <div style={{ borderTop:'1.5px dashed #ccc' }} />

      <div style={{ padding: esPrimera ? '18px 48px 16px' : '14px 48px 16px', boxSizing:'border-box' }}>
        {esPrimera && (
        <div style={{ backgroundColor:'#fff', borderRadius:'14px', padding:'14px 18px', marginBottom:'14px', border:'2px solid #e0e0e0' }}>
          <div style={{ overflow:'hidden', marginBottom:'8px' }}>
            <span style={{ float:'left', fontSize:'10px', color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'2px', lineHeight:'24px', fontWeight:'700' }}>Datos de envío</span>
            <span style={{ float:'right', fontSize:'14px', fontWeight:'900', fontFamily:'monospace', color:'#1a1a1a', letterSpacing:'0.5px', lineHeight:'24px', backgroundColor:'#f0f0f0', padding:'4px 12px', borderRadius:'8px', border:'1.5px solid #ccc' }}>{pedido?.PEDIDO_ID||''}</span>
            <div style={{ clear:'both' }} />
          </div>
          <div style={{ fontSize:'22px', fontWeight:'900', color:'#1a1a1a', marginBottom:'10px', lineHeight:1.1, textAlign:'center' }}>{cliente?.NOMBRE||'-'}</div>
          <div style={{ overflow:'hidden', marginBottom:'10px' }}>
            {cliente?.CELULAR && (
              <div style={{ float:'left', marginRight:'12px', backgroundColor:'#f5f5f5', borderRadius:'10px', padding:'10px 16px 10px 12px', border:'1px solid #e0e0e0' }}>
                <div style={{ fontSize:'8px', color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'4px', fontWeight:'700' }}>📱 Celular</div>
                <div style={{ fontSize:'15px', fontWeight:'800', color:'#1a1a1a', fontFamily:'monospace' }}>{cliente.CELULAR}</div>
              </div>
            )}
            {cliente?.CEDULA && (
              <div style={{ float:'left', backgroundColor:'#f5f5f5', borderRadius:'10px', padding:'10px 16px 10px 12px', border:'1px solid #e0e0e0' }}>
                <div style={{ fontSize:'8px', color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'4px', fontWeight:'700' }}>🆔 Cédula</div>
                <div style={{ fontSize:'15px', fontWeight:'800', color:'#1a1a1a', fontFamily:'monospace' }}>{cliente.CEDULA}</div>
              </div>
            )}
            <div style={{ clear:'both' }} />
          </div>
          {(pedido?.DIRECCION_TEXTO || pedido?.DIRECCION_PEDIDO) && (
            <div style={{ borderRadius:'10px', padding:'11px 14px', borderLeft:`4px solid ${tiendaColor}` }}>
              <div style={{ fontSize:'8px', color:tiendaColor, textTransform:'uppercase', letterSpacing:'1px', marginBottom:'4px', fontWeight:'700' }}>Dirección de entrega</div>
              {/* pre-line: la dirección se escribe con un formato de varias líneas
                  (CIUDAD / calle principal / secundaria / referencia). Antes se
                  aplastaba a un renglón con ' · ' y era ilegible para el repartidor. */}
              <div style={{ fontSize:'13px', color:'#1a1a1a', fontWeight:'600', lineHeight:1.4, whiteSpace:'pre-line' }}>{pedido.DIRECCION_TEXTO||pedido.DIRECCION_PEDIDO}</div>
            </div>
          )}
        </div>
        )}

        <div style={{ fontSize:'10px', color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:'8px', fontWeight:'700' }}>
          {esPrimera ? `Contenido · ${totalPrendas} prenda(s)` : 'Contenido (continuación)'}
        </div>

        {/* Filas de 1 o 2 prendas (ver distribuirFilasCliente): sola = franja de
            ancho completo, en pareja = media hoja cada una.
            A propósito NO se muestran estado, área ni casillas de control: eso es
            información interna de la fábrica, no del cliente. */}
        {(filas || []).map((fila, fIdx) => {
          const anchoCompleto = fila.length === 1
          const idxBase = offsetIdx + filas.slice(0, fIdx).reduce((s, f) => s + f.length, 0)
          return (
            <div key={fIdx} style={{ overflow:'hidden', marginBottom:'8px' }}>
              {fila.map((item, ci) => (
                <div key={ci} style={{
                  float:'left',
                  width: anchoCompleto ? '100%' : '50%',
                  paddingRight: (!anchoCompleto && ci === 0) ? '7px' : '0',
                  boxSizing:'border-box',
                }}>
                  <PrendaCliente item={item} numero={idxBase + ci + 1}
                    tiendaColor={tiendaColor} anchoCompleto={anchoCompleto} />
                </div>
              ))}
              <div style={{ clear:'both' }} />
            </div>
          )
        })}

        {esUltima && (() => {
          const total = parseFloat(pedido?.MONTO_TOTAL||0)
          const abonado = parseFloat(pedido?.MONTO_ABONADO||0)
          const saldo = total - abonado
          const pct = total > 0 ? Math.round((abonado/total)*100) : 100
          const isPagado = pedido?.ESTADO_PAGO === 'PAGADO' || saldo < 0.01
          return (
            <div style={{ marginTop:'10px', padding:'10px 14px', borderRadius:'10px', backgroundColor:isPagado?'#dcfce7':'#fee2e2', border:`2px solid ${isPagado?'#86efac':'#fca5a5'}`, overflow:'hidden' }}>
              <span style={{ float:'left', fontSize:'20px', lineHeight:'28px', marginRight:'10px' }}>{isPagado?'✅':'🔴'}</span>
              <div style={{ overflow:'hidden' }}>
                {isPagado
                  ? <div style={{ fontSize:'13px', fontWeight:'800', color:'#15803d', lineHeight:'28px' }}>PAGO COMPLETO</div>
                  : <><div style={{ fontSize:'12px', fontWeight:'800', color:'#b91c1c' }}>ABONO DEL {pct}% — SALDO PENDIENTE</div><div style={{ fontSize:'11px', color:'#b91c1c', marginTop:'2px', fontWeight:'700' }}>Cobrar ${saldo.toFixed(2)} al motorizado</div></>
                }
              </div>
              {!isPagado && total > 0 && (
                <div style={{ float:'right', textAlign:'right' }}>
                  <div style={{ fontSize:'10px', color:'#1a1a1a', marginBottom:'2px', fontWeight:'600' }}>Total</div>
                  <div style={{ fontSize:'15px', fontWeight:'900', color:'#1a1a1a' }}>${total.toFixed(2)}</div>
                </div>
              )}
              <div style={{ clear:'both' }} />
            </div>
          )
        })()}
      </div>

      <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'9px 48px', backgroundColor:'#f5f5f5', borderTop:'1px solid #e0e0e0', overflow:'hidden', boxSizing:'border-box' }}>
        <span style={{ float:'left', fontSize:'9px', color:'#1a1a1a', fontWeight:'600' }}>
          {pedido?.PEDIDO_ID}
          {totalPaginas > 1 && <span style={{ marginLeft:'8px', color:tiendaColor, fontWeight:'800' }}>p.{paginaActual}/{totalPaginas}</span>}
        </span>
        <span style={{ float:'right', fontSize:'9px', color:'#1a1a1a', fontWeight:'600' }}>{esMandarina?'MANDARINA REPUBLIC':esYaw?'YAW':'INDSTORE'}</span>
        <div style={{ clear:'both' }} />
      </div>

    </div>
  )
}

/**
 * Hoja(s) del cliente. Se pagina igual que la de confección: con muchas prendas
 * (ahora que cada una lleva su detalle e instrucciones) una sola hoja recortaba
 * el contenido sin avisar.
 *
 * Para generar el PDF NO se usa este componente sino PdfGraciasPagina, un div
 * atómico por hoja — si no, html2canvas captura todas apiladas y las aplasta en
 * una sola A4. Esto es para el preview en pantalla.
 */
export function PdfGracias({ pedido, items, cliente, tiendaColor }) {
  const paginas = paginarItemsCliente(items)
  return (
    <>
      {paginas.map((pag, i) => (
        <PdfGraciasPagina key={i} pedido={pedido} items={pag.items} filas={pag.filas} cliente={cliente}
          tiendaColor={tiendaColor} offsetIdx={pag.offset}
          esPrimera={i === 0} esUltima={i === paginas.length - 1}
          paginaActual={i + 1} totalPaginas={paginas.length} />
      ))}
    </>
  )
}

export function PdfConfeccionPagina({ pedido, items, tiendaColor, paginaActual, totalPaginas, offsetIdx }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const esYaw       = pedido?.TIENDA_ID === 'YAW'
  const logo = esMandarina ? LOGO_MANDARINA : LOGO_INDSTORE
  // La entrega es una FECHA, no un instante: Supabase la guarda a medianoche UTC
  // y leerla como instante la corría un día hacia atrás en la hoja impresa.
  const entrega = parseFechaCalendario(pedido?.FECHA_ENTREGA_PROMETIDA)
  // Días de calendario completos, no diferencia de instantes (que dependía de la
  // hora a la que se imprimiera la hoja).
  const diasRestantes = diasHastaFecha(entrega)
  const urgente = diasRestantes !== null && diasRestantes <= 2
  const totalPrendas = (pedido?.items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)
  const areas = [...new Set((pedido?.items||[]).map(i=>i.AREA).filter(Boolean))].join(', ') || '—'

  return (
    <div style={{ fontFamily:"'Helvetica Neue',Arial,sans-serif", backgroundColor:'#fff', width:`${PAGE_W}px`, height:`${PAGE_H}px`, overflow:'hidden', position:'relative', boxSizing:'border-box' }}>

      <div style={{ borderBottom:`4px solid ${tiendaColor}`, padding:'10px 48px', backgroundColor:'#fafafa', overflow:'hidden', boxSizing:'border-box' }}>
        <div style={{ float:'left', overflow:'hidden' }}>
          {esYaw
            ? <div style={{ float:'left', width:'40px', height:'40px', backgroundColor:'#fff', border:'2px solid #e0e0e0', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', marginRight:'10px', marginTop:'4px', boxSizing:'border-box' }}>
                <span style={{ fontSize:'13px', fontWeight:'900', color:'#1a1a1a', letterSpacing:'-0.5px' }}>YAW</span>
              </div>
            : <img src={logo} style={{ float:'left', width:'40px', height:'40px', objectFit:'contain', marginRight:'10px', marginTop:'4px' }} alt="logo" />
          }
          <div style={{ float:'left' }}>
            <div style={{ fontSize:'8px', color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'2px', marginBottom:'3px', fontWeight:'700' }}>Orden de Producción Interna</div>
            <div style={{ fontSize:'22px', fontWeight:'900', color:'#1a1a1a', fontFamily:'monospace', letterSpacing:'-0.5px', lineHeight:1 }}>{pedido?.PEDIDO_ID}</div>
          </div>
          <div style={{ clear:'both' }} />
        </div>
        <div style={{ float:'right', textAlign:'right' }}>
          {urgente && <div style={{ display:'inline-block', backgroundColor:'#ef4444', color:'#fff', fontSize:'10px', fontWeight:'800', padding:'3px 10px', borderRadius:'20px', marginBottom:'3px', textTransform:'uppercase' }}>🚨 URGENTE</div>}
          {totalPaginas > 1 && <div style={{ display:'inline-block', backgroundColor:tiendaColor+'15', border:`1px solid ${tiendaColor}40`, borderRadius:'8px', padding:'3px 12px', marginBottom:'3px', marginLeft:'6px' }}><span style={{ fontSize:'10px', fontWeight:'800', color:tiendaColor }}>Pág. {paginaActual}/{totalPaginas}</span></div>}
          <div style={{ fontSize:'9px', color:'#1a1a1a', marginBottom:'1px', clear:'both', fontWeight:'600' }}>Entrega comprometida</div>
          <div style={{ fontSize:'13px', fontWeight:'700', color:urgente?'#ef4444':'#1a1a1a' }}>
            {entrega ? entrega.toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'}) : '—'}
          </div>
          {diasRestantes !== null && (
            <div style={{ fontSize:'9px', color:urgente?'#ef4444':'#1a1a1a', marginTop:'1px', fontWeight:'600' }}>
              {diasRestantes > 0 ? `${diasRestantes} día(s) restante(s)` : diasRestantes === 0 ? '¡ENTREGA HOY!' : `${Math.abs(diasRestantes)} día(s) de retraso`}
            </div>
          )}
        </div>
        <div style={{ clear:'both' }} />
      </div>

      {paginaActual === 1 && (
        <div style={{ backgroundColor:'#f0f0f0', padding:'5px 48px', borderBottom:'1px solid #d0d0d0', boxSizing:'border-box' }}>
          {[['VENDEDOR', pedido?.VENDEDOR_ID||'—'], ['PRENDAS', totalPrendas], ['ÁREAS', areas]].map(([k,v]) => (
            <span key={k} style={{ display:'inline-block', marginRight:'24px' }}>
              <span style={{ fontSize:'9px', color:'#1a1a1a', fontWeight:'700' }}>{k}: </span>
              <span style={{ fontSize:'10px', fontWeight:'900', color:'#1a1a1a' }}>{v}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ padding:'10px 48px 50px', boxSizing:'border-box', overflow:'hidden' }}>
        {(items||[]).map((item, idx) => {
          const globalIdx = offsetIdx + idx
          const fotos = [
            { url:item.FOTO_PECHO_URL,   label:'PECHO'   },
            { url:item.FOTO_ESPALDA_URL, label:'ESPALDA' },
            { url:item.FOTO_MANGA_D_URL, label:'M.DER'   },
            { url:item.FOTO_MANGA_I_URL, label:'M.IZQ'   },
          ].filter(f => f.url)

          const FOTO_SIZES = { 1:200, 2:175, 3:148, 4:134 }
          const fotoSizePx = FOTO_SIZES[fotos.length] || 134
          const fotoRows = fotos.length <= 2 ? [fotos] : fotos.length === 3 ? [fotos.slice(0,2), fotos.slice(2)] : [fotos.slice(0,2), fotos.slice(2,4)]

          return (
            <div key={idx} style={{ marginBottom:'10px', border:'2px solid #e0e0e0', borderRadius:'12px', overflow:'hidden' }}>

              <div style={{ borderBottom:`3px solid ${tiendaColor}`, padding:'7px 14px', overflow:'hidden', backgroundColor:'#fff' }}>
                <span style={{ float:'left' }}>
                  <span style={{ display:'inline-block', backgroundColor:tiendaColor, color:'#fff', fontSize:'11px', fontWeight:'900', padding:'3px 11px', borderRadius:'20px', marginRight:'10px', fontFamily:'monospace' }}>#{globalIdx+1}</span>
                  <span style={{ fontSize:'14px', fontWeight:'800', color:'#1a1a1a' }}>{item.PRODUCTO_NOMBRE}</span>
                </span>
                {item.AREA && <span style={{ float:'right', display:'inline-block', border:`2px solid ${tiendaColor}`, color:tiendaColor, fontSize:'11px', fontWeight:'800', padding:'3px 16px', borderRadius:'20px', textTransform:'uppercase', backgroundColor:'#fff', textAlign:'center' }}>{item.AREA}</span>}
                <div style={{ clear:'both' }} />
              </div>

              <div style={{ padding:'10px 14px', overflow:'hidden', boxSizing:'border-box' }}>
                <div style={{ float:'left', marginRight:'14px' }}>
                  {fotos.length > 0 ? (
                    <div>
                      {fotoRows.map((row, ri) => (
                        <div key={ri} style={{ overflow:'hidden', marginBottom:ri < fotoRows.length-1 ? '5px' : '0' }}>
                          {row.map((f, fi) => (
                            <div key={fi} style={{ float:'left', textAlign:'center', marginRight:fi < row.length-1 ? '5px' : '0' }}>
                              <img src={imagenAncho(f.url, 600)} style={{ width:`${fotoSizePx}px`, height:`${fotoSizePx}px`, objectFit:'cover', borderRadius:'8px', border:'2px solid #ddd', backgroundColor:'#f5f5f5', display:'block' }} />
                              <div style={{ fontSize:'8px', color:'#1a1a1a', marginTop:'3px', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:'700' }}>{f.label}</div>
                            </div>
                          ))}
                          <div style={{ clear:'both' }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ width:'160px', height:'160px', backgroundColor:'#f5f5f5', borderRadius:'10px', border:'2px dashed #ddd', textAlign:'center', paddingTop:'45px', boxSizing:'border-box' }}>
                      <div style={{ fontSize:'24px', marginBottom:'5px' }}>✏️</div>
                      <div style={{ fontSize:'9px', color:'#1a1a1a', fontWeight:'600' }}>Sin imágenes</div>
                    </div>
                  )}
                </div>

                <div style={{ overflow:'hidden' }}>
                  <div style={{ overflow:'hidden', marginBottom:'2px' }}>
                    <div style={{ float:'left', width:'48%', paddingRight:'4px', boxSizing:'border-box' }}>
                      <Ficha label="COLOR" value={item.COLOR||'—'} />
                    </div>
                    <div style={{ float:'right', width:'48%' }}>
                      <Ficha label="TALLA" value={item.TALLA||'—'} />
                    </div>
                    <div style={{ clear:'both' }} />
                    <div style={{ float:'left', width:'48%', paddingRight:'4px', boxSizing:'border-box' }}>
                      <Ficha label="CANTIDAD" value={item.CANTIDAD} color={tiendaColor} big />
                    </div>
                    <div style={{ float:'right', width:'48%' }}>
                      <Ficha label="ESTADO" value={item.SUBESTADO||'SOLICITADO'} />
                    </div>
                    <div style={{ clear:'both' }} />
                  </div>

                  {item.DETALLE_PERSONALIZADO && (
                    <BloqueTexto valor={item.DETALLE_PERSONALIZADO} titulo="📋 Instrucciones"
                      colorTitulo="#b45309" fondo="#fff8e1" borde="#ffe082" />
                  )}
                  {item.NOTAS_AREA && (
                    <BloqueTexto valor={item.NOTAS_AREA} titulo="📝 Nota de área"
                      colorTitulo="#1d4ed8" fondo="#eff6ff" borde="#bfdbfe" />
                  )}
                  {item.ARCHIVO_DISENO_URL && (
                    <div style={{ backgroundColor:'#f0fdf4', borderRadius:'7px', padding:'7px 9px', border:'1px solid #bbf7d0' }}>
                      <div style={{ fontSize:'7px', color:'#15803d', fontWeight:'800', marginBottom:'2px' }}>📎 Archivo AI/PSD</div>
                      <div style={{ fontSize:'8px', color:'#1a1a1a', wordBreak:'break-all', lineHeight:1.4, fontWeight:'600' }}>{item.ARCHIVO_DISENO_URL.split('/').pop()}</div>
                    </div>
                  )}
                </div>

                <div style={{ clear:'both' }} />
              </div>

              <div style={{ backgroundColor:'#f5f5f5', padding:'6px 14px', borderTop:'1px solid #e0e0e0', overflow:'hidden' }}>
                <span style={{ float:'left', fontSize:'7px', color:'#1a1a1a', fontWeight:'800', textTransform:'uppercase', lineHeight:'16px', marginRight:'12px' }}>Control</span>
                {['Confeccionado','Diseño aplicado','Revisado','Listo para despacho'].map(step => (
                  <span key={step} style={{ float:'left', marginRight:'14px', overflow:'hidden' }}>
                    <span style={{ float:'left', width:'13px', height:'13px', border:'2px solid #aaa', borderRadius:'3px', marginRight:'4px', marginTop:'1px', display:'block', boxSizing:'border-box' }} />
                    <span style={{ float:'left', fontSize:'8px', color:'#1a1a1a', lineHeight:'15px', fontWeight:'600' }}>{step}</span>
                  </span>
                ))}
                <div style={{ clear:'both' }} />
              </div>

            </div>
          )
        })}
      </div>

      <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'8px 48px', backgroundColor:'#f5f5f5', borderTop:'2px solid #e0e0e0', overflow:'hidden', boxSizing:'border-box' }}>
        <div style={{ float:'left', overflow:'hidden' }}>
          {esYaw
            ? <span style={{ float:'left', fontSize:'8px', color:'#1a1a1a', lineHeight:'22px', fontWeight:'900' }}>YAW</span>
            : <><img src={logo} style={{ float:'left', width:'18px', height:'18px', objectFit:'contain', opacity:0.6, marginRight:'7px', marginTop:'2px' }} alt="logo" />
               <span style={{ float:'left', fontSize:'8px', color:'#1a1a1a', lineHeight:'22px', fontWeight:'600' }}>{esMandarina?'MANDARINA REPUBLIC':'INDSTORE'}</span></>
          }
        </div>
        <span style={{ display:'block', textAlign:'center', fontSize:'8px', color:'#1a1a1a', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.5px', lineHeight:'22px' }}>USO INTERNO — NO INCLUYE PRECIOS</span>
        <span style={{ float:'right', fontSize:'8px', color:'#1a1a1a', lineHeight:'22px', fontWeight:'600' }}>
          {pedido?.PEDIDO_ID}{totalPaginas > 1 && <span style={{ marginLeft:'7px', color:tiendaColor, fontWeight:'700' }}>p.{paginaActual}/{totalPaginas}</span>}
        </span>
        <div style={{ clear:'both' }} />
      </div>

    </div>
  )
}

export function PdfConfeccion({ pedido, items, tiendaColor }) {
  const paginas = paginarItems(items)
  const total = paginas.length
  return (
    <>
      {paginas.map((pag, pIdx) => (
        <PdfConfeccionPagina key={pIdx} pedido={pedido} items={pag.items} tiendaColor={tiendaColor}
          paginaActual={pIdx+1} totalPaginas={total} offsetIdx={pag.offset} />
      ))}
    </>
  )
}
