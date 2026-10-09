# Seguimiento de pedido para el cliente — plan de trabajo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el cliente de MANDARINA vea el estado de su pedido en `mandarinaec.com/pedido` con su celular y su número de pedido, junto a una promo que Rodrigo prende y cambia desde el CRM.

**Architecture:** el CRM sirve una página pública (`/pedido`) que le pregunta a una ruta pública nueva (`POST /api/publico/pedido`). Toda la regla vive en dos módulos puros con pruebas: `lib/etapaCliente.js` (las 5 etapas) y `lib/seguimientoPublico.js` (validar, tapar, armar la respuesta, límite de intentos). Los datos salen de un repositorio nuevo (`lib/db/seguimiento.js`). Shopify muestra la página dentro de `mandarinaec.com/pedido` con un iframe.

**Tech Stack:** Next.js 14 (app router), Supabase (schema `crm`, `service_role`), `node --test`, Shopify (tema MAIN de Mandarina).

**Spec:** `docs/superpowers/specs/2026-10-09-seguimiento-pedido-mandarina-design.md`
**Maqueta aprobada:** https://claude.ai/artifact/4rB1oruUpDbbyX5yxbHK4k — su HTML está en el scratchpad de la sesión del 9-oct; el CSS que hay que portar está copiado completo en la Tarea 6.

## Global Constraints

- Solo pedidos con `tienda_id = 'MANDARINA'`.
- Etapas, en este orden y con estos nombres: **Recibido · Diseño · Producción · Tránsito · Entregado**.
- **Entregado** = `estado_pedido = 'ENTREGADO'`, o **24 h** después del paso a `COMPLETADO`. Se calcula; nunca se escribe en la base.
- **Sin fecha prometida** en la página.
- **Ningún monto** sale del servidor: solo el booleano `saldoPendiente`.
- Celular **completo**. Cédula con los **5 dígitos del medio** tapados (`17*****321`, RUC `1712*****4001`). Dirección: **solo la ciudad**. Sin email.
- Mensaje único para todo fallo: «No encontramos ese pedido. Revisa el número de tu hoja y el celular con el que compraste.»
- Límite: **10 consultas por IP cada 15 min**; **5 fallos sobre un mismo número en 15 min** lo bloquean. Respuesta `429` «Demasiados intentos, prueba en unos minutos.»
- WhatsApp: `https://wa.me/593983745757` con texto ya escrito.
- Español de Ecuador con **tuteo** en textos, comentarios y commits.
- Siempre en `main`. **Nunca `git add -A` ni `git add .`**: agrega por nombre.
- Módulos puros con prueba: imports **relativos con `.js`** (`node --test` no entiende `@/`).
- Los `select` de Supabase se arman con **`array.join(',')`**, nunca concatenando plantillas (`tests/select-no-se-rompe-en-el-build.test.js`).
- Todo `<input>` del CRM lleva `className="input"` (sin eso se escribe a ciegas, texto blanco sobre blanco).
- Una pantalla nueva del CRM va en las **dos** superficies del menú: `app/dashboard/page.js` y `app/dashboard/layout.js`.
- `registrarEvento(...)` siempre con `await`.

## Review Focus

1. **El celular en cualquier formato** (`+593 99 876 5678`, `593998765678`, `998765678`, `099-876-5678`) tiene que encontrar el pedido; lo vacío o corto nunca coincide con nada, ni siquiera con un cliente sin celular. → pruebas en la Tarea 2.
2. **El número de pedido como lo escriba el cliente** (`6308`, ` 6308 `, `#6308`, `man-jac-6308`, `06308`) apunta al mismo pedido, y `16308` no. → pruebas en la Tarea 2.
3. **Pedidos viejos sin bitácora** (anteriores a ago-2026) en `COMPLETADO` no deben quedarse para siempre en «Tránsito» ni romper la página. → prueba en la Tarea 1 (cae a `fecha_actualizacion`).
4. **El límite de 24 h de «Entregado»** en hora de Ecuador: a las 23 h no, a las 25 h sí. → prueba en la Tarea 1.
5. **Un pedido sin prendas vivas** (todas eliminadas) muestra «0 prendas» y no avanza solo de etapa. → pruebas en las Tareas 1 y 2.

---

## Mapa de archivos

| archivo | qué hace |
|---|---|
| `docs/sql/2026-10-09-seguimiento-publico.sql` | tablas `crm.consultas_publicas` y `crm.config_publica` |
| `lib/etapaCliente.js` | **puro**: en qué etapa está el pedido y con qué fechas |
| `lib/parseFecha.js` | + `formatDiaMes` («03 Oct») |
| `lib/seguimientoPublico.js` | **puro**: normalizar celular y número, tapar cédula, saldo, armar la respuesta, límite, limpiar la promo |
| `lib/db/seguimiento.js` | lecturas y escrituras de Supabase de todo lo anterior |
| `app/api/publico/pedido/route.js` | la ruta pública |
| `middleware.js` | + la ruta pública en `RUTAS_PUBLICAS` |
| `app/api/promo-seguimiento/route.js` | leer y guardar la promo (solo ADMIN) |
| `app/dashboard/promo-seguimiento/page.js` | pantalla de la promo |
| `app/dashboard/page.js`, `app/dashboard/layout.js` | entrada en el menú |
| `app/pedido/page.js` | la página pública (servidor: lee la promo) |
| `components/seguimiento/Seguimiento.js` | formulario + estado (cliente) |
| `components/seguimiento/HojaPedido.js` | la hoja «¡Hola!» |
| `components/seguimiento/Promo.js` | el recuadro de la promo (lo usan la página pública y la vista previa del CRM) |
| `components/seguimiento/seguimiento.module.css` | el CSS de la maqueta |
| `public/logos/logo_mandarina_240.png` | logo liviano (el original pesa 808 KB) |
| `lib/origenes.js`, `next.config.js` | `mandarinaec.com` puede enmarcar **solo** `/pedido` |
| `tests/etapa-cliente.test.js`, `tests/seguimiento-publico.test.js`, `tests/csp.test.js` | pruebas |

---

### Task 1: Las etapas del cliente

**Files:**
- Create: `lib/etapaCliente.js`
- Modify: `lib/parseFecha.js` (agregar `formatDiaMes` junto a `formatFechaCorta`, ~línea 143)
- Test: `tests/etapa-cliente.test.js`

**Interfaces:**
- Consumes: `parseSubestados(subestadoStr, areaStr)` de `lib/subestados.js` → `{ ESTAMPADO: 'LISTO', … }`.
- Produces:
  - `ETAPAS_CLIENTE: { nombre: string, mensaje: string }[]` (5 elementos, índice = etapa)
  - `HORAS_HASTA_ENTREGADO = 24`
  - `calcularEtapa({ pedido, items, logs, ahora? }) → { etapa: 0|1|2|3|4|null, fechas: (string ISO|null)[5], cancelado: boolean }`
    - `pedido`: fila de `crm.pedidos` (snake_case: `estado_pedido`, `fecha_pedido`, `fecha_actualizacion`, `fecha_impresion_produccion`)
    - `items`: filas de `crm.detalle_pedido` (`subestado`, `subestado_corte`, `area`, `eliminado`)
    - `logs`: `{ fecha, campo, despues }[]` de `crm.logs_pedidos`
  - `formatDiaMes(input) → '03 Oct'` (hora de Ecuador; `''` si no se puede leer)

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
// tests/etapa-cliente.test.js
//
// En qué etapa ve el CLIENTE su pedido en mandarinaec.com/pedido. La regla está
// en docs/superpowers/specs/2026-10-09-seguimiento-pedido-mandarina-design.md.
import test from 'node:test'
import assert from 'node:assert'
import { calcularEtapa, ETAPAS_CLIENTE, HORAS_HASTA_ENTREGADO } from '../lib/etapaCliente.js'
import { formatDiaMes } from '../lib/parseFecha.js'

const AHORA = new Date('2026-10-09T17:00:00Z') // 12:00 en Ecuador
const pedido = (extra = {}) => ({
  pedido_id: 'MAN-JAC-6308', estado_pedido: 'EN_FABRICA',
  fecha_pedido: '2026-10-03T15:00:00Z', fecha_actualizacion: '2026-10-03T15:00:00Z',
  fecha_impresion_produccion: null, ...extra,
})
const item = (extra = {}) => ({ area: 'ESTAMPADO', subestado: 'SOLICITADO', subestado_corte: null, eliminado: false, ...extra })
const log = (campo, despues, fecha) => ({ campo, despues, fecha })
const calc = (p, items = [item()], logs = [], ahora = AHORA) => calcularEtapa({ pedido: p, items, logs, ahora })

test('los nombres de las 5 etapas son los acordados con Rodrigo', () => {
  assert.deepEqual(ETAPAS_CLIENTE.map(e => e.nombre), ['Recibido', 'Diseño', 'Producción', 'Tránsito', 'Entregado'])
  assert.equal(HORAS_HASTA_ENTREGADO, 24)
})

test('recién creado: Recibido, con la fecha de CREACION', () => {
  const r = calc(pedido(), [item()], [log('CREACION', '', '2026-10-03T15:00:00Z')])
  assert.equal(r.etapa, 0)
  assert.equal(r.fechas[0], '2026-10-03T15:00:00.000Z')
  assert.deepEqual(r.fechas.slice(1), [null, null, null, null])
  assert.equal(r.cancelado, false)
})

test('sin bitácora, la fecha de Recibido sale de fecha_pedido', () => {
  assert.equal(calc(pedido()).fechas[0], '2026-10-03T15:00:00.000Z')
})

test('impreso para producción: Diseño', () => {
  const r = calc(pedido(), [item()], [log('IMPRESION_PRODUCCION', '2026-10-04', '2026-10-04T14:00:00Z')])
  assert.equal(r.etapa, 1)
  assert.equal(r.fechas[1], '2026-10-04T14:00:00.000Z')
})

test('impreso sin línea en la bitácora: vale la columna fecha_impresion_produccion', () => {
  assert.equal(calc(pedido({ fecha_impresion_produccion: '2026-10-04T14:00:00Z' })).etapa, 1)
})

test('arte enviado al cliente para aprobar sigue en Diseño', () => {
  const r = calc(pedido({ fecha_impresion_produccion: '2026-10-04T14:00:00Z' }), [item({ subestado: 'ENVIADO_APROBACION' })])
  assert.equal(r.etapa, 1)
})

