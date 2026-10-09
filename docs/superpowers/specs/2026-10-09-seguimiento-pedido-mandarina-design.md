# Seguimiento de pedido para el cliente (`mandarinaec.com/pedido`) — diseño

**Fecha:** 9-oct-2026 · **Estado:** diseño aprobado en conversación, falta revisar este documento
**Maqueta aprobada:** https://claude.ai/artifact/4rB1oruUpDbbyX5yxbHK4k (datos de ejemplo)

## Para qué

El cliente de MANDARINA entra a `mandarinaec.com/pedido`, escribe su celular y
su número de pedido, y ve en qué va su pedido. En la misma página ve una
promoción que Rodrigo prende, apaga y cambia desde el CRM. La idea es mandar a
los clientes a la web para que vean esa promo.

Es la **Fase 1**. La **Fase 2** (tres mensajes de WhatsApp por etapa, con
interruptor APAGADO / RESPUESTA RÁPIDA / RESPUESTA REAL) va en otro documento y
reutiliza las etapas definidas aquí.

**Sabremos que funciona cuando:**
- el cliente ve el estado real de su pedido con solo su celular y su número;
- nadie puede ver un pedido ajeno ni sacar datos sensibles adivinando;
- Rodrigo cambia o apaga la promo sin tocar código.

## Alcance

**Dentro:** solo pedidos de la tienda `MANDARINA`.
**Fuera, por ahora:** INDSTORE (se replica en `indlovers.com/pedido` cuando
esta funcione) y YAW.

## Lo que ve el cliente

### Pantalla de entrada
Cabecera con el degradado naranja y el logo, como la hoja «¡Gracias!».
- **Tu celular**: se comparan los **últimos 9 dígitos** contra `clientes.celular`
  (acepta `0998…`, `+593 99…`, con o sin espacios).
- **Número de pedido**: basta con el número (`6308`); también acepta el id
  completo (`MAN-JAC-6308`). El número no se repite entre tiendas.
- Botón **Ver mi pedido**.
- Recuadro de la promo (si está prendida).
- Recuadro «¿No tienes el número o tienes una duda?» con botón de WhatsApp.

Si no coincide: **«No encontramos ese pedido. Revisa el número de tu hoja y el
celular con el que compraste.»** El mismo mensaje para todo: pedido que no
existe, celular que no coincide, pedido de otra tienda. Nunca revela cuál falló.

### Pantalla «Mi pedido»
La **misma estructura de la primera hoja del PDF del cliente**
(`PdfGraciasPagina` en `components/pedido/PdfPedido.js`), acomodada a una
columna para el celular. No es la hoja A4 encogida: así la letra quedaba de 4 px.

De arriba abajo:
1. **Cabecera** naranja: logo, «MANDARINA REPUBLIC», «¡Hola, {primer nombre}!»
   y una nota corta.
2. **Promo**, en el lugar del recuadro del cupón del PDF (mismas muescas de
   boleto). Se oculta entera si está apagada.
3. **Estado del pedido**: id (`MAN-JAC-6308`), barra de 5 etapas con la fecha de
   cada etapa alcanzada, y el mensaje de la etapa actual. **Sin fecha prometida.**
4. **Pago**:
   - con saldo → aviso rojo «Tu pedido tiene un saldo pendiente de pago» +
     botón «Completar mi pago por WhatsApp». **Nunca se muestra ningún monto.**
   - pagado → «PAGO COMPLETO» en verde, como en el PDF.
5. **Datos de envío**, tapados (ver Seguridad).
6. **Contenido · N prendas**: por prenda, foto frontal (`FOTO_PECHO_URL`, como
   `fotoPrincipal` del PDF), nombre, cantidad, color y talla. Sin estado interno,
   sin área, sin instrucciones de confección.
7. **«¿Tienes alguna duda?»** + botón de WhatsApp.
8. Pie: `MAN-JAC-6308 · MANDARINA REPUBLIC`.

### WhatsApp
Todos los botones abren `https://wa.me/593983745757` (número principal de
Mandarina en el inbox, `wa-inbox-next/lib/canales.js`) con el texto ya escrito:
- dudas: «Hola, tengo una duda sobre mi pedido MAN-JAC-6308»
- pago: «Hola, quiero completar el pago del pedido MAN-JAC-6308»
- entrada: «Hola, quiero consultar mi pedido»

## Las 5 etapas

Se calculan en el servidor, con datos que el CRM ya guarda. Una etapa nunca
retrocede en pantalla: se toma la más avanzada que se cumpla.

| # | etapa | se cumple cuando | fecha que se muestra |
|---|---|---|---|
| 1 | **Recibido** | el pedido existe | creación (`CREACION` en la bitácora, o `fecha_pedido`) |
| 2 | **Diseño** | hay `IMPRESION_PRODUCCION` en la bitácora | la primera impresión |
| 3 | **Producción** | alguna prenda tiene `subestado_corte = CORTADO`, o algún área la tiene en `EN_PROCESO` o `LISTO`, o el pedido está en `DESPACHO`. (`ENVIADO_APROBACION` = arte enviado al cliente: **sigue en Diseño**) | el primer `CORTE …`, `SUBESTADO …` o `ESTADO_PEDIDO → DESPACHO` |
| 4 | **Tránsito** | `estado_pedido = COMPLETADO` | el `ESTADO_PEDIDO → COMPLETADO` de la bitácora |
| 5 | **Entregado** | `estado_pedido = ENTREGADO`, **o** pasó **1 día** desde el paso a COMPLETADO | Tránsito + 1 día, o la marca ENTREGADO |

