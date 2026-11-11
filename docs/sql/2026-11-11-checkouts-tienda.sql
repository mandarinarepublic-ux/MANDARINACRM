-- crm_2026_11_11_checkouts_tienda
-- Pago con tarjeta (Payphone · Cajita) DENTRO de la tienda, en un recuadro.
--
-- El cliente arma el carrito en mandarinaec.com, toca "Pagar con tarjeta" y se
-- abre /pagar del CRM en un recuadro: datos, envío y total (los calcula Shopify
-- con draftOrderCalculate) y la Cajita de Payphone. Al aprobarse el pago, el CRM
-- crea el pedido PAGADO en Shopify (draftOrderCreate + draftOrderComplete), y de
-- ahí entra solo al CRM por el webhook de siempre (orders/paid).
--
-- Una fila por intento de compra. Si el cliente dejó su celular y no pagó, el
-- cron /api/cron/carritos deja su chat como PENDIENTE en el inbox (carrito abandonado).

create table if not exists crm.checkouts_tienda (
  id                  text primary key,                 -- 10 caracteres base36 (va dentro del clientTransactionId)
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  tienda              text not null default 'MANDARINA',
  lineas              jsonb not null,                   -- [{ variantId, cantidad }] tal como vino del carrito
  cliente             jsonb,                            -- { nombre, apellido, email, celular, cedula }
  direccion           jsonb,                            -- { direccion, referencia, ciudad, provincia }
  descuento           text,
  calculo             jsonb,                            -- lo que devolvió Shopify (líneas, envío, totales)
  total_centavos      integer,                          -- lo que se cobra en Payphone
  estado              text not null default 'NUEVO',    -- NUEVO | COTIZADO | PAGANDO | CREANDO | PAGADO | ERROR
  intentos            integer not null default 0,       -- cuántas Cajitas se abrieron (sufijo del clientTransactionId)
  payphone_tx_id      text,
  payphone_detalle    jsonb,
  shopify_order_id    text,
  shopify_order_name  text,
  error               text,
  aviso_abandono_en   timestamptz                       -- cuándo se avisó al inbox (carrito abandonado)
);

create index if not exists checkouts_tienda_abandono_idx
  on crm.checkouts_tienda (estado, creado_en) where aviso_abandono_en is null;

alter table crm.checkouts_tienda enable row level security;   -- cero políticas: solo service_role
