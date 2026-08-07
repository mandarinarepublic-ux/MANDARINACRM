-- Permiso por aplicación, decidido persona por persona desde el CRM.
-- Hermana de `areas` y `tiendas`: mismo tipo, misma pantalla.
-- Valores válidos: 'INBOX_MANDARINA', 'INBOX_INDSTORE'.
--
-- Arranca vacío A PROPÓSITO: nadie entra a ningún inbox hasta que se le dé el
-- permiso. El primer paso después de aplicarla es habilitarse uno mismo.
--
-- Solo Supabase: el espejo en Sheets no lleva esta columna (es respaldo, y el
-- permiso se relee de Supabase en cada petición).
alter table crm.usuarios add column if not exists accesos text[] not null default '{}';
