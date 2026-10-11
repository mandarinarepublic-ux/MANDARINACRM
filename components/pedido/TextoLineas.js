import { lineasDeTexto } from '@/lib/direccionPedido'

// Pinta un texto libre respetando sus saltos de línea. html2canvas no respeta
// `white-space: pre-line` de forma confiable, así que cada línea va en su propio
// bloque (las vacías con alto mínimo para conservar el espacio).
export default function TextoLineas({ texto, style }) {
  const lineas = lineasDeTexto(texto)
  return (
    <div style={style}>
      {lineas.map((l, i) => (
        <div key={i} style={{ minHeight: l.trim() === '' ? '1em' : undefined, wordBreak: 'break-word' }}>
          {l.trim() === '' ? ' ' : l}
        </div>
      ))}
    </div>
  )
}
