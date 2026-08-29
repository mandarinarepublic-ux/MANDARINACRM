# Pedidos de Shopify al CRM — Plan de implementación

> **Para quien lo ejecute:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ir tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que una venta pagada en `mandarinaec.com` o `indlovers.com` entre sola al CRM y suene en Telegram, y que una sin pagar avise para perseguirla.

**Arquitectura:** un webhook verifica la firma HMAC de Shopify, traduce el pedido al payload que ya usa Nueva Venta, y lo crea llamando a `/api/pedidos` autenticado como un usuario real `TIENDA WEB`. No se toca ni una línea del código que hoy vende.

**Stack:** Next.js 14 (App Router), Supabase (`crm`), `node --test`, Web Crypto para el HMAC.

**Spec:** `docs/superpowers/specs/2026-08-28-pedidos-shopify-al-crm-design.md`

## Restricciones globales

- **Español ecuatoriano con tuteo**, también en commits y comentarios.
- **Siempre `main`.** Nada de ramas: Supabase solo existe en Production.
- **NUNCA `git add -A` ni `git add .`** — hay trabajo sin commitear en este repo. Agrega por nombre.
- `node --test` **no entiende `@/`**: en las pruebas importa con ruta relativa (`../lib/x.js`).
- Los `select` de PostgREST se arman con `array.join(',')`, **nunca concatenando plantillas** (el build se come caracteres).
- Todo `fetch` mira **`res.ok`**. Un 4xx no lanza excepción.
- Nada de `registrarEvento(...)` sin `await` antes de un `return`.
- El área de todas las prendas web es exactamente `PRODUCTO SIN DISEÑO`.
- La identificación del cliente es `PENDIENTE-` + celular de 10 dígitos, con **guion medio**.

---

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `lib/shopifyPedido.js` | **Puro.** Traduce un pedido de Shopify al payload de `/api/pedidos`. Sin red, sin base. |
| `lib/shopifyWebhook.js` | **Puro.** Resuelve la tienda por dominio y verifica la firma HMAC. |
| `lib/telegram.js` | Se le agrega un aviso: pedido web sin pagar. |
| `app/api/shopify/pedidos/route.js` | La ruta. Orquesta: verifica → decide → crea o avisa. |
| `tests/shopify-pedido-mapeo.test.js` | Pruebas del mapeo. |
| `tests/shopify-webhook-firma.test.js` | Pruebas de firma y tienda, con **control negativo**. |
| `docs/sql/2026-08-28-shopify-order-id.sql` | La migración. |

---

## Tarea 1: El mapeo Shopify → CRM (puro)

**Archivos:**
- Crear: `lib/shopifyPedido.js`
- Probar: `tests/shopify-pedido-mapeo.test.js`

**Interfaces producidas** (las usa la Tarea 4):
- `normalizarCelular(v: string) => string` — 10 dígitos o `''`
- `identificacionPendiente(cel: string) => string` — `PENDIENTE-0987654321`
- `tallaYColor(variantTitle, opciones) => { talla: string, color: string }`
- `estaPagado(order) => boolean`
- `mapearPedido(order, tiendaId) => object` — el cuerpo para `POST /api/pedidos`

- [ ] **Paso 1: Escribe la prueba que falla**

```js
// tests/shopify-pedido-mapeo.test.js
import test from 'node:test'
import assert from 'node:assert'
import { normalizarCelular, identificacionPendiente } from '../lib/shopifyPedido.js'

test('el celular queda en 10 dígitos venga como venga', () => {
  for (const entrada of ['+593960643698', '0960643698', '+593 96 064 3698', '593960643698']) {
    assert.strictEqual(normalizarCelular(entrada), '0960643698', `falló con ${entrada}`)
  }
})

test('sin teléfono devuelve vacío, no basura', () => {
  assert.strictEqual(normalizarCelular(null), '')
  assert.strictEqual(normalizarCelular(''), '')
})

test('☠️ la identificación lleva GUION MEDIO: el guion bajo no pasa la validación', () => {
  const id = identificacionPendiente('0960643698')
  assert.strictEqual(id, 'PENDIENTE-0960643698')
  assert.ok(/^[A-Za-z0-9-]{3,20}$/.test(id), 'tiene que pasar validarIdentificacion de PASAPORTE')
  assert.ok(!id.includes('_'), 'un guion bajo lo reprueba el formulario de edición')
})
```

- [ ] **Paso 2: Corre la prueba y comprueba que falla**

