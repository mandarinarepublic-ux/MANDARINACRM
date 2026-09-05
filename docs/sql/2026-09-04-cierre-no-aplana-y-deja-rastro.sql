-- 2026-09-04 · El cierre de un pedido deja de aplanar el detalle por área
--                y empieza a dejar rastro.
--
-- QUÉ HABÍA. El trigger `pedidos_marcar_cortado` (19-ago-2026) marca las prendas
-- de un pedido como CORTADO y LISTO cuando el pedido entra a COMPLETADO,
-- ENTREGADO o DESPACHO. Su primera versión solo tocaba `subestado_corte` y era
-- correcta; 40 minutos después se le agregó forzar también `subestado`, y ahí
-- entraron dos problemas.
--
-- PROBLEMA 1 · APLANA EL DETALLE POR ÁREA, SIEMPRE.
-- Escribía `subestado = 'LISTO'` como texto plano, destruyendo el formato
-- compuesto "ESTAMPADO:LISTO|BORDADO:LISTO". Y no es un caso raro:
--
--   · el auto-avance de la app pone DESPACHO cuando todas las áreas están LISTO
--   · el WHERE del trigger dice `subestado is distinct from 'LISTO'`
--   · "ESTAMPADO:LISTO|BORDADO:LISTO" SÍ es distinto de 'LISTO'
--   → se reescribe SIEMPRE
--
-- Medido el 4-sep-2026: 136 de 136 prendas multi-área de pedidos cerrados están
-- aplanadas. CERO conservan el desglose. Con esto, medir cuánto tarda bordado
-- contra estampado es imposible incluso hacia adelante: el dato se borra al
-- cerrar.
--
-- PROBLEMA 2 · ESCRIBE SIN DEJAR RASTRO.
-- Va directo a la tabla, sin pasar por la app, así que no genera `logCambio` ni
-- una fila en `logs_pedidos`. Por eso el registro de CORTE parecía haberse
-- apagado en agosto (98 pedidos en julio → 5 en agosto → 0 en septiembre): no se
-- apagó, se mudó a un sitio que no registra. La propia migración de agosto dice
-- que volteó 475 prendas que seguían en SOLICITADO o ENVIADO_APROBACION, y de
-- eso no quedó ni una línea.
--
-- ⚠️ Y los respaldos que aquellas migraciones prometen (`crm.respaldo_corte_20260818`
-- con 759 prendas y `crm.respaldo_corte_20260819` con 22) NO EXISTEN en la base.
-- Lo sobrescrito entonces no se puede reconstruir. Esta migración no lo arregla
-- —no hay de dónde—, pero a partir de ahora nada se sobrescribe en silencio.
--
-- QUÉ CAMBIA ACÁ, y qué NO.
--   ✅ sigue marcando CORTADO al cerrar → la bandeja de Corte se mantiene limpia,
--      que es para lo que se hizo el trigger y funciona bien
--   ✅ sigue forzando las áreas a LISTO → las bandejas de producción no se
--      llenan de prendas de pedidos ya cerrados
--   🆕 RESPETA el formato compuesto: "ESTAMPADO:ENVIADO_APROBACION|BORDADO:SOLICITADO"
--      pasa a "ESTAMPADO:LISTO|BORDADO:LISTO", no a "LISTO"
--   🆕 DEJA RASTRO en crm.prenda_eventos, una fila por área tocada, con el
--      estado real que tenía antes
--
-- ☠️ EL RASTRO ES EL PUNTO, no un extra. Que un pedido salga con prendas sin
-- marcar significa que alguien no registró su trabajo. Taparlo automáticamente
-- —que es lo que pasaba— esconde el problema para siempre. Ahora se sigue
-- limpiando la bandeja, pero queda contado:
--
--   select count(*) from crm.prenda_eventos where origen = 'AUTO_CIERRE';
--
-- Por eso el origen es AUTO_CIERRE y no AUTO: separa "lo dedujo el sistema
-- porque el área avanzó" (AUTO, sano) de "lo dio por hecho el cierre" (AUTO_CIERRE,
-- una señal de que algo se saltó).

