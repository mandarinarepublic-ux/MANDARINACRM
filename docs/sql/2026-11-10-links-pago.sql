-- crm_2026_11_10_links_pago
-- Links de pago de Payphone creados desde el CRM (/dashboard/link-pago).
--
-- El vendedor pone celular + valor, el CRM crea el link en Payphone y él lo
-- manda por el WhatsApp de su celular. Esta tabla es su HISTÓRICO: qué link,
-- a quién, por cuánto y si ya se pagó.
--
-- El estado se actualiza consultando a Payphone por `client_tx_id`
-- (GET /api/Sale/client/{id}) cuando el vendedor abre su histórico: no depende
-- de la notificación externa de Payphone, que todavía no está aprobada.
--
-- `client_tx_id` lleva el celular codificado (mismo formato que los inbox), así
-- que si Payphone avisa el pago al inbox, la nota PAGADO cae en el chat correcto.

create table if not exists crm.links_pago (
  id               bigint generated always as identity primary key,
  creado_en        timestamptz not null default now(),
  vendedor_id      text not null,
  vendedor_nombre  text,
  tienda           text not null,             -- 'MANDARINA' | 'INDSTORE'
  celular          text not null,             -- 593XXXXXXXXX
  valor            numeric(10,2) not null,    -- con IVA incluido, en dólares
  link             text not null,
  client_tx_id     text not null unique,      -- el de Payphone (≤ 15 caracteres)
  estado           text not null default 'PENDIENTE',  -- PENDIENTE | PAGADO | RECHAZADO
  transaction_id   text,                      -- el # de Payphone cuando hay pago
  pagado_en        timestamptz,
  tarjeta          text,                      -- marca/banco que devuelve Payphone
  revisado_en      timestamptz                -- última consulta a Payphone
);

create index if not exists links_pago_vendedor_idx on crm.links_pago (vendedor_id, creado_en desc);

alter table crm.links_pago enable row level security;   -- cero políticas: solo service_role