test('cortado: Producción, con la fecha del primer corte', () => {
  const r = calc(pedido(), [item({ subestado_corte: 'CORTADO' })], [
    log('CORTE HOODIE PREMIUM', 'CORTADO', '2026-10-06T16:00:00Z'),
    log('CORTE PEDIDO', 'CORTADO', '2026-10-05T16:00:00Z'),
  ])
  assert.equal(r.etapa, 2)
  assert.equal(r.fechas[2], '2026-10-05T16:00:00.000Z')
})

test('un área trabajando (multi-área) también es Producción', () => {
  assert.equal(calc(pedido(), [item({ area: 'ESTAMPADO + BORDADO', subestado: 'ESTAMPADO:SOLICITADO|BORDADO:EN_PROCESO' })]).etapa, 2)
})

test('ENTREGADO_TIENDA (prenda de stock) no cuenta como trabajo del taller', () => {
  assert.equal(calc(pedido(), [item({ area: 'ENTREGA EN TIENDA', subestado: 'ENTREGADO_TIENDA' })]).etapa, 0)
})

test('en DESPACHO (la fábrica terminó, se empaca) sigue en Producción', () => {
  assert.equal(calc(pedido({ estado_pedido: 'DESPACHO' })).etapa, 2)
})

test('COMPLETADO: Tránsito, con la fecha del paso a COMPLETADO', () => {
  const r = calc(pedido({ estado_pedido: 'COMPLETADO' }), [item({ subestado: 'LISTO' })], [
    log('ESTADO_PEDIDO', 'COMPLETADO', '2026-10-09T01:00:00Z'),
  ])
  assert.equal(r.etapa, 3)
  assert.equal(r.fechas[3], '2026-10-09T01:00:00.000Z')
})

test('Entregado: a las 23 h de COMPLETADO todavía no, a las 25 h sí', () => {
  const p = pedido({ estado_pedido: 'COMPLETADO' })
  const logs = [log('ESTADO_PEDIDO', 'COMPLETADO', '2026-10-08T17:00:00Z')]
  assert.equal(calc(p, [item()], logs, new Date('2026-10-09T16:00:00Z')).etapa, 3)
  const r = calc(p, [item()], logs, new Date('2026-10-09T18:00:00Z'))
  assert.equal(r.etapa, 4)
  assert.equal(r.fechas[4], '2026-10-09T17:00:00.000Z')
})

test('marcado ENTREGADO a mano: Entregado de una', () => {
  const r = calc(pedido({ estado_pedido: 'ENTREGADO' }), [item()], [log('ESTADO_PEDIDO', 'ENTREGADO', '2026-10-09T15:00:00Z')])
  assert.equal(r.etapa, 4)
  assert.equal(r.fechas[4], '2026-10-09T15:00:00.000Z')
})

test('pedido viejo COMPLETADO sin bitácora: cae a fecha_actualizacion y llega a Entregado', () => {
  const r = calc(pedido({ estado_pedido: 'COMPLETADO', fecha_actualizacion: '2026-07-01T15:00:00Z' }), [item()], [])
  assert.equal(r.etapa, 4)
  assert.equal(r.fechas[3], '2026-07-01T15:00:00.000Z')
})

test('nunca retrocede: si ya está en Tránsito, las etapas de antes cuentan como hechas aunque falte su dato', () => {
  const r = calc(pedido({ estado_pedido: 'COMPLETADO' }), [item()], [log('ESTADO_PEDIDO', 'COMPLETADO', '2026-10-09T10:00:00Z')])
  assert.equal(r.etapa, 3)
  assert.equal(r.fechas[1], null, 'sin dato de impresión no se inventa una fecha')
})

test('cancelado: sin etapa', () => {
  const r = calc(pedido({ estado_pedido: 'CANCELADO' }))
  assert.equal(r.cancelado, true)
  assert.equal(r.etapa, null)
})

test('sin prendas vivas no avanza solo', () => {
  const r = calc(pedido(), [item({ eliminado: true, subestado_corte: 'CORTADO' })], [])
  assert.equal(r.etapa, 0)
})

test('las fechas de etapas que aún no llegan no se muestran', () => {
  const r = calc(pedido(), [item()], [log('ESTADO_PEDIDO', 'COMPLETADO', '2026-10-09T10:00:00Z')])
  assert.equal(r.etapa, 0, 'EN_FABRICA manda sobre una línea vieja de la bitácora')
  assert.equal(r.fechas[3], null)
})

