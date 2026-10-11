-- Ciudad de entrega del pedido, independiente de la dirección (10-oct-2026).
-- Antes la ciudad se pegaba adelante del texto de la dirección ("Quito: …") y al
-- editar se volvía a pegar ("El coca : El coca: Calle…"). Ahora vive aparte y se
-- imprime aparte. Aplicada como migración `pedidos_ciudad_pedido`.
alter table crm.pedidos add column if not exists ciudad_pedido text;
comment on column crm.pedidos.ciudad_pedido is 'Ciudad de entrega del pedido, aparte de la dirección (10-oct-2026). La dirección ya no lleva la ciudad adelante.';