- `CANCELADO` → la página muestra «Este pedido fue cancelado. Si tienes dudas,
  escríbenos» + WhatsApp, sin barra.
- Mensajes por etapa (editables en el código, uno por etapa):
  1. Recibimos tu pedido y ya está en la fila del taller.
  2. Estamos preparando el diseño de tus prendas.
  3. Tus prendas están en producción: corte, estampado y costura.
  4. Tu pedido va en camino. (+ «Guía {transportista} {número}» si hay guía)
  5. ¡Tu pedido fue entregado! Gracias por confiar en Mandarina.
- La regla vive en **un archivo puro** (`lib/etapaCliente.js`) que recibe el
  pedido, sus ítems y su bitácora, y devuelve `{ etapa, fechas, cancelado }`.
  La Fase 2 usará esa misma función para decidir qué mensaje toca.

⚠️ «Entregado» es **calculado**, no se escribe en la base. No cambia el trabajo
de Despacho.

## Saldo pendiente

Saldo = `monto_total − monto_abonado` (lo que ya calcula el CRM con los abonos).
Pagado si `estado_pago = 'PAGADO'` o el saldo es menor a 1 centavo, la misma
regla de la hoja del PDF. La respuesta de la API **solo lleva un booleano**
`saldoPendiente`; los montos nunca salen del servidor.

## Seguridad

La página la abre cualquiera que tenga el celular y el número. Por eso:

| dato | se muestra |
|---|---|
| Nombre completo | sí |
| Celular | tapado: `09****5678` |
| Cédula | tapada: `******4321` |
| Dirección | **solo la ciudad** |
| Email | no |
| Montos (total, abonos, saldo) | no; solo «tiene saldo pendiente» sí/no |
| Prendas, fotos frontales, id del pedido | sí |
| Notas internas, área, vendedor | no |

**Ruta pública nueva:** `POST /api/publico/pedido` con `{ celular, numero }`.
- Se agrega a `RUTAS_PUBLICAS` del `middleware.js` y se defiende sola.
- Responde solo si **el número y los últimos 9 dígitos del celular coinciden**
  y el pedido es de `MANDARINA`. Cualquier otro caso: `404` con el mensaje
  genérico.
- **Límite de intentos**: 10 por IP cada 15 minutos, y 5 fallidos seguidos por
  número de pedido bloquean ese número 15 minutos. Se cuentan en una tabla
  `crm.consultas_publicas` (Vercel no guarda memoria entre llamadas). Pasado el
  límite: `429` «Demasiados intentos, prueba en unos minutos».
- Devuelve **solo** lo de la tabla de arriba, ya tapado en el servidor. El
  navegador nunca recibe la cédula ni el celular completos.
- Toda consulta (acierto, fallo, bloqueo) queda en `crm.consultas_publicas`
  con IP, número intentado y resultado. Así se ve si alguien está barriendo
  números.
- Los fallos inesperados van a `crm.eventos_sistema` con `await`.
- El texto de la página se pinta con React; nada del pedido entra por
  `innerHTML`.

## La promo

Un registro de configuración (`crm.config_publica`, clave `promo_mandarina`) con:
`activa` (sí/no), `titulo`, `texto`, `codigo`, `link`, `etiqueta` («🎁 Promo de
octubre»).

- **Pantalla nueva en el CRM**, solo ADMIN: «Promo del seguimiento». Formulario
  con esos campos, un interruptor y una vista previa del recuadro.
- La página pública la lee en cada visita. Apagada → el recuadro no aparece en
  ninguna de las dos pantallas.
- ⚠️ Una pantalla nueva va en las **dos** superficies del menú
  (`app/dashboard/page.js` y `app/dashboard/layout.js`).

## Dónde vive y cómo llega a `mandarinaec.com/pedido`

- **La página la sirve el CRM** en `crm.apps.mandarinaec.com/pedido`
  (`app/pedido/page.js`). El `middleware.js` solo cubre `/api` y `/dashboard`,
  así que la página ya es pública; la protección está en la API.
- **En Shopify** se crea la página «Pedido» con la dirección `/pedido`, que
  muestra la del CRM a ancho completo dentro de la tienda (iframe). El cliente
  no sale de `mandarinaec.com`.
- Para eso, `next.config` permite incrustar **solo `/pedido`** desde
  `https://www.mandarinaec.com` y `https://mandarinaec.com` (`frame-ancestors`).
  El resto del CRM sigue sin poder incrustarse ahí.
- Si el iframe da problemas en la prueba (altura, desplazamiento en el
  celular), el plan B es una redirección de `/pedido` a la página del CRM. Se
  decide al probarlo, con Rodrigo.

## Pruebas

- `tests/etapa-cliente.test.js`: cada etapa con su dato; que no retroceda;
  Entregado a las 23 h (no) y a las 25 h (sí) de COMPLETADO, en hora de Ecuador;
  cancelado; pedido sin bitácora.
- `tests/publico-pedido.test.js`: celular con `+593`, espacios y 0 inicial;
  pedido de INDSTORE → 404 igual que inexistente; la respuesta **no contiene**
  cédula, dirección, email ni ningún monto (se busca el texto en el JSON);
  límite de intentos.
- Prueba real antes de publicar: un pedido de Rodrigo en cada etapa, en el
  celular, dentro de `mandarinaec.com/pedido`.

## Fuera de esta fase

- Mensajes de WhatsApp por etapa y su interruptor (Fase 2).
- INDSTORE en `indlovers.com/pedido`.
- Pagar en línea desde la página (dLocal).
- Completar la bitácora con los cierres automáticos y las cancelaciones: lo
  pide la Fase 2, no esta.
