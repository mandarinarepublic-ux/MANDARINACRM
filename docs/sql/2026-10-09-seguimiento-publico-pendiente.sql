-- Seguimiento público: la consulta se RESERVA ('pendiente') antes de contar, para
-- que las peticiones simultáneas se vean entre sí. Una fila que se queda en
-- 'pendiente' (la función murió) sigue contando como intento: es a propósito.
alter table crm.consultas_publicas drop constraint if exists consultas_publicas_resultado_check;
alter table crm.consultas_publicas add constraint consultas_publicas_resultado_check
  check (resultado in ('ok', 'fallo', 'bloqueado', 'pendiente'));

drop index if exists crm.consultas_publicas_fallos_numero;
create index consultas_publicas_fallos_numero
  on crm.consultas_publicas (numero, fecha desc) where resultado in ('fallo', 'pendiente');
