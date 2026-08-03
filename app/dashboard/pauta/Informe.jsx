'use client'
// El informe imprimible del tablero de pauta.
//
// Se imprime con el navegador (window.print → "Guardar como PDF") y no con
// jsPDF + html2canvas como el PDF del pedido. Ahí la diferencia importa: un
// informe de pauta puede tener decenas de anuncios, y capturarlo como imagen da
// un archivo enorme, borroso al ampliar y con el texto no seleccionable. La
// impresión nativa pagina sola y sale con texto de verdad.
//
// Va SIEMPRE en el DOM pero oculto (`hidden print:block`), y el resto de la
// pantalla se esconde al imprimir. Así lo que se imprime es esto y no lo que se
// ve — que está plegado en acordeones y no serviría de informe.
//
// Acá TODO va desplegado: campaña, conjunto y cada anuncio con su embudo
// completo. Es el "mayor detalle" que se pidió; en pantalla eso sería
// inmanejable, en papel es justo lo que se quiere revisar.
import { dinero, numero, veces } from './formato'

const PASOS = [
  ['impresiones', 'Impresiones'], ['clics', 'Clics'], ['llegaron', 'Escribieron'],
  ['respondieron', 'Respondieron'], ['conversaron', 'Conversaron'],
  ['pedidos', 'Compraron'], ['pagados', 'Cobrados'],
]

const ORIGENES = [
  ['digital_a_fisico', 'Digital a físico'], ['por_chat', 'Por chat'],
  ['cliente_de_paso', 'Cliente de paso'], ['mensaje_directo', 'Mensaje directo'],
  ['sin_rastro', 'Sin rastro'],
]

/** Una tira de embudo. Se repite en cada nivel para poder comparar de un vistazo. */
function Embudo({ x }) {
  return (
    <table className="w-full text-[9px] mt-1 mb-2" style={{ borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          {PASOS.map(([id, etq]) => (
            <td key={id} style={{ border: '1px solid #ddd', padding: '2px 4px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700 }}>{numero(x[id] || 0)}</div>
              <div style={{ color: '#777', fontSize: 8 }}>{etq}</div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

export default function Informe({ data, tienda, canalNombre }) {
  if (!data) return null
  const t = data.totales
  const o = data.origenes || {}

  return (
    // Fondo blanco y texto negro a la fuerza: la app es oscura y sin esto el PDF
    // sale con letras claras sobre blanco, ilegible.
    <div className="hidden print:block" style={{ background: '#fff', color: '#000', padding: 16, fontSize: 11 }}>
      <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Informe de pauta — {tienda}</h1>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 10 }}>
        {data.desde} al {data.hasta}
        {canalNombre ? ` · número: ${canalNombre}` : ' · los dos números'}
        {' · '}generado el {new Date().toLocaleString('es-EC')}
      </div>

      {data.gastoEsDeTodaLaTienda && (
        <div style={{ border: '1px solid #999', padding: 6, marginBottom: 10, fontSize: 9 }}>
          <b>Atención:</b> los chats y las ventas son solo del número elegido, pero el
          gasto es de toda la tienda — Meta no sabe a cuál número escribió cada
          persona. Sirve para comparar números entre sí, no para leer el ROAS de uno solo.
        </div>
      )}

      <h2 style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>Resumen</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <tbody>
          <tr>
            <Celda k="Gasto en Meta" v={dinero(t.gasto)} />
            <Celda k="Venta atribuida" v={dinero(t.ventaAtribuida)} />
            <Celda k="ROAS del CRM" v={veces(t.roasCrm)} />
            <Celda k="MER (toda la tienda)" v={veces(t.mer)} />
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: 12, fontWeight: 700, marginTop: 10 }}>Embudo total</h2>
      <Embudo x={data.embudo} />

      <h2 style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>De dónde salió cada venta</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <tbody>
          <tr>
            {ORIGENES.map(([id, etq]) => (
              <Celda key={id} k={etq}
                     v={o[id] ? `${numero(o[id].ventas)} · ${dinero(o[id].usd)}` : '0'} />
            ))}
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: 12, fontWeight: 700, marginTop: 12 }}>Detalle por anuncio</h2>
      {data.campanas.map((c) => (
        // break-inside: avoid → una campaña no se parte a la mitad entre dos
        // hojas si cabe entera. Es lo que hace que el PDF se pueda leer.
        <div key={c.campaignId} style={{ marginTop: 10, breakInside: 'avoid' }}>
          <div style={{ background: '#eee', padding: '3px 6px', fontWeight: 700, fontSize: 11 }}>
            {c.nombre} — {dinero(c.gasto)} · {numero(c.pedidos)} compraron
          </div>
          <Embudo x={c} />

          {c.conjuntos.map((cj) => (
            <div key={cj.adsetId} style={{ marginLeft: 10, marginTop: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 10, color: '#333' }}>
                {cj.nombre} — {dinero(cj.gasto)} · {numero(cj.pedidos)} compraron
              </div>
              <Embudo x={cj} />

              {cj.artes.map((a) => (
                <div key={a.adId} style={{ marginLeft: 10, marginTop: 4, breakInside: 'avoid',
                                           borderLeft: '2px solid #ccc', paddingLeft: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 600 }}>
                    {a.nombre}
                    {a.estado && a.estado !== 'ACTIVE' && (
                      <span style={{ color: '#777', fontWeight: 400 }}> · {a.estado}</span>
                    )}
                    {/* La señal más accionable del informe, en texto para que
                        sobreviva a una impresión en blanco y negro. */}
                    {a.gasto > 0 && a.pedidos === 0 && (
                      <span style={{ color: '#c00' }}> · SIN VENTAS</span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: '#555' }}>
                    {dinero(a.gasto)} gastado · {dinero(a.venta)} vendido · ROAS {veces(a.roasCrm)}
                    {a.costoPorConversacion != null && ` · ${dinero(a.costoPorConversacion)} por chat`}
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    {a.arteUrl && a.arteTipo !== 'video' && (
                      <img src={a.arteUrl} alt="" style={{ width: 70, border: '1px solid #ddd' }} />
                    )}
                    <div style={{ flex: 1 }}>
                      {a.arteTitular && <div style={{ fontSize: 9, fontWeight: 600 }}>{a.arteTitular}</div>}
                      {a.arteTexto && (
                        <div style={{ fontSize: 8, color: '#444', whiteSpace: 'pre-line' }}>
                          {String(a.arteTexto).slice(0, 300)}
                        </div>
                      )}
                      <Embudo x={a} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 14, fontSize: 8, color: '#777', borderTop: '1px solid #ccc', paddingTop: 4 }}>
        Venta = pedido creado, cobrado o no. El ROAS del CRM usa la venta atribuida
        a anuncios; el MER usa toda la venta de la tienda. Un gasto “s/d” significa
        que Meta no reportó gasto de ese anuncio, no que fuera gratis.
      </div>
    </div>
  )
}

const Celda = ({ k, v }) => (
  <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>
    <div style={{ fontSize: 9, color: '#666' }}>{k}</div>
    <div style={{ fontSize: 12, fontWeight: 700 }}>{v}</div>
  </td>
)