test('formatDiaMes: día y mes en hora de Ecuador', () => {
  assert.equal(formatDiaMes('2026-10-04T03:00:00Z'), '03 Oct', 'las 22:00 del 3 en Ecuador')
  assert.equal(formatDiaMes(null), '')
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test tests/etapa-cliente.test.js`
Expected: FAIL — `Cannot find module '…/lib/etapaCliente.js'`.

- [ ] **Step 3: Agregar `formatDiaMes` a `lib/parseFecha.js`**, justo después de `formatFechaCorta`:

```js
/**
 * Día y mes cortos en hora de Ecuador: "03 Oct". Para la barra de etapas de la
 * página pública del pedido, donde la hora no le sirve al cliente.
 */
export function formatDiaMes(input) {
  const d = input instanceof Date ? input : parseFecha(input)
  if (!d || isNaN(d)) return ''
  const { mes, dia } = partesEcuador(d)
  return `${dosDigitos(dia)} ${MESES[mes]}`
}
```

- [ ] **Step 4: Crear `lib/etapaCliente.js`**

```js
// lib/etapaCliente.js
//
// En qué ETAPA ve el cliente su pedido: la página pública /pedido y, en la
// Fase 2, los mensajes de WhatsApp. Puro: sin base, sin red, sin '@/'.
//
// Regla acordada con Rodrigo el 9-oct-2026 (spec 2026-10-09-seguimiento-…):
//   Recibido   el pedido existe
//   Diseño     se imprimió la hoja para producción
//   Producción se cortó, o un área lo tiene EN_PROCESO / LISTO, o está en DESPACHO
//              (ENVIADO_APROBACION = arte mandado al cliente: sigue en Diseño)
//   Tránsito   COMPLETADO
//   Entregado  ENTREGADO, o 24 h después de COMPLETADO (calculado, no se guarda)
//
// Nunca retrocede: manda la etapa más avanzada que se cumpla.

import { parseSubestados } from './subestados.js'

export const ETAPAS_CLIENTE = Object.freeze([
  { nombre: 'Recibido',   mensaje: 'Recibimos tu pedido y ya está en la fila del taller.' },
  { nombre: 'Diseño',     mensaje: 'Estamos preparando el diseño de tus prendas.' },
  { nombre: 'Producción', mensaje: 'Tus prendas están en producción: corte, estampado y costura.' },
  { nombre: 'Tránsito',   mensaje: 'Tu pedido va en camino.' },
  { nombre: 'Entregado',  mensaje: '¡Tu pedido fue entregado! Gracias por confiar en Mandarina.' },
])

export const HORAS_HASTA_ENTREGADO = 24

// ENTREGADO_TIENDA es una prenda de stock que no pasa por el taller: no cuenta.
const TRABAJO_DE_AREA = new Set(['EN_PROCESO', 'LISTO'])
const ESTADOS_PRODUCCION = new Set(['DESPACHO', 'COMPLETADO', 'ENTREGADO'])

const ms = (f) => {
  const t = f ? Date.parse(f) : NaN
  return Number.isNaN(t) ? null : t
}

function extremo(logs, pred, cual) {
  let r = null
  for (const l of logs) {
    if (!pred(l)) continue
    const t = ms(l.fecha)
    if (t == null) continue
    if (r == null || (cual === 'primera' ? t < r : t > r)) r = t
  }
  return r
}

const esLogDeProduccion = (l) => {
  const campo = String(l.campo || '')
  const despues = String(l.despues || '')
  if (campo.startsWith('CORTE') && despues === 'CORTADO') return true
  if (campo.startsWith('SUBESTADO') && /EN_PROCESO|LISTO/.test(despues)) return true
  return campo === 'ESTADO_PEDIDO' && despues === 'DESPACHO'
}

/**
 * @returns {{ etapa: 0|1|2|3|4|null, fechas: (string|null)[], cancelado: boolean }}
 */
export function calcularEtapa({ pedido, items = [], logs = [], ahora = new Date() }) {
  const estado = String(pedido?.estado_pedido || '').toUpperCase()
  if (estado === 'CANCELADO') return { etapa: null, fechas: [null, null, null, null, null], cancelado: true }

  const vivos = items.filter((i) => !i.eliminado)
  const f = [null, null, null, null, null]

  f[0] = extremo(logs, (l) => l.campo === 'CREACION', 'primera') ?? ms(pedido?.fecha_pedido)
  f[1] = extremo(logs, (l) => l.campo === 'IMPRESION_PRODUCCION', 'primera') ?? ms(pedido?.fecha_impresion_produccion)
  f[2] = extremo(logs, esLogDeProduccion, 'primera')

  const enTaller = vivos.some((i) =>
    i.subestado_corte === 'CORTADO'
    || Object.values(parseSubestados(i.subestado, i.area)).some((v) => TRABAJO_DE_AREA.has(v)))
  const produccion = enTaller || ESTADOS_PRODUCCION.has(estado)
  const transito = estado === 'COMPLETADO' || estado === 'ENTREGADO'

  if (transito) {
    f[3] = extremo(logs, (l) => l.campo === 'ESTADO_PEDIDO' && l.despues === 'COMPLETADO', 'ultima')
      ?? ms(pedido?.fecha_actualizacion)
  }

  let entregado = false
  if (estado === 'ENTREGADO') {
    entregado = true
    f[4] = extremo(logs, (l) => l.campo === 'ESTADO_PEDIDO' && l.despues === 'ENTREGADO', 'ultima') ?? f[3]
  } else if (estado === 'COMPLETADO' && f[3] != null) {
    const limite = f[3] + HORAS_HASTA_ENTREGADO * 3600 * 1000
    if (ahora.getTime() >= limite) { entregado = true; f[4] = limite }
  }

  const etapa = entregado ? 4 : transito ? 3 : produccion ? 2 : f[1] != null ? 1 : 0
  const fechas = f.map((t, k) => (k <= etapa && t != null ? new Date(t).toISOString() : null))
  return { etapa, fechas, cancelado: false }
}
```

- [ ] **Step 5: Correr las pruebas**

Run: `node --test tests/etapa-cliente.test.js`
Expected: PASS (todas). Luego `npm test` completo: 0 fallos.

- [ ] **Step 6: Commit**

```bash
git add lib/etapaCliente.js lib/parseFecha.js tests/etapa-cliente.test.js
git commit -m "Seguimiento: las 5 etapas que ve el cliente, con sus fechas"
```
(con la línea `Co-Authored-By` de la sesión)

---

### Task 2: Validar, tapar y armar la respuesta pública

**Files:**
- Create: `lib/seguimientoPublico.js`
- Test: `tests/seguimiento-publico.test.js`

**Interfaces:**
- Consumes: nada (puro).
- Produces:
  - `TIENDA_PUBLICA = 'MANDARINA'`
  - `LIMITE = { ventanaMin: 15, porIp: 10, fallosPorNumero: 5 }`
  - `MENSAJE_NO_ENCONTRADO`, `MENSAJE_DEMASIADOS`
  - `soloDigitos(s) → string`
  - `celularCoincide(escrito, guardado) → boolean`
  - `normalizarNumero(entrada) → { id: string|null, numero: string } | null`
  - `pedidoCoincideNumero(pedidoId, n) → boolean`
  - `taparCedula(cedula) → string`
  - `tieneSaldoPendiente(pedido) → boolean`
  - `armarRespuesta({ pedido, items, cliente, guia, etapaInfo }) → RespuestaPublica`
    `RespuestaPublica = { pedidoId, nombre, primerNombre, celular, cedula, ciudad, etapa, fechas, cancelado, guia: {numero, transportista}|null, saldoPendiente, prendas: {nombre,color,talla,cantidad,foto}[] }`
  - `decidirLimite({ intentosIp, fallosNumero }) → 'ok'|'bloqueado'`
  - `limpiarPromo(body) → Promo` y `promoVisible(promo) → boolean`
    `Promo = { activa: boolean, etiqueta, titulo, texto, codigo, link }` (strings; `link` vacío o `https://…`)

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
// tests/seguimiento-publico.test.js
//
// La ruta pública /api/publico/pedido la abre cualquiera con un celular y un
// número. Lo que se prueba aquí es lo que la protege: con qué coincide, qué se
// tapa y qué NUNCA sale del servidor.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  celularCoincide, normalizarNumero, pedidoCoincideNumero, taparCedula,
  tieneSaldoPendiente, armarRespuesta, decidirLimite, limpiarPromo, promoVisible,
  LIMITE, TIENDA_PUBLICA,
} from '../lib/seguimientoPublico.js'

test('el celular coincide en cualquier formato (últimos 9 dígitos)', () => {
  for (const escrito of ['0998765678', '+593 99 876 5678', '593998765678', '998765678', '099-876-5678']) {
    assert.ok(celularCoincide(escrito, '0998765678'), escrito)
  }
  assert.ok(celularCoincide('0998765678', '+593998765678'))
})

test('lo vacío o corto nunca coincide, ni con un cliente sin celular', () => {
  assert.equal(celularCoincide('', ''), false)
  assert.equal(celularCoincide('', null), false)
  assert.equal(celularCoincide('5678', '0998765678'), false)
  assert.equal(celularCoincide('0998765678', '0998765679'), false)
})

test('el número de pedido como lo escriba el cliente', () => {
  for (const e of ['6308', ' 6308 ', '#6308', '06308']) {
    assert.deepEqual(normalizarNumero(e), { id: null, numero: '6308' }, e)
  }
  assert.deepEqual(normalizarNumero('man-jac-6308'), { id: 'MAN-JAC-6308', numero: '6308' })
  assert.equal(normalizarNumero(''), null)
  assert.equal(normalizarNumero('abc'), null)
})

test('el número apunta a su pedido y no a uno que termina igual', () => {
  const n = normalizarNumero('6308')
  assert.ok(pedidoCoincideNumero('MAN-JAC-6308', n))
  assert.equal(pedidoCoincideNumero('MAN-JAC-16308', n), false)
  assert.ok(pedidoCoincideNumero('MAN-JAC-6308', normalizarNumero('MAN-JAC-6308')))
  assert.equal(pedidoCoincideNumero('MAN-AND-6308', normalizarNumero('MAN-JAC-6308')), false)
})

test('la cédula tapa los 5 dígitos del medio', () => {
  assert.equal(taparCedula('1712345321'), '17*****321')
  assert.equal(taparCedula('1712345674001'), '1712*****4001')
  assert.equal(taparCedula(''), '')
  assert.equal(taparCedula(null), '')
  assert.equal(taparCedula('12345'), '*****', 'una cédula rara y corta se tapa entera')
})

test('saldo pendiente: misma regla que la hoja del PDF', () => {
  assert.equal(tieneSaldoPendiente({ monto_total: 50, monto_abonado: 25, estado_pago: 'ABONO' }), true)
  assert.equal(tieneSaldoPendiente({ monto_total: 50, monto_abonado: 50, estado_pago: 'ABONO' }), false)
  assert.equal(tieneSaldoPendiente({ monto_total: 50, monto_abonado: 0, estado_pago: 'PAGADO' }), false)
  assert.equal(tieneSaldoPendiente({ monto_total: 50, monto_abonado: 49.995 }), false, 'menos de un centavo')
  assert.equal(tieneSaldoPendiente({}), false)
})

const muestra = () => ({
  pedido: {
    pedido_id: 'MAN-JAC-6308', tienda_id: 'MANDARINA', estado_pedido: 'COMPLETADO',
    monto_total: 125.5, monto_abonado: 50, monto_pendiente: 75.5, estado_pago: 'ABONO',
    direccion_pedido: 'QUITO\nAv. Amazonas N34-120\nEdificio Torres', notas_vendedor: 'cliente VIP',
  },
  items: [
    { producto_nombre: 'HOODIE PREMIUM', color: 'Negro', talla: 'M', cantidad: '1', precio_unit: '45', subtotal: '45',
      foto_pecho_url: '', foto_espalda_url: 'https://res.cloudinary.com/x/espalda.jpg', eliminado: false },
    { producto_nombre: 'CAMISETA', color: 'Blanco', talla: 'S', cantidad: '2', eliminado: true },
  ],
  cliente: { nombre: 'Valeria Andrade Montalvo', cedula: '1712345321', celular: '0998765678',
    ciudad: 'Quito', email: 'valeria@correo.com', direccion: 'Av. Amazonas N34-120' },
  guia: { numero: '1234567890', transportista: 'Servientrega' },
  etapaInfo: { etapa: 3, fechas: ['a', 'b', 'c', 'd', null], cancelado: false },
})

test('la respuesta lleva lo acordado', () => {
  const r = armarRespuesta(muestra())
  assert.equal(r.pedidoId, 'MAN-JAC-6308')
  assert.equal(r.primerNombre, 'Valeria')
  assert.equal(r.celular, '0998765678', 'el celular va completo')
  assert.equal(r.cedula, '17*****321')
  assert.equal(r.ciudad, 'Quito')
  assert.equal(r.saldoPendiente, true)
  assert.deepEqual(r.guia, { numero: '1234567890', transportista: 'Servientrega' })
  assert.equal(r.prendas.length, 1, 'las prendas eliminadas no se muestran')
  assert.equal(r.prendas[0].foto, 'https://res.cloudinary.com/x/espalda.jpg', 'sin foto de pecho, la de espalda')
  assert.equal(r.prendas[0].cantidad, 1)
})

test('NUNCA salen montos, cédula completa, dirección, email ni notas', () => {
  const json = JSON.stringify(armarRespuesta(muestra()))
  for (const prohibido of ['125.5', '75.5', '1712345321', 'Amazonas', 'valeria@correo.com',
    'cliente VIP', 'monto', 'precio', 'subtotal', 'direccion', 'email', 'notas']) {
    assert.ok(!json.includes(prohibido), `la respuesta filtró «${prohibido}»`)
  }
})

test('la guía solo se muestra desde Tránsito', () => {
  const m = muestra()
  m.etapaInfo = { etapa: 2, fechas: [null, null, null, null, null], cancelado: false }
  assert.equal(armarRespuesta(m).guia, null)
})

test('pedido sin prendas vivas: lista vacía, sin romperse', () => {
  const m = muestra()
  m.items = [{ producto_nombre: 'X', eliminado: true }]
  assert.deepEqual(armarRespuesta(m).prendas, [])
})

test('límite de intentos', () => {
  assert.deepEqual(LIMITE, { ventanaMin: 15, porIp: 10, fallosPorNumero: 5 })
  assert.equal(decidirLimite({ intentosIp: 9, fallosNumero: 4 }), 'ok')
  assert.equal(decidirLimite({ intentosIp: 10, fallosNumero: 0 }), 'bloqueado')
  assert.equal(decidirLimite({ intentosIp: 0, fallosNumero: 5 }), 'bloqueado')
})

test('solo MANDARINA', () => {
  assert.equal(TIENDA_PUBLICA, 'MANDARINA')
})

test('la promo: se limpia, se corta y el link debe ser https', () => {
  const p = limpiarPromo({ activa: 'true', titulo: '  2x1 en camisetas  ', link: 'javascript:alert(1)', codigo: 'x'.repeat(200) })
  assert.equal(p.activa, true)
  assert.equal(p.titulo, '2x1 en camisetas')
  assert.equal(p.link, '', 'un link que no es https se descarta')
  assert.equal(p.codigo.length, 40)
  assert.equal(limpiarPromo({ link: 'https://www.mandarinaec.com/x' }).link, 'https://www.mandarinaec.com/x')
  assert.equal(limpiarPromo(null).activa, false)
})

test('la promo se ve solo prendida y con título', () => {
  assert.equal(promoVisible({ activa: true, titulo: '2x1' }), true)
  assert.equal(promoVisible({ activa: false, titulo: '2x1' }), false)
  assert.equal(promoVisible({ activa: true, titulo: '' }), false)
  assert.equal(promoVisible(null), false)
})

test('la ruta pública está en RUTAS_PUBLICAS del middleware', () => {
  const mw = readFileSync(new URL('../middleware.js', import.meta.url), 'utf8')
  assert.ok(mw.includes("'/api/publico/pedido'"), 'falta /api/publico/pedido en RUTAS_PUBLICAS')
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test tests/seguimiento-publico.test.js`
Expected: FAIL — `Cannot find module '…/lib/seguimientoPublico.js'`.

- [ ] **Step 3: Crear `lib/seguimientoPublico.js`**

```js
// lib/seguimientoPublico.js
//
// Lo que protege a la página pública /pedido. Puro: sin base, sin red.
//
// La página la abre CUALQUIERA que tenga el celular y el número de pedido. Por
// eso la respuesta se arma aquí, campo por campo, con una lista de lo que SÍ
// sale (nunca «todo menos…»): un campo nuevo en la tabla no se filtra solo.
// Lo que nunca sale: montos, cédula completa, dirección, email, notas.

export const TIENDA_PUBLICA = 'MANDARINA'
export const LIMITE = Object.freeze({ ventanaMin: 15, porIp: 10, fallosPorNumero: 5 })
export const MENSAJE_NO_ENCONTRADO = 'No encontramos ese pedido. Revisa el número de tu hoja y el celular con el que compraste.'
export const MENSAJE_DEMASIADOS = 'Demasiados intentos, prueba en unos minutos.'

export const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '')

const ultimos9 = (cel) => {
  const d = soloDigitos(cel)
  return d.length >= 9 ? d.slice(-9) : ''
}

/** Compara los últimos 9 dígitos. Lo vacío o corto nunca coincide. */
export function celularCoincide(escrito, guardado) {
  const a = ultimos9(escrito)
  return a !== '' && a === ultimos9(guardado)
}

/** "6308", "#6308", "06308" → {numero:'6308'}; "man-jac-6308" → id completo. */
export function normalizarNumero(entrada) {
  const t = String(entrada ?? '').trim().toUpperCase().replace(/^#/, '')
  if (/^[A-Z]+-[A-Z]+-\d+$/.test(t)) return { id: t, numero: t.split('-').pop().replace(/^0+/, '') }
  const numero = soloDigitos(t).replace(/^0+/, '')
  return numero ? { id: null, numero } : null
}

export function pedidoCoincideNumero(pedidoId, n) {
  if (!n || !pedidoId) return false
  if (n.id) return pedidoId === n.id
  return String(pedidoId).split('-').pop().replace(/^0+/, '') === n.numero
}

/** Tapa los 5 dígitos del medio: 1712345321 → 17*****321. */
export function taparCedula(cedula) {
  const c = String(cedula ?? '').trim()
  if (!c) return ''
  if (c.length < 7) return '*'.repeat(c.length)
  const ini = Math.floor((c.length - 5) / 2)
  return `${c.slice(0, ini)}*****${c.slice(ini + 5)}`
}

/** Misma regla que la hoja del PDF del cliente (PdfGraciasPagina). */
export function tieneSaldoPendiente(pedido) {
  if (String(pedido?.estado_pago || '').toUpperCase() === 'PAGADO') return false
  const saldo = (Number(pedido?.monto_total) || 0) - (Number(pedido?.monto_abonado) || 0)
  return saldo >= 0.01
}

const texto = (v) => String(v ?? '').trim()

/** La foto que representa a la prenda: pecho → espalda → mangas (como fotoPrincipal). */
const fotoDe = (i) => i.foto_pecho_url || i.foto_espalda_url || i.foto_manga_d_url || i.foto_manga_i_url || ''

export function armarRespuesta({ pedido, items = [], cliente, guia, etapaInfo }) {
  const nombre = texto(cliente?.nombre)
  return {
    pedidoId: pedido.pedido_id,
    nombre,
    primerNombre: nombre.split(/\s+/)[0] || '',
    celular: soloDigitos(cliente?.celular),
    cedula: taparCedula(cliente?.cedula),
    ciudad: texto(cliente?.ciudad),
    etapa: etapaInfo.etapa,
    fechas: etapaInfo.fechas,
    cancelado: etapaInfo.cancelado,
    guia: etapaInfo.etapa != null && etapaInfo.etapa >= 3 && guia?.numero
      ? { numero: texto(guia.numero), transportista: texto(guia.transportista) }
      : null,
    saldoPendiente: tieneSaldoPendiente(pedido),
    prendas: items.filter((i) => !i.eliminado).map((i) => ({
      nombre: texto(i.producto_nombre),
      color: texto(i.color),
      talla: texto(i.talla),
      cantidad: parseInt(i.cantidad, 10) || 1,
      foto: fotoDe(i),
    })),
  }
}

/** Los conteos son de ANTES de este intento. */
export function decidirLimite({ intentosIp, fallosNumero }) {
  if (intentosIp >= LIMITE.porIp) return 'bloqueado'
  if (fallosNumero >= LIMITE.fallosPorNumero) return 'bloqueado'
  return 'ok'
}

const corta = (v, max) => texto(v).slice(0, max)

/** Lo que se guarda de la promo. Un link que no es https se descarta. */
export function limpiarPromo(body) {
  const b = body || {}
  const link = corta(b.link, 300)
  return {
    activa: b.activa === true || b.activa === 'true',
    etiqueta: corta(b.etiqueta, 60),
    titulo: corta(b.titulo, 80),
    texto: corta(b.texto, 160),
    codigo: corta(b.codigo, 40),
    link: /^https:\/\//i.test(link) ? link : '',
  }
}

export const promoVisible = (p) => Boolean(p?.activa && texto(p?.titulo))
```

- [ ] **Step 4: Agregar la ruta a `middleware.js`**, al final de `RUTAS_PUBLICAS` (después de `'/api/shopify/pedidos',`):

```js
  // '/api/publico/pedido' — el seguimiento del cliente en mandarinaec.com/pedido
  //   (9-oct-2026). El cliente no tiene sesión. Se defiende SOLA: responde solo si
  //   el número Y el celular coinciden, solo MANDARINA, con límite de intentos por
  //   IP y por número, y arma la respuesta con lista blanca de campos
  //   (lib/seguimientoPublico.js). Nunca devuelve montos ni la cédula completa.
  '/api/publico/pedido',
```

- [ ] **Step 5: Correr las pruebas**

Run: `node --test tests/seguimiento-publico.test.js` → PASS. Luego `npm test` → 0 fallos.

- [ ] **Step 6: Commit**

```bash
git add lib/seguimientoPublico.js tests/seguimiento-publico.test.js middleware.js
git commit -m "Seguimiento: validar celular y número, tapar la cédula y armar la respuesta pública"
```

---

### Task 3: Tablas en Supabase y el repositorio

**Files:**
- Create: `docs/sql/2026-10-09-seguimiento-publico.sql`
- Create: `lib/db/seguimiento.js`

**Interfaces:**
- Consumes: `getSupabase()` de `lib/supabase.js`; `LIMITE` de `lib/seguimientoPublico.js`.
- Produces:
  - `buscarPedidosPorNumero(n) → Promise<filaPedido[]>` (`n` = salida de `normalizarNumero`)
  - `cargarDetallePublico(pedido) → Promise<{ items, logs, cliente, guia }>` (las formas que piden `calcularEtapa` y `armarRespuesta`)
  - `contarIntentos({ ip, numero }) → Promise<{ intentosIp, fallosNumero }>`
  - `registrarConsulta({ ip, numero, resultado, pedidoId? }) → Promise<void>` (no lanza)
  - `leerPromo() → Promise<Promo|null>` · `guardarPromo(promo, usuario) → Promise<void>`

- [ ] **Step 1: Escribir la migración** `docs/sql/2026-10-09-seguimiento-publico.sql`

```sql
-- Seguimiento público del pedido (mandarinaec.com/pedido) — 9-oct-2026.
-- Spec: docs/superpowers/specs/2026-10-09-seguimiento-pedido-mandarina-design.md

-- Cada consulta de la página pública: para el límite de intentos y para ver si
-- alguien está barriendo números de pedido.
create table if not exists crm.consultas_publicas (
  id         bigserial primary key,
  fecha      timestamptz not null default now(),
  ip         text not null,
  numero     text,
  resultado  text not null check (resultado in ('ok', 'fallo', 'bloqueado')),
  pedido_id  text
);
create index if not exists consultas_publicas_ip_fecha
  on crm.consultas_publicas (ip, fecha desc);
create index if not exists consultas_publicas_fallos_numero
  on crm.consultas_publicas (numero, fecha desc) where resultado = 'fallo';
alter table crm.consultas_publicas enable row level security;

-- Configuración que se ve en páginas públicas. Hoy: la promo del seguimiento.
create table if not exists crm.config_publica (
  clave           text primary key,
  valor           jsonb not null,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
alter table crm.config_publica enable row level security;

-- Arranca APAGADA: la página no muestra promo hasta que Rodrigo la prenda.
insert into crm.config_publica (clave, valor, actualizado_por)
values ('promo_mandarina',
        '{"activa":false,"etiqueta":"","titulo":"","texto":"","codigo":"","link":""}',
        'SISTEMA')
on conflict (clave) do nothing;
```

- [ ] **Step 2: Aplicarla** con la herramienta de Supabase `apply_migration` (proyecto `piingkecjgoisnxccvaa`, nombre `seguimiento_publico`), que la deja en `supabase_migrations.schema_migrations`.

- [ ] **Step 3: Verificar contra la base**

```sql
select table_name from information_schema.tables
 where table_schema = 'crm' and table_name in ('consultas_publicas', 'config_publica');
select clave, valor from crm.config_publica;
```
Expected: las dos tablas, y `promo_mandarina` con `"activa": false`.

- [ ] **Step 4: Crear `lib/db/seguimiento.js`**

```js
// lib/db/seguimiento.js
// Repositorio del seguimiento PÚBLICO del pedido (mandarinaec.com/pedido).
// Solo Supabase: Sheets está apagado desde el 19-ago y esto es nuevo.
//
// Cada lectura trae SOLO las columnas que hacen falta. La lista blanca de lo que
// le llega al cliente está en lib/seguimientoPublico.js (armarRespuesta); aquí
// se evita además que viajen montos o la dirección más allá del servidor.

import { getSupabase } from '../supabase'
import { LIMITE } from '../seguimientoPublico'

const COLS_PEDIDO = [
  'pedido_id', 'tienda_id', 'cliente_id', 'fecha_pedido', 'fecha_actualizacion',
  'estado_pedido', 'estado_pago', 'monto_total', 'monto_abonado',
  'fecha_impresion_produccion', 'guia_numero', 'guia_transportista',
].join(',')

const COLS_ITEM = [
  'producto_nombre', 'color', 'talla', 'cantidad', 'area', 'subestado', 'subestado_corte',
  'foto_pecho_url', 'foto_espalda_url', 'foto_manga_d_url', 'foto_manga_i_url', 'eliminado',
].join(',')

const COLS_CLIENTE = ['nombre', 'cedula', 'celular', 'ciudad'].join(',')
const COLS_LOG = ['fecha', 'campo', 'valor_despues'].join(',')
const COLS_GUIA = ['numero_guia', 'transportista', 'fecha_despacho'].join(',')

/** Candidatos por número. `like '%-6308'` no atrapa MAN-JAC-16308 (exige el guion). */
export async function buscarPedidosPorNumero(n) {
  if (!n) return []
  let q = getSupabase().from('pedidos').select(COLS_PEDIDO)
  q = n.id ? q.eq('pedido_id', n.id) : q.like('pedido_id', `%-${n.numero}`)
  const { data, error } = await q.limit(5)
  if (error) throw error
  return data || []
}

export async function cargarDetallePublico(pedido) {
  const sb = getSupabase()
  const id = pedido.pedido_id
  const [it, lg, cl, gu] = await Promise.all([
    sb.from('detalle_pedido').select(COLS_ITEM).eq('pedido_id', id).eq('eliminado', false),
    sb.from('logs_pedidos').select(COLS_LOG).eq('pedido_id', id).order('fecha', { ascending: true }),
    pedido.cliente_id
      ? sb.from('clientes').select(COLS_CLIENTE).eq('cliente_id', pedido.cliente_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from('guias_despacho').select(COLS_GUIA).eq('pedido_id', id)
      .order('fecha_despacho', { ascending: false }).limit(1),
  ])
  for (const r of [it, lg, cl, gu]) if (r.error) throw r.error

  const g = gu.data?.[0]
  const guia = g?.numero_guia
    ? { numero: g.numero_guia, transportista: g.transportista }
    : pedido.guia_numero ? { numero: pedido.guia_numero, transportista: pedido.guia_transportista } : null

  return {
    items: it.data || [],
    logs: (lg.data || []).map((l) => ({ fecha: l.fecha, campo: l.campo, despues: l.valor_despues })),
    cliente: cl.data || null,
    guia,
  }
}

export async function contarIntentos({ ip, numero }) {
  const desde = new Date(Date.now() - LIMITE.ventanaMin * 60 * 1000).toISOString()
  const sb = getSupabase()
  const [a, b] = await Promise.all([
    sb.from('consultas_publicas').select('id', { count: 'exact', head: true })
      .eq('ip', ip).gte('fecha', desde),
    sb.from('consultas_publicas').select('id', { count: 'exact', head: true })
      .eq('numero', numero).eq('resultado', 'fallo').gte('fecha', desde),
  ])
  if (a.error) throw a.error
  if (b.error) throw b.error
  return { intentosIp: a.count || 0, fallosNumero: b.count || 0 }
}

/** NO-THROW: que no se pueda anotar no le quita la respuesta al cliente. */
export async function registrarConsulta({ ip, numero, resultado, pedidoId }) {
  try {
    const { error } = await getSupabase().from('consultas_publicas')
      .insert({ ip, numero: numero || null, resultado, pedido_id: pedidoId || null })
    if (error) throw error
  } catch (e) {
    console.error('consultas_publicas error:', e?.message || e)
  }
}

const PROMO_CLAVE = 'promo_mandarina'

export async function leerPromo() {
  const { data, error } = await getSupabase().from('config_publica')
    .select('valor').eq('clave', PROMO_CLAVE).maybeSingle()
  if (error) throw error
  return data?.valor || null
}

/** Se mandan TODAS las columnas: un upsert parcial pone en NULL lo que no viaja. */
export async function guardarPromo(promo, usuario) {
  const { error } = await getSupabase().from('config_publica').upsert({
    clave: PROMO_CLAVE,
    valor: promo,
    actualizado_en: new Date().toISOString(),
    actualizado_por: usuario || 'SISTEMA',
  }, { onConflict: 'clave' })
  if (error) throw error
}
```

- [ ] **Step 5: Compilar** — `npm run build` debe terminar sin errores (este archivo aún no lo usa nadie, pero así se caza un import roto).

- [ ] **Step 6: Commit**

```bash
git add docs/sql/2026-10-09-seguimiento-publico.sql lib/db/seguimiento.js
git commit -m "Seguimiento: tablas de consultas y promo, y su repositorio"
```

---

### Task 4: La ruta pública `POST /api/publico/pedido`

**Files:**
- Create: `app/api/publico/pedido/route.js`

**Interfaces:**
- Consumes: Tarea 1 (`calcularEtapa`), Tarea 2 (`normalizarNumero`, `pedidoCoincideNumero`, `celularCoincide`, `armarRespuesta`, `decidirLimite`, `TIENDA_PUBLICA`, `MENSAJE_*`), Tarea 3 (repositorio), `registrarEvento` de `lib/eventos.js`.
- Produces: `POST { celular, numero }` →
  - `200 RespuestaPublica` · `404 { error: MENSAJE_NO_ENCONTRADO }` · `429 { error: MENSAJE_DEMASIADOS }` · `500 { error: 'No pudimos cargar tu pedido. Intenta de nuevo en un momento.' }`

- [ ] **Step 1: Crear la ruta**

```js
// app/api/publico/pedido/route.js
//
// Seguimiento del pedido para el CLIENTE (mandarinaec.com/pedido). Pública: está
// en RUTAS_PUBLICAS del middleware y se defiende sola. Ver
// docs/superpowers/specs/2026-10-09-seguimiento-pedido-mandarina-design.md.
//
// ☠️ Un solo mensaje para todo fallo (no existe, otro celular, otra tienda): si
// dijera «ese pedido existe pero el celular no», regalaría la mitad del secreto.
export const dynamic = 'force-dynamic'

import {
  normalizarNumero, pedidoCoincideNumero, celularCoincide, armarRespuesta,
  decidirLimite, TIENDA_PUBLICA, MENSAJE_NO_ENCONTRADO, MENSAJE_DEMASIADOS,
} from '@/lib/seguimientoPublico'
import { calcularEtapa } from '@/lib/etapaCliente'
import {
  buscarPedidosPorNumero, cargarDetallePublico, contarIntentos, registrarConsulta,
} from '@/lib/db/seguimiento'
import { registrarEvento } from '@/lib/eventos'

const SIN_CACHE = { 'Cache-Control': 'no-store' }

function ipDe(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || req.headers.get('x-real-ip') || 'desconocida'
}

export async function POST(req) {
  const ip = ipDe(req)
  let body = {}
  try { body = await req.json() } catch { /* cuerpo vacío o roto: cae en «no encontrado» */ }

  const n = normalizarNumero(body?.numero)
  const numero = n ? (n.id || n.numero) : String(body?.numero ?? '').slice(0, 40)

  try {
    const intentos = await contarIntentos({ ip, numero })
    if (decidirLimite(intentos) === 'bloqueado') {
      await registrarConsulta({ ip, numero, resultado: 'bloqueado' })
      return Response.json({ error: MENSAJE_DEMASIADOS }, { status: 429, headers: SIN_CACHE })
    }

    const candidatos = n ? await buscarPedidosPorNumero(n) : []
    const pedido = candidatos.find((p) => p.tienda_id === TIENDA_PUBLICA && pedidoCoincideNumero(p.pedido_id, n))
    const detalle = pedido ? await cargarDetallePublico(pedido) : null

    if (!pedido || !celularCoincide(body?.celular, detalle?.cliente?.celular)) {
      await registrarConsulta({ ip, numero, resultado: 'fallo' })
      return Response.json({ error: MENSAJE_NO_ENCONTRADO }, { status: 404, headers: SIN_CACHE })
    }

    const etapaInfo = calcularEtapa({ pedido, items: detalle.items, logs: detalle.logs })
    await registrarConsulta({ ip, numero, resultado: 'ok', pedidoId: pedido.pedido_id })
    return Response.json(armarRespuesta({ pedido, ...detalle, etapaInfo }), { headers: SIN_CACHE })
  } catch (e) {
    await registrarEvento({
      fuente: 'supabase',
      nivel: 'error',
      mensaje: `El seguimiento público falló: ${e?.message || e}`,
      detalle: { ruta: '/api/publico/pedido', numero },
    })
    return Response.json(
      { error: 'No pudimos cargar tu pedido. Intenta de nuevo en un momento.' },
      { status: 500, headers: SIN_CACHE },
    )
  }
}
```

- [ ] **Step 2: Compilar y revisar el bundle** — `npm run build`; luego confirmar que el `select` llegó entero al build:

Run: `grep -o "fecha_impresion_produccion,guia_numero" .next/server/app/api/publico/pedido/route.js | head -1`
Expected: una coincidencia (si sale vacío, el build se comió una coma: ver la trampa del 19-ago en la skill).

- [ ] **Step 3: Correr `npm test`** → 0 fallos (incluye `select-no-se-rompe-en-el-build`).

- [ ] **Step 4: Commit**

```bash
git add app/api/publico/pedido/route.js
git commit -m "Seguimiento: ruta pública del pedido con límite de intentos"
```

---

### Task 5: La promo editable (solo ADMIN)

**Files:**
- Create: `components/seguimiento/Promo.js`
- Create: `app/api/promo-seguimiento/route.js`
- Create: `app/dashboard/promo-seguimiento/page.js`
- Modify: `app/dashboard/page.js` (lista de accesos de ADMIN, junto a `{href:'/dashboard/producto-nuevo',…}`, ~línea 325)
- Modify: `app/dashboard/layout.js` (lista del menú, junto a `tipos-prenda`, ~línea 27)

**Interfaces:**
- Consumes: `requireAdmin(req)` de `lib/auth.js` → `{ ok, status, error, usuario }`; `limpiarPromo`, `promoVisible` (Tarea 2); `leerPromo`, `guardarPromo` (Tarea 3).
- Produces:
  - `GET /api/promo-seguimiento` → `{ promo: Promo }` · `PUT` (cuerpo `Promo`) → `{ ok: true, promo }`
  - `<Promo promo={Promo} enCabecera={boolean} />`: el recuadro de boleto (lo usa la Tarea 6). Usa las clases `promo`, `promoEnCabecera`, `promoTxt`, `regalo`, `codigo`, `promoAcc` de `components/seguimiento/seguimiento.module.css` (Step 1). Las variables de color viven en `.raiz`: **todo lugar que pinte `<Promo>` debe estar dentro de un elemento con `className={s.raiz}`**.

- [ ] **Step 1: Crear `components/seguimiento/seguimiento.module.css`** — el CSS COMPLETO de la maqueta aprobada (lo usan la promo de esta tarea y la página de la Tarea 6). Las variables viven en `.raiz` porque un módulo CSS no admite `:root`:

```css
/* La hoja «¡Gracias!» del PDF, a una columna para el celular. Maqueta aprobada
   por Rodrigo el 9-oct-2026. Tema claro a propósito: es la misma hoja que recibe
   el cliente en papel/PDF. */
.raiz{
  --naranja:#e85d04; --naranja-osc:#c94800; --naranja-cla:#ff8c00;
  --tinta:#1a1a1a; --gris:#666; --linea:#e0e0e0; --fondo-ficha:#fafafa;
  --papel:#ffffff; --fondo:#f1ece7;
  --ok:#15803d; --ok-bg:#dcfce7; --ok-borde:#86efac;
  --alerta:#b91c1c; --alerta-bg:#fee2e2; --alerta-borde:#fca5a5;
  --wa:#1f9d55;
  --sans:'Helvetica Neue',Helvetica,Arial,sans-serif;
  --mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  color-scheme:light;
  min-height:100vh; background:var(--fondo); color:var(--tinta); font-family:var(--sans);
  padding:20px 16px 40px; box-sizing:border-box;
}
.raiz *{box-sizing:border-box}
.hoja{max-width:560px;margin:0 auto;background:var(--papel);border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(60,30,10,.12)}

.cabecera{position:relative;overflow:hidden;background:linear-gradient(135deg,var(--naranja-osc) 0%,var(--naranja) 40%,var(--naranja-cla) 100%);padding:24px 22px;color:#fff}
.cabecera::before{content:"";position:absolute;top:-80px;right:-80px;width:240px;height:240px;border-radius:50%;background:rgba(0,0,0,.12)}
.cabecera::after{content:"";position:absolute;bottom:-60px;left:30%;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.06)}
.cabFila{position:relative;z-index:1;display:flex;gap:16px;align-items:center}
.cabFila img{width:96px;height:96px;object-fit:contain;flex:none}
.cabTxt{min-width:0}
.marca{font-size:11px;letter-spacing:3px;font-weight:700;text-transform:uppercase;opacity:.9;margin-bottom:4px}
.saludo{font-size:clamp(28px,8vw,36px);font-weight:900;line-height:1.05;letter-spacing:-1px;text-shadow:0 2px 8px rgba(0,0,0,.35);margin:0;text-wrap:balance}
.cabNota{position:relative;z-index:1;margin-top:14px;background:rgba(0,0,0,.28);border-radius:10px;padding:10px 14px;font-size:13px;line-height:1.5}

.cortePunteado{border-top:1.5px dashed #ccc}
.cuerpo{padding:18px 18px 8px;display:flex;flex-direction:column;gap:14px}
.etiqueta{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700}
.idpedido{font-family:var(--mono);font-weight:900;font-size:14px;background:#f0f0f0;border:1.5px solid #ccc;border-radius:8px;padding:4px 10px}

/* Avance */
.avance{border:2px solid var(--linea);border-radius:14px;padding:14px 16px}
.avanceCab{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.pasos{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,1fr)}
.paso{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;position:relative;min-width:0}
.paso::before{content:"";position:absolute;top:13px;left:-50%;width:100%;height:3px;background:var(--linea);z-index:0}
.paso:first-child::before{display:none}
.hecho::before,.actual::before{background:var(--naranja)}
.punto{width:28px;height:28px;border-radius:50%;background:#fff;border:3px solid var(--linea);display:grid;place-items:center;font-size:13px;font-weight:900;color:#fff;position:relative;z-index:1}
.hecho .punto{background:var(--naranja);border-color:var(--naranja)}
.actual .punto{border-color:var(--naranja);box-shadow:0 0 0 5px rgba(232,93,4,.18)}
.actual .punto::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--naranja)}
.pasoNom{font-size:11px;font-weight:700;line-height:1.2;color:var(--gris)}
.hecho .pasoNom{color:var(--tinta)}
.actual .pasoNom{color:var(--naranja-osc)}
.pasoFecha{font-size:10px;color:var(--gris);font-variant-numeric:tabular-nums}
.avanceMsg{margin:14px 0 0;font-size:14px;line-height:1.45;font-weight:600}

/* Pago */
.saldo{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:var(--alerta-bg);border:2px solid var(--alerta-borde)}
.saldo h3{margin:0 0 3px;font-size:13px;font-weight:800;color:var(--alerta)}
.saldo p{margin:0 0 10px;font-size:13px;color:var(--alerta);font-weight:600;line-height:1.4}
.pagado{display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:10px;background:var(--ok-bg);border:2px solid var(--ok-borde);font-size:13px;font-weight:800;color:var(--ok)}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-weight:800;font-size:14px;border:0;border-radius:10px;padding:11px 16px;cursor:pointer;text-decoration:none}
.btnWa{background:var(--wa);color:#fff}
.btnNaranja{background:var(--naranja);color:#fff;width:100%;font-size:16px;padding:14px}
.btnNaranja:disabled{opacity:.6;cursor:default}
.btn:focus-visible,.campo input:focus-visible{outline:3px solid var(--naranja-cla);outline-offset:2px}

/* Datos */
.datos{border:2px solid var(--linea);border-radius:14px;padding:14px 16px}
.nombre{font-size:21px;font-weight:900;text-align:center;margin:8px 0 10px;line-height:1.1}
.fichas{display:flex;flex-wrap:wrap;gap:8px}
.ficha{background:#f5f5f5;border:1px solid var(--linea);border-radius:10px;padding:8px 14px 8px 12px}
.ficha .etiqueta{font-size:8px;letter-spacing:1px;margin-bottom:3px}
.fichaValor{font-family:var(--mono);font-weight:800;font-size:14px}
.notaPriv{margin:10px 0 0;font-size:11px;color:var(--gris)}

/* Prendas */
.prendas{display:flex;flex-direction:column;gap:8px}
.prenda{display:flex;gap:12px;background:var(--fondo-ficha);border:1px solid var(--linea);border-radius:10px;padding:11px 12px}
.prendaFoto{width:92px;height:92px;flex:none;border-radius:8px;border:2px solid var(--linea);background:#eee;object-fit:cover}
.prendaInfo{min-width:0;flex:1}
.prendaTit{display:flex;gap:6px;align-items:flex-start;margin-bottom:6px}
.prendaNum{font-family:var(--mono);font-size:9px;font-weight:800;color:#888;line-height:17px}
.prendaNom{font-size:14px;font-weight:800;line-height:1.25;flex:1;min-width:0}
.cant{background:rgba(232,93,4,.1);color:var(--naranja);border-radius:6px;padding:2px 8px;font-weight:900;font-size:13px}
.chip{display:inline-block;background:#fff;border:1px solid var(--linea);border-radius:6px;padding:3px 8px;margin:0 5px 4px 0;font-size:11px;font-weight:800}
.chip small{font-size:9px;color:var(--gris);font-weight:400}

/* Promo */
.promo{position:relative;background:#fff;color:var(--tinta);border-radius:16px;padding:16px 18px;box-shadow:0 8px 32px rgba(0,0,0,.18);border:1.5px solid var(--linea);display:flex;gap:14px;align-items:center}
.promo::before,.promo::after{content:"";position:absolute;top:50%;margin-top:-9px;width:18px;height:18px;border-radius:50%;background:var(--naranja-osc)}
.promo::before{left:-9px}.promo::after{right:-9px}
.promoEnCabecera{z-index:1;margin-top:16px}
.promoTxt{flex:1;min-width:0}
.regalo{font-size:11px;font-weight:700;margin-bottom:3px}
.promoTxt h3{margin:0 0 4px;font-size:16px;font-weight:900;line-height:1.25;text-wrap:balance}
.promoTxt p{margin:0;font-size:12px}
.codigo{font-family:var(--mono);font-weight:900;font-size:15px;border:1.5px dashed var(--naranja);color:var(--naranja-osc);border-radius:8px;padding:6px 10px;text-align:center;white-space:nowrap}
.promoAcc{display:flex;flex-direction:column;gap:6px;align-items:stretch}
.promoAcc a{font-size:12px;font-weight:800;color:var(--naranja-osc);text-align:center}

/* Dudas y pie */
.duda{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;border:2px solid var(--linea);border-radius:14px;padding:14px 16px}
.duda h3{margin:0 0 2px;font-size:15px;font-weight:900}
.duda p{margin:0;font-size:13px;color:var(--gris)}
.duda .btn{flex:1 1 220px}
.pie{display:flex;justify-content:space-between;padding:9px 18px;background:#f5f5f5;border-top:1px solid var(--linea);font-size:10px;font-weight:600;margin-top:10px}

/* Entrada */
.campo{display:flex;flex-direction:column;gap:6px}
.campo label{font-size:12px;font-weight:800}
.campo input{font:inherit;font-size:18px;padding:13px 14px;border:2px solid var(--linea);border-radius:10px;background:#fff;color:var(--tinta);font-family:var(--mono)}
.campo small{color:var(--gris);font-size:12px}
.error{background:var(--alerta-bg);border:2px solid var(--alerta-borde);color:var(--alerta);border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700}
.volver{background:none;border:0;color:var(--naranja-osc);font:inherit;font-weight:800;font-size:13px;cursor:pointer;align-self:flex-start;padding:0}

@media (max-width:420px){
  .pasoNom{font-size:9.5px}
  .pasoFecha{display:none}
  .prendaFoto{width:72px;height:72px}
  .promo{flex-direction:column;align-items:stretch}
  .cabFila img{width:72px;height:72px}
}
```

- [ ] **Step 2: Crear `components/seguimiento/Promo.js`**

```js
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
```

- [ ] **Step 3: Crear `app/api/promo-seguimiento/route.js`**

```js
// La promo de la página pública /pedido. Solo ADMIN la lee y la cambia aquí;
// la página pública la lee por su lado (app/pedido/page.js).
export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { limpiarPromo } from '@/lib/seguimientoPublico'
import { leerPromo, guardarPromo } from '@/lib/db/seguimiento'

export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  try {
    return Response.json({ promo: limpiarPromo(await leerPromo()) })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  try {
    const promo = limpiarPromo(await req.json())
    await guardarPromo(promo, auth.usuario?.NOMBRE)
    return Response.json({ ok: true, promo })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
```
Antes de seguir, confirmar que `getUsuarioById` devuelve el nombre en `NOMBRE`: `grep -n "NOMBRE" lib/db/usuarios.js | head -3`. Si la clave es otra, usar esa.

- [ ] **Step 4: Crear `app/dashboard/promo-seguimiento/page.js`**

```js
'use client'
// Promo que ve el cliente en mandarinaec.com/pedido. Solo ADMIN.
import { useEffect, useState } from 'react'
import Promo from '@/components/seguimiento/Promo'
import { promoVisible } from '@/lib/seguimientoPublico'
import s from '@/components/seguimiento/seguimiento.module.css'

const VACIA = { activa: false, etiqueta: '', titulo: '', texto: '', codigo: '', link: '' }
const CAMPOS = [
  { k: 'etiqueta', label: 'Etiqueta', ph: '🎁 Promo de octubre' },
  { k: 'titulo',   label: 'Título',   ph: '2x1 en camisetas personalizadas' },
  { k: 'texto',    label: 'Texto',    ph: 'Válido hasta el 31 de octubre en mandarinaec.com' },
  { k: 'codigo',   label: 'Código',   ph: 'MANDI2X1' },
  { k: 'link',     label: 'Link (https://…)', ph: 'https://www.mandarinaec.com/collections/…' },
]

export default function PromoSeguimientoPage() {
  const [promo, setPromo] = useState(VACIA)
  const [estado, setEstado] = useState('CARGANDO') // CARGANDO | LISTO | GUARDANDO | ERROR
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    fetch('/api/promo-seguimiento')
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setPromo(d.promo); setEstado('LISTO') })
      .catch((e) => { setAviso(`No se pudo cargar la promo: ${e.message}`); setEstado('ERROR') })
  }, [])

  async function guardar() {
    setEstado('GUARDANDO'); setAviso('')
    try {
      const r = await fetch('/api/promo-seguimiento', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promo),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPromo(d.promo)
      setAviso(d.promo.activa ? '✅ Guardada. Los clientes ya la ven.' : '✅ Guardada. Está apagada: los clientes no la ven.')
      setEstado('LISTO')
    } catch (e) {
      setAviso(`❌ No se guardó: ${e.message}`); setEstado('LISTO')
    }
  }

  const set = (k) => (e) => setPromo((p) => ({ ...p, [k]: e.target.value }))

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Promo del seguimiento</h1>
        <p className="text-sm text-gray-400">Es la que ve el cliente en mandarinaec.com/pedido, arriba de su pedido.</p>
      </div>

      <label className="card p-4 flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-white font-semibold">{promo.activa ? '🟢 Prendida' : '⚪ Apagada'}</span>
        <input id="promo-activa" type="checkbox" className="w-5 h-5" checked={promo.activa}
          onChange={(e) => setPromo((p) => ({ ...p, activa: e.target.checked }))} />
      </label>

      <div className="card p-4 space-y-3">
        {CAMPOS.map((c) => (
          <div key={c.k}>
            <label htmlFor={`promo-${c.k}`} className="block text-xs text-gray-400 mb-1">{c.label}</label>
            <input id={`promo-${c.k}`} className="input w-full" value={promo[c.k]} placeholder={c.ph} onChange={set(c.k)} />
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="text-xs text-gray-400 mb-2">Vista previa</div>
        {/* Dentro de .raiz: ahí viven los colores de la promo. */}
        <div className={s.raiz} style={{ minHeight: 0, padding: 16, borderRadius: 12, background: '#e85d04' }}>
          {promoVisible(promo) ? <Promo promo={promo} /> : <div style={{ color: '#fff', fontSize: 14 }}>Apagada o sin título: el cliente no ve ningún recuadro.</div>}
        </div>
      </div>

      {aviso && <div className="text-sm text-white">{aviso}</div>}
      <button className="btn-primary w-full" disabled={estado !== 'LISTO'} onClick={guardar}>
        {estado === 'GUARDANDO' ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Las dos superficies del menú**

En `app/dashboard/layout.js`, después de la línea de `tipos-prenda`:
```js
  { href:'/dashboard/promo-seguimiento', label:'Promo del seguimiento', icon:'🎁', roles:['ADMIN'] },
```
En `app/dashboard/page.js`, en la lista de accesos de ADMIN, después de `{href:'/dashboard/producto-nuevo',…}`:
```js
          {href:'/dashboard/promo-seguimiento',icon:'🎁',label:'Promo seguimiento'},
```

- [ ] **Step 6: `npm test` y `npm run build`** → sin fallos.

- [ ] **Step 7: Commit**

```bash
git add components/seguimiento/Promo.js components/seguimiento/seguimiento.module.css app/api/promo-seguimiento/route.js app/dashboard/promo-seguimiento/page.js app/dashboard/page.js app/dashboard/layout.js
git commit -m "Seguimiento: pantalla para prender y cambiar la promo (solo ADMIN)"
```

---

### Task 6: La página pública `/pedido`

**Files:**
- Create: `components/seguimiento/HojaPedido.js`
- Create: `components/seguimiento/Seguimiento.js`
- Create: `app/pedido/page.js`
- Create: `public/logos/logo_mandarina_240.png`

**Interfaces:**
- Consumes: `RespuestaPublica` (Tarea 2), `ETAPAS_CLIENTE` (Tarea 1), `formatDiaMes` (Tarea 1), `<Promo>` (Tarea 5), `leerPromo` (Tarea 3), `promoVisible`/`limpiarPromo` (Tarea 2), `imagenAncho` de `lib/imagenes.js`.
- Produces: la página `GET /pedido`. Avisa su alto al marco con `postMessage({ tipo: 'mandarina-pedido-altura', alto })` (lo usa la Tarea 8).

- [ ] **Step 1: El CSS ya está completo** desde la Tarea 5 (`components/seguimiento/seguimiento.module.css`). No se toca.

- [ ] **Step 2: Logo liviano** (el original pesa 808 KB). En PowerShell:

```powershell
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("C:\Users\RodrigoWork\Desktop\MANDARINACRM\public\logos\logo_mandarina.png")
$bmp = New-Object System.Drawing.Bitmap 240, 240
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'
$g.DrawImage($src, 0, 0, 240, 240)
$bmp.Save("C:\Users\RodrigoWork\Desktop\MANDARINACRM\public\logos\logo_mandarina_240.png", [System.Drawing.Imaging.ImageFormat]::Png)
```
Expected: archivo de menos de 100 KB.

- [ ] **Step 3: Crear `components/seguimiento/HojaPedido.js`**

```js
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
              <span className={s.pasoFecha}>{formatDiaMes(p.fechas[k])}</span>
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
```

- [ ] **Step 4: Crear `components/seguimiento/Seguimiento.js`**

```js
'use client'
// Entrada (celular + número) y la hoja del pedido. Avisa su alto al marco de
// Shopify para que el iframe de mandarinaec.com/pedido no tenga doble scroll.
import { useEffect, useRef, useState } from 'react'
import s from './seguimiento.module.css'
import Promo from './Promo'
import HojaPedido, { waCon } from './HojaPedido'

const ORIGENES_TIENDA = ['https://www.mandarinaec.com', 'https://mandarinaec.com']

export default function Seguimiento({ promo }) {
  const [celular, setCelular] = useState('')
  const [numero, setNumero] = useState('')
  const [pedido, setPedido] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const raiz = useRef(null)

  useEffect(() => {
    if (!raiz.current || window.parent === window) return
    const avisar = () => {
      const alto = raiz.current?.scrollHeight || 0
      for (const o of ORIGENES_TIENDA) window.parent.postMessage({ tipo: 'mandarina-pedido-altura', alto }, o)
    }
    const ro = new ResizeObserver(avisar)
    ro.observe(raiz.current)
    avisar()
    return () => ro.disconnect()
  }, [])

  async function consultar(e) {
    e.preventDefault()
    setError(''); setCargando(true)
    try {
      const r = await fetch('/api/publico/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular, numero }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No pudimos cargar tu pedido. Intenta de nuevo en un momento.'); return }
      setPedido(d)
      window.scrollTo(0, 0)
    } catch {
      setError('No hay conexión. Revisa tu internet e intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div ref={raiz} className={s.raiz}>
      {pedido ? (
        <HojaPedido p={pedido} promo={promo} onVolver={() => { setPedido(null); setError('') }} />
      ) : (
        <section className={s.hoja}>
          <div className={s.cabecera}>
            <div className={s.cabFila}>
              <img src="/logos/logo_mandarina_240.png" alt="Mandarina Republic" />
              <div className={s.cabTxt}>
                <div className={s.marca}>Mandarina Republic</div>
                <h1 className={s.saludo}>Sigue tu pedido</h1>
              </div>
            </div>
            <div className={s.cabNota}>Escribe tu celular y el número que aparece en tu hoja de pedido.</div>
          </div>
          <div className={s.cortePunteado} />
          <form className={s.cuerpo} onSubmit={consultar} noValidate>
            {error && <div className={s.error} role="alert">{error}</div>}
            <div className={s.campo}>
              <label htmlFor="seg-celular">Tu celular</label>
              <input id="seg-celular" inputMode="tel" autoComplete="tel" placeholder="09 9876 5678"
                value={celular} onChange={(e) => setCelular(e.target.value)} />
            </div>
            <div className={s.campo}>
              <label htmlFor="seg-numero">Número de pedido</label>
              <input id="seg-numero" inputMode="numeric" placeholder="6308"
                value={numero} onChange={(e) => setNumero(e.target.value)} />
              <small>Está en tu hoja de pedido, por ejemplo <b>MAN-JAC-6308</b>. Basta con <b>6308</b>.</small>
            </div>
            <button className={`${s.btn} ${s.btnNaranja}`} type="submit" disabled={cargando || !celular || !numero}>
              {cargando ? 'Buscando…' : 'Ver mi pedido'}
            </button>
            {promo && <Promo promo={promo} />}
            <div className={s.duda}>
              <div><h3>¿No tienes el número o tienes una duda?</h3><p>Escríbenos y te ayudamos.</p></div>
              <a className={`${s.btn} ${s.btnWa}`} target="_blank" rel="noopener noreferrer"
                href={waCon('Hola, quiero consultar mi pedido')}>💬 Escríbenos por WhatsApp</a>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Crear `app/pedido/page.js`**

```js
// Página PÚBLICA del seguimiento (mandarinaec.com/pedido la muestra en un marco).
// El middleware solo cubre /api y /dashboard: esta página no pide sesión. Lo que
// protege los datos está en /api/publico/pedido.
export const dynamic = 'force-dynamic'

import Seguimiento from '@/components/seguimiento/Seguimiento'
import { leerPromo } from '@/lib/db/seguimiento'
import { limpiarPromo, promoVisible } from '@/lib/seguimientoPublico'

export const metadata = {
  title: 'Sigue tu pedido · Mandarina Republic',
  robots: { index: false, follow: false },
}

export default async function PedidoPublicoPage() {
  let promo = null
  try {
    const p = limpiarPromo(await leerPromo())
    promo = promoVisible(p) ? p : null
  } catch (e) {
    // Sin promo la página sirve igual: el seguimiento es lo importante.
    console.error('Promo del seguimiento no cargó:', e?.message || e)
  }
  return <Seguimiento promo={promo} />
}
```

- [ ] **Step 6: Probar en local** — `npm run dev`, abrir `http://localhost:3000/pedido` en ancho de celular (400 px) y de escritorio:
  - con un número inventado (`99999`) y cualquier celular → aparece el mensaje genérico;
  - con un pedido real de MANDARINA y su celular (sacarlos con `select p.pedido_id, c.celular from crm.pedidos p join crm.clientes c using (cliente_id) where p.tienda_id='MANDARINA' order by p.fecha_pedido desc limit 3;`) → se ve la hoja, la etapa, las fotos, la cédula tapada y nada de montos;
  - con un pedido de INDSTORE y su celular → mensaje genérico;
  - con la promo apagada no aparece ningún recuadro de promo.

- [ ] **Step 7: `npm test` y `npm run build`** → sin fallos.

- [ ] **Step 8: Commit**

```bash
git add components/seguimiento/HojaPedido.js components/seguimiento/Seguimiento.js app/pedido/page.js public/logos/logo_mandarina_240.png
git commit -m "Seguimiento: página pública /pedido con la hoja del cliente, etapas y promo"
```

---

### Task 7: Que `mandarinaec.com` pueda mostrar `/pedido` (y nada más)

**Files:**
- Modify: `lib/origenes.js` (agregar `ORIGENES_TIENDA` debajo de `ORIGEN_CRM`)
- Modify: `next.config.js` (`headers()`)
- Test: `tests/csp.test.js`

**Interfaces:**
- Produces: `ORIGENES_TIENDA = ['https://www.mandarinaec.com', 'https://mandarinaec.com']`.

- [ ] **Step 1: Escribir las pruebas que fallan**, al final de `tests/csp.test.js`:

```js
import { ORIGENES_TIENDA } from '../lib/origenes.js'

test('la tienda puede enmarcar SOLO /pedido', () => {
  // Bloque de /pedido: lleva los orígenes de la tienda.
  const bloque = config.match(/source:\s*'\/pedido'[\s\S]*?frame-ancestors([^"]*)"/)
  assert.ok(bloque, 'falta la regla de /pedido en next.config.js')
  for (const o of ORIGENES_TIENDA) assert.ok(bloque[1].includes(o), `falta ${o} en la CSP de /pedido`)
  // Regla general: NO los lleva (el resto del CRM no se puede enmarcar desde la tienda).
  const general = config.match(/source:\s*'\/:path\*'[\s\S]*?frame-ancestors([^"]*)"/)
  for (const o of ORIGENES_TIENDA) assert.ok(!general[1].includes(o), `${o} no debe poder enmarcar todo el CRM`)
})

test('la regla de /pedido va DESPUÉS de la general (Next: la última gana)', () => {
  assert.ok(config.indexOf("source: '/pedido'") > config.indexOf("source: '/:path*'"))
})
```

- [ ] **Step 2: Correr** `node --test tests/csp.test.js` → FAIL (`ORIGENES_TIENDA` no existe).

- [ ] **Step 3: Agregar a `lib/origenes.js`**, debajo de `ORIGEN_CRM`:

```js
/**
 * La tienda de Mandarina (Shopify). Puede enmarcar SOLO la página pública
 * /pedido (seguimiento del cliente, 9-oct-2026); nunca el resto del CRM.
 */
export const ORIGENES_TIENDA = Object.freeze([
  'https://www.mandarinaec.com',
  'https://mandarinaec.com',
])
```

- [ ] **Step 4: En `next.config.js`**, dentro del arreglo que devuelve `headers()`, **después** del bloque `source: '/:path*'`:

```js
      // /pedido es la página PÚBLICA del seguimiento: la tienda la muestra en un
      // marco en mandarinaec.com/pedido. Solo esta ruta; el resto del CRM sigue
      // cerrado a la tienda. Va DESPUÉS de la general porque Next se queda con la
      // última cabecera que coincide. Repetido a mano: ver ORIGENES_TIENDA en
      // lib/origenes.js y tests/csp.test.js.
      {
        source: '/pedido',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://inbox.apps.mandarinaec.com https://ind-inbox.apps.mandarinaec.com https://www.mandarinaec.com https://mandarinaec.com",
          },
        ],
      },
```

- [ ] **Step 5: Correr** `node --test tests/csp.test.js` → PASS; `npm test` → 0 fallos.

- [ ] **Step 6: Commit**

```bash
git add lib/origenes.js next.config.js tests/csp.test.js
git commit -m "Seguimiento: mandarinaec.com puede mostrar /pedido en un marco, y nada más del CRM"
```

---

### Task 8: Desplegar, probar con datos reales y ponerlo en `mandarinaec.com/pedido`

**Files:**
- Modify: `docs/ESTADO-CRM.md` (sección «Qué está en producción»)

- [ ] **Step 1: Subir y confirmar el despliegue**

```bash
npm test && npm run build
git push origin main
git status -sb            # debe decir: ## main...origin/main sin "ahead"
vercel ls mandarina-pro-sales --prod   # el primero, ● Ready, creado segundos después del push
```

- [ ] **Step 2: Probar la ruta pública en producción**

```bash
# número inventado → 404 con el mensaje genérico
curl -s -X POST https://crm.apps.mandarinaec.com/api/publico/pedido -H "Content-Type: application/json" -d '{"celular":"0990000000","numero":"99999999"}' -w "\n%{http_code}\n"
# la cabecera de /pedido deja enmarcar a la tienda; la de /dashboard no
curl -sI https://crm.apps.mandarinaec.com/pedido | grep -i content-security-policy
curl -sI https://crm.apps.mandarinaec.com/dashboard | grep -i content-security-policy
```
Expected: `404` con «No encontramos ese pedido…»; `/pedido` con `https://www.mandarinaec.com`; `/dashboard` **sin** ella.

Límite: repetir el primer `curl` 11 veces seguidas → la 11.ª responde `429`. Luego revisar en la base:
```sql
select resultado, count(*) from crm.consultas_publicas where fecha > now() - interval '1 hour' group by 1;
```

- [ ] **Step 3: Prueba real con Rodrigo** — pedirle un pedido de MANDARINA suyo (o de confianza) y su celular. Abrir `https://crm.apps.mandarinaec.com/pedido` **en su celular** y confirmar con él: etapa correcta, fotos, cédula tapada, celular completo, sin montos, aviso de saldo si corresponde, botones de WhatsApp abren el chat de Mandarina con el texto escrito. **No dar por probado sin su confirmación.**

- [ ] **Step 4: Prender la promo con Rodrigo** desde «Promo del seguimiento» en el CRM, y confirmar que aparece en la página.

- [ ] **Step 5: La página en Shopify — con permiso de Rodrigo antes de tocar la tienda**
  1. Llamar `get-shop-info` y confirmar que el dominio es `mandarinaec.com` (el MCP de Shopify cambia de tienda solo).
  2. En el tema MAIN (`151861624925`), crear la plantilla `templates/page.pedido.liquid`:
     ```liquid
     <iframe id="mandarina-pedido" src="https://crm.apps.mandarinaec.com/pedido" title="Sigue tu pedido"
       style="width:100%;border:0;min-height:900px;display:block"></iframe>
     <script>
       window.addEventListener('message', function (e) {
         if (e.origin !== 'https://crm.apps.mandarinaec.com') return;
         if (!e.data || e.data.tipo !== 'mandarina-pedido-altura') return;
         document.getElementById('mandarina-pedido').style.height = Math.ceil(e.data.alto) + 'px';
       });
     </script>
     ```
  3. Crear la página «Sigue tu pedido» con handle `pedido` y la plantilla `page.pedido` (queda en `/pages/pedido`).
  4. Crear la redirección `/pedido` → `/pages/pedido`.
  5. Abrir `https://www.mandarinaec.com/pedido` en el celular de Rodrigo: sin doble scroll, se ve completa, consulta un pedido.
  - **Plan B** si el marco falla (altura, scroll en iPhone): cambiar la redirección a `/pedido` → `https://crm.apps.mandarinaec.com/pedido`. Decidirlo con Rodrigo.

- [ ] **Step 6: Actualizar `docs/ESTADO-CRM.md`** — agregar al inicio de «Qué está en producción» un párrafo: qué hace la página, las 5 etapas, qué se tapa, dónde se cambia la promo, cómo se ven las consultas (`crm.consultas_publicas`), y que INDSTORE queda pendiente.

- [ ] **Step 7: Commit**

```bash
git add docs/ESTADO-CRM.md
git commit -m "ESTADO-CRM: seguimiento del pedido en mandarinaec.com/pedido"
git push origin main
```
