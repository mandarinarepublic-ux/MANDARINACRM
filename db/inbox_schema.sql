-- db/inbox_schema.sql
-- Schema `inbox` (v2 — estructura REAL del bot de ventas de WhatsApp con IA).
-- Los DOS inbox (IND y MANDI) usan la MISMA estructura; se distinguen por `cuenta`.
-- Vive en el mismo proyecto Supabase que el CRM (mandarina-DATA) para unir el
-- hilo de WhatsApp con el pedido/cliente (por teléfono y/o por id_venta).
--
-- Mapeo desde las hojas actuales:
--   CONTACTOS  → inbox.conversaciones  (una por cuenta+telefono)
--   MENSAJES   → inbox.mensajes        (PK = ID uuid del sistema)
-- Idempotente. Las tablas del inbox empiezan vacías (greenfield en Supabase).

drop view if exists crm.cliente_conversacion;
drop table if exists inbox.mensajes;
drop table if exists inbox.conversaciones;

-- CONTACTOS → conversaciones
--   Telefono, Nombre, Alias, SOPORTE(ATENDIDO|ARCHIVADO), WA_ID('EC...'),
--   Ultima_Actualizacion, HUMANO('IA'|agente), ID_VENTA(→pedido), NOTAS, REFUERZO1/2
create table inbox.conversaciones (
  conversacion_id   uuid primary key default gen_random_uuid(),
  cuenta            text not null check (cuenta in ('IND','MANDI')),
  canal             text not null default 'WA',    -- WA | FB | IG (social después)
  telefono          text not null,
  wa_id             text,                            -- WA_ID
  nombre_contacto   text,                            -- Nombre
  alias             text,                            -- Alias
  soporte           text,                            -- SOPORTE
  humano            text,                            -- HUMANO ('IA' = bot)
  id_venta          text,                            -- ID_VENTA → soft link a crm.pedidos.pedido_id
  notas             text,                            -- NOTAS
  refuerzo1         timestamptz,                     -- REFUERZO1 (remarketing)
  refuerzo2         timestamptz,                     -- REFUERZO2
  ultimo_mensaje_at timestamptz,                     -- Ultima_Actualizacion
  no_leidos         int not null default 0,
  fecha_creacion    timestamptz not null default now(),
  unique (cuenta, telefono)
);

-- MENSAJES → mensajes
--   ID(uuid), Telefono, Nombre, Tipo, Contenido, MediaURL, Fecha,
--   Direccion(ENTRANTE|SALIENTE), MediaID, Respuesta_IA, Foto_IA, Contexto_ID
create table inbox.mensajes (
  mensaje_id       uuid primary key default gen_random_uuid(),  -- = ID (preserva idempotencia)
  conversacion_id  uuid not null references inbox.conversaciones(conversacion_id) on delete cascade,
  cuenta           text not null,                 -- denormalizado (filtro rápido)
  telefono         text,
  nombre           text,                          -- Nombre
  direccion        text not null,                 -- IN | OUT (de ENTRANTE/SALIENTE)
  tipo             text,                          -- Tipo
  texto            text,                          -- Contenido
  media_url        text,                          -- MediaURL
  media_id         text,                          -- MediaID
  respuesta_ia     text,                          -- Respuesta_IA
  foto_ia          text,                          -- Foto_IA
  contexto_id      text,                          -- Contexto_ID
  fecha            timestamptz not null default now()
);

create index on inbox.conversaciones (cuenta, ultimo_mensaje_at desc);
create index on inbox.conversaciones (telefono);
create index on inbox.conversaciones (id_venta) where id_venta is not null;
create index on inbox.mensajes (conversacion_id, fecha);
create index on inbox.mensajes (cuenta, telefono);

alter table inbox.conversaciones enable row level security;
alter table inbox.mensajes       enable row level security;

-- Normalización de teléfono (últimos 9 dígitos) para unir 09XXXXXXXX ⇄ 5939XXXXXXXX.
create or replace function inbox.norm_telefono(t text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 9), '');
$$;

-- Vista de unión CRM ↔ inbox (por teléfono; además id_venta es link directo).
create or replace view crm.cliente_conversacion as
select
  c.conversacion_id, c.cuenta, c.canal, c.telefono, c.wa_id,
  c.nombre_contacto, c.alias, c.soporte, c.humano, c.id_venta,
  c.ultimo_mensaje_at, c.no_leidos,
  cl.cliente_id,
  cl.nombre  as cliente_nombre,
  cl.cedula  as cliente_cedula,
  cl.celular as cliente_celular
from inbox.conversaciones c
left join crm.clientes cl
  on inbox.norm_telefono(cl.celular) = inbox.norm_telefono(c.telefono)
 and inbox.norm_telefono(c.telefono) is not null;
