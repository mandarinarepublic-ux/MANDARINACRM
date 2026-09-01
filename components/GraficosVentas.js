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
// `mias` solo cambia los TEXTOS (el vendedor lee "Mis ventas"), jamas los datos.
export default function GraficosVentas({ data, mias = false }) {
  const meses = useMemo(
    () => serieMeses(data.ventasPorMes, data.primerPedido, data.hoyEcuador),
    [data.ventasPorMes, data.primerPedido, data.hoyEcuador],
  )
  const dias = useMemo(
    () => serieDias(data.ventasPorDia, data.hoyEcuador),
    [data.ventasPorDia, data.hoyEcuador],
  )
  // `mias` entra aca porque la advertencia CAMBIA de significado: la serie de un
  // vendedor arranca en SU primer pedido, no en el del CRM.
  const avisoMeses = useMemo(
    () => notaMeses(meses, data.primerPedido, mias),
    [meses, data.primerPedido, mias],
  )

  // `hoyEcuador` YA viene calculado en hora de Guayaquil por Postgres, asi que
  // recortarlo aca es seguro. Recortar un ISO cualquiera NO lo es: a las 19:00
  // Supabase manda UTC y el dia salta al siguiente.
  const mesEnCurso = etiquetaMesLarga(String(data.hoyEcuador || '').slice(0, 7))

  // La tarjeta de arriba se llama distinto en cada panel; la nota tiene que
  // nombrar la que el lector TIENE delante, o el cotejo no se puede hacer.
  const tarjeta = mias ? '«Mes actual»' : '«Ventas del mes»'

  return (
    <div className="grid md:grid-cols-2 gap-4 mb-6">
      <GraficoBarras
        titulo={mias ? 'Mis ventas por mes' : 'Ventas por mes'}
        descripcion="histórico completo"
        serie={meses}
        nota={avisoMeses}
        vacio="Todavía no hay meses cerrados"
      />
      <GraficoBarras
        titulo={mias ? 'Mis ventas por día' : 'Ventas por día'}
        descripcion={mesEnCurso}
        serie={dias}
        nota={`Del día 1 a hoy. Suma exactamente lo mismo que la tarjeta ${tarjeta}.`}
        vacio="Sin ventas este mes"
      />
    </div>
  )
}
