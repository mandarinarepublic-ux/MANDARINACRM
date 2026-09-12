-- Opciones en una cotizacion.
--
-- Migracion ADITIVA: agrega una columna y NO toca ni una fila existente. Las
-- cotizaciones que ya existen quedan con `opciones` en NULL y las lee
-- opcionesDe() como una sola opcion implicita, igual que antes.
alter table crm.cotizaciones
  add column if not exists opciones jsonb;

comment on column crm.cotizaciones.opciones is
  'Escenarios completos, cada uno con sus productos y su entrega_dias. NULL o vacio = cotizacion de una sola opcion, que usa productos/entrega_dias de la raiz. Cuando tiene contenido, esas dos columnas de la raiz SE IGNORAN y no se mantienen sincronizadas: ver lib/cotizacion.js opcionesDe().';