Corre: `node --test tests/shopify-pedido-mapeo.test.js`
Esperado: FALLA con `Cannot find module '../lib/shopifyPedido.js'`

- [ ] **Paso 3: Escribe lo mínimo para que pase**

```js
// lib/shopifyPedido.js
// Traduce un pedido de Shopify al payload que ya usa Nueva Venta.
// PURO a propósito: sin red y sin base, para poder probarlo con node --test.

/** Deja el celular en 10 dígitos (0XXXXXXXXX). Vacío si no hay nada usable. */
export function normalizarCelular(v) {
  const d = String(v || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 10 && d.startsWith('0')) return d
  if (d.length === 12 && d.startsWith('593')) return '0' + d.slice(3)
  if (d.length === 9) return '0' + d
  return d.slice(-10)
}

/**
 * Shopify no pide cédula. Se guarda el celular con prefijo para que
 * `inferirTipo()` lo lea como PASAPORTE — un celular pelado son 10 dígitos y
 * caería como CÉDULA, que es justo lo contrario.
 * GUION MEDIO: la validación es /^[A-Za-z0-9-]{3,20}$/ y un `_` la reprueba.
 */
export function identificacionPendiente(celular) {
  return `PENDIENTE-${normalizarCelular(celular)}`
}
```

- [ ] **Paso 4: Corre la prueba y comprueba que pasa**

Corre: `node --test tests/shopify-pedido-mapeo.test.js`
Esperado: PASA

- [ ] **Paso 5: Prueba de talla y color — el orden NO es constante**

```js
import { tallaYColor } from '../lib/shopifyPedido.js'

test('☠️ con nombres de opción se usan los NOMBRES, nunca la posición', () => {
  const a = tallaYColor('M / Naranja', [{ name: 'Talla' }, { name: 'Color' }])
  const b = tallaYColor('Naranja / M', [{ name: 'Color' }, { name: 'Talla' }])
  assert.deepStrictEqual(a, { talla: 'M', color: 'Naranja' })
  assert.deepStrictEqual(b, { talla: 'M', color: 'Naranja' }, 'el catálogo tiene productos en los dos órdenes')
})

test('☠️ EL WEBHOOK NO MANDA LOS NOMBRES: sin ellos se reconoce la talla por su forma', () => {
  // Un line_item de webhook trae `variant_title` y nada más. Si esto se
  // resolviera por posición, la mitad del catálogo saldría con el color en
  // la talla y viceversa.
  assert.deepStrictEqual(tallaYColor('M / Naranja', []), { talla: 'M', color: 'Naranja' })
  assert.deepStrictEqual(tallaYColor('Naranja / M', []), { talla: 'M', color: 'Naranja' })
  assert.deepStrictEqual(tallaYColor('2XL / Negro', []), { talla: '2XL', color: 'Negro' })
})

test('una sola opción cae a talla', () => {
  assert.deepStrictEqual(tallaYColor('XL', []), { talla: 'XL', color: '' })
  assert.deepStrictEqual(tallaYColor('Default Title', []), { talla: '', color: '' })
})
```

- [ ] **Paso 6: Implementa `tallaYColor`**

```js
const esNombreTalla = (n) => /talla|size|tama/i.test(String(n || ''))
const esNombreColor = (n) => /color|colour/i.test(String(n || ''))
/** Formas de talla del catálogo: XS..4XL y números (tallas de niño). */
const PARECE_TALLA = /^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|\d{1,2})$/i

/**
 * El catálogo tiene productos `Talla, Color` y otros `Color, Talla`, así que
 * NUNCA se resuelve por posición.
 *
 * ⚠️ Un `line_item` de webhook trae `variant_title` y NO trae los nombres de
 * las opciones — esos viven en el producto. Por eso hay dos caminos: si los
 * nombres llegan (desde el catálogo) mandan ellos; si no, se reconoce la talla
 * por su forma y lo que sobra es el color.
 */
export function tallaYColor(variantTitle, opciones = []) {
  const bruto = String(variantTitle || '').trim()
  if (!bruto || /^default title$/i.test(bruto)) return { talla: '', color: '' }
  const partes = bruto.split('/').map(s => s.trim()).filter(Boolean)

  if (opciones.length) {
    let talla = '', color = ''
    partes.forEach((valor, i) => {
      const nombre = opciones[i]?.name
      if (esNombreColor(nombre)) color = valor
      else if (esNombreTalla(nombre)) talla = valor
      else if (!talla) talla = valor
    })
    return { talla, color }
  }

  const iTalla = partes.findIndex(p => PARECE_TALLA.test(p))
  if (iTalla === -1) return { talla: partes[0] || '', color: partes[1] || '' }
  return { talla: partes[iTalla], color: partes.filter((_, i) => i !== iTalla)[0] || '' }
}
```

