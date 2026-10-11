-- AUTO: mensajes informativos por etapa del pedido, configurables por tienda
-- (10-oct-2026). Una fila por (tienda, etapa). Cada mensaje se prende y apaga
-- por su cuenta; NO hay interruptor general. Todos nacen APAGADOS.
-- Este paso solo GUARDA la configuración: el envío por WhatsApp va aparte.
-- Aplicada como migración `auto_mensajes`.
create table if not exists crm.auto_mensajes (
  tienda          text    not null check (tienda in ('mandarina', 'ind')),
  etapa           int     not null check (etapa between 0 and 4),
  activo          boolean not null default false,
  texto           text    not null default '',
  media_url       text,
  media_tipo      text    check (media_tipo in ('imagen', 'audio')),
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,
  primary key (tienda, etapa),
  -- Un adjunto lleva las dos cosas o ninguna.
  check ((media_url is null) = (media_tipo is null))
);
comment on table crm.auto_mensajes is 'AUTO: mensaje informativo por etapa del pedido y tienda (10-oct-2026). Etapas = lib/etapaCliente.js.';
alter table crm.auto_mensajes enable row level security;
