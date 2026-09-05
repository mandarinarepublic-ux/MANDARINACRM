-- 2026-09-04 · Por qué NO se emitió una factura que el cliente pidió
--
-- Complementa a 2026-09-04-factura-descartada.sql, del mismo día. Aquella guardó
-- quién y cuándo; esta agrega el porqué.
--
-- ⏱️ Se agregó con CERO descartes registrados, así que no hay hueco histórico.
-- Si se hubiera dejado para más adelante, todos los descartes de por medio
-- habrían quedado sin causa — y eso no se recupera.
--
-- POR QUÉ UN CÓDIGO Y NO SOLO TEXTO LIBRE. Un motivo escrito a mano cada vez no
-- se puede sumar: al año la pregunta va a ser "¿cuántas facturas perdemos por
-- cada causa?", y clientes que se arrepienten y pedidos anulados son problemas
-- distintos que se arreglan distinto. Con códigos eso lo responde un `group by`.
-- La nota libre existe igual, porque ninguna lista cubre el caso raro: la lista
-- sirve para CONTAR, la nota para ENTENDER.
--
-- La lista vive en lib/motivos-factura.js (probada). ☠️ `etiquetaMotivo` devuelve
-- el código TAL CUAL si no lo reconoce, nunca vacío: si algún día se retira un
-- motivo, los descartes viejos tienen que seguir diciendo algo. Una lista blanca
-- que devuelve vacío es exactamente como en este sistema se han escondido datos.
--
-- "OTRO" sin nota se rechaza en el servidor: es el caso que la lista no supo
-- clasificar, así que la nota es lo único que va a quedar de él.

alter table crm.pedidos
  add column if not exists factura_descartada_motivo text,
  add column if not exists factura_descartada_nota   text;

comment on column crm.pedidos.factura_descartada_motivo is
  'Codigo de por que NO se emitio la factura. Lista corta en lib/motivos-factura.js para poder contarlos con group by; el texto libre va en factura_descartada_nota.';

-- Para la pregunta que va a venir: "¿por qué dejamos de facturar?"
--   select factura_descartada_motivo, count(*)
--     from crm.pedidos where factura_descartada group by 1 order by 2 desc;