- [ ] **Paso 7: Prueba de `estaPagado` y del payload completo**

```js
import { estaPagado, mapearPedido } from '../lib/shopifyPedido.js'

const PEDIDO = {
  id: 7538787221597,
  name: '#1184',
  financial_status: 'paid',
  shipping_address: { name: 'Jonathan Ríos', phone: '0980446364', address1: 'Machachi', city: 'Machachi' },
  customer: { phone: null, email: 'jr@ejemplo.com' },
  line_items: [{
    title: 'Camiseta Spider-Man', variant_title: 'M / Rojo', quantity: 2,
    price: '26.00', variant_id: 111, product_id: 222,
  }],
}

test('solo `paid` cuenta como pagado', () => {
  assert.ok(estaPagado(PEDIDO))
  for (const e of ['pending', 'voided', 'refunded', 'partially_paid', null]) {
    assert.ok(!estaPagado({ ...PEDIDO, financial_status: e }), `${e} NO es pagado`)
  }
})

test('el payload sale listo para /api/pedidos', () => {
  const p = mapearPedido(PEDIDO, 'MANDARINA', { 111: 'https://cdn/foto.jpg' })
  assert.strictEqual(p.tiendaId, 'MANDARINA')
  assert.strictEqual(p.cliente.cedula, 'PENDIENTE-0980446364')
  assert.strictEqual(p.cliente.nombre, 'Jonathan Ríos')
  assert.strictEqual(p.items[0].area, 'PRODUCTO SIN DISEÑO')
  assert.strictEqual(p.items[0].talla, 'M')
  assert.strictEqual(p.items[0].color, 'Rojo')
  assert.strictEqual(p.items[0].cantidad, 2)
  assert.strictEqual(p.items[0].precioUnit, 26)
  assert.strictEqual(p.items[0].imagenShopify, 'https://cdn/foto.jpg')
  assert.strictEqual(p.items[0].shopifyVariantId, '111')
  // pagado = abonado completo
  assert.strictEqual(p.pagos.reduce((s, x) => s + x.monto, 0), 52)
  assert.strictEqual(p.emitirFactura, false, 'estos pedidos NO se facturan en Dátil')
})

test('el teléfono sale del envío aunque el cliente no tenga', () => {
  const p = mapearPedido({ ...PEDIDO, customer: { phone: null } }, 'MANDARINA', {})
  assert.strictEqual(p.cliente.celular, '0980446364')
})
```

- [ ] **Paso 8: Implementa `estaPagado` y `mapearPedido`**

```js
export function estaPagado(order) {
  return String(order?.financial_status || '').toLowerCase() === 'paid'
}

export const AREA_WEB = 'PRODUCTO SIN DISEÑO'

/**
 * @param {object} order  pedido crudo del webhook de Shopify
 * @param {string} tiendaId  MANDARINA | INDSTORE
 * @param {object} fotos  { [variantId]: url } — la foto del producto
 */
export function mapearPedido(order, tiendaId, fotos = {}) {
  const env = order.shipping_address || {}
  const celular = normalizarCelular(env.phone || order.customer?.phone || order.phone)

  const items = (order.line_items || []).map((li) => {
    // sin nombres de opción: el webhook no los manda (ver tallaYColor)
    const { talla, color } = tallaYColor(li.variant_title)
    return {
      productoNombre: li.title || '',
      talla, color,
      cantidad: parseInt(li.quantity || 1, 10),
      precioUnit: parseFloat(li.price || 0),
      area: AREA_WEB,
      esPersonalizado: false,
      shopifyVariantId: String(li.variant_id || ''),
      imagenShopify: fotos[li.variant_id] || fotos[String(li.variant_id)] || '',
    }
  })

  const total = items.reduce((s, i) => s + i.precioUnit * i.cantidad, 0)

  return {
    tiendaId,
    cliente: {
      nombre: env.name || order.customer?.first_name || 'Cliente web',
      cedula: identificacionPendiente(celular),
      celular,
      email: order.email || order.customer?.email || '',
      ciudad: env.city || '',
      direccion: [env.address1, env.city].filter(Boolean).join(', '),
    },
    items,
    // Pagado = abonado completo. El estado de pago lo calcula /api/pedidos.
    pagos: [{ monto: total, metodo: 'TIENDA WEB', fecha: order.created_at || null }],
    emitirFactura: false, // decisión de Rodrigo: estos NO se facturan en Dátil
    direccionTexto: [env.address1, env.city].filter(Boolean).join(', '),
    notasVendedor: `Pedido web ${order.name || ''} (Shopify ${order.id})`.trim(),
  }
}
```

