-- docs/sql/2026-08-19-prendas-en-taller.sql
--
-- Una sola definición de "prenda que le toca al taller".
--
-- Hoy ese criterio está escrito en TRES sitios que pueden divergir:
--   1. `eliminado = false`                → el repositorio (el único que funciona)
--   2. `SUBESTADO !== 'ELIMINADO'`        → las pantallas. En Supabase NUNCA se cumple:
--                                            softDeleteItem pone `eliminado = true` y
--                                            no toca el subestado. Es código muerto.
--   3. `SUBESTADO !== 'ENTREGADO_TIENDA'` → las pantallas
--
-- Esa duplicación produjo un falso positivo durante el diseño: un conteo que
-- incluyera prendas eliminadas habría marcado "faltan prendas" en pedidos completos,
-- para siempre. Con la vista, la lista y el conteo leen el mismo criterio.
--
-- Medido el 19-ago-2026: de 1261 prendas, 1228 quedan en el taller y 33 se excluyen
-- (las 33 de ENTREGA EN TIENDA). En Supabase NUNCA se ha eliminado una prenda: cero
-- filas con `eliminado = true` y cero con subestado 'ELIMINADO'.
--
-- Ver: docs/superpowers/specs/2026-08-19-bandeja-produccion-design.md §4.2

create or replace view crm.prendas_en_taller as
  select *
    from crm.detalle_pedido
   where eliminado = false
     and subestado is distinct from 'ELIMINADO'
     and subestado is distinct from 'ENTREGADO_TIENDA';

comment on view crm.prendas_en_taller is
  'Prendas que el taller debe fabricar. Unico criterio de "prenda que cuenta": '
  'excluye eliminadas (columna y subestado) y las de ENTREGA EN TIENDA, que nacen '
  'entregadas y nunca pasan por fabrica. La lista y el conteo de /api/produccion '
  'leen de aqui para que no puedan divergir. Ver '
  'docs/superpowers/specs/2026-08-19-bandeja-produccion-design.md';
