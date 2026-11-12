-- crm_2026_11_12_checkouts_transferencia
-- Transferencia dentro del recuadro de pago de la tienda (spec 2026-11-12).
-- Estado nuevo: COMPROBANTE (subió la foto; pedido creado en el CRM, retenido).

alter table crm.checkouts_tienda
  add column if not exists metodo          text,   -- null (tarjeta) | 'TRANSFERENCIA'
  add column if not exists banco           text,   -- id de lib/cuentasBancarias.js
  add column if not exists comprobante_url text,   -- foto del comprobante (Cloudinary)
  add column if not exists crm_pedido_id   text;   -- MAN-WEB-#### creado al subir la foto

comment on column crm.checkouts_tienda.estado is
  'NUEVO | COTIZADO | PAGANDO | CREANDO | PAGADO | COMPROBANTE | ERROR';
