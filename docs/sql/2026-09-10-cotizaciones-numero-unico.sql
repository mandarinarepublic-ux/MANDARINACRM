-- Cotizaciones: el número no se puede repetir.
--
-- Hasta hoy `numero` lo inventaba el navegador con Math.random() entre 1 y 999
-- y la base lo aceptaba tal cual: nada impedía dos «COT-20260910-042». Ahora lo
-- asigna el servidor, secuencial por día, y este índice es lo que garantiza
-- que si dos vendedores guardan en el mismo instante uno de los dos reintente
-- (lib/db/cotizaciones.js, createCotizacion: reintenta ante 23505).
--
-- Sin este índice, ese reintento es teatro.
--
-- Aplicado en producción (mandarina-DATA) el 2026-09-10. Verificado antes que
-- no hubiera duplicados: 3 filas, 3 números distintos.
create unique index if not exists cotizaciones_numero_unico
  on crm.cotizaciones (numero);
