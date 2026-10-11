-- Ciudad de entrega del pedido, independiente de la dirección (10-oct-2026).
-- Antes la ciudad se pegaba adelante del texto de la dirección ("Quito: …") y al
-- editar se volvía a pegar ("El coca : El coca: Calle…"). Ahora vive aparte y se
-- imprime aparte. Aplicada como migración `pedidos_ciudad_pedido`.
alter table crm.pedidos add column if not exists ciudad_pedido text;
comment on column crm.pedidos.ciudad_pedido is 'Ciudad de entrega del pedido, aparte de la dirección (10-oct-2026). La dirección ya no lleva la ciudad adelante.';

-- Limpieza de los pedidos viejos (aplicada el 10-oct-2026, 1313 pedidos):
--   · respaldo: crm.respaldo_pedidos_direccion_20261010 (pedido_id, direccion_pedido, ciudad_pedido)
--   · «Ciudad: X» / «Cuidad: X» en la 1.ª línea → ciudad_pedido = X, se quita la línea
--   · «X: resto» (X de 2-30 letras, no «Calle/Celular/Retiro/DNI/Sucursal…») → ciudad_pedido = X,
--     dirección = resto (también los duplicados «X : X: resto»)
--   · sin prefijo → ciudad_pedido = la ciudad del cliente, dirección intacta
--   · 2.º pase: si la dirección aún empezaba con «<ciudad_pedido>:», se quitó (8 pedidos)
-- Para deshacer: update crm.pedidos p set direccion_pedido=r.direccion_pedido, ciudad_pedido=r.ciudad_pedido
--   from crm.respaldo_pedidos_direccion_20261010 r where r.pedido_id=p.pedido_id;