- [ ] **Paso 9: Corre TODAS las pruebas del repo**

Corre: `npm test`
Esperado: las 40 de siempre + la nueva, todas en verde.

- [ ] **Paso 10: Commit**

```bash
git add lib/shopifyPedido.js tests/shopify-pedido-mapeo.test.js
git commit -m "feat: mapeo puro de un pedido de Shopify al payload del CRM"
```

---

## Tarea 2: Firma HMAC y resolución de tienda

**Archivos:**
- Crear: `lib/shopifyWebhook.js`
- Probar: `tests/shopify-webhook-firma.test.js`

**Interfaces producidas:**
- `tiendaPorDominio(dominio) => { id, store, clientSecret } | null`
- `firmaValida(cuerpoCrudo: string, cabecera: string, secreto: string) => Promise<boolean>`

- [ ] **Paso 1: Escribe la prueba — el control negativo es la importante**

```js
// tests/shopify-webhook-firma.test.js
import test from 'node:test'
import assert from 'node:assert'
import { createHmac } from 'node:crypto'
import { firmaValida, tiendaPorDominio } from '../lib/shopifyWebhook.js'

const SECRETO = 'secreto-de-prueba'
const CUERPO = '{"id":123,"financial_status":"paid"}'
const firmar = (cuerpo, secreto) => createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('base64')

test('una firma buena pasa', async () => {
  assert.ok(await firmaValida(CUERPO, firmar(CUERPO, SECRETO), SECRETO))
})

test('☠️ CONTROL NEGATIVO: firma inválida NO pasa', async () => {
  assert.ok(!await firmaValida(CUERPO, firmar(CUERPO, 'otro-secreto'), SECRETO))
  assert.ok(!await firmaValida(CUERPO, 'basura', SECRETO))
  assert.ok(!await firmaValida(CUERPO, '', SECRETO))
  assert.ok(!await firmaValida(CUERPO, null, SECRETO))
})

test('☠️ un cuerpo alterado invalida la firma', async () => {
  const firma = firmar(CUERPO, SECRETO)
  assert.ok(!await firmaValida(CUERPO.replace('paid', 'pending'), firma, SECRETO))
})

test('sin secreto NUNCA pasa, aunque la firma venga vacía', async () => {
  assert.ok(!await firmaValida(CUERPO, '', ''))
})

test('un dominio desconocido no resuelve a ninguna tienda', () => {
  assert.strictEqual(tiendaPorDominio('tienda-falsa.myshopify.com'), null)
  assert.strictEqual(tiendaPorDominio(''), null)
  assert.strictEqual(tiendaPorDominio(null), null)
})
```

- [ ] **Paso 2: Corre y comprueba que falla**

Corre: `node --test tests/shopify-webhook-firma.test.js`
Esperado: FALLA, el módulo no existe.

- [ ] **Paso 3: Implementa**

```js
// lib/shopifyWebhook.js
// Verificación de webhooks de Shopify. Dos tiendas, cada una con su secreto.
import { getTiendasConfig } from './shopify.js'

/**
 * De qué tienda vino el webhook, según X-Shopify-Shop-Domain.
 * Devuelve null si no corresponde a ninguna configurada — y entonces es 401.
 */
export function tiendaPorDominio(dominio) {
  const d = String(dominio || '').trim().toLowerCase()
  if (!d) return null
  return getTiendasConfig().find(t => String(t.store || '').toLowerCase() === d) || null
}

/**
 * ⚠️ El HMAC se calcula sobre el cuerpo CRUDO. Si se hace req.json() y luego se
 * re-serializa, la firma no cuadra NUNCA: el orden de las claves y los espacios
 * cambian.
 * Comparación en tiempo constante para no filtrar la firma por temporización.
 */
export async function firmaValida(cuerpoCrudo, cabecera, secreto) {
  if (!secreto || !cabecera) return false
  const llave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const firma = await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(cuerpoCrudo))
  const esperado = Buffer.from(new Uint8Array(firma)).toString('base64')
  const a = Buffer.from(esperado)
  const b = Buffer.from(String(cabecera))
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i]
  return dif === 0
}
```

- [ ] **Paso 4: Corre y comprueba que pasa**

