// El recuadro del cupón de la hoja «¡Gracias!», convertido en la promo del
// seguimiento. Lo usan la página pública y la vista previa del CRM.
import s from './seguimiento.module.css'

export default function Promo({ promo, enCabecera = false }) {
  if (!promo) return null
  return (
    <div className={`${s.promo} ${enCabecera ? s.promoEnCabecera : ''}`}>
      <div className={s.promoTxt}>
        {promo.etiqueta && <div className={s.regalo}>{promo.etiqueta}</div>}
        <h3>{promo.titulo}</h3>
        {promo.texto && <p>{promo.texto}</p>}
      </div>
      {(promo.codigo || promo.link) && (
        <div className={s.promoAcc}>
          {promo.codigo && <div className={s.codigo}>{promo.codigo}</div>}
          {promo.link && <a href={promo.link} target="_blank" rel="noopener noreferrer">Ver la promo ↗</a>}
        </div>
      )}
    </div>
  )
}
