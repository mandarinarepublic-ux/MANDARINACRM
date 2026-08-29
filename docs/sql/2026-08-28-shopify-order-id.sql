-- Pedidos de Shopify que entran solos al CRM.
-- Aplicado en producción el 28-ago-2026 (proyecto piingkecjgoisnxccvaa, schema crm).
--
-- 1) Anti-duplicados. Shopify reintenta los webhooks hasta 19 veces, y del
--    mismo pedido llegan `orders/create` y `orders/paid`. Sin esto el mismo
--    pedido entraría dos veces a fábrica.
alter table crm.pedidos add column if not exists shopify_order_id text;

-- El índice es PARCIAL a propósito: los pedidos que no vienen de la web dejan
-- la columna en null y no compiten entre sí.
create unique index if not exists pedidos_shopify_order_id_uniq
  on crm.pedidos (shopify_order_id)
  where shopify_order_id is not null;

-- Comprobado que el índice MUERDE, no solo que existe: dos inserciones con el
-- mismo shopify_order_id dentro de un bloque que se deshace al final, y la
-- segunda fue rechazada con unique_violation. No quedó ninguna fila de prueba.

-- 2) El vendedor de las ventas web. El webhook firma una sesión para este
--    usuario y crea el pedido llamando a /api/pedidos, que saca el vendedor de
--    la cookie y nunca del cuerpo de la petición.
--
--    usuario_id: 7019aea9-f66b-4972-bd94-cd141bb757aa
--    (va en Vercel como SHOPIFY_VENDEDOR_USUARIO_ID)
--
-- ⚠️ El rol es VENDEDOR, no "VENTAS": VENTAS es un ACCESO, no un rol. El plan
--    decía VENTAS y estaba equivocado.
--
-- ☠️ El `password_hash` NO va vacío. `passwordCoincide` en lib/db/usuarios.js
--    cae a comparación en TEXTO PLANO cuando el hash no tiene forma de bcrypt,
--    así que un hash vacío equivale a "la contraseña es la cadena vacía". Hoy
--    la ruta de login rechaza contraseñas vacías antes de llegar ahí, pero eso
--    deja la seguridad de una cuenta con acceso a dos tiendas dependiendo de
--    una guardia en otro archivo, y esa cookie vale también para los dos inbox.
--    Se le puso un hash bcrypt real de una contraseña aleatoria que nadie
--    conoce ni quedó guardada en ningún lado.
--
-- insert into crm.usuarios (usuario_id, nombre, codigo, email, username,
--                           password_hash, rol, areas, tiendas, activo, fecha, accesos)
-- values (gen_random_uuid()::text, 'TIENDA WEB', 'WEB', '', '',
--         '<hash bcrypt aleatorio>', 'VENDEDOR',
--         '{}'::text[], '{MANDARINA,INDSTORE}'::text[], true, now(), '{}'::text[]);
