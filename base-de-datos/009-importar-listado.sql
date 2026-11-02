-- 009: importar el "Listado de envíos en la oficina" (Excel) en vez de registrar paquete por paquete.
-- Solo AGREGA una tabla y dos columnas; no cambia ni borra nada.

-- Cada vez que la oficina sube un listado queda anotado: qué archivo, quién, cuántas filas
-- entraron y cuáles no (con el motivo). Sirve de respaldo y para revisar errores después.
create table if not exists importaciones (
  id uuid primary key default gen_random_uuid(),
  archivo text not null,
  creado_por uuid references usuarios(id),
  total_filas int not null default 0,
  importadas int not null default 0,
  omitidas int not null default 0,
  -- filas que no entraron: [{ "fila": 7, "guia": "SP...", "motivo": "..." }]
  omitidas_detalle jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- De qué importación vino cada paquete, y su fila del Excel COMPLETA (todas las columnas,
-- aunque la app no las use hoy: manifiesto, orden, peso, servicio, fechas...).
alter table paquetes add column if not exists importacion_id uuid references importaciones(id);
alter table paquetes add column if not exists datos_listado jsonb;
create index if not exists idx_paquetes_importacion on paquetes(importacion_id);

alter table importaciones enable row level security;
create policy importaciones_oficina on importaciones for all to authenticated
  using (rol_actual() in ('dueno','organizador')) with check (rol_actual() in ('dueno','organizador'));
