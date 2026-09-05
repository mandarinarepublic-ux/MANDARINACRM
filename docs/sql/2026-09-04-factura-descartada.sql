-- 2026-09-04 · Descartar a mano una factura que no se va a emitir
--
-- POR QUÉ. El cuadro de errores muestra "N pedidos pidió factura y no la tiene".
-- Es un detector de silencio y funciona: así se descubrió que Make llevaba 13
-- días sin emitir. Pero algunos de esos pedidos NO se van a facturar nunca —el
-- cliente ya no la quiere, se anuló, se facturó por fuera— y no había forma de
-- sacarlos. El contador se quedaba clavado en un número que nadie iba a bajar, y
-- un contador que nunca baja se deja de mirar. Ahí muere el detector.
--
-- ☠️ VA EN COLUMNAS APARTE, NO APAGANDO `factura_solicitada`.
-- Que el cliente la pidió es un HECHO. No emitirla es una DECISIÓN nuestra.
-- Apagar la primera para lograr el efecto de la segunda borraría el hecho, y
-- dentro de tres meses nadie sabría por qué ese pedido no tiene factura. Se
-- guardan las dos cosas.
--
-- Se registra quién y cuándo. Sin motivo, por decisión de Rodrigo (4-sep-2026):
-- un clic y fuera. ⚠️ Eso significa que dentro de meses se sabrá QUE se descartó
-- y no POR QUÉ; si alguna vez hace falta contar las causas, hay que agregar el
-- motivo y desde ese día en adelante — lo anterior no se recupera.
-- Por lo mismo el descarte es REVERSIBLE: sin motivo obligatorio, equivocarse es
-- fácil y deshacer tiene que funcionar.

alter table crm.pedidos
  add column if not exists factura_descartada     boolean     not null default false,
  add column if not exists factura_descartada_por text,
  add column if not exists factura_descartada_at  timestamptz;

-- El único acceso real: "pidieron factura, no la tienen y no se descartaron".
create index if not exists pedidos_factura_pendiente_idx
  on crm.pedidos (fecha_pedido)
  where factura_solicitada and factura_id is null and not factura_descartada;

comment on column crm.pedidos.factura_descartada is
  'Se pidio factura y se decidio a mano no emitirla. NO borra factura_solicitada: la peticion del cliente sigue registrada.';
