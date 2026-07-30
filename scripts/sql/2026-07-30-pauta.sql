-- scripts/sql/2026-07-30-pauta.sql
-- Tablero de pauta: gasto diario por anuncio + funciones SQL del embudo y las cubetas.
-- Ver docs/superpowers/specs/2026-07-30-tablero-pauta-design.md
--
-- Todo aditivo: nada de lo de acá toca una tabla que ya existiera antes de esta
-- migración. Se puede correr muchas veces sin romper nada (if not exists / or replace).

-- OJO, lección ya pagada: NO existe (ni hace falta crear) una tabla
-- public.schema_migrations en este proyecto. El registro de migraciones lo
-- lleva Supabase solo, en supabase_migrations.schema_migrations, y
-- apply_migration lo escribe ahí automáticamente con el `name` que se le
-- pasa a la migración — no hay nada que insertar a mano. (Se llegó a crear
-- por error una public.schema_migrations en esta misma tarea, creyendo que
-- era la tabla compartida del proyecto; se verificó que tenía una sola fila
-- y se borró.)

-- Qué cuenta publicitaria paga para qué tienda. Es tabla y no código fijo
-- porque hay 16 cuentas con nombres repetidos y esto cambia.
create table if not exists crm.pauta_cuentas (
  ad_account_id text primary key,
  nombre        text,
  tienda_id     text not null check (tienda_id in ('INDSTORE','MANDARINA')),
  moneda        text default 'USD',
  activa        boolean not null default true,
  notas         text
);

alter table crm.pauta_cuentas enable row level security;

-- Foto diaria del gasto por anuncio.
-- Los nombres van desnormalizados A PROPÓSITO: renombrar una campaña en Meta
-- reescribe también el reporte de julio. Así julio dice lo que decía en julio.
create table if not exists crm.pauta_dia (
  fecha               date not null,
  ad_id               text not null,
  ad_account_id       text,
  tienda_id           text,
  campaign_id         text,
  campaign_nombre     text,
  adset_id            text,
  adset_nombre        text,
  ad_nombre           text,
  estado              text,
  gasto               numeric(12,2) default 0,
  impresiones         bigint default 0,
  clics               bigint default 0,
  conversaciones_meta bigint default 0,
  valor_meta          numeric(12,2),
  roas_meta           numeric(10,4),
  creative_id         text,
  arte_url            text,
  arte_tipo           text,
  arte_texto          text,
  arte_titular        text,
  actualizado_at      timestamptz not null default now(),
  primary key (fecha, ad_id)
);

alter table crm.pauta_dia enable row level security;

create index if not exists pauta_dia_tienda_fecha on crm.pauta_dia (tienda_id, fecha desc);
create index if not exists pauta_dia_campaign     on crm.pauta_dia (campaign_id);

-- El embudo, calculado en vivo. Cruza inbox.mensajes con crm.pedidos.
--
-- OJO con el LEFT JOIN a pedidos: una persona con 2 pedidos aparece 2 veces, así
-- que los escalones cuentan `distinct t9`. Contar `*` inflaría "llegaron".
create or replace function crm.pauta_embudo(
  p_desde          date,
  p_hasta          date,
  p_tienda         text,
  p_ventana_dias   int default 30,
  p_min_respondio  int default 2,
  p_min_converso   int default 3
)
returns table (
  ad_id        text,
  tienda_id    text,
  llegaron     int,
  respondieron int,
  conversaron  int,
  pedidos      int,
  pagados      int,
  venta        numeric
)
language sql
stable
as $$
  with personas as (
    select
      right(regexp_replace(m.telefono, '\D', '', 'g'), 9) as t9,
      case when m.cuenta = 'IND' then 'INDSTORE' else 'MANDARINA' end as tienda_id,
      min(m.fecha) as primer_msg,
      count(*) filter (where m.direccion = 'ENTRANTE') as msgs_cliente,
      -- El ÚLTIMO anuncio que la trajo (regla R1 del diseño).
      (array_agg(m.referral->>'source_id' order by m.fecha desc)
         filter (where coalesce(m.referral->>'source_id','') <> ''))[1] as ad_id
    from inbox.mensajes m
    group by 1, 2
  ),
  elegibles as (
    select *
    from personas
    where ad_id is not null
      -- OJO con la trampa de zona horaria: un `date` casteado directo a
      -- `timestamptz` (`p_desde::timestamptz`) se resuelve con el timezone
      -- de la SESIÓN, no con el de Ecuador. Este proyecto corre en UTC, así
      -- que ese cast da medianoche UTC = 19:00 del día anterior en Ecuador
      -- (-05) y el corte cae 5 horas antes de tiempo, perdiendo gente de la
      -- última tarde/noche del rango. Por eso se arma el timestamp a mano
      -- con el offset `-05` explícito, igual que ya hace `ped` en
      -- `pauta_cubetas`. Aplica tanto al piso como al techo del rango.
      --
      -- Fecha piso: antes del 13-jul-2026 no se capturaba referral.
      and primer_msg >= greatest(
            (p_desde::text || 'T00:00:00-05')::timestamptz,
            timestamptz '2026-07-13 00:00:00-05'
          )
      and primer_msg <  ((p_hasta + 1)::text || 'T00:00:00-05')::timestamptz
      and tienda_id = p_tienda
  ),
  ped as (
    select right(regexp_replace(coalesce(c.celular,''), '\D', '', 'g'), 9) as t9,
           p.pedido_id, p.monto_total, p.fecha_pedido, p.estado_pago
    from crm.pedidos p
    join crm.clientes c on c.cliente_id = p.cliente_id
  )
  select
    e.ad_id,
    e.tienda_id,
    count(distinct e.t9)::int,
    count(distinct e.t9) filter (where e.msgs_cliente >= p_min_respondio)::int,
    count(distinct e.t9) filter (where e.msgs_cliente >= p_min_converso)::int,
    count(distinct ped.pedido_id)::int,
    count(distinct ped.pedido_id) filter (where ped.estado_pago ilike '%PAGADO%')::int,
    coalesce(sum(ped.monto_total), 0)
  from elegibles e
  left join ped
    on ped.t9 = e.t9
   and ped.fecha_pedido >= e.primer_msg
   and ped.fecha_pedido <  e.primer_msg + (p_ventana_dias || ' days')::interval
  group by 1, 2;
