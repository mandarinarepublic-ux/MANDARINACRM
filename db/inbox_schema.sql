-- db/inbox_schema.sql
-- Schema `inbox` (v1) — conversaciones + mensajes de los DOS inbox de WhatsApp
-- (IND y MANDI) en las MISMAS tablas, distinguidos por la columna `cuenta`.
-- Vive en el mismo proyecto Supabase que el CRM (mandarina-DATA) para poder unir
-- el hilo de WhatsApp con el pedido/cliente por número de celular.
--
-- Estado: v1. Las columnas son un punto de partida razonable; se afinan cuando
-- tengamos la estructura real del inbox actual (hoy en Sheets) + el backfill.
-- Idempotente: se puede re-ejecutar sin romper nada.

-- ─── conversaciones ──────────────────────────────────────────────────────────
create table if not exists inbox.conversaciones (
  conversacion_id   uuid primary key default gen_random_uuid(),
  cuenta            text not null check (cuenta in ('IND', 'MANDI')),
  telefono          text not null,                 -- número WhatsApp (llave de unión al CRM)
  nombre_contacto   text,                           -- nombre que muestra WhatsApp
  ultimo_mensaje_at timestamptz,                    -- para ordenar la lista del inbox
  no_leidos         int  not null default 0,        -- contador de no leídos
  estado            text not null default 'ABIERTA',-- ABIERTA | CERRADA | ARCHIVADA
  asignado_a        text,                           -- agente/vendedor a cargo
  etiquetas         text[] not null default '{}',
  fecha_creacion    timestamptz not null default now(),
  unique (cuenta, telefono)                         -- una conversación por teléfono y cuenta
);

-- ─── mensajes ────────────────────────────────────────────────────────────────
create table if not exists inbox.mensajes (
  mensaje_id      uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references inbox.conversaciones(conversacion_id) on delete cascade,
  direccion       text not null check (direccion in ('IN', 'OUT')),  -- entrante | saliente
  tipo            text not null default 'texto',    -- texto|imagen|audio|video|documento|ubicacion|sticker
  texto           text,
  media_url       text,
  wa_message_id   text,                             -- id externo de WhatsApp (dedup/idempotencia)
  estado          text,                             -- saliente: enviado|entregado|leido|fallido
  autor           text,                             -- saliente: agente; entrante: contacto
  fecha           timestamptz not null default now()
);

-- ─── índices ─────────────────────────────────────────────────────────────────
create index if not exists idx_conv_cuenta_ultimo on inbox.conversaciones (cuenta, ultimo_mensaje_at desc);
create index if not exists idx_conv_telefono      on inbox.conversaciones (telefono);
create index if not exists idx_msg_conv_fecha      on inbox.mensajes (conversacion_id, fecha);
-- Dedup de mensajes entrantes por id de WhatsApp (cuando venga).
create unique index if not exists uq_msg_wa_id on inbox.mensajes (wa_message_id) where wa_message_id is not null;

-- ─── RLS (consistente con crm: activado, sin políticas; la app usa service_role) ──
alter table inbox.conversaciones enable row level security;
alter table inbox.mensajes       enable row level security;

-- ─── normalización de teléfono para la unión CRM ↔ inbox ─────────────────────
-- Ecuador: celular puede venir como '09XXXXXXXX' (con 0) o '5939XXXXXXXX' (código
-- país). El denominador común son los últimos 9 dígitos (9XXXXXXXX). Se comparan
-- solo dígitos, tomando los últimos 9.
create or replace function inbox.norm_telefono(t text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 9), '');
$$;

-- ─── vista de unión: conversación ↔ cliente del CRM (por teléfono) ───────────
-- En el schema `crm` para que la app (cliente Supabase con schema 'crm') la lea
-- como una tabla más: .from('cliente_conversacion').
create or replace view crm.cliente_conversacion as
select
  c.conversacion_id,
  c.cuenta,
  c.telefono,
  c.nombre_contacto,
  c.ultimo_mensaje_at,
  c.no_leidos,
  c.estado,
  cl.cliente_id,
  cl.nombre  as cliente_nombre,
  cl.cedula  as cliente_cedula,
  cl.celular as cliente_celular
from inbox.conversaciones c
left join crm.clientes cl
  on inbox.norm_telefono(cl.celular) = inbox.norm_telefono(c.telefono)
 and inbox.norm_telefono(c.telefono) is not null;
