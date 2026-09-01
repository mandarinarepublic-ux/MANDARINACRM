// Helpers de los graficos de barras del panel de Inicio.
//
// Viven aparte de los componentes por dos razones:
//  1. `node --test` no entiende `@/`, y desde `tests/` se importan con ruta
//     relativa. Lo que esta aca se puede probar; lo que vive dentro de un
//     componente de React, no.
//  2. ☠️ Las fechas no pueden enganiar. Nada de `new Date('2026-08-01')`: eso
//     se interpreta como UTC medianoche y en Ecuador (UTC-5) retrocede al 31
//     de julio. Todas las etiquetas se arman partiendo la cadena, nunca
//     dejando que el navegador "parsee" el ISO.

export const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
export const MESES_LARGOS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

// '2026-08' → { anio: 2026, mes: 8 }. Devuelve null si no tiene la forma.
export function partesMes(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''))
  if (!m) return null
  return { anio: Number(m[1]), mes: Number(m[2]) }
}

// '2026-08-31' → { anio: 2026, mes: 8, dia: 31 }
export function partesDia(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return null
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) }
}

export function etiquetaMes(ym) {
  const p = partesMes(ym)
  if (!p) return String(ym || '')
  return MESES_CORTOS[p.mes - 1] || String(ym)
}

export function etiquetaMesLarga(ym) {
  const p = partesMes(ym)
  if (!p) return String(ym || '')
  return `${MESES_LARGOS[p.mes - 1] || p.mes} ${p.anio}`
}

export function etiquetaDia(iso) {
  const p = partesDia(iso)
  return p ? String(p.dia) : String(iso || '')
}

export function etiquetaDiaLarga(iso) {
  const p = partesDia(iso)
  if (!p) return String(iso || '')
  return `${p.dia} de ${MESES_LARGOS[p.mes - 1] || p.mes}`
}

// Cuantos dias tiene un mes. Se construye en UTC a proposito: `Date.UTC(y, m, 0)`
// da el ultimo dia del mes `m` sin que la zona del navegador meta la mano.
export function diasDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

export function esUltimoDiaDelMes(iso) {
  const p = partesDia(iso)
  if (!p) return false
  return p.dia === diasDelMes(p.anio, p.mes)
}

