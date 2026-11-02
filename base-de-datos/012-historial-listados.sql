-- 012: historial enriquecido de los listados.
-- Solo AGREGA: un depósito privado, una columna, una tabla y una vista. No cambia ni borra nada.

-- 1. Copia del Excel original de cada importación (depósito privado, solo la oficina).
insert into storage.buckets (id, name, public)
values ('listados', 'listados', false)
on conflict (id) do nothing;

create policy listados_oficina on storage.objects for all to authenticated
  using (bucket_id = 'listados' and rol_actual() in ('dueno', 'organizador'))
  with check (bucket_id = 'listados' and rol_actual() in ('dueno', 'organizador'));

alter table importaciones add column if not exists archivo_ruta text;

-- 2. Cada fila de cada listado, tal como vino ese día (incluidas las repetidas). Como el listado de la
--    oficina es acumulado, esto guarda cómo fue cambiando cada paquete en el sistema del courier
--    (ESTADO, DEMORA GENERAL, REPARTIDOR ACTUAL...) día tras día.
create table if not exists listado_filas (
  id uuid primary key default gen_random_uuid(),
  importacion_id uuid not null references importaciones(id) on delete cascade,
  fila int,
  numero_guia text,
  paquete_id uuid references paquetes(id),
  resultado text not null check (resultado in ('importada', 'repetida', 'omitida')),
  motivo text,
  datos jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_listado_filas_guia on listado_filas (numero_guia);
create index if not exists idx_listado_filas_importacion on listado_filas (importacion_id);
create index if not exists idx_listado_filas_paquete on listado_filas (paquete_id);

alter table listado_filas enable row level security;
create policy listado_filas_oficina on listado_filas for all to authenticated
  using (rol_actual() in ('dueno', 'organizador')) with check (rol_actual() in ('dueno', 'organizador'));

-- Las filas del primer listado (30 de octubre) ya estaban guardadas dentro de cada paquete
insert into listado_filas (importacion_id, numero_guia, paquete_id, resultado, datos)
select p.importacion_id, p.numero_guia, p.id, 'importada', p.datos_listado
from paquetes p
where p.importacion_id is not null
  and p.datos_listado is not null
  and not exists (select 1 from listado_filas f where f.paquete_id = p.id);

-- 3. Vista enriquecida: una fila por paquete con todo lo que sabemos, lista para exportar o analizar.
--    security_invoker: respeta los permisos de quien la consulta (la oficina ve todo, el repartidor nada).
create or replace view paquetes_enriquecidos with (security_invoker = true) as
select
  p.numero_guia,
  p.nombre_etiqueta as destinatario,
  d.telefono,
  d.cedula,
  d.direccion_texto as direccion,
  s.nombre as sector,
  z.nombre as zona,
  p.ubicacion_entrega_lat as ubicacion_lat,
  p.ubicacion_entrega_lng as ubicacion_lng,
  p.ubicacion_entrega_en as ubicacion_recibida_en,
  p.estado,
  p.voluminoso as paquete_grande,
  p.fecha_recibido,
  p.hora_confirmacion,
  p.hora_preferida as entrega_desde,
  p.hora_hasta as entrega_hasta,
  p.dia_entrega,
  r.nombre as repartidor,
  p.intentos_realizados as intentos,
  e.creado_en as fecha_entrega,
  e.tipo as tipo_entrega,
  e.receptor_es_destinatario,
  e.receptor_nombre,
  e.verificacion as verificacion_cedula,
  e.cargado_en_courier as prueba_subida,
  case when e.cargado_en_courier_en is not null
       then round(extract(epoch from (e.cargado_en_courier_en - e.creado_en)) / 60)
  end as minutos_hasta_subir_prueba,
  p.datos_listado ->> 'SERVICIO' as servicio,
  p.datos_listado ->> 'MANIFIESTO' as manifiesto,
  p.datos_listado ->> 'ORDEN' as orden,
  p.datos_listado ->> 'PESO' as peso,
  p.datos_listado ->> 'ESTADO' as estado_en_courier,
  i.archivo as importado_desde,
  i.created_at as importado_en
from paquetes p
left join destinatarios d on d.id = p.destinatario_id
left join sectores s on s.id = p.sector_id
left join zonas z on z.id = s.zona_id
left join repartidores r on r.id = p.repartidor_asignado_id
left join importaciones i on i.id = p.importacion_id
left join lateral (
  select * from entregas en
  where en.paquete_id = p.id and en.resultado = 'entregado'
  order by en.creado_en desc
  limit 1
) e on true;
