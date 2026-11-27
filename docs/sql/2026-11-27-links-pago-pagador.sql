-- crm_2026_11_27_links_pago_pagador
-- Reporte de pagos: TODO lo que la pasarela sabe de quién pagó. Pedido de
-- Rodrigo, 27-nov-2026: «tuve que buscar un pago y solo llegué a dar con ese
-- cliente por el número celular».
--
-- Hasta hoy se guardaba solo `tarjeta` y `pagador` (email en Payphone, nombre en
-- dLocal: dos cosas distintas en la misma columna). Ahora cada dato va en su
-- columna, y la respuesta COMPLETA de la pasarela queda en `datos_pasarela`
-- para no volver a perder nada que la pasarela mande y no hayamos mapeado.
--
-- Solo agrega columnas: no cambia nada de lo que ya funciona.

alter table crm.links_pago
  add column if not exists pagador_nombre     text,
  add column if not exists pagador_email      text,
  add column if not exists pagador_telefono   text,
  add column if not exists pagador_documento  text,   -- cédula / pasaporte / RUC
  add column if not exists tarjeta_tipo       text,   -- Credit / Debit
  add column if not exists tarjeta_ultimos    text,   -- últimos 4 dígitos (Payphone NO da el número completo)
  add column if not exists autorizacion       text,   -- código de autorización del banco
  add column if not exists datos_pasarela     jsonb;  -- la respuesta cruda de Payphone / dLocal
