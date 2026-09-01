'use client'
import { useMemo, useRef, useState } from 'react'
import {
  alturaBarra, capitalizar, formatoMonto, indicesEje, indicesEtiquetados, maxSerie,
  topeDeEscala, totalSerie,
} from '@/lib/grafico'

// Grafico de barras de UNA sola serie (dinero por periodo).
//
// Decisiones que NO son de gusto:
//  · Una serie ⇒ UN color. Pintar cada barra mas oscura cuanto mas vende
//    duplica en el color lo que ya dice el alto y no agrega informacion.
//  · La rejilla y los ejes son lineas solidas de un tono sobre el fondo. Nada
//    punteado: el punteado se lee como "proyeccion" o "umbral", y esto es una
//    rejilla.
//  · El numero NO va sobre cada barra (con 31 dias es ruido ilegible): se
//    etiqueta el maximo, el eje pone las fechas y el resto lo da el globo.
//  · El globo NUNCA es la unica forma de leer un valor — por eso el boton
//    "Tabla", que es ademas la salida accesible.
//
// El area sensible es la COLUMNA COMPLETA, no la barra: con 31 dias cada
// columna mide ~11px de ancho, pero 156px de alto. Apuntar a la barra de un dia
// flojo (3px de alto) seria imposible.
export default function GraficoBarras({
  titulo,
  descripcion,
  serie,
  nota,
  color = '#FF6B00',
  alto = 156,
  vacio = 'Sin ventas en este periodo',
  // Cuando se pasa `onSeleccionar`, cada barra se vuelve un boton de verdad:
  // sirve de MANDO (el historico por mes elige que mes pinta el diario). Sin
  // ella las columnas siguen siendo divs, para no meter 31 paradas de tabulador
  // en un grafico que no se puede clicar.
  onSeleccionar = null,
  seleccionada = null,
}) {
  const [activo, setActivo] = useState(null)
  const [tabla, setTabla] = useState(false)
  const cajaRef = useRef(null)

  const puntos = serie || []
  const n = puntos.length
  const max = useMemo(() => maxSerie(puntos), [puntos])
  // Contra esto se miden las barras: el maximo mas la cabecera de su etiqueta.
  const tope = useMemo(() => topeDeEscala(puntos), [puntos])
  const total = useMemo(() => totalSerie(puntos), [puntos])
  const etiquetados = useMemo(() => new Set(indicesEtiquetados(puntos)), [puntos])
  const enEje = useMemo(() => new Set(indicesEje(n)), [n])
  const p = activo != null ? puntos[activo] : null

  // Alineacion horizontal del globo y de la etiqueta: pegados al borde cuando
  // la barra esta en una punta, para que no se salgan de la tarjeta.
  const centro = (i) => ((i + 0.5) / n) * 100
  const alinear = (i) => {
    const c = centro(i)
    return c < 18 ? '0%' : c > 82 ? '-100%' : '-50%'
  }

  function teclas(e) {
    if (!n) return
    if (e.key === 'ArrowRight') { e.preventDefault(); setActivo((a) => Math.min(n - 1, (a ?? -1) + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActivo((a) => Math.max(0, (a ?? n) - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActivo(0) }
    else if (e.key === 'End') { e.preventDefault(); setActivo(n - 1) }
    else if (e.key === 'Escape') { setActivo(null) }
  }

  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold text-white text-sm truncate min-w-0">{titulo}</h3>
        <button
          type="button"
          onClick={() => setTabla((v) => !v)}
          aria-pressed={tabla}
          className="text-[11px] px-2 py-1 rounded-lg border border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700 transition-all flex-shrink-0"
        >
          {tabla ? 'Gráfico' : 'Tabla'}
        </button>
      </div>

      {/* El periodo va PEGADO al numero: "Ventas por mes" con un $42.587 suelto
          debajo se lee como el monto de UN mes, no como el acumulado. */}
      <div className="flex items-baseline gap-1.5 mb-3 min-w-0">
        <span className="text-xl font-bold font-display text-white">{formatoMonto(total)}</span>
        {descripcion && <span className="text-xs text-gray-600 truncate">· {descripcion}</span>}
      </div>

      {n === 0 || max <= 0 ? (
        <div className="flex items-center justify-center text-gray-600 text-xs" style={{ height: alto }}>
          {vacio}
        </div>
      ) : tabla ? (
        <div className="overflow-y-auto" style={{ maxHeight: alto + 26 }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="text-gray-500 text-left">
                <th className="font-medium py-1">Periodo</th>
                <th className="font-medium py-1 text-right">Ventas</th>
                <th className="font-medium py-1 text-right">Pedidos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {puntos.map((d) => (
                <tr key={d.clave} className={d.actual ? 'text-mandarina-400' : 'text-gray-300'}>
                  <td className="py-1">{capitalizar(d.etiquetaLarga)}{d.parcial ? ' *' : ''}</td>
                  <td className="py-1 text-right tabular-nums">{formatoMonto(d.monto)}</td>
                  <td className="py-1 text-right tabular-nums text-gray-500">{d.pedidos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div
            ref={cajaRef}
            tabIndex={0}
            role="group"
            aria-label={`${titulo}. Usa las flechas para recorrer las barras.`}
            onKeyDown={teclas}
            onMouseLeave={() => setActivo(null)}
            onBlur={(e) => { if (!cajaRef.current?.contains(e.relatedTarget)) setActivo(null) }}
            className="relative outline-none focus-visible:ring-1 focus-visible:ring-mandarina-500/50 rounded-lg"
            style={{ height: alto }}
          >
            {/* Rejilla: la base (el eje) y una linea a media altura, solidas y
                un tono sobre el fondo. Nada punteado: el punteado se lee como
                "umbral" o "proyeccion". Y no hay linea en el techo porque ahi
                arriba va la cabecera de las etiquetas, no un valor. */}
            {[50, 100].map((y) => (
              <div key={y} className="absolute inset-x-0 border-t border-gray-800" style={{ top: `${y}%` }} aria-hidden="true" />
            ))}

            {/* Sin marca de escala en el tope: la barra mas alta SIEMPRE lleva
                su numero encima, asi que una escala arriba repetiria ese mismo
                valor dos veces en la misma tarjeta. */}

            <div className="absolute inset-0 flex items-end gap-[2px]">
              {puntos.map((d, i) => {
                const h = alturaBarra(d.monto, tope)
                const apagada = activo != null && activo !== i
                const marcada = seleccionada != null && d.clave === seleccionada
                const Columna = onSeleccionar ? 'button' : 'div'
                return (
                  <Columna
                    key={d.clave}
                    {...(onSeleccionar
                      ? { type: 'button', onClick: () => onSeleccionar(d.clave), 'aria-pressed': marcada,
                          title: `${d.etiquetaLarga}: ${formatoMonto(d.monto)}` }
                      : {})}
                    onMouseEnter={() => setActivo(i)}
                    // ⚠️ La marca del elegido NO puede ser un fondo que suba
                    // por toda la columna: se lee como una BARRA FANTASMA más
                    // alta que la real (con septiembre en $0 era descarado).
                    // Va abajo, bajo el eje, como una pestaña.
                    className={`flex-1 min-w-0 h-full flex items-end rounded-t ${onSeleccionar ? 'cursor-pointer hover:bg-gray-800/40' : 'cursor-default'}`}
                  >
                    <div
                      className="w-full transition-opacity duration-100"
                      style={{
                        height: d.monto > 0 ? `max(3px, ${h}%)` : '2px',
                        borderRadius: '4px 4px 0 0',
                        // Un dia sin ventas deja una marca gris al ras del eje.
                        // Sin ella, "no vendi nada" y "ese dia no existe" se ven
                        // exactamente igual.
                        backgroundColor: d.monto > 0 ? color : '#374151',
                        opacity: apagada ? 0.35 : d.parcial ? 0.55 : 1,
                      }}
                    />
                  </Columna>
                )
              })}
            </div>

            {/* Etiquetas directas: el maximo (o todas, si son pocas barras). */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              {puntos.map((d, i) => (etiquetados.has(i) ? (
                <span
                  key={d.clave}
                  className="absolute text-[10px] text-gray-400 tabular-nums whitespace-nowrap"
                  style={{
                    left: `${centro(i)}%`,
                    bottom: `calc(${alturaBarra(d.monto, tope)}% + 3px)`,
                    transform: `translateX(${alinear(i)})`,
                  }}
                >
                  {formatoMonto(d.monto)}
                </span>
              ) : null))}
            </div>

            {/* Globo. Se va abajo cuando la barra es alta para no taparla. */}
            {p && (
              <div
                role="status"
                className="absolute z-10 pointer-events-none bg-gray-950/95 border border-gray-700 rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
                style={{
                  left: `${centro(activo)}%`,
                  transform: `translateX(${alinear(activo)})`,
                  ...(alturaBarra(p.monto, tope) > 58 ? { bottom: 4 } : { top: 4 }),
                }}
              >
                <div className="text-[11px] text-gray-400">
                  {capitalizar(p.etiquetaLarga)}
                  {p.parcial === 'curso' && <span className="text-mandarina-500"> · en curso</span>}
                  {p.parcial === 'inicio' && <span className="text-mandarina-500"> · mes parcial</span>}
                </div>
                <div className="text-sm font-semibold text-white tabular-nums">{formatoMonto(p.monto)}</div>
                <div className="text-[11px] text-gray-500 tabular-nums">{p.pedidos} pedido{p.pedidos === 1 ? '' : 's'}</div>
              </div>
            )}
          </div>

          {/* El eje X va FUERA del alto del area de barras: si compartieran un
              contenedor de alto fijo, las fechas quedarian recortadas. */}
          <div className="flex gap-[2px] mt-1.5" aria-hidden="true">
            {puntos.map((d, i) => (
              <div key={d.clave} className="flex-1 min-w-0 text-center">
                {/* El subrayado grueso marca el periodo ELEGIDO; el color solo,
                    el periodo actual. Dos señales distintas para dos cosas
                    distintas: en el histórico pueden coincidir o no. */}
                <div className={`h-0.5 rounded-full mb-1 ${d.clave === seleccionada ? 'bg-mandarina-500' : 'bg-transparent'}`} />
                {enEje.has(i) && (
                  <span className={`text-[10px] tabular-nums ${
                    d.clave === seleccionada ? 'text-mandarina-400 font-bold'
                      : d.actual ? 'text-mandarina-400 font-medium' : 'text-gray-600'}`}>
                    {d.etiqueta}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {nota && <p className="text-[11px] text-gray-600 mt-2.5 leading-snug">{nota}</p>}
    </div>
  )
}
