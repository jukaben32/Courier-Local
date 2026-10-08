-- 005 · Repartidor suplente (de emergencia), coberturas de ausencias y reemplazo definitivo
-- Se pega UNA vez en el editor SQL de Supabase. Es seguro: solo agrega cosas, no toca datos existentes.

-- 1) Marca al repartidor suplente: no tiene rutas fijas, entra cuando otro falla
alter table repartidores add column if not exists es_suplente boolean not null default false;
comment on column repartidores.es_suplente is 'Repartidor de emergencia: sin sectores fijos; cubre ausencias y se entrena por si alguien sale.';

-- 2) Coberturas: "hoy (o hasta tal día) este repartidor cubre al que falta"
create table if not exists coberturas (
  id uuid primary key default gen_random_uuid(),
  ausente_id uuid not null references repartidores(id),
  cubre_id uuid not null references repartidores(id),
  desde date not null,
  hasta date not null,
  motivo text,
  creada_por uuid references usuarios(id),
  creada_en timestamptz not null default now(),
  terminada_en timestamptz,
  constraint cobertura_fechas check (hasta >= desde),
  constraint cobertura_distintos check (ausente_id <> cubre_id)
);

-- Una sola cobertura abierta por repartidor ausente
create unique index if not exists uq_cobertura_abierta on coberturas(ausente_id) where terminada_en is null;
create index if not exists idx_coberturas_vigentes on coberturas(desde, hasta) where terminada_en is null;

alter table coberturas enable row level security;
drop policy if exists coberturas_oficina on coberturas;
create policy coberturas_oficina on coberturas for all to authenticated
  using (rol_actual() in ('dueno','organizador')) with check (rol_actual() in ('dueno','organizador'));

-- 3) Cubrir una ausencia: registra la cobertura y pasa los paquetes pendientes, todo o nada
create or replace function cubrir_ausencia(p_ausente uuid, p_cubre uuid, p_hasta date, p_motivo text default null)
returns int
language plpgsql
as $$
declare
  hoy date := (now() at time zone 'America/Santo_Domingo')::date;
  movidos int;
begin
  insert into coberturas (ausente_id, cubre_id, desde, hasta, motivo, creada_por)
  values (p_ausente, p_cubre, hoy, greatest(coalesce(p_hasta, hoy), hoy), nullif(trim(p_motivo), ''), auth.uid());

  update paquetes
     set repartidor_asignado_id = p_cubre
   where repartidor_asignado_id = p_ausente
     and estado in ('recibido','notificado','confirmado','en_ruta','intento_fallido');
  get diagnostics movidos = row_count;
  return movidos;
end;
$$;

-- 4) Reemplazo definitivo: el entrante hereda las rutas del saliente, que queda dado de baja
create or replace function reemplazar_repartidor(p_saliente uuid, p_entrante uuid)
returns int
language plpgsql
as $$
declare
  movidos int;
begin
  if p_saliente = p_entrante then
    raise exception 'El repartidor que sale y el que entra son la misma persona';
  end if;
  if (select count(*) from repartidores where id in (p_saliente, p_entrante) and rol = 'repartidor') <> 2 then
    raise exception 'Los dos deben ser repartidores (no el administrador de la minivan)';
  end if;

  insert into repartidor_sectores (repartidor_id, sector_id)
    select p_entrante, sector_id from repartidor_sectores where repartidor_id = p_saliente
  on conflict do nothing;
  delete from repartidor_sectores where repartidor_id = p_saliente;

  update repartidores set activo = false where id = p_saliente;
  update repartidores set es_suplente = false where id = p_entrante;

  update coberturas set terminada_en = now()
   where terminada_en is null and (ausente_id = p_saliente or cubre_id = p_saliente);

  update paquetes
     set repartidor_asignado_id = p_entrante
   where repartidor_asignado_id = p_saliente
     and estado in ('recibido','notificado','confirmado','en_ruta','intento_fallido');
  get diagnostics movidos = row_count;
  return movidos;
end;
$$;