// $15.025 — entero, con punto de miles (Ecuador). Se formatea a mano y no con
// `toLocaleString`: el resultado tiene que ser el mismo en el navegador, en
// Vercel y en las pruebas, sin depender del ICU que traiga cada runtime.
export function formatoMonto(n) {
  const v = Math.round(Number(n) || 0)
  const signo = v < 0 ? '-' : ''
  const cuerpo = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${signo}$${cuerpo}`
}

// La barra mas alta NO llega al techo: se le deja una franja arriba para que su
// etiqueta ($20.099) tenga donde ir. Sin esa cabecera el numero se monta sobre
// el titulo de la tarjeta.
export const CABECERA = 0.86

// El tope contra el que se miden las barras, ya con la cabecera descontada.
export function topeDeEscala(serie, cabecera = CABECERA) {
  const max = maxSerie(serie)
  return max > 0 ? max / cabecera : 0
}

export function maxSerie(serie) {
  return (serie || []).reduce((m, p) => Math.max(m, Number(p?.monto) || 0), 0)
}

export function totalSerie(serie) {
  return (serie || []).reduce((t, p) => t + (Number(p?.monto) || 0), 0)
}

// Altura de la barra en % del alto util. Con `max` en 0 todo mide 0: un panel
// sin ventas se ve vacio, no con barras al tope.
export function alturaBarra(monto, max) {
  const m = Number(monto) || 0
  const tope = Number(max) || 0
  if (tope <= 0 || m <= 0) return 0
  return Math.max(0, Math.min(100, (m / tope) * 100))
}

// Que barras llevan el numero encima.
//
// ⚠️ Un numero sobre CADA barra es ruido y no lo lee nadie: con 31 dias solo se
// etiqueta el maximo. Con pocas barras (el historico por mes) caben todas y
// ahorran tener que pasar el mouse.
export function indicesEtiquetados(serie, tope = 6) {
  const s = serie || []
  const conVenta = s.map((p, i) => ({ i, monto: Number(p?.monto) || 0 })).filter((p) => p.monto > 0)
  if (conVenta.length === 0) return []
  if (s.length <= tope) return conVenta.map((p) => p.i)
  let mejor = conVenta[0]
  for (const p of conVenta) if (p.monto > mejor.monto) mejor = p
  return [mejor.i]
}

// Que etiquetas del eje X se pintan. Con 31 dias no caben los 31 numeros, asi
// que se muestran de 5 en 5 mas el ultimo (que es HOY y siempre interesa).
export function indicesEje(n, maxEtiquetas = 8) {
  if (n <= 0) return []
  if (n <= maxEtiquetas) return Array.from({ length: n }, (_, i) => i)
  const paso = Math.ceil(n / maxEtiquetas)
  const out = []
  for (let i = 0; i < n; i += paso) out.push(i)
  if (out[out.length - 1] !== n - 1) {
    // El ultimo siempre entra; si queda pegado al anterior, ese anterior sale.
    if (n - 1 - out[out.length - 1] < Math.max(1, Math.floor(paso / 2))) out.pop()
    out.push(n - 1)
  }
  return out
}

// ─── Armado de las dos series ───────────────────────────────────────────────

export function serieDias(ventasPorDia, hoyISO) {
  return (ventasPorDia || []).map((p) => ({
    clave: p.dia,
    etiqueta: etiquetaDia(p.dia),
    etiquetaLarga: etiquetaDiaLarga(p.dia),
    monto: Number(p.monto) || 0,
    pedidos: Number(p.pedidos) || 0,
    actual: p.dia === hoyISO,
  }))
}

// El historico por mes, con las dos advertencias que evitan leer mal el grafico:
//
// ☠️ `parcial: 'inicio'` — el primer mes del CRM arranca a mitad de mes
//    (18-jun-2026). Esa barra corta NO es una caida de ventas, es medio mes.
// ☠️ `parcial: 'curso'` — el mes en curso todavia no termina. El 5 de septiembre
//    su barra es diminuta al lado de agosto y se lee como un derrumbe. Se marca
//    salvo que hoy sea justo el ultimo dia del mes, donde ya esta completo.
export function serieMeses(ventasPorMes, primerPedidoISO, hoyISO) {
  const s = ventasPorMes || []
  const primero = partesDia(primerPedidoISO)
  const hoy = partesDia(hoyISO)
  const mesDePrimero = primero ? `${primero.anio}-${String(primero.mes).padStart(2, '0')}` : null
  const mesDeHoy = hoy ? `${hoy.anio}-${String(hoy.mes).padStart(2, '0')}` : null
  const hoyCierraElMes = esUltimoDiaDelMes(hoyISO)

  return s.map((p, i) => {
    let parcial = null
    if (i === 0 && mesDePrimero === p.mes && primero && primero.dia > 1) parcial = 'inicio'
    if (mesDeHoy === p.mes && !hoyCierraElMes) parcial = 'curso'
    return {
      clave: p.mes,
      etiqueta: etiquetaMes(p.mes),
      etiquetaLarga: etiquetaMesLarga(p.mes),
      monto: Number(p.monto) || 0,
      pedidos: Number(p.pedidos) || 0,
      actual: mesDeHoy === p.mes,
      parcial,
    }
  })
}

// El pie de pagina del grafico mensual: solo aparece si hay algo que advertir.
//
// ☠️ `hito` NO es cosmetico aca. La serie arranca en el primer pedido de LO QUE
// SE ESTA MIRANDO, y eso cambia con quien mira y con el filtro puesto:
//
//   ADMIN sin filtro        → "primer pedido del CRM"   (18-jun-2026)
//   VENDEDOR                → "tu primer pedido"        (el suyo)
//   ADMIN filtrando a GRACE → "primer pedido de GRACE"  (22-jun-2026)
//
// Escribir "primer pedido del CRM" a ciegas es sencillamente falso en los dos
// ultimos casos. Quien llama sabe que esta mirando; esta funcion no.
export function notaMeses(serie, primerPedidoISO, hito = 'primer pedido del CRM') {
  const s = serie || []
  const avisos = []
  const inicio = s.find((p) => p.parcial === 'inicio')
  if (inicio) {
    const d = partesDia(primerPedidoISO)
    avisos.push(`${inicio.etiquetaLarga} arranca el ${d ? d.dia : '?'} (${hito}): es medio mes, no una caída.`)
  }
  const curso = s.find((p) => p.parcial === 'curso')
  if (curso) avisos.push(`${curso.etiquetaLarga} sigue en curso: la barra va a seguir creciendo.`)
  return avisos.join(' ')
}

// 'junio 2026' → 'Junio 2026'. A mano y no con la clase `capitalize` de
// Tailwind, que capitaliza CADA palabra: "19 De Agosto", "Septiembre 2026 En
// Curso". En español solo va la primera.
export function capitalizar(texto) {
  const s = String(texto || '')
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// ─── Listas clicables del panel (vendedores, tiendas) ───────────────────────

// Convierte el mapa que manda la base (`{CLAVE: {monto, count}}`) en filas
// ordenadas de mayor a menor, listas para pintar y para clicar.
//
// ☠️ LA FILA SELECCIONADA NO PUEDE DESAPARECER NUNCA. Es el caso que rompe
// esto: si un ADMIN filtra por JACKELINE y ella NO vendio en INDSTORE este mes,
// INDSTORE se cae de la lista de tiendas — y con ella el unico boton que
// permitia quitar ese filtro. El panel se queda trabado mostrando $0 sin manera
// de salir salvo recargando. Por eso la seleccionada vuelve a entrar a la
// fuerza, en cero y marcada `ausente`, y si hay tope desplaza a la ultima.
export function filasSeleccionables(mapa, seleccionada = null, tope = null) {
  const filas = Object.entries(mapa || {})
    .map(([clave, v]) => ({
      clave,
      monto: Number(v?.monto) || 0,
      pedidos: Number(v?.count ?? v?.pedidos) || 0,
    }))
    .sort((a, b) => b.monto - a.monto || String(a.clave).localeCompare(String(b.clave)))

  if (seleccionada && !filas.some((f) => f.clave === seleccionada)) {
    filas.push({ clave: seleccionada, monto: 0, pedidos: 0, ausente: true })
  }
  if (!tope || filas.length <= tope) return filas

  const cortadas = filas.slice(0, tope)
  if (seleccionada && !cortadas.some((f) => f.clave === seleccionada)) {
    cortadas[cortadas.length - 1] = filas.find((f) => f.clave === seleccionada)
  }
  return cortadas
}

// El total de una lista, para que las barras sean parte-de-un-todo DENTRO de su
// tarjeta.
//
// ⚠️ Antes el porcentaje se sacaba contra `ventasMes` y con eso las dos barras
// de tienda nunca llegaban al 100%: faltaba YAW, que contaba en el total y en
// ninguna barra. Ademas, con un filtro de vendedor puesto la lista de tiendas
// ya NO suma `ventasMes` a proposito (es un selector cruzado), asi que el
// denominador tiene que ser el de la propia lista.
export function totalFilas(filas) {
  return (filas || []).reduce((t, f) => t + (Number(f?.monto) || 0), 0)
}
