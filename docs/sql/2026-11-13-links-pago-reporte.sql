-- crm_2026_11_13_links_pago_reporte
-- Reporte de links de pago (Payphone + dLocal Go), pantalla solo ADMIN
-- /dashboard/reporte-pagos. Pedido de Rodrigo, 13-nov-2026.
--
-- crm.links_pago deja de ser "los links Payphone del CRM" y pasa a ser EL
-- registro de todos los links de pago, vengan de donde vengan:
--   origen  CRM         → /dashboard/link-pago (vendedor)
--           INBOX_MANDI → panel Ventas / LINKPAGO del inbox de Mandarina
--           INBOX_IND   → panel Ventas del inbox de IND
--           DLOCAL      → pago que trajo la sincronización con dLocal y que
--                         nadie había registrado (los viejos, de antes de hoy)
--
-- dLocal da comisión y neto REALES (balance_fee / balance_amount).
-- Payphone NO los da por API: se estiman al 5,75 % y `comision_estimada` lo dice.
--
-- Solo agrega columnas: no cambia nada de lo que ya funciona.

alter table crm.links_pago
  add column if not exists proveedor          text not null default 'PAYPHONE',  -- PAYPHONE | DLOCAL
  add column if not exists origen             text not null default 'CRM',
  add column if not exists externo_id         text,           -- id del pago en dLocal (DP-…)
  add column if not exists comision           numeric(10,2),
  add column if not exists neto               numeric(10,2),
  add column if not exists comision_estimada  boolean not null default false,
  add column if not exists pagador            text;

-- Un link generado por un cliente que escribió LINKPAGO (o uno viejo de dLocal)
-- no tiene vendedor.
alter table crm.links_pago alter column vendedor_id drop not null;

-- Estado: PENDIENTE | PAGADO | RECHAZADO | EXPIRADO (este último, solo dLocal lo informa).

create index if not exists links_pago_creado_idx on crm.links_pago (creado_en desc, id);
create index if not exists links_pago_pagado_idx on crm.links_pago (pagado_en desc) where pagado_en is not null;
