-- crm_2026_10_14_canjes_fidelidad
-- Canjes del club de premios → pedidos de $0 (POST /api/fidelidad/canje).
--
-- 1) crm.canjes_fidelidad: la RESERVA de cada canje. La ruta inserta aquí ANTES
--    de crear el pedido (PK canje_id), así dos llamadas a la vez con el mismo
--    canje no pueden crear dos pedidos. pedido_id queda null mientras se crea.
--    Si la función muere a la mitad, la reserva sin pedido se retoma a los 2 min.
--
-- 2) El usuario PREMIOS (código PRE → MAN-PRE-#### / IND-PRE-####), igual que
--    TIENDA WEB (docs/sql/2026-08-28-shopify-order-id.sql):
--    ⚠️ rol VENDEDOR (VENTAS es un acceso, no un rol).
--    ☠️ password_hash NUNCA vacío: passwordCoincide cae a texto plano y un hash
--       vacío = "la contraseña es la cadena vacía". Va un bcrypt de una clave
--       aleatoria que nadie conoce ni queda guardada.
--    Su usuario_id va a la variable PREMIOS_USUARIO_ID de Vercel.

create table if not exists crm.canjes_fidelidad (
  canje_id     uuid primary key,
  pedido_id    text references crm.pedidos(pedido_id),
  reservado_en timestamptz not null default now()
);
alter table crm.canjes_fidelidad enable row level security;   -- cero políticas: solo service_role

-- insert into crm.usuarios (usuario_id, nombre, codigo, email, username,
--                           password_hash, rol, areas, tiendas, activo, fecha, accesos)
-- values (gen_random_uuid()::text, 'PREMIOS', 'PRE', '', '',
--         '<hash bcrypt aleatorio>', 'VENDEDOR',
--         '{}'::text[], '{MANDARINA,INDSTORE}'::text[], true, now(), '{}'::text[]);