Corre: `npm test`
Esperado: todo verde.

- [ ] **Paso 5: Commit**

```bash
git add lib/shopifyWebhook.js tests/shopify-webhook-firma.test.js
git commit -m "feat: verificación de firma HMAC de Shopify por tienda"
```

---

## Tarea 3: El aviso de Telegram del pedido sin pagar

**Archivos:**
- Modificar: `lib/telegram.js`
- Probar: `tests/shopify-aviso-sin-pagar.test.js`

**Interfaces producidas:**
- `notificarPedidoWebSinPagar({ tiendaId, nombre, celular, monto, prendas, urlShopify }) => Promise<boolean>`
- `notificarPedidoWebFallido({ tiendaId, orderName, motivo }) => Promise<boolean>`

- [ ] **Paso 1: Prueba del texto (sin red)**

```js
// tests/shopify-aviso-sin-pagar.test.js
import test from 'node:test'
import assert from 'node:assert'
import { textoPedidoWebSinPagar, textoPedidoWebFallido } from '../lib/telegram.js'

test('el aviso trae lo necesario para perseguir la venta', () => {
  const t = textoPedidoWebSinPagar({
    tiendaId: 'MANDARINA', nombre: 'Justin Vinces', celular: '0986413373',
    monto: 35, prendas: 1, urlShopify: 'https://admin.shopify.com/…/orders/123',
  })
  for (const esperado of ['Justin Vinces', '0986413373', '35.00', 'admin.shopify.com']) {
    assert.ok(t.includes(esperado), `falta ${esperado} en el aviso`)
  }
  assert.ok(/sin pagar|no pag/i.test(t), 'tiene que decir que NO está pagado')
})

test('☠️ si el pedido no pudo entrar, el aviso dice por qué', () => {
  const t = textoPedidoWebFallido({ tiendaId: 'MANDARINA', orderName: '#1184', motivo: '401 No autenticado' })
  assert.ok(t.includes('#1184'))
  assert.ok(t.includes('401'), 'sin el motivo nadie sabe qué arreglar')
})
```

- [ ] **Paso 2: Corre y comprueba que falla**

Corre: `node --test tests/shopify-aviso-sin-pagar.test.js`
Esperado: FALLA, `textoPedidoWebSinPagar` no existe.

- [ ] **Paso 3: Agrégalos a `lib/telegram.js`**

```js
/** Texto aparte de la función que envía, para poder probarlo sin red. */
export function textoPedidoWebSinPagar({ tiendaId, nombre, celular, monto, prendas, urlShopify }) {
  const emoji = EMOJI_TIENDA[tiendaId] || '🛍️'
  return (
    `🕐 *Pedido web SIN PAGAR* ${emoji}\n` +
    `Cliente: *${nombre || '—'}*\n` +
    `Celular: \`${celular || '—'}\`\n` +
    `Monto: *$${Number(monto || 0).toFixed(2)}* · ${prendas || 0} prenda(s)\n` +
    `Llegó al checkout y no pagó. Escríbele.\n${urlShopify || ''}`
  )
}

export function textoPedidoWebFallido({ tiendaId, orderName, motivo }) {
  const emoji = EMOJI_TIENDA[tiendaId] || '🛍️'
  return (
    `🚨 *Pedido web NO entró al CRM* ${emoji}\n` +
    `Shopify: *${orderName || '—'}*\n` +
    `Motivo: \`${motivo || 'desconocido'}\`\n` +
    `Hay que cargarlo a mano.`
  )
}

export async function notificarPedidoWebSinPagar(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  return enviarTelegram(chat, textoPedidoWebSinPagar(v))
}

export async function notificarPedidoWebFallido(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  return enviarTelegram(chat, textoPedidoWebFallido(v))
}
```

- [ ] **Paso 4: Corre y comprueba que pasa**

Corre: `npm test`

- [ ] **Paso 5: Commit**

```bash
git add lib/telegram.js tests/shopify-aviso-sin-pagar.test.js
git commit -m "feat: avisos de Telegram para pedidos web sin pagar y fallidos"
```

---

## Tarea 4: La base — columna, índice y usuario TIENDA WEB

**Archivos:**
- Crear: `docs/sql/2026-08-28-shopify-order-id.sql`

- [ ] **Paso 1: Escribe la migración**

```sql
-- Anti-duplicados: Shopify reintenta los webhooks hasta 19 veces.
alter table crm.pedidos add column if not exists shopify_order_id text;

