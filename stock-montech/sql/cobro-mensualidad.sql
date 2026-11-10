-- Cobro de la mensualidad del sistema (Lambda).
--
-- Crea la tabla estado_servicio (vencimiento y datos de pago) y traba la base: pasados los dias
-- de gracia despues del vencimiento, nadie puede agregar, cambiar ni borrar nada desde el panel.
-- Leer sigue funcionando, asi el catalogo publico y el panel se siguen viendo.
--
-- El panel puede leer estado_servicio pero no cambiarla: solo se cambia desde Supabase
-- (SQL Editor o Table Editor), que no pasa por estas reglas.
--
-- Se puede correr dos veces sin romper nada. Mientras estado_servicio no tenga su fila (la carga
-- datos-de-pago.sql), no se bloquea nada.

create table if not exists public.estado_servicio (
  id int primary key default 1 check (id = 1),
  vence date not null,                         -- ultimo dia para pagar (el 13 de cada mes)
  monto numeric,                               -- mensualidad en pesos (vacio = no se muestra)
  recargo_diario numeric not null default 10000,
  dias_aviso int not null default 5,           -- dias antes del vencimiento en que aparece el aviso
  dias_gracia int not null default 7,          -- dias despues del vencimiento hasta el solo lectura
  cbu text,
  alias text,
  cuenta text,
  titular text,
  cuil text,
  banco text
);

alter table public.estado_servicio enable row level security;
drop policy if exists "panel_lee_estado_servicio" on public.estado_servicio;
create policy "panel_lee_estado_servicio" on public.estado_servicio
  for select to authenticated using (true);
revoke insert, update, delete on public.estado_servicio from anon, authenticated;
grant select on public.estado_servicio to authenticated;

-- true mientras el panel puede hacer cambios. Sin fila en estado_servicio, siempre true.
create or replace function public.servicio_habilitado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (now() at time zone 'America/Argentina/Buenos_Aires')::date <= e.vence + e.dias_gracia
       from public.estado_servicio e where e.id = 1),
    true
  );
$$;
grant execute on function public.servicio_habilitado() to anon, authenticated;

-- Traba en todas las tablas del sistema. Las reglas "restrictivas" se suman a las que ya tiene
-- cada tabla: no abren nada nuevo, solo agregan la condicion de que el servicio este al dia.
do $$
declare
  t record;
begin
  for t in
    select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'estado_servicio'
  loop
    -- Una tabla sin RLS ignora las reglas. Se le prende con permisos iguales a los de hoy
    -- (el panel hace todo, el catalogo lee) para que siga funcionando igual.
    if not t.relrowsecurity then
      execute format('alter table public.%I enable row level security', t.relname);
      execute format('drop policy if exists "panel_todo" on public.%I', t.relname);
      execute format('create policy "panel_todo" on public.%I for all to authenticated using (true) with check (true)', t.relname);
      execute format('drop policy if exists "publico_lee" on public.%I', t.relname);
      execute format('create policy "publico_lee" on public.%I for select to anon using (true)', t.relname);
      raise notice 'La tabla % no tenia RLS: se prendio con los permisos de siempre', t.relname;
    end if;

    execute format('drop policy if exists "servicio_al_dia_alta" on public.%I', t.relname);
    execute format('create policy "servicio_al_dia_alta" on public.%I as restrictive for insert to public with check (public.servicio_habilitado())', t.relname);
    execute format('drop policy if exists "servicio_al_dia_cambio" on public.%I', t.relname);
    execute format('create policy "servicio_al_dia_cambio" on public.%I as restrictive for update to public using (public.servicio_habilitado()) with check (public.servicio_habilitado())', t.relname);
    execute format('drop policy if exists "servicio_al_dia_baja" on public.%I', t.relname);
    execute format('create policy "servicio_al_dia_baja" on public.%I as restrictive for delete to public using (public.servicio_habilitado())', t.relname);
  end loop;
end $$;
