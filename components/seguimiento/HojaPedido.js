// La hoja «¡Gracias!» del PDF del cliente (PdfGraciasPagina) para la web: mismos
// bloques, a una columna. Recibe SOLO la respuesta pública (ya tapada).
import s from './seguimiento.module.css'
import Promo from './Promo'
import { ETAPAS_CLIENTE } from '@/lib/etapaCliente'
import { formatDiaMes } from '@/lib/parseFecha'
import { imagenAncho } from '@/lib/imagenes'

export const WA = 'https://wa.me/593983745757'
export const waCon = (texto) => `${WA}?text=${encodeURIComponent(texto)}`

function Avance({ p }) {
  if (p.cancelado) {
    return (
      <div className={s.avance}>
        <div className={s.avanceCab}><span className={s.etiqueta}>Estado de tu pedido</span><span className={s.idpedido}>{p.pedidoId}</span></div>
        <p className={s.avanceMsg}>Este pedido fue cancelado. Si tienes dudas, escríbenos.</p>
      </div>
    )
  }
  const msg = p.etapa === 3 && p.guia
    ? `${ETAPAS_CLIENTE[3].mensaje} Guía ${p.guia.transportista} ${p.guia.numero}.`.replace('  ', ' ')
    : ETAPAS_CLIENTE[p.etapa].mensaje
  return (
    <div className={s.avance} aria-label="Avance del pedido">
      <div className={s.avanceCab}><span className={s.etiqueta}>Estado de tu pedido</span><span className={s.idpedido}>{p.pedidoId}</span></div>
      <ol className={s.pasos}>
        {ETAPAS_CLIENTE.map((e, k) => {
          const cls = k < p.etapa ? s.hecho : k === p.etapa ? s.actual : ''
          return (
            <li key={e.nombre} className={`${s.paso} ${cls}`} aria-current={k === p.etapa ? 'step' : undefined}>
              <span className={s.punto}>{k < p.etapa ? '✓' : ''}</span>
              <span className={s.pasoNom}>{e.nombre}</span>
              <span className={s.pasoFecha}>{formatDiaMes(p.fechas?.[k])}</span>
            </li>
          )
        })}
      </ol>
      <p className={s.avanceMsg}>{msg}</p>
    </div>
  )
}

export default function HojaPedido({ p, promo, onVolver }) {
  const totalPrendas = p.prendas.reduce((n, i) => n + i.cantidad, 0)
  return (
    <section className={s.hoja}>
      <div className={s.cabecera}>
        <div className={s.cabFila}>
          <img src="/logos/logo_mandarina_240.png" alt="Mandarina Republic" />
          <div className={s.cabTxt}>
            <div className={s.marca}>Mandarina Republic</div>
            <h1 className={s.saludo}>¡Hola,<br />{p.primerNombre || 'cliente'}!</h1>
          </div>
        </div>
        <div className={s.cabNota}>Tu pedido se está confeccionando con mucho cariño. Aquí puedes ver en qué va.</div>
        {promo && <Promo promo={promo} enCabecera />}
      </div>
      <div className={s.cortePunteado} />

      <div className={s.cuerpo}>
        <button type="button" className={s.volver} onClick={onVolver}>← Consultar otro pedido</button>
        <Avance p={p} />

        {p.saldoPendiente ? (
          <div className={s.saldo}>
            <span aria-hidden="true">🔴</span>
            <div>
              <h3>Tu pedido tiene un saldo pendiente de pago</h3>
              <p>Escríbenos por WhatsApp para completarlo antes del despacho.</p>
              <a className={`${s.btn} ${s.btnWa}`} target="_blank" rel="noopener noreferrer"
                href={waCon(`Hola, quiero completar el pago del pedido ${p.pedidoId}`)}>💬 Completar mi pago por WhatsApp</a>
            </div>
          </div>
        ) : (
          <div className={s.pagado}><span aria-hidden="true">✅</span>PAGO COMPLETO</div>
        )}

        <div className={s.datos}>
          <span className={s.etiqueta}>Datos de envío</span>
          <p className={s.nombre}>{p.nombre}</p>
          <div className={s.fichas}>
            {p.celular && <div className={s.ficha}><div className={s.etiqueta}>📱 Celular</div><div className={s.fichaValor}>{p.celular}</div></div>}
            {p.cedula && <div className={s.ficha}><div className={s.etiqueta}>🆔 Cédula</div><div className={s.fichaValor}>{p.cedula}</div></div>}
            {p.ciudad && <div className={s.ficha}><div className={s.etiqueta}>📍 Ciudad</div><div>{p.ciudad}</div></div>}
          </div>
          <p className={s.notaPriv}>Por tu seguridad tapamos parte de tu cédula y no mostramos tu dirección.</p>
        </div>

        <div>
          <div className={s.etiqueta} style={{ marginBottom: 8 }}>Contenido · {totalPrendas} {totalPrendas === 1 ? 'prenda' : 'prendas'}</div>
          <div className={s.prendas}>
            {p.prendas.map((i, k) => (
              <div key={k} className={s.prenda}>
                {i.foto
                  ? <img className={s.prendaFoto} src={imagenAncho(i.foto, 400)} alt={`Foto de ${i.nombre}`} loading="lazy" />
                  : <div className={s.prendaFoto} />}
                <div className={s.prendaInfo}>
                  <div className={s.prendaTit}>
                    <span className={s.prendaNum}>#{k + 1}</span>
                    <span className={s.prendaNom}>{i.nombre}</span>
                    <span className={s.cant}>x{i.cantidad}</span>
                  </div>
                  {i.color && <span className={s.chip}><small>Color </small>{i.color}</span>}
                  {i.talla && <span className={s.chip}><small>Talla </small>{i.talla}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={s.duda}>
          <div><h3>¿Tienes alguna duda?</h3><p>Escríbenos y te respondemos por WhatsApp.</p></div>
          <a className={`${s.btn} ${s.btnWa}`} target="_blank" rel="noopener noreferrer"
            href={waCon(`Hola, tengo una duda sobre mi pedido ${p.pedidoId}`)}>💬 Escríbenos por WhatsApp</a>
        </div>
      </div>
      <div className={s.pie}><span>{p.pedidoId}</span><span>MANDARINA REPUBLIC</span></div>
    </section>
  )
}
