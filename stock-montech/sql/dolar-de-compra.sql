-- Dolar de compra de la mercaderia.
--
-- Cada unidad (celular o accesorio) guarda en cotizacion_costo el dolar al que se pago. Hasta
-- ahora esa columna se llenaba recien al vender, con el "Costo $" de ese dia. Desde ahora se
-- llena al cargar el stock (Nuevo ingreso o Sumar stock) y la venta la respeta.
--
-- 1. Se asegura de que las dos tablas tengan la columna (si ya la tienen, no cambia nada).
-- 2. A lo que hoy esta en el local, con revendedores o senado y todavia no tiene dolar, le
--    congela el "Costo $" que esta guardado ahora en el panel (o el de venta, si el de costo esta
--    vacio). Asi su costo en pesos deja de moverse cuando cambie el dolar. Despues se puede
--    corregir modelo por modelo desde Opciones > Compras y dolar.
--
-- Se puede correr dos veces sin romper nada: el paso 2 solo toca unidades sin dolar. Las ventas
-- ya hechas no se tocan.

alter table public.celulares add column if not exists cotizacion_costo numeric;
alter table public.accesorios add column if not exists cotizacion_costo numeric;

update public.celulares
   set cotizacion_costo = (select coalesce(nullif(c.cotizacion_costo, 0), c.cotizacion_dolar) from public.configuracion c where c.id = 1)
 where estado in ('disponible', 'revendedor', 'senado')
   and (cotizacion_costo is null or cotizacion_costo <= 0);

update public.accesorios
   set cotizacion_costo = (select coalesce(nullif(c.cotizacion_costo, 0), c.cotizacion_dolar) from public.configuracion c where c.id = 1)
 where estado in ('disponible', 'revendedor', 'senado')
   and (cotizacion_costo is null or cotizacion_costo <= 0);
