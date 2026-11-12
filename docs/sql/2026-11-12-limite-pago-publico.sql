-- 2026-11-12 · Tope de envíos a /api/publico/pago (recuadro de pago de la tienda).
-- Contador por (clave, ventana): la ruta corre en varias funciones de Vercel a la
-- vez, así que el conteo vive en la base y se suma de forma ATÓMICA.
-- La clave nunca guarda la IP en claro: va un hash (lib/limitePublico.js).

create table if not exists crm.limites_publicos (
  clave    text        not null,
  ventana  timestamptz not null,
  cuenta   integer     not null default 0,
  primary key (clave, ventana)
);

alter table crm.limites_publicos enable row level security;
-- sin políticas: solo la service_role (servidor) la usa.

create index if not exists limites_publicos_ventana_idx on crm.limites_publicos (ventana);

-- Suma 1 al contador de esta ventana y devuelve el total. Una vez de cada ~200
-- llamadas borra ventanas de más de 1 día, para que la tabla no crezca.
create or replace function crm.sumar_limite(p_clave text, p_ventana timestamptz)
returns integer
language plpgsql
security definer
set search_path = crm, pg_temp
as $$
declare
  v integer;
begin
  insert into crm.limites_publicos as l (clave, ventana, cuenta)
  values (p_clave, p_ventana, 1)
  on conflict (clave, ventana) do update set cuenta = l.cuenta + 1
  returning l.cuenta into v;

  if random() < 0.005 then
    delete from crm.limites_publicos where ventana < now() - interval '1 day';
  end if;

  return v;
end;
$$;

revoke all on function crm.sumar_limite(text, timestamptz) from public, anon, authenticated;
grant execute on function crm.sumar_limite(text, timestamptz) to service_role;
