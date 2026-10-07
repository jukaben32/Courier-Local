-- ============================================================
-- Courier Local — Excepciones de cédula
-- ============================================================
-- Se ejecuta UNA vez, después de 003-subida-courier.sql.
-- Cuando la cédula no coincide con el nombre del paquete, el sistema no deja entregar. Si el repartidor
-- cree que igual corresponde (apodo en la etiqueta, nombre cortado…), pide autorización a la oficina:
-- queda una solicitud con la foto, y un organizador la autoriza (con su motivo) o la rechaza.

create table solicitudes_excepcion (
  id uuid primary key default gen_random_uuid(),
  paquete_id uuid not null references paquetes(id),
  repartidor_id uuid not null references repartidores(id),
  foto_url text not null,
  -- lo que el sistema alcanzó a leer de la cédula (puede quedar vacío si la foto era ilegible)
  nombre_en_cedula text,
  cedula_leida text,
  motivo_sistema text not null check (motivo_sistema in ('no_coincide', 'ilegible')),
  nota_repartidor text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  resuelto_por uuid references usuarios(id),
  motivo_resolucion text,
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  -- una decisión siempre deja escrito por qué
  constraint resolucion_con_motivo check (estado = 'pendiente' or (resuelto_por is not null and motivo_resolucion is not null))
);

-- Solo puede haber una solicitud pendiente por paquete
create unique index uq_excepcion_pendiente on solicitudes_excepcion (paquete_id) where estado = 'pendiente';
create index idx_excepcion_estado on solicitudes_excepcion (estado, creada_en);

alter table solicitudes_excepcion enable row level security;

-- La oficina ve y resuelve todas
create policy excepciones_oficina on solicitudes_excepcion for all to authenticated
  using (rol_actual() in ('dueno', 'organizador'))
  with check (rol_actual() in ('dueno', 'organizador'));

-- El repartidor ve las suyas y crea solicitudes solo de sus paquetes
create policy excepciones_repartidor_ver on solicitudes_excepcion for select to authenticated
  using (repartidor_id = repartidor_actual());

create policy excepciones_repartidor_crear on solicitudes_excepcion for insert to authenticated
  with check (
    repartidor_id = repartidor_actual()
    and estado = 'pendiente'
    and resuelto_por is null
    and exists (select 1 from paquetes p where p.id = solicitudes_excepcion.paquete_id and p.repartidor_asignado_id = repartidor_actual())
  );
