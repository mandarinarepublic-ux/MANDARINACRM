-- 2026-09-04 · crm.prenda_eventos
--
-- La llave que le falta al CRM: un registro de movimientos POR PRENDA.
--
-- POR QUÉ. `crm.logs_pedidos` guarda el movimiento de una prenda con `campo` de
-- texto libre y el nombre del producto dentro ("SUBESTADO HOODIE PREMIUM", con
-- erratas reales como "HODIE") y SIN `item_id`. Dos hoodies iguales en el mismo
-- pedido son indistinguibles. Por eso hoy NO se puede medir cuánto tarda cada
-- área ni cuánto lleva una prenda parada.
--
-- Auditado el 4-sep-2026 sobre la base:
--   · ESTADO_PEDIDO      → limpio, 801 pedidos desde el 22-jun. Sirve.
--   · IMPRESION_PRODUCCION → 806 pedidos. Sirve.
--   · CORTE %            → jul 98 pedidos · ago 5 · sep 0. Se apagó.
--   · SUBESTADO %        → sano en volumen, inservible como llave.
--   · detalle_pedido.fecha_modificacion → NUNCA se actualiza: en las 156 prendas
--     vivas es idéntica a la fecha de creación del pedido, incluidas las 41 en
--     ENVIADO_APROBACION que por definición sí se movieron. No usarla.
--
-- ADITIVA: no toca ninguna tabla existente. `logs_pedidos` sigue escribiéndose
-- igual, así que ninguna pantalla ni reporte actual cambia de comportamiento.

create table if not exists crm.prenda_eventos (
  evento_id      bigserial primary key,
  item_id        text        not null,
  pedido_id      text        not null,
  -- 'CORTE' | 'ESTAMPADO' | 'SUBLIMACION' | 'BORDADO' | '' (prenda sin área)
  area           text        not null default '',
  estado_antes   text        not null default '',
  estado_despues text        not null default '',
  fecha          timestamptz not null default now(),
  usuario        text        not null default 'SISTEMA',
  -- 'MANUAL' = lo marcó una persona · 'AUTO' = lo dedujo el sistema.
  -- Separarlos permite auditar (y revertir) el auto-marcado de corte sin tocar
  -- lo que sí registró alguien.
  origen         text        not null default 'MANUAL'
);

-- Los tres accesos reales: la vida de una prenda, la de un pedido, y el barrido
-- por fechas de cualquier reporte.
create index if not exists prenda_eventos_item_fecha_idx  on crm.prenda_eventos (item_id, fecha);
create index if not exists prenda_eventos_pedido_idx      on crm.prenda_eventos (pedido_id);
create index if not exists prenda_eventos_fecha_idx       on crm.prenda_eventos (fecha desc);
-- Para "cuánto tarda bordado": filtra por área y ordena por fecha.
create index if not exists prenda_eventos_area_fecha_idx  on crm.prenda_eventos (area, fecha desc);

comment on table crm.prenda_eventos is
  'Movimientos por prenda con item_id. Reemplaza como fuente de medición al campo de texto libre de logs_pedidos, que no permite atribuir un cambio a una prenda concreta.';
comment on column crm.prenda_eventos.origen is
  'MANUAL = lo marcó una persona. AUTO = lo dedujo el sistema (hoy: corte inferido cuando un área pasa a EN_PROCESO o LISTO).';

-- ⚠️ El schema `crm` ya está expuesto en `pgrst.db_schemas`; no hay que tocar el
-- rol. La app entra con `service_role`, así que no se define RLS acá: hacerlo sin
-- políticas dejaría la tabla ilegible para cualquier otro consumidor futuro.
