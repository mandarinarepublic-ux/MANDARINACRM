-- crm_2026_11_19_depositos_pasarela
-- Depósitos que una pasarela hizo a la cuenta del banco, anotados A MANO.
--
-- Payphone no informa por API cuánto ni cuándo deposita (dLocal sí: sus retiros
-- vienen de /v1/settlements). Sin esto, la tarjeta de Payphone del Reporte de
-- pagos solo podía mostrar lo cobrado, no lo que queda en Payphone.
-- Saldo en Payphone = neto cobrado (estimado) − depósitos anotados.
--
-- Se borra lógico (`eliminado`) para que un error de dedo no desaparezca sin rastro.

create table if not exists crm.depositos_pasarela (
  id               bigint generated always as identity primary key,
  creado_en        timestamptz not null default now(),
  proveedor        text not null default 'PAYPHONE',   -- por ahora solo PAYPHONE
  fecha            date not null,                      -- día en que llegó al banco (Ecuador)
  monto            numeric(10,2) not null check (monto > 0),
  nota             text,                               -- banco, # de comprobante, lo que sirva
  creado_por       text,                               -- usuario_id de quien lo anotó
  creado_por_nombre text,
  eliminado        boolean not null default false,
  eliminado_en     timestamptz,
  eliminado_por    text
);

create index if not exists depositos_pasarela_idx on crm.depositos_pasarela (proveedor, fecha desc) where not eliminado;

alter table crm.depositos_pasarela enable row level security;   -- cero políticas: solo service_role
