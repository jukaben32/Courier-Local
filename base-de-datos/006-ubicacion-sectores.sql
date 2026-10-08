-- 006 · Ubicación de los sectores (para repartir parejo sin alargar las rutas)
-- Se pega UNA vez en el editor SQL de Supabase. Solo agrega columnas vacías: no toca datos existentes.

alter table sectores add column if not exists latitud double precision;
alter table sectores add column if not exists longitud double precision;
-- De dónde salió la ubicación: 'osm' (mapa), 'aprendido' (promedio de los pines de los clientes) o 'manual'
alter table sectores add column if not exists origen_ubicacion text
  check (origen_ubicacion in ('osm', 'aprendido', 'manual'));

comment on column sectores.latitud is 'Centro aproximado del sector. Lo usa el reparto equitativo para saber qué sector queda cerca de cuál.';
