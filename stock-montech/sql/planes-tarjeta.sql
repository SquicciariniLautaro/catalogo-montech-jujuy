-- Simulador de cuotas con tarjeta: interes de cada plan y si se muestra en el catalogo.
--
-- El panel los cambia desde la pestana Tarjeta; el catalogo publico solo los lee para calcular las
-- cuotas. Arranca con los intereses del Excel "TARJETAS INTERESES MONTECH" (la cuota unica oculta).
-- Mientras esta tabla no exista, el panel y el catalogo usan esos mismos valores, pero el panel no
-- puede guardar cambios.
--
-- Se puede correr dos veces sin romper nada: no pisa los intereses ya guardados.

create table if not exists public.planes_tarjeta (
  cuotas int primary key check (cuotas between 1 and 36),
  interes numeric not null default 0 check (interes >= 0),   -- en porcentaje: 15 = 15%
  visible boolean not null default true                       -- false = no aparece en el catalogo ni en el texto para copiar
);

insert into public.planes_tarjeta (cuotas, interes, visible) values
  (1, 15, false),
  (3, 20, true),
  (6, 27, true),
  (9, 46, true),
  (12, 57, true)
on conflict (cuotas) do nothing;

-- El panel (con sesion iniciada) hace todo; el catalogo publico solo lee
alter table public.planes_tarjeta enable row level security;
drop policy if exists "panel_todo" on public.planes_tarjeta;
create policy "panel_todo" on public.planes_tarjeta for all to authenticated using (true) with check (true);
drop policy if exists "publico_lee" on public.planes_tarjeta;
create policy "publico_lee" on public.planes_tarjeta for select to anon using (true);
grant select on public.planes_tarjeta to anon;
grant select, insert, update, delete on public.planes_tarjeta to authenticated;

-- Misma traba que el resto de las tablas si ya se corrio cobro-mensualidad.sql: en solo lectura
-- no se pueden cambiar los intereses
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'servicio_habilitado') then
    drop policy if exists "servicio_al_dia_alta" on public.planes_tarjeta;
    create policy "servicio_al_dia_alta" on public.planes_tarjeta as restrictive for insert to public
      with check (public.servicio_habilitado());
    drop policy if exists "servicio_al_dia_cambio" on public.planes_tarjeta;
    create policy "servicio_al_dia_cambio" on public.planes_tarjeta as restrictive for update to public
      using (public.servicio_habilitado()) with check (public.servicio_habilitado());
    drop policy if exists "servicio_al_dia_baja" on public.planes_tarjeta;
    create policy "servicio_al_dia_baja" on public.planes_tarjeta as restrictive for delete to public
      using (public.servicio_habilitado());
  end if;
end $$;
