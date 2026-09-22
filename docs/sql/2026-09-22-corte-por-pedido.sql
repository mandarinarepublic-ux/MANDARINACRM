-- 2026-09-22 · Corte por PEDIDO: cortar todo de un clic, o trabarlo con el motivo
--
-- EL PROBLEMA: el cortador marcaba prenda por prenda. Un pedido de 6 prendas le
-- costaba 7 clics (abrir + 6) y scroll entre seis tarjetas con foto. Con la
-- bandeja en el celular, eso es la mitad del trabajo de registrar el trabajo.
--
-- Ahora la bandeja de Corte actúa sobre el PEDIDO entero, y estas columnas
-- guardan el resultado de esas dos acciones.
--
-- ☠️ POR QUÉ NO BASTA LA BITÁCORA (`crm.logs_pedidos`), que también recibe cada
-- acción: `logCambio` es NO-THROW a propósito —si falla, el taller tiene que
-- poder seguir marcando—. O sea que la fecha se perdería EN SILENCIO, que es
-- justo el modo de fallo que más caro ha salido en este repo. Estas columnas son
-- el dato duro (lo que la pantalla pinta y lo que se puede medir); la bitácora
-- es el relato histórico. Se escriben en la MISMA operación, así que no pueden
-- contradecirse: la columna es siempre la última línea del relato.
--
-- ⚠️ `corte_pendiente_nota` NO es una nota cualquiera: mientras tenga texto, el
-- pedido queda TRABADO en la bandeja de Corte —se ve en cualquier filtro, y no
-- lo baja nada automático—. Solo lo suelta el cortador dando «Cortar las N».
-- Vaciarla a mano desde la base suelta el pedido sin dejar rastro; se suelta
-- desde la pantalla.
--
-- Y mientras esté trabado queda bloqueado el auto-marcado de corte
-- (`debeAutoMarcarCorte`, lib/prendaEventos.js), ese que marca la prenda como
-- cortada sola cuando el área la pone EN_PROCESO. Si no, el pedido que el
-- cortador acaba de trabar se le desaparecería de la bandeja sin tocarlo — que
-- es el defecto que esto viene a cerrar.

alter table crm.pedidos
  add column if not exists corte_pendiente_nota    text,
  add column if not exists corte_pendiente_fecha   timestamptz,
  add column if not exists corte_pendiente_usuario text,
  add column if not exists corte_terminado_fecha   timestamptz,
  add column if not exists corte_terminado_usuario text;

comment on column crm.pedidos.corte_pendiente_nota is
  'Lo que el cortador dice que falta. Con texto = pedido TRABADO en la bandeja de Corte: se ve en cualquier filtro y el auto-marcado queda bloqueado. Lo suelta «Cortar las N».';
comment on column crm.pedidos.corte_pendiente_fecha is
  'Cuándo dijo el cortador que faltaba algo. Dato duro: la bitácora es no-throw y puede perderse.';
comment on column crm.pedidos.corte_terminado_fecha is
  'Cuándo dio el cortador el pedido por cortado entero. Permite medir cuánto se demora corte.';

-- Los pedidos trabados son pocos (los que esperan tela). El índice parcial evita
-- recorrer la tabla entera para pintarlos arriba en la bandeja.
create index if not exists pedidos_corte_trabado_idx
  on crm.pedidos (corte_pendiente_fecha desc)
  where corte_pendiente_nota is not null and corte_pendiente_nota <> '';

-- NOTA sobre crm.pedido_ultimo_movimiento (2026-09-04): esa vista cuenta como
-- trabajo los campos `CORTE %`, y la línea que escriben estas dos acciones es
-- «CORTE PEDIDO». Entra sola, sin tocar la vista. Es lo correcto: cortar la tela
-- de un pedido entero es mover el trabajo, no dejar una nota.
