-- crm_2026_10_20_shopify_sin_pagar
-- Pedidos web que NACIERON sin pagar (depósito, transferencia…).
--
-- El webhook de Shopify (app/api/shopify/pedidos) anota aquí cada orders/create
-- sin pagar y deja un aviso INTERNO en el inbox de la tienda para que el
-- vendedor persiga el pago y cargue la venta A MANO con Pedido manual.
--
-- ☠️ Por eso, cuando después alguien marca ese pedido como pagado en Shopify,
-- orders/paid NO lo crea en el CRM: el vendedor ya lo cargó y entraría DOS
-- veces a fábrica (le pasó a #1191 → MAN-AND-6409, 20-oct-2026). Esta tabla es
-- lo único que distingue "pagó con tarjeta al momento" de "pagó después".

create table if not exists crm.shopify_sin_pagar (
  shopify_order_id text primary key,
  tienda_id        text not null,
  order_name       text,
  celular          text,
  aviso_inbox      text,            -- 'ok' | 'sin_celular' | 'error: …'
  creado_en        timestamptz not null default now()
);

alter table crm.shopify_sin_pagar enable row level security;   -- cero políticas: solo service_role

-- #1191 (Kevin Guzhñay) nació sin pagar y Andrés ya lo cargó como MAN-AND-6409:
-- si alguien lo marca pagado en Shopify, no debe entrar otra vez.
insert into crm.shopify_sin_pagar (shopify_order_id, tienda_id, order_name, celular, aviso_inbox)
values ('18990873608285', 'MANDARINA', '#1191', '0991552710', 'anterior al aviso (cargado a mano: MAN-AND-6409)')
on conflict do nothing;