create unique index if not exists pedidos_shopify_order_id_uniq
  on crm.pedidos (shopify_order_id)
  where shopify_order_id is not null;
```

- [ ] **Paso 2: Aplícala**

Con `apply_migration` del MCP de Supabase (proyecto `piingkecjgoisnxccvaa`). Queda registrada sola en `supabase_migrations.schema_migrations`.

- [ ] **Paso 3: Verifica que el índice EXISTE y MUERDE**

```sql
-- 1. existe
select indexname from pg_indexes
 where schemaname='crm' and tablename='pedidos' and indexname='pedidos_shopify_order_id_uniq';

-- 2. muerde: la segunda inserción tiene que fallar
begin;
  insert into crm.pedidos (pedido_id, tienda_id, shopify_order_id) values ('ZZZ-TEST-1','MANDARINA','test-999');
  -- esta debe dar: duplicate key value violates unique constraint
  insert into crm.pedidos (pedido_id, tienda_id, shopify_order_id) values ('ZZZ-TEST-2','MANDARINA','test-999');
rollback;
```

Esperado: la segunda falla. **Si no falla, el índice no sirve y el resto del plan no protege nada.**

- [ ] **Paso 4: Crea el usuario TIENDA WEB**

```sql
insert into crm.usuarios (usuario_id, nombre, codigo, email, password_hash, rol, tiendas, activo)
values (gen_random_uuid()::text, 'TIENDA WEB', 'WEB', '', '', 'VENTAS', 'MANDARINA,INDSTORE', true)
returning usuario_id;
```

⚠️ `password_hash` vacío a propósito: **nadie puede entrar con esa cuenta a mano.**
Guarda el `usuario_id` que devuelve — va en Vercel como `SHOPIFY_VENDEDOR_USUARIO_ID`.

- [ ] **Paso 5: Verifica que el usuario quedó como se espera**

```sql
select usuario_id, nombre, codigo, rol, tiendas, activo from crm.usuarios where codigo = 'WEB';
```
Esperado: una fila, `activo = true`, `tiendas` con las dos.

- [ ] **Paso 6: Commit**

```bash
git add docs/sql/2026-08-28-shopify-order-id.sql
git commit -m "feat: columna shopify_order_id con índice único y usuario TIENDA WEB"
```

---

## Tarea 5: La ruta del webhook

**Archivos:**
- Crear: `app/api/shopify/pedidos/route.js`
- Probar: `tests/shopify-webhook-ruta.test.js`

**Interfaces consumidas:** todo lo de las tareas 1, 2 y 3, más `firmarSesion`/`secretoSesion` de `lib/sesion.js` y `COOKIE_SESION`.

- [ ] **Paso 1: Prueba de la ruta a nivel de fuente (el estilo de este repo)**

```js
// tests/shopify-webhook-ruta.test.js
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const ruta = readFileSync(new URL('../app/api/shopify/pedidos/route.js', import.meta.url), 'utf8')

test('☠️ lee el cuerpo CRUDO antes de parsear, o la firma nunca cuadra', () => {
  assert.ok(/await\s+req\.text\(\)/.test(ruta), 'tiene que usar req.text(), no req.json()')
  assert.ok(!/await\s+req\.json\(\)/.test(ruta), 'req.json() rompe la verificación del HMAC')
})

test('☠️ MIRA res.ok en la llamada a /api/pedidos — la lección de LINKPAGO', () => {
  assert.ok(/res\.ok|\.ok\b/.test(ruta), 'un 401 no lanza: sin res.ok el fallo se descarta solo')
})

test('☠️ si la creación falla, avisa por Telegram', () => {
  assert.ok(/notificarPedidoWebFallido/.test(ruta), 'un pedido que no entra tiene que hacer ruido')
})

test('los avisos se ESPERAN, no van fire-and-forget', () => {
  assert.ok(/await\s+notificarPedidoWebSinPagar/.test(ruta), 'en serverless un aviso sin await se pierde')
  assert.ok(/await\s+notificarPedidoWebFallido/.test(ruta))
})

