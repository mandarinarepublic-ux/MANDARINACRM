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
