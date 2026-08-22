// lib/pauta/salud.js
//
// ¿La pauta está entregando, o se murió y nadie se enteró?
//
// ☠️ POR QUÉ EXISTE: del 16 al 20-ago-2026 la pauta de MANDARINA pasó de ~$14
// diarios con 10-35 conversaciones a $0,00. Cuatro días. Los anuncios seguían en
// estado ACTIVE y el cron seguía cargando datos sin quejarse: el sistema estaba
// perfectamente sano informando que no pasaba nada.
//
// Nadie se dio cuenta. Se descubrió de casualidad el 21-ago, contestando otra
// pregunta. Con un ROAS real de 9,25x, cada día caído no es gasto ahorrado: es
// venta que no entra.
//
// UN TABLERO NO HABRÍA SERVIDO: el problema no fue no poder consultar, fue que
// nadie preguntó durante cuatro días. Por eso esto empuja el aviso, no espera
// que alguien entre a mirar.
//
// Lógica pura y sin dependencias: `node --test` la importa y la prueba con los
// números reales de esos días.

/** Por debajo de esta fracción de lo normal, se considera caída. */
export const UMBRAL_CAIDA = 0.2

/**
 * Mediana mínima para que valga la pena vigilar, en dólares/día.
 *
 * Sin esto, una cuenta apagada a propósito (o recién creada) avisaría todos los
 * días de que gasta cero. Un aviso que siempre está encendido no es un aviso.
 */
export const BASE_MINIMA = 1

/** Días de historia para calcular lo que es "normal". */
export const DIAS_BASE = 14

/**
 * Días recientes que NO se usan para decidir, porque su cifra todavía se mueve.
 *
 * ☠️ Meta sigue ajustando el gasto de los últimos ~3 días; por eso el cron
 * refresca esa ventana (DIAS_REFRESCO). Un dato provisional llega BAJO y sube
 * después, así que evaluar con él produce CAÍDAS FALSAS, nunca falsos "todo
 * bien".
 *
 * Caso real, y me pasó a mí antes que al código: el 21-ago-2026 leí que el
 * 20-ago MANDARINA había gastado $2,46 y reporté cuatro días de pauta muerta.
 * La cifra real de ese día era $21,22 — la pauta ya se había recuperado. El
 * detector, corriendo a las 07:00 sobre "ayer", habría cometido exactamente el
 * mismo error y gritado una caída inexistente.
 *
 * Una falsa alarma es peor que no avisar: entrena a ignorar el aviso, que es
 * justo como murió el push del inbox. Se prefiere avisar dos días tarde que
 * avisar mal. Con una caída como la del 16-ago, esto avisa el día 18.
 */
export const DIAS_PROVISIONALES = 2

/**
 * Cada cuántos días se repite el aviso mientras siga caída.
 *
 * ⚠️ NO es un enfriamiento "de flanco" (avisar solo la primera vez). Esa fue
 * exactamente la falla del push del inbox: daba UN aviso por cliente en toda su
 * vida y por eso parecía funcionar mientras no funcionaba. Una pauta que lleva
 * cuatro días muerta tiene que seguir molestando.
 */
export const REPETIR_CADA = 3

/** Mediana: resiste los ceros y los picos, cosa que el promedio no hace. */
export function mediana(nums) {
  const xs = (nums || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (xs.length === 0) return 0
  const m = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2
}

/**
 * ¿Cómo está la pauta de una cuenta?
 *
 * @param {object[]} dias  [{fecha, gasto, anunciosActivos, conversaciones}] ASCENDENTE por fecha.
 *                         El último es el día más reciente CON DATOS (normalmente ayer).
 * @returns {{
 *   hayDatos: boolean, base: number, gastoUltimo: number, diasCaidos: number,
 *   caida: boolean, recuperada: boolean, debeAvisar: boolean, motivo: string
 * }}
 */
export function evaluarSaludPauta(dias) {
  const todos = (dias || []).filter((d) => d && d.fecha)
  // ☠️ Fuera los días cuya cifra todavía se mueve: son la fábrica de falsas
  // alarmas. Ver DIAS_PROVISIONALES.
  const firmes = DIAS_PROVISIONALES > 0 ? todos.slice(0, -DIAS_PROVISIONALES) : todos
  const serie = firmes.slice(-DIAS_BASE - 1)
  if (serie.length < 3) {
    return { hayDatos: false, base: 0, gastoUltimo: 0, diasCaidos: 0,
             caida: false, recuperada: false, debeAvisar: false,
             motivo: 'sin historia suficiente para saber qué es normal' }
  }

  const gasto = (d) => Number(d.gasto) || 0
  const base = mediana(serie.map(gasto))
  const ultimo = serie[serie.length - 1]
  const gastoUltimo = gasto(ultimo)

  // Cuenta apagada a propósito o sin arrancar: no hay nada que vigilar.
  if (base < BASE_MINIMA) {
    return { hayDatos: true, base, gastoUltimo, diasCaidos: 0,
             caida: false, recuperada: false, debeAvisar: false,
             motivo: 'no hay pauta corriendo que vigilar' }
  }

  const piso = base * UMBRAL_CAIDA
  const estaCaido = (d) => gasto(d) < piso

  // Días consecutivos caídos contando desde el final.
  let diasCaidos = 0
  for (let i = serie.length - 1; i >= 0 && estaCaido(serie[i]); i--) diasCaidos++

  // ☠️ Anuncios ACTIVE con gasto cero es lo que de verdad delata el problema:
  // separa "apagué la pauta" de "está rota". El 17-ago había 3 anuncios ACTIVE
  // y cero dólares.
  const activos = Number(ultimo.anunciosActivos) || 0

  // Se recuperó: el último día está bien y el anterior estaba caído.
  const anterior = serie[serie.length - 2]
  const recuperada = diasCaidos === 0 && !!anterior && estaCaido(anterior)

  const caida = diasCaidos >= 1
  // Avisa el primer día y después cada REPETIR_CADA, para insistir sin cansar.
  const tocaRepetir = diasCaidos === 1 || (diasCaidos - 1) % REPETIR_CADA === 0

  return {
    hayDatos: true, base, gastoUltimo, diasCaidos, activos,
    caida, recuperada,
    debeAvisar: (caida && tocaRepetir) || recuperada,
    motivo: caida
      ? `gastó $${gastoUltimo.toFixed(2)} contra $${base.toFixed(2)} normales`
      : recuperada ? 'volvió a entregar' : 'entregando con normalidad',
  }
}

/** El texto del aviso. Corto: se lee en la pantalla de bloqueo del celular. */
export function textoAviso(cuenta, s, fecha) {
  if (s.recuperada) {
    return `✅ *Pauta ${cuenta}* volvió a entregar\n` +
           `${fecha}: $${s.gastoUltimo.toFixed(2)} (normal: $${s.base.toFixed(2)}/día)`
  }
  const dias = s.diasCaidos === 1 ? 'ayer' : `${s.diasCaidos} días seguidos`
  return (
    `🔴 *Pauta ${cuenta}: no está entregando*\n\n` +
    `${dias} sin gasto normal.\n` +
    `${fecha}: *$${s.gastoUltimo.toFixed(2)}* · lo normal son $${s.base.toFixed(2)}/día\n` +
    (s.activos > 0
      ? `\n⚠️ Hay *${s.activos} anuncio(s) en ACTIVE* que no gastan.\n` +
        `No están apagados: revisa presupuesto, forma de pago o rechazos en el Administrador de Anuncios.`
      : `\nNo hay anuncios activos: si los apagaste tú, todo bien.`)
  )
}
