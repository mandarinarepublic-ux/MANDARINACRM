'use client'
import { useMemo } from 'react'
import GraficoBarras from '@/components/GraficoBarras'
import { serieDias, serieMeses, notaMeses, etiquetaMesLarga } from '@/lib/grafico'

// Los dos graficos de ventas del panel de Inicio: el historico por mes a la
// izquierda y el dia a dia del mes en curso a la derecha. En celular se apilan
// en ese mismo orden.
//
// Vive aparte porque lo usan DOS paneles con alcances distintos — y el alcance
// NO se decide aca:
//
//  ☠️ Las series ya vienen filtradas por `crm.resumen_inicio`, que se entera de
//     quien pregunta por la COOKIE FIRMADA (`/api/inicio`), no por lo que diga
//     el navegador. Un ADMIN recibe todo; un VENDEDOR, solo sus pedidos. Este
//     componente pinta lo que le dan y no sabe filtrar: si algun dia hiciera
//     falta acotar, se acota en la base, nunca aca.
//
// `mias` y `alcance` solo cambian los TEXTOS (el vendedor lee "Mis ventas"; el
// admin filtrado lee de quien es el primer pedido), jamas los datos.
export default function GraficosVentas({ data, mias = false, alcance = null, onMes = null }) {
  const meses = useMemo(
    () => serieMeses(data.ventasPorMes, data.primerPedido, data.hoyEcuador),
    [data.ventasPorMes, data.primerPedido, data.hoyEcuador],
  )
  const dias = useMemo(
    () => serieDias(data.ventasPorDia, data.hoyEcuador),
    [data.ventasPorDia, data.hoyEcuador],
  )
  // ☠️ La advertencia CAMBIA de significado segun quien mire y que filtro haya
  // puesto: la serie arranca en el primer pedido de LO QUE SE ESTA MIRANDO.
  // Decir "primer pedido del CRM" cuando estas viendo a GRACE (que empezo el
  // 22-jun, no el 18) es sencillamente falso.
  const hito = mias
    ? 'tu primer pedido'
    : alcance ? `primer pedido de ${alcance}` : 'primer pedido del CRM'
  const avisoMeses = useMemo(
    () => notaMeses(meses, data.primerPedido, hito),
    [meses, data.primerPedido, hito],
  )

  // `hoyEcuador` YA viene calculado en hora de Guayaquil por Postgres, asi que
  // recortarlo aca es seguro. Recortar un ISO cualquiera NO lo es: a las 19:00
  // Supabase manda UTC y el dia salta al siguiente.
  const claveDeHoy = String(data.hoyEcuador || '').slice(0, 7)

  // ☠️ El mes que se pinta sale de lo que la BASE dice haber entendido, no del
  // estado de la pantalla. Si se mandara un mes con basura, la base cae al mes
  // en curso y aqui vuelve el real: el titulo nunca puede prometer un mes
  // distinto del que hay dibujado debajo.
  const mesDelDiario = data.filtro?.mes || claveDeHoy
  const esMesEnCurso = mesDelDiario === claveDeHoy
  const etiquetaDelDiario = etiquetaMesLarga(mesDelDiario)

  // La tarjeta de arriba se llama distinto en cada panel; la nota tiene que
  // nombrar la que el lector TIENE delante, o el cotejo no se puede hacer.
  const tarjeta = mias ? '«Mes actual»' : '«Ventas del mes»'

  // ⚠️ La promesa de que las barras cuadran con la tarjeta SOLO vale para el mes
  // en curso: es el unico que esa tarjeta mide. Mirando agosto desde septiembre
  // seria mentira, y una nota que miente es peor que no tener nota.
  const notaDiaria = esMesEnCurso
    ? `Del día 1 a hoy. Suma exactamente lo mismo que la tarjeta ${tarjeta}.`
    : `Mes completo. Las tarjetas de arriba siguen siendo del mes en curso, no de ${etiquetaDelDiario}.`

  return (
    <div className="grid md:grid-cols-2 gap-4 mb-6">
      {/* El histórico es el MANDO: tocar un mes cambia el gráfico de al lado.
          Por eso ignora `p_filtro_mes` en la base — si se filtrara a sí mismo
          se quedaría con una sola barra y no habría cómo cambiar de mes. */}
      <GraficoBarras
        titulo={mias ? 'Mis ventas por mes' : 'Ventas por mes'}
        descripcion={onMes ? 'toca un mes para verlo día a día' : 'histórico completo'}
        serie={meses}
        nota={avisoMeses}
        vacio="Todavía no hay meses cerrados"
        onSeleccionar={onMes}
        seleccionada={onMes ? mesDelDiario : null}
      />
      <GraficoBarras
        titulo={mias ? 'Mis ventas por día' : 'Ventas por día'}
        descripcion={etiquetaDelDiario}
        serie={dias}
        nota={notaDiaria}
        vacio={esMesEnCurso ? 'Sin ventas este mes' : `Sin ventas en ${etiquetaDelDiario}`}
      />
    </div>
  )
}
