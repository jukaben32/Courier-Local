-- 015: registro de llamadas, penalidades y segundo teléfono del repartidor.
-- Solo AGREGA columnas y tablas nuevas; no cambia ni borra nada. Es seguro con la rama main (comparten base).
-- Aplicar ANTES de publicar (push) el código que lo usa.

-- 1. Segundo teléfono del repartidor
alter table repartidores add column if not exists telefono2 text;

-- 2. Llamadas a clientes: quién llamó, a qué hora y qué pasó
create table if not exists llamadas (
  id uuid primary key default gen_random_uuid(),
  paquete_id uuid not null references paquetes(id) on delete cascade,
  repartidor_id uuid references repartidores(id),
  usuario_id uuid references usuarios(id),
  telefono text not null,
  resultado text not null check (resultado in ('contesto', 'no_contesto', 'ocupado', 'numero_equivocado', 'apagado', 'reprogramado')),
  nota text,
  creada_en timestamptz not null default now()
);
create index if not exists idx_llamadas_paquete on llamadas (paquete_id, creada_en desc);
create index if not exists idx_llamadas_fecha on llamadas (creada_en desc);

alter table llamadas enable row level security;

create policy llamadas_oficina on llamadas for all to authenticated
  using (rol_actual() in ('dueno', 'organizador'))
  with check (rol_actual() in ('dueno', 'organizador'));

create policy llamadas_repartidor_ver on llamadas for select to authenticated
  using (repartidor_id = repartidor_actual());

create policy llamadas_repartidor_crear on llamadas for insert to authenticated
  with check (
    repartidor_id = repartidor_actual()
    and exists (select 1 from paquetes p where p.id = llamadas.paquete_id and p.repartidor_asignado_id = repartidor_actual())
  );

-- 3. Penalidades que cobra el courier a la oficina (paquete perdido, demora en oficina...)
create table if not exists penalidades (
  id uuid primary key default gen_random_uuid(),
  paquete_id uuid references paquetes(id) on delete set null,
  numero_guia text not null,
  tipo text not null check (tipo in ('paquete_perdido', 'demora_oficina', 'otro')),
  costo numeric(12, 2) not null check (costo >= 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagada')),
  dias_en_oficina int,
  nota text,
  creada_en timestamptz not null default now(),
  pagada_en timestamptz,
  registrada_por uuid references usuarios(id)
);
create index if not exists idx_penalidades_estado on penalidades (estado, creada_en desc);

alter table penalidades enable row level security;

create policy penalidades_oficina on penalidades for all to authenticated
  using (rol_actual() in ('dueno', 'organizador'))
  with check (rol_actual() in ('dueno', 'organizador'));