$$;

-- Las tres cubetas del diseño (R4): de pauta, sin pauta, y pedidos sin chat.
-- Van separadas a propósito: los pedidos sin conversación (mostrador, web,
-- teléfono) NO son fracaso de la pauta y no deben restarle.
create or replace function crm.pauta_cubetas(p_desde date, p_hasta date, p_tienda text)
returns table (pauta int, sin_pauta int, sin_chat int)
language sql stable as $$
  with personas as (
    select right(regexp_replace(m.telefono,'\D','','g'),9) as t9,
           case when m.cuenta='IND' then 'INDSTORE' else 'MANDARINA' end as tienda_id,
           min(m.fecha) as primer_msg,
           bool_or(coalesce(m.referral->>'source_id','') <> '') as de_pauta
    from inbox.mensajes m group by 1,2
  ),
  nuevos as (
    select * from personas
    where tienda_id = p_tienda
      -- Mismo cuidado de zona horaria que en pauta_embudo: armar el
      -- timestamp a mano con `-05` explícito, nunca castear el `date`
      -- directo a `timestamptz` (eso usa el timezone de la sesión, que acá
      -- es UTC, y corta 5 horas antes de la medianoche real de Ecuador).
      and primer_msg >= greatest(
            (p_desde::text || 'T00:00:00-05')::timestamptz,
            timestamptz '2026-07-13 00:00:00-05'
          )
      and primer_msg <  ((p_hasta + 1)::text || 'T00:00:00-05')::timestamptz
  ),
  con_chat as (select distinct t9 from personas where tienda_id = p_tienda),
  ped as (
    select right(regexp_replace(coalesce(c.celular,''),'\D','','g'),9) as t9, p.pedido_id
    from crm.pedidos p join crm.clientes c on c.cliente_id = p.cliente_id
    where p.tienda_id = p_tienda
      and p.fecha_pedido >= (p_desde::text || 'T00:00:00-05')::timestamptz
      and p.fecha_pedido <  ((p_hasta + 1)::text || 'T00:00:00-05')::timestamptz
  )
  select
    (select count(*) from nuevos where de_pauta)::int,
    (select count(*) from nuevos where not de_pauta)::int,
    (select count(*) from ped where t9 not in (select t9 from con_chat))::int;
$$;

-- Semilla de crm.pauta_cuentas. Valores REALES de la Tarea 1
-- (docs/superpowers/specs/2026-07-30-mapeo-cuentas-pauta.md): 33 de 33 anuncios
-- del inbox mapeados al 100%, ninguna cuenta paga para las dos tiendas a la vez.
insert into crm.pauta_cuentas (ad_account_id, nombre, tienda_id, moneda) values
  ('1500806130455765', 'IndStore',        'INDSTORE',  'USD'),
  ('360623391212876',  'MandarinaLaBMKT', 'MANDARINA', 'USD')
on conflict (ad_account_id) do update
  set nombre = excluded.nombre, tienda_id = excluded.tienda_id;

-- Bucket de artes (creatividades de anuncios, no datos de clientes): público de
-- lectura, igual criterio que inbox-media. Si ya existiera no se toca.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pauta-artes', 'pauta-artes', true, 26214400,
  array['image/jpeg','image/png','image/webp','image/gif',
        'video/mp4','video/3gpp','video/quicktime','video/webm']
)
on conflict (id) do nothing;

-- Sin insert de registro acá: ver la nota de arriba sobre
-- supabase_migrations.schema_migrations.