test('le contesta 200 a Shopify aunque algo falle, o borra la suscripción', () => {
  assert.ok(/status:\s*200|Response\.json\(\s*\{\s*ok/.test(ruta))
})
```

- [ ] **Paso 2: Corre y comprueba que falla**

Corre: `node --test tests/shopify-webhook-ruta.test.js`
Esperado: FALLA, la ruta no existe.

- [ ] **Paso 3: Escribe la ruta**

```js
// app/api/shopify/pedidos/route.js
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { tiendaPorDominio, firmaValida } from '@/lib/shopifyWebhook'
import { mapearPedido, estaPagado, normalizarCelular } from '@/lib/shopifyPedido'
import { notificarPedidoWebSinPagar, notificarPedidoWebFallido } from '@/lib/telegram'
import { firmarSesion, secretoSesion, COOKIE_SESION } from '@/lib/sesion'
import { getSupabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'

// A Shopify SIEMPRE 200 cuando ya se hizo lo que había que hacer: si se le
// devuelve error, reintenta 19 veces y termina borrando la suscripción sola.
const ok = (detalle) => Response.json({ ok: true, ...detalle })

export async function POST(req) {
  // 1) CUERPO CRUDO. Parsear antes rompe la firma.
  const crudo = await req.text()
  const dominio = req.headers.get('x-shopify-shop-domain')
  const firma = req.headers.get('x-shopify-hmac-sha256')

  const tienda = tiendaPorDominio(dominio)
  if (!tienda) return Response.json({ error: 'Tienda desconocida' }, { status: 401 })
  if (!await firmaValida(crudo, firma, tienda.clientSecret)) {
    return Response.json({ error: 'Firma inválida' }, { status: 401 })
  }

  let order
  try { order = JSON.parse(crudo) } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const orderId = String(order.id || '')
  if (!orderId) return Response.json({ error: 'Pedido sin id' }, { status: 400 })

  // 2) ¿Ya entró? Shopify reintenta y manda orders/create + orders/paid.
  const sb = getSupabase()
  const { data: yaEsta } = await sb.from('pedidos').select('pedido_id')
    .eq('shopify_order_id', orderId).limit(1)
  if (yaEsta?.length) return ok({ duplicado: true, pedidoId: yaEsta[0].pedido_id })

  // 3) Sin pagar: NO entra al CRM, solo avisa. Si después paga, orders/paid lo trae.
  if (!estaPagado(order)) {
    const env = order.shipping_address || {}
    await notificarPedidoWebSinPagar({
      tiendaId: tienda.id,
      nombre: env.name || order.customer?.first_name,
      celular: normalizarCelular(env.phone || order.customer?.phone),
      monto: order.total_price,
      prendas: (order.line_items || []).reduce((s, i) => s + (i.quantity || 1), 0),
      urlShopify: order.order_status_url || '',
    })
    return ok({ sinPagar: true })
  }

  // 4) Pagado: se crea llamando a /api/pedidos como el usuario TIENDA WEB.
  const payload = mapearPedido(order, tienda.id, fotosDeLineItems(order))
  const token = await firmarSesion({ id: process.env.SHOPIFY_VENDEDOR_USUARIO_ID }, secretoSesion(), 1)
  const base = process.env.CRM_BASE_URL || `https://${req.headers.get('host')}`

  const res = await fetch(`${base}/api/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_SESION}=${token}` },
    body: JSON.stringify(payload),
  })

  // ☠️ LINKPAGO: un 401 NO lanza. Sin mirar res.ok el fallo se descarta solo.
  if (!res.ok) {
    const motivo = `${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`
    await notificarPedidoWebFallido({ tiendaId: tienda.id, orderName: order.name, motivo })
    await registrarEvento({ fuente: 'shopify', nivel: 'error', mensaje: `Pedido web ${order.name}: ${motivo}` })
    return ok({ creado: false, motivo })
  }

  const { pedidoId } = await res.json()
  // `origen` NO se puede mandar en el cuerpo: /api/pedidos no lo acepta (lo
  // calcula el servidor). Se marca acá, junto con el id de Shopify.
  await sb.from('pedidos')
    .update({ shopify_order_id: orderId, origen: 'tienda_web' })
    .eq('pedido_id', pedidoId)
  return ok({ creado: true, pedidoId })
}

/** La foto del producto, por variante. Viene en el propio webhook cuando existe. */
function fotosDeLineItems(order) {
  const fotos = {}
  for (const li of order.line_items || []) {
    if (li.variant_id && li.image?.src) fotos[String(li.variant_id)] = li.image.src
  }
  return fotos
}
```

- [ ] **Paso 4: Corre las pruebas**

Corre: `npm test`
Esperado: todo verde, incluidas las 5 nuevas de la ruta.

- [ ] **Paso 5: ⚠️ Verifica que el webhook trae la foto**

El webhook de Shopify **no siempre incluye `line_items[].image`**. Comprueba con un
cuerpo real (Tarea 6, paso 3). Si no viene, hay que pedirla al catálogo por
`variant_id` — y entonces se agrega un paso más a `fotosDeLineItems` usando
`fetchShopifyProducts`. **No des por hecho que viene.**

- [ ] **Paso 6: Commit**

```bash
git add app/api/shopify/pedidos/route.js tests/shopify-webhook-ruta.test.js
git commit -m "feat: webhook que mete los pedidos pagados de Shopify al CRM"
```

---

## Tarea 6: Desplegar, registrar y verificar en vivo

- [ ] **Paso 1: Variables en Vercel (proyecto `mandarina-pro-sales`)**

| variable | valor |
|---|---|
| `SHOPIFY_VENDEDOR_USUARIO_ID` | el uuid de TIENDA WEB (Tarea 4) |
| `CRM_BASE_URL` | `https://crm.apps.mandarinaec.com` |

⚠️ Cargarlas **desde bash con `printf --`**, no desde PowerShell: le pega un BOM invisible y falla solo en producción.

- [ ] **Paso 2: Push y confirmar que el despliegue es TU commit**

```bash
git status -sb        # confirma que no quedó nada sin subir
git push origin main
vercel ls --prod      # el despliegue tiene que apuntar a tu commit
```

⚠️ "Ya hice el deploy" no sube código. Y agregar una variable **redespliega lo VIEJO**.

- [ ] **Paso 3: ☠️ CONTROL NEGATIVO en la ruta desplegada, ANTES de registrar nada**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://crm.apps.mandarinaec.com/api/shopify/pedidos \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Shop-Domain: 3cnrr9-sy.myshopify.com" \
  -H "X-Shopify-Hmac-Sha256: firma-basura" \
  -d '{"id":999,"financial_status":"paid"}'
```

Esperado: **401**. Y comprobar en la base que **no se creó ningún pedido**:

```sql
select count(*) from crm.pedidos where shopify_order_id = '999';  -- tiene que dar 0
```

Sin esta prueba, un 200 no significa nada.

- [ ] **Paso 4: Probar que Telegram está VIVO**

⚠️ El `TELEGRAM_BOT_TOKEN` de IND estaba vacío y se dio por bueno porque la
variable existía. Manda un mensaje de prueba al chat de ventas y **confirma en el
chat que llegó**. No mires el código: mira el teléfono.

- [ ] **Paso 5: Registrar los webhooks en las DOS tiendas**

Por la Admin API de cada tienda, dos suscripciones por tienda:

```graphql
mutation {
  webhookSubscriptionCreate(
    topic: ORDERS_PAID
    webhookSubscription: {
      callbackUrl: "https://crm.apps.mandarinaec.com/api/shopify/pedidos"
      format: JSON
    }
  ) { webhookSubscription { id topic } userErrors { field message } }
}
```

Repetir con `topic: ORDERS_CREATE`. Y lo mismo en `indlovers.com`.

Verificar después:
```graphql
query { webhookSubscriptions(first: 10) { nodes { topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } } } }
```
Esperado: 2 por tienda.

- [ ] **Paso 6: Pedido de prueba real, por la puerta real**

Uno en cada tienda. Comprobar, **en este orden**:

1. Llegó el **mensaje de Telegram** (míralo en el chat).
2. El pedido está en el CRM con id `MAN-WEB-####` / `IND-WEB-####`.
3. Tiene cliente con `PENDIENTE-09…`, las prendas con talla, color y **la foto**.
4. `shopify_order_id` y `origen = 'tienda_web'` quedaron grabados.
5. La **talla y el color no están cruzados** (mira una variante `Color / Talla`).

- [ ] **Paso 7: Probar que NO se duplica**

En el panel de Shopify, reenviar el mismo webhook (o esperar el `orders/create` +
`orders/paid` del mismo pedido). Comprobar:

```sql
select count(*) from crm.pedidos where shopify_order_id = '<id del pedido de prueba>';
```
Esperado: **1**.

- [ ] **Paso 8: Actualizar la memoria y cerrar**

Dejar anotado en memoria: tiendas cubiertas, el uuid de TIENDA WEB, si la foto
venía o no en el webhook, y el resultado del control negativo.

---

## Pendiente aparte (no es parte de este plan)

Revisar a mano los 4 pedidos web que no se pudieron emparejar, 2 de ellos
**pagados**: Justin Vinces (8-jul), Wilson De la Vera (12-jun), **Geovanny
Suárez (20-may, $31,50)** y **David León Celorio (9-may, $35)**. No están
confirmados como perdidos — el cruce por celular/email/nombre falla fácil.
