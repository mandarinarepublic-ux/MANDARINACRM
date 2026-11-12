# Transferencia en la tienda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (Rodrigo pidió "arma e instala": ejecución nativa en la sesión + revisión final independiente).

**Goal:** botón "Pagar con transferencia" de mandarinaec.com abre nuestro recuadro: datos → bancos → cuenta + monto → foto del comprobante → pedido en el CRM (pago TRANSFERENCIA PENDIENTE, retenido) + chat con la foto en el inbox MANDI; ADMIN confirma (→ producción + Shopify pagado + CAPI) o rechaza.

**Architecture:** todo en el CRM sobre `crm.checkouts_tienda` (mismo recuadro `/pagar`, mismo `/api/publico/pago`). El pedido del CRM se crea al subir la foto llamando a `/api/pedidos` como la TIENDA WEB con `retenerTransferencia`. El pedido de Shopify se crea recién al CONFIRMAR, ya pagado (`crearPedidoPagado`), con la etiqueta `transferencia-tienda` que el webhook ignora.

**Tech Stack:** Next.js (app router), Supabase, Shopify Admin GraphQL 2025-07, Cloudinary (fotos), node:test.

**Spec:** `docs/superpowers/specs/2026-11-12-transferencia-en-tienda-design.md`

## Global Constraints

- Solo MANDARINA. Cuentas: Pichincha ahorros 2210996988, Guayaquil ahorros 38180287, Produbanco ahorros 18059046370, Deuna corriente 7700310145; titular RODRIGO CASTILLO, CI 1716608094.
- Confirmar/Rechazar: SOLO ADMIN. Sin vencimiento automático.
- CAPI Purchase y `notificarVenta` NUNCA al crear el pedido retenido; sí al confirmar. Dátil: los pedidos web no se facturan (`emitirFactura:false`), no aplica.
- Tuteo ecuatoriano en todo texto al cliente.
- Cambio respecto del spec (decisión mía): el pedido de Shopify se crea al CONFIRMAR, pagado; al rechazar no hay nada que cancelar en Shopify.

## Review Focus

1. Doble toque en "Enviar comprobante" / recarga → un solo pedido (candado `tomarParaCrear`).
2. Foto enorme del celular → se comprime en el navegador (≤1600 px JPEG) para no pasar el tope de 4,5 MB de Vercel.
3. Falla después de guardar la foto → el cliente ve "recibimos tu comprobante", queda ERROR + evento nivel error; nunca se pierde la foto.
4. `orders/paid` del pedido creado al confirmar → el webhook NO crea un segundo pedido (etiqueta).
5. Pedido retenido → no aparece en Producción/Impresión y no se puede pasar a EN_FABRICA a mano.

---

### Task 1: Datos puros (cuentas, textos, reglas de pago)
**Files:** Create `lib/cuentasBancarias.js`, `lib/transferenciaTienda.js`; Test `tests/transferencia-tienda.test.js`
**Produces:** `CUENTAS`, `cuentaPorId(id)`; `textoAvisoTransferencia(checkout, {pedidoId})`, `idAvisoTransferencia(checkoutId)`, `idAvisoConfirmacion(pagoId, accion)`, `transferenciaSinConfirmar(pagos)`, `cuentaComoAbono(pago)`, `ETIQUETA_TRANSFERENCIA = 'transferencia-tienda'`; `textoAbandono` menciona el banco si eligió transferencia.
- [ ] tests → fallan → implementar → pasan → commit

### Task 2: Base
**Files:** `docs/sql/2026-11-12-checkouts-transferencia.sql`, `lib/db/checkouts.js` (COLS)
Columnas `metodo`, `banco`, `comprobante_url`, `crm_pedido_id` en `crm.checkouts_tienda`; estado nuevo `COMPROBANTE`. Aplicar migración.

### Task 3: Abonos y alta retenida
**Files:** `lib/db/pagos.js` (recalcPago, las dos ramas, usa `cuentaComoAbono`), `app/api/pedidos/route.js`
`retenerTransferencia` solo si la sesión es `SHOPIFY_VENDEDOR_USUARIO_ID`: estado `PENDIENTE_FABRICA`, pagos con `estado:'PENDIENTE'`, montoAbonado sin ellos, sin notificarVenta ni CAPI.

### Task 4: Webhook ignora la etiqueta
**Files:** `app/api/shopify/pedidos/route.js`; test de la función pura `tieneEtiquetaTransferencia(order)`.

### Task 5: Shopify al confirmar
**Files:** `lib/shopifyCheckout.js` — `crearPedidoPagado` acepta `pago: { tipo:'transferencia', banco }` → tags `['transferencia-tienda','pago-en-tienda']`, atributo Pago "Transferencia · <banco>", nota.

### Task 6: Orquestación
**Files:** Create `lib/procesarTransferencia.js`
`procesarComprobante({ checkoutId, banco, foto })`, `confirmarTransferencia({ pagoId, admin })`, `rechazarTransferencia({ pagoId, admin })`.

### Task 7: Rutas
`app/api/publico/pago/route.js` acciones `transferencia` y `comprobante`; Create `app/api/pagos/[id]/transferencia/route.js` (ADMIN).

### Task 8: Candado de producción
`app/api/pedidos/[id]/route.js`: 409 "Falta confirmar la transferencia" al pasar a EN_FABRICA/DESPACHO/COMPLETADO/ENTREGADO con `transferenciaSinConfirmar`.

### Task 9: Pantallas
`components/pago/PagoEnTienda.js` (elegir método, bancos, copiar, subir foto), `public/pago-tienda.js` (transferencia abre el recuadro con `&m=t`), `app/pagar/page.js`, pantalla del pedido (foto + Confirmar/Rechazar para ADMIN).

### Task 10: Inbox con foto
CRM `avisarPedidoEnInbox({..., mediaUrl})`; wa-inbox-next `AvisoInterno` muestra la imagen.

### Task 11: Instalar y probar de punta a punta en producción.
