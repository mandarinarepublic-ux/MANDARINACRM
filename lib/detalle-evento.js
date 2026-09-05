// lib/detalle-evento.js
//
// El contexto que se guarda cuando algo falla, y cómo se lee después en el
// cuadro de errores. Puro: no toca base ni red.
//
// POR QUÉ EXISTE. El 4-sep-2026 el tablero de errores mostró solo esto:
//
//     El Historial fallo al cargar: Requested range not satisfiable
//
// Sin quién, sin qué filtros, sin qué página, sin código. Reconstruirlo costó
// varias consultas a la base — y todo eso podía haber estado guardado, porque
// `crm.eventos_sistema` tiene una columna `detalle` (jsonb) desde siempre.
//
// ☠️ Y el otro lado del problema: de 745 eventos, 634 SÍ traían contexto, y la
// pantalla pintaba UN campo mediante una condición escrita a mano
// (`ev.detalle?.origen === 'inbox' && ev.detalle?.telefono`). Una lista blanca:
// todo lo demás, invisible. Es el defecto que en este sistema ya escondió
// clientes en el inbox cuatro veces.
//
// LA REGLA: se pinta lo que HAY, no lo que alguien previó.

/** Claves que NUNCA se guardan aunque lleguen en los params. */
const SECRETAS = /^(token|authorization|auth|apikey|api_key|key|secret|password|clave|cookie)$/i

/**
 * El contexto de un error, listo para la columna `detalle`.
 *
 * @param {{error?:any, ruta?:string, usuario?:object, params?:object, extra?:object}} opts
 * @returns {object} nunca null: un objeto vacío deja ver que el error llegó sin
 *   contexto, que es un defecto a corregir y no un misterio.
 */
export function contextoDeError({ error, ruta, usuario, params, extra } = {}) {
  const d = {}
  // El código va primero porque es lo ÚNICO buscable: 'PGRST103' encuentra el
  // caso; "falló al cargar" no encuentra nada.
  if (error?.code) d.codigo = String(error.code)
  if (error?.message) d.error = String(error.message).slice(0, 500)
  if (error?.hint) d.pista = String(error.hint).slice(0, 300)
  if (error?.details) d.detalles = String(error.details).slice(0, 300)
  if (ruta) d.ruta = ruta
  // ⚠️ Los repos devuelven MAYÚSCULAS (USUARIO_ID, NOMBRE, ROL) y la cookie
  // minúsculas. Se aceptan las dos formas: si esto solo mirara una, la mitad de
  // los errores quedarían sin dueño y nadie lo notaría.
  const nombre = usuario?.nombre ?? usuario?.NOMBRE
  const id = usuario?.id ?? usuario?.ID ?? usuario?.USUARIO_ID ?? usuario?.usuario_id
  const rol = usuario?.rol ?? usuario?.ROL
  if (nombre) d.usuario = nombre
  if (id) d.usuarioId = id
  if (rol) d.rol = rol

  if (params && typeof params === 'object') {
    const limpios = {}
    for (const [k, v] of Object.entries(params)) {
      if (SECRETAS.test(k)) continue   // no se guarda un secreto en una tabla que se lee en pantalla
      limpios[k] = v
    }
    // Se guarda aunque quede vacío: "pidió sin filtros" es información.
    d.params = limpios
  }
  if (extra && typeof extra === 'object') Object.assign(d, extra)
  return d
}

/** Un valor cualquiera, listo para pintarse. */
function aTexto(v) {
  if (v === null || v === undefined || v === '') return { texto: '—', completo: '' }
  if (Array.isArray(v)) {
    const completo = v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
    return { texto: `[${v.length}] ${completo}`, completo }
  }
  if (typeof v === 'object') {
    const completo = JSON.stringify(v)
    return { texto: completo, completo }
  }
  const completo = String(v)
  return { texto: completo, completo }
}

const TOPE = 220

/**
 * El `detalle` convertido en filas legibles. Por REGLA, no por lista blanca:
 * cualquier clave —incluida una que nadie previó— aparece.
 *
 * Lo anidado se APLANA (`params.pagina`) en vez de esconderse, y un valor vacío
 * se muestra como vacío: "el campo existe y vino vacío" y "el campo no existe"
 * son cosas distintas y tienen que verse distintas.
 *
 * @returns {{clave:string, valor:string, completo:string}[]}
 */
export function filasDeDetalle(detalle, prefijo = '') {
  if (detalle === null || detalle === undefined) return []
  if (typeof detalle !== 'object' || Array.isArray(detalle)) {
    const { texto, completo } = aTexto(detalle)
    return [{ clave: prefijo || 'detalle', valor: recortar(texto), completo }]
  }

  const filas = []
  for (const [clave, valor] of Object.entries(detalle)) {
    const nombre = prefijo ? `${prefijo}.${clave}` : clave
    // Solo se baja un nivel por objeto plano; una lista se pinta entera para no
    // perder su tamaño, que suele ser el dato que importa.
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      filas.push(...filasDeDetalle(valor, nombre))
      continue
    }
    const { texto, completo } = aTexto(valor)
    filas.push({ clave: nombre, valor: recortar(texto), completo })
  }
  return filas
}

function recortar(t) {
  return t.length > TOPE ? `${t.slice(0, TOPE)}… (${t.length} caracteres)` : t
}

/** El detalle entero como texto, para el botón de copiar. */
export function detalleComoTexto(evento) {
  const cab = [
    `[${evento?.nivel ?? ''}] ${evento?.fuente ?? ''} · ${evento?.fecha ?? ''}`,
    evento?.pedido_id ? `pedido: ${evento.pedido_id}` : null,
    evento?.mensaje ?? '',
  ].filter(Boolean)
  const filas = filasDeDetalle(evento?.detalle).map((f) => `${f.clave}: ${f.completo || '—'}`)
  return [...cab, ...(filas.length ? ['', ...filas] : [])].join('\n')
}