create or replace function crm.marcar_cortado_al_cerrar()
returns trigger
language plpgsql
as $$
begin
  -- ── 1) El rastro va PRIMERO ─────────────────────────────────────────────
  -- Se lee `detalle_pedido` antes del UPDATE, así que `estado_antes` es el real.
  -- Si esto fuera después, todos los eventos dirían "LISTO → LISTO".

  -- 1a) Corte: una fila por prenda que se marca sola.
  insert into crm.prenda_eventos (item_id, pedido_id, area, estado_antes, estado_despues, usuario, origen)
  select d.item_id, d.pedido_id, 'CORTE',
         coalesce(nullif(d.subestado_corte, ''), 'PENDIENTE'), 'CORTADO',
         'SISTEMA', 'AUTO_CIERRE'
    from crm.detalle_pedido d
   where d.pedido_id = new.pedido_id
     and d.subestado is distinct from 'ENTREGADO_TIENDA'
     and d.subestado is distinct from 'ELIMINADO'
     and d.eliminado = false
     and coalesce(nullif(d.subestado_corte, ''), 'PENDIENTE') <> 'CORTADO';

  -- 1b) Áreas: una fila por CADA área que no estaba LISTO. Esta es la lista de
  --     "se cerró a medias", que antes se perdía entera.
  insert into crm.prenda_eventos (item_id, pedido_id, area, estado_antes, estado_despues, usuario, origen)
  select d.item_id, d.pedido_id,
         case when d.subestado like '%:%' then trim(split_part(t.part, ':', 1)) else '' end,
         case when d.subestado like '%:%' then trim(split_part(t.part, ':', 2)) else trim(t.part) end,
         'LISTO', 'SISTEMA', 'AUTO_CIERRE'
    from crm.detalle_pedido d
    cross join lateral unnest(string_to_array(coalesce(d.subestado, ''), '|')) as t(part)
   where d.pedido_id = new.pedido_id
     and d.subestado is distinct from 'ENTREGADO_TIENDA'
     and d.subestado is distinct from 'ELIMINADO'
     and d.eliminado = false
     and (case when d.subestado like '%:%' then trim(split_part(t.part, ':', 2)) else trim(t.part) end)
         is distinct from 'LISTO';

  -- ── 2) Recién ahora se escribe ──────────────────────────────────────────
  update crm.detalle_pedido d
     set subestado_corte = case
           when coalesce(nullif(d.subestado_corte, ''), 'PENDIENTE') <> 'CORTADO' then 'CORTADO'
           else d.subestado_corte end,
         subestado = case
           -- ⚠️ Compuesto: se pone LISTO CADA área, conservando nombres y orden.
           -- Antes esto era 'LISTO' a secas y borraba el desglose.
           when d.subestado like '%:%' then (
             select string_agg(trim(split_part(part, ':', 1)) || ':LISTO', '|' order by ord)
               from unnest(string_to_array(d.subestado, '|')) with ordinality as u(part, ord))
           when d.subestado is distinct from 'LISTO' then 'LISTO'
           else d.subestado end
   where d.pedido_id = new.pedido_id
     and d.subestado is distinct from 'ENTREGADO_TIENDA'
     and d.subestado is distinct from 'ELIMINADO'
     and d.eliminado = false
     -- Solo si hay algo que cambiar: evita reescribir filas por nada.
     and (coalesce(nullif(d.subestado_corte, ''), 'PENDIENTE') <> 'CORTADO'
          or exists (
            select 1 from unnest(string_to_array(coalesce(d.subestado, ''), '|')) as v(part)
             where (case when d.subestado like '%:%' then trim(split_part(v.part, ':', 2)) else trim(v.part) end)
                   is distinct from 'LISTO'));
  return null;
end $$;

-- El trigger no cambia: sigue disparando solo AL ENTRAR a un estado de cierre.
-- Se deja explícito para que esta migración sea legible por sí sola.
--   after insert or update of estado_pedido on crm.pedidos
--   when (new.estado_pedido in ('COMPLETADO','ENTREGADO','DESPACHO'))
