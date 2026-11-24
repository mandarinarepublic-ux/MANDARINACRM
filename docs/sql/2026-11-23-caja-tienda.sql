-- crm_2026_11_23_caja_tienda
-- Caja de la tienda: cierre diario de efectivo. Solo aditivo e idempotente.
-- pago_id es uuid (igual que crm.pagos.pago_id); sin FK duro para no acoplar.

create table if not exists crm.cajas (
  id                     bigint generated always as identity primary key,
  nombre                 text not null,
  responsable_usuario_id text not null,
  fondo_fijo             numeric(10,2) not null default 20,
  tolerancia             numeric(10,2) not null default 5,
  activa                 boolean not null default true,
  inicio                 timestamptz,                -- lo fija el arranque
  creado_en              timestamptz not null default now()
);

create table if not exists crm.cierres_caja (
  id                 bigint generated always as identity primary key,
  caja_id            bigint not null references crm.cajas(id),
  tipo               text not null check (tipo in ('ARRANQUE','NORMAL')),
  estado             text not null check (estado in ('CONTADO','CERRADO','REABIERTO')),
  apertura           numeric(10,2),
  cobros_efectivo    numeric(10,2),
  salidas            numeric(10,2),
  esperado           numeric(10,2),
  contado            numeric(10,2),
  diferencia         numeric(10,2),
  motivo             text,
  contado_en         timestamptz not null default now(),
  cerrado_en         timestamptz,
  firmado_por        text,
  firmado_por_nombre text,
  reabierto_por      text,
  reabierto_en       timestamptz
);

create unique index if not exists cierres_caja_un_contado
  on crm.cierres_caja (caja_id) where estado = 'CONTADO';

create table if not exists crm.cierre_pagos (
  cierre_id bigint not null references crm.cierres_caja(id),
  pago_id   uuid not null,
  monto     numeric(10,2),      -- copia al momento del conteo
  pedido_id text,
  primary key (cierre_id, pago_id)
);

create table if not exists crm.movimientos_caja (
  id                bigint generated always as identity primary key,
  caja_id           bigint not null references crm.cajas(id),
  cierre_id         bigint references crm.cierres_caja(id),
  tipo              text not null check (tipo in ('SALIDA','SOBRE','DEPOSITO','REPOSICION')),
  monto             numeric(10,2) not null check (monto > 0),
  motivo            text,
  foto_url          text,
  creado_por        text,
  creado_por_nombre text,
  creado_en         timestamptz not null default now(),
  confirmacion      text not null default 'PENDIENTE' check (confirmacion in ('PENDIENTE','OK','NO_CUADRA')),
  monto_confirmado  numeric(10,2),
  confirmado_por    text,
  confirmado_en     timestamptz,
  anulado           boolean not null default false,
  anulado_por       text,
  anulado_en        timestamptz
);

create index if not exists movimientos_caja_caja_idx on crm.movimientos_caja (caja_id, creado_en desc);
create index if not exists movimientos_caja_cierre_idx on crm.movimientos_caja (cierre_id);

create table if not exists crm.verificaciones_banco (
  pago_id               uuid primary key,
  resultado             text not null check (resultado in ('LLEGO','NO_LLEGO')),
  verificado_por        text,
  verificado_por_nombre text,
  verificado_en         timestamptz not null default now()
);

alter table crm.cajas                 enable row level security;   -- cero políticas: solo service_role
alter table crm.cierres_caja          enable row level security;
alter table crm.cierre_pagos          enable row level security;
alter table crm.movimientos_caja      enable row level security;
alter table crm.verificaciones_banco  enable row level security;

-- Seed: caja de Jackeline
insert into crm.cajas (nombre, responsable_usuario_id)
select 'Tienda', 'uuid-007'
where not exists (select 1 from crm.cajas where nombre = 'Tienda');

update crm.usuarios
   set accesos = array_append(coalesce(accesos, '{}'), 'CAJA')
 where usuario_id = 'uuid-007'
   and not ('CAJA' = any(coalesce(accesos, '{}')));
