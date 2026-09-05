-- 2026-09-04 · Cuándo fue la última vez que alguien tocó un pedido
--
-- Alimenta la columna «Quieto» del Tablero por sub-área, que es LA señal de
-- cuello de botella: cuando «Quieto» se acerca a «En taller», nadie tocó ese
-- pedido desde que entró. Medido el 4-sep-2026: 22 pedidos llevaban más de 7
-- días sin un solo movimiento, y varios con «impresión» como último evento — o
-- sea entraron al taller y nadie los volvió a mirar.
--
-- ☠️ VISTA, NO CONSULTA DIRECTA. Leer las filas crudas de `logs_pedidos` de los
-- ~60 pedidos vivos y agrupar en el navegador cruzaría el tope de 1000 filas de
-- PostgREST EN SILENCIO (error null, filas de menos) y el «Quieto» saldría mal
-- sin que nadie lo note. Agrupando en la base, devuelve UNA fila por pedido.
--
-- ⚠️ Y NO se usa `detalle_pedido.fecha_modificacion`, que parece la respuesta
-- obvia: medido el 4-sep, en las 156 prendas vivas era idéntica a la fecha de
-- creación del pedido —incluidas 41 que sí se habían movido—. Nunca se actualiza.
--
-- Se excluye NOTA a propósito: escribir una nota no es mover el trabajo, y
-- contarla haría parecer atendido un pedido que sigue parado.
--
-- 🔜 Cuando `crm.prenda_eventos` acumule histórico, esta vista puede pasar a
-- leerlo a él (tiene `item_id`, que logs_pedidos no tiene). Hoy solo lleva unas
-- horas de datos, así que la fuente sigue siendo el log viejo.

create or replace view crm.pedido_ultimo_movimiento as
select pedido_id,
       max(fecha) as ultimo_movimiento,
       (array_agg(campo order by fecha desc))[1] as ultimo_campo
  from crm.logs_pedidos
 where campo like 'SUBESTADO %'
    or campo like 'CORTE %'
    or campo in ('ESTADO_PEDIDO', 'IMPRESION_PRODUCCION')
 group by pedido_id;

comment on view crm.pedido_ultimo_movimiento is
  'Ultimo evento de TRABAJO por pedido (excluye NOTA). Agrupa en la base para no cruzar el tope de 1000 filas de PostgREST leyendo logs_pedidos en crudo.';
