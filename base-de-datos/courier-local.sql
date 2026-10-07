-- ============================================================
-- Courier Local — Base de datos completa (Supabase / Postgres)
-- ============================================================
-- UN SOLO archivo: crea tablas, reglas, permisos, datos iniciales,
-- índice de efectividad, bonos y liquidación quincenal.
-- Se ejecuta una sola vez (SQL Editor > pegar todo > Run).
--
-- Contenido, en orden:
--   1. Utilidades (hora de RD, actualización automática de fechas)
--   2. Zonas, sectores, franjas, repartidores, usuarios
--   3. Destinatarios, paquetes, entregas, mensajes
--   4. Reglas automáticas (triggers)
--   5. Índice de efectividad, bonos y liquidación
--   6. Permisos (RLS) y almacenamiento privado de fotos
--   7. Datos iniciales
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. UTILIDADES
-- ------------------------------------------------------------

-- Supabase guarda las horas en UTC (4 horas adelante de RD).
-- Esta función convierte a la hora local de República Dominicana;
-- se usa en todos los cálculos por franja horaria y por quincena.
create function a_hora_local(momento timestamptz)
returns timestamp
language sql stable
as $$ select momento at time zone 'America/Santo_Domingo' $$;

-- Actualiza sola la columna updated_at cada vez que se edita una fila
create function tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. ZONAS, SECTORES, FRANJAS, REPARTIDORES, USUARIOS
-- ------------------------------------------------------------

-- ZONAS: solo los 2 niveles de PAGO confirmados por el cliente
create table zonas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,           -- 'San Pedro' o 'Municipios'
  tarifa_pago numeric(10,2) not null,    -- RD$ por paquete entregado
  created_at timestamptz not null default now()
);

-- SECTORES: las áreas concretas de reparto, cada una dentro de una zona de pago
create table sectores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  zona_id uuid not null references zonas(id),
  -- solo afecta el índice de efectividad (bonos), no el pago
  factor_dificultad numeric(3,2) not null default 1.00,
  created_at timestamptz not null default now()
);

-- FRANJAS: los horarios que se ofrecen por WhatsApp.
-- Están en una tabla (no escritos en el código) para poder agregar o cambiar
-- franjas con un solo INSERT/UPDATE. Los repartidores no tienen horario límite.
create table franjas (
  codigo text primary key,
  nombre text not null,
  hora_inicio time not null,
  hora_fin time not null,
  check (hora_fin > hora_inicio)
);

-- REPARTIDORES
create table repartidores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  -- 'administrador' maneja la minivan (paquetes voluminosos) y NO entra al ranking de bonos
  rol text not null default 'repartidor' check (rol in ('repartidor','administrador')),
  vehiculo text not null default 'moto' check (vehiculo in ('moto','minivan')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- REPARTIDOR_SECTORES: quién tiene ruta fija en qué sector (muchos a muchos)
create table repartidor_sectores (
  repartidor_id uuid not null references repartidores(id),
  sector_id uuid not null references sectores(id),
  primary key (repartidor_id, sector_id)
);

-- USUARIOS: las personas que inician sesión en el sistema
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('dueno','organizador','repartidor')),
  repartidor_id uuid references repartidores(id),
  activo boolean not null default true,
  check (rol <> 'repartidor' or repartidor_id is not null)
);

comment on table usuarios is 'Para dar de baja a alguien que se va: activo = false. Pierde el acceso al instante sin borrar su historial.';

-- Funciones auxiliares para los permisos (más abajo)
create function rol_actual()
returns text
language sql stable security definer set search_path = public
as $$ select rol from usuarios where id = auth.uid() and activo $$;

create function repartidor_actual()
returns uuid
language sql stable security definer set search_path = public
as $$ select repartidor_id from usuarios where id = auth.uid() and activo $$;

-- ------------------------------------------------------------
-- 3. DESTINATARIOS, PAQUETES, ENTREGAS, MENSAJES
-- ------------------------------------------------------------

-- DESTINATARIOS: una persona = nombre + teléfono.
-- (Una madre puede comprar a nombre de sus hijos desde el mismo teléfono, y cada
-- uno tiene su propia cédula; por eso el teléfono solo NO identifica a la persona.)
create table destinatarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  cedula text,   -- dato sensible (Ley 172-13); se completa al hacer la primera entrega
  direccion_texto text,
  ubicacion_lat double precision,
  ubicacion_lng double precision,
  punto_encuentro text,  -- zonas rurales: "en el colmado de la esquina"
  sector_id uuid references sectores(id),
  -- captura de cédula que mandó por WhatsApp para autorizar a un tercero
  foto_cedula_referencia_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_destinatarios_nombre_telefono
  on destinatarios (telefono, lower(btrim(nombre)));
create index idx_destinatarios_telefono on destinatarios(telefono);

create trigger trg_destinatarios_updated before update on destinatarios
  for each row execute function tocar_updated_at();

-- PAQUETES
create type estado_paquete as enum (
  'recibido', 'notificado', 'confirmado', 'en_ruta', 'entregado',
  'intento_fallido', 'retiro_oficina', 'devuelto', 'rechazado'
);

-- Por qué se devolvió un paquete. Solo 'falla_repartidor' resta puntos en el índice;
-- lo demás (el cliente no contestó, no estaba, etc.) no es culpa del repartidor.
create type motivo_devolucion as enum (
  'sin_respuesta_destinatario', 'no_localizable', 'rechazado_por_destinatario',
  'danado', 'falla_repartidor', 'otro'
);

create table paquetes (
  id uuid primary key default gen_random_uuid(),
  numero_guia text not null unique,
  destinatario_id uuid not null references destinatarios(id),
  -- nombre TAL COMO VIENE EN LA ETIQUETA: la cédula debe coincidir con este nombre (regla del courier)
  nombre_etiqueta text not null,
  contenido text,
  voluminoso boolean not null default false,  -- va en la minivan del administrador
  estado estado_paquete not null default 'recibido',
  sector_id uuid references sectores(id),
  repartidor_asignado_id uuid references repartidores(id),
  ventana_horaria text references franjas(codigo),
  hora_confirmacion timestamptz,
  fecha_recibido timestamptz not null default now(),
  fecha_limite timestamptz,  -- se calcula sola al guardar: fecha_recibido + 3 días
  intentos_realizados int not null default 0 check (intentos_realizados between 0 and 3),
  motivo_devolucion motivo_devolucion,
  fecha_devolucion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- un paquete devuelto o rechazado siempre debe decir por qué
  constraint devuelto_requiere_motivo check (
    estado not in ('devuelto','rechazado') or motivo_devolucion is not null
  )
);

create index idx_paquetes_destinatario on paquetes(destinatario_id);
create index idx_paquetes_estado on paquetes(estado);
create index idx_paquetes_fecha_limite on paquetes(fecha_limite);
create index idx_paquetes_repartidor on paquetes(repartidor_asignado_id);

create trigger trg_paquetes_updated before update on paquetes
  for each row execute function tocar_updated_at();

create function calcular_fecha_limite()
returns trigger
language plpgsql
as $$
begin
  new.fecha_limite := new.fecha_recibido + interval '3 days';
  return new;
end;
$$;

create trigger trg_paquetes_limite before insert on paquetes
  for each row execute function calcular_fecha_limite();

-- ENTREGAS: la prueba de cada intento (exitoso o fallido)
create table entregas (
  id uuid primary key default gen_random_uuid(),
  paquete_id uuid not null references paquetes(id),
  -- null solo en 'retiro_oficina' (lo registra un organizador)
  repartidor_id uuid references repartidores(id),
  tipo text not null default 'domicilio' check (tipo in ('domicilio','retiro_oficina')),
  resultado text not null check (resultado in ('entregado','intento_fallido','rechazado')),

  -- Cédula del DESTINATARIO ORIGINAL (siempre, aunque reciba un tercero)
  foto_cedula_destinatario_url text,
  cedula_origen text check (cedula_origen in ('fisica_en_entrega','captura_whatsapp')),
  -- lo que la IA leyó de la cédula, comparado con nombre_etiqueta del paquete
  nombre_en_cedula text,
  cedula_leida text,
  cedula_coincide boolean,
  -- Si la cédula no coincide, SOLO un organizador puede autorizar la entrega y debe decir por qué
  excepcion_motivo text,
  excepcion_autorizada_por uuid references usuarios(id),

  -- Quién recibió en la puerta
  receptor_es_destinatario boolean not null default true,
  receptor_nombre text,
  receptor_cedula text,

  foto_paquete_url text,
  ubicacion_lat double precision,
  ubicacion_lng double precision,
  motivo_fallo text,
  cargado_en_courier boolean not null default false,
  -- lo que se pagó por esta entrega, fijado al momento de entregar
  -- (si la tarifa cambia después, los pagos ya hechos no se alteran)
  tarifa_aplicada numeric(10,2),
  creado_en timestamptz not null default now(),

  constraint domicilio_requiere_repartidor check (tipo <> 'domicilio' or repartidor_id is not null),
  constraint tercero_requiere_cedula check (
    resultado <> 'entregado' or receptor_es_destinatario or foto_cedula_destinatario_url is not null
  ),
  constraint entrega_requiere_cedula_coincidente check (
    resultado <> 'entregado'
    or cedula_coincide is true
    or (excepcion_motivo is not null and excepcion_autorizada_por is not null)
  )
);

create index idx_entregas_paquete on entregas(paquete_id);
create index idx_entregas_repartidor on entregas(repartidor_id);

-- MENSAJES_WHATSAPP
create table mensajes_whatsapp (
  id uuid primary key default gen_random_uuid(),
  paquete_id uuid not null references paquetes(id),
  tipo text not null check (tipo in ('aviso','recordatorio','confirmacion','entregado','otro')),
  estado text not null default 'enviado' check (estado in ('enviado','entregado','leido','fallido')),
  contenido text,
  creado_en timestamptz not null default now()
);

create index idx_mensajes_paquete on mensajes_whatsapp(paquete_id);

-- ------------------------------------------------------------
-- 4. REGLAS AUTOMÁTICAS
-- ------------------------------------------------------------

-- Antes de guardar una entrega: fija cuánto se paga por ella
create function entregas_antes_de_insertar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.resultado = 'entregado' and new.tipo = 'domicilio' then
    select z.tarifa_pago into new.tarifa_aplicada
    from paquetes p
    join sectores s on s.id = p.sector_id
    join zonas z on z.id = s.zona_id
    where p.id = new.paquete_id;

    if new.tarifa_aplicada is null then
      raise exception 'El paquete no tiene sector asignado; no se puede calcular la tarifa de la entrega.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_entregas_antes before insert on entregas
  for each row execute function entregas_antes_de_insertar();

-- Después de guardar una entrega: actualiza el estado y los intentos del paquete
create function entregas_despues_de_insertar()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  intentos int;
begin
  if new.resultado = 'entregado' then
    update paquetes set estado = 'entregado' where id = new.paquete_id;

  elsif new.resultado = 'rechazado' then
    update paquetes
    set estado = 'rechazado',
        motivo_devolucion = coalesce(motivo_devolucion, 'rechazado_por_destinatario'),
        fecha_devolucion = now()
    where id = new.paquete_id;

  elsif new.resultado = 'intento_fallido' then
    update paquetes set intentos_realizados = intentos_realizados + 1
    where id = new.paquete_id
    returning intentos_realizados into intentos;

    if intentos >= 3 then
      -- al tercer intento fallido se devuelve al courier; por defecto NO se penaliza
      -- al repartidor (un organizador puede cambiar el motivo a 'falla_repartidor')
      update paquetes
      set estado = 'devuelto',
          motivo_devolucion = coalesce(motivo_devolucion, 'no_localizable'),
          fecha_devolucion = now()
      where id = new.paquete_id;
    else
      update paquetes set estado = 'intento_fallido' where id = new.paquete_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_entregas_despues after insert on entregas
  for each row execute function entregas_despues_de_insertar();

-- ------------------------------------------------------------
-- 5. ÍNDICE DE EFECTIVIDAD, BONOS Y LIQUIDACIÓN
-- ------------------------------------------------------------

-- PARAMETROS_BONO: una sola fila con todos los números ajustables.
-- Los marcados SUPUESTO están pendientes de confirmar con el cliente;
-- se cambian con un UPDATE, sin tocar ninguna consulta.
create table parametros_bono (
  id boolean primary key default true check (id),  -- fuerza una sola fila
  -- pesos del índice (deben sumar 1.00)
  peso_cumplimiento_franja numeric not null default 0.40,
  peso_primer_intento numeric not null default 0.30,
  peso_evidencia numeric not null default 0.30,
  -- puntos extra por cada 1.00 de factor de dificultad por encima de 1.00
  puntos_por_dificultad numeric not null default 20,
  -- puntos que resta cada devolución causada por el repartidor
  puntos_penalizacion_devolucion numeric not null default 5,
  -- ==== SUPUESTOS pendientes de confirmar ====
  volumen_minimo_mensual int not null default 150,
  umbral_bono_mensual numeric not null default 85,
  monto_bono_mensual numeric(10,2) not null default 1500,
  monto_bono_primer_lugar numeric(10,2) not null default 1000,
  monto_bono_anual numeric(10,2) not null default 5000,
  meses_minimos_bono_anual int not null default 6,
  -- ===========================================
  actualizado_en timestamptz not null default now(),
  check (peso_cumplimiento_franja + peso_primer_intento + peso_evidencia = 1)
);

-- INDICE_MENSUAL: el puntaje congelado del mes (base para pagar el bono real)
create table indice_mensual (
  id uuid primary key default gen_random_uuid(),
  repartidor_id uuid not null references repartidores(id),
  mes date not null,  -- primer día del mes
  entregas_totales int not null default 0,
  entregas_en_ventana int not null default 0,
  entregas_primer_intento int not null default 0,
  evidencia_completa_pct numeric,
  factor_dificultad_promedio numeric,
  penalizaciones int not null default 0,
  puntaje numeric,
  bono_calificado boolean not null default false,
  monto_bono numeric(10,2) not null default 0,
  unique (repartidor_id, mes)
);

-- Índice EN VIVO. "security_invoker" hace que cada persona vea solo lo que sus
-- permisos le dejan: un repartidor ve únicamente su propio índice.
create view indice_efectividad_mensual with (security_invoker = true) as
with pr as (
  select * from parametros_bono limit 1
),
base as (
  select
    e.repartidor_id,
    date_trunc('month', a_hora_local(e.creado_en))::date as mes,
    s.factor_dificultad,
    -- ¿entregó dentro de la franja que el cliente confirmó? (null si no confirmó franja)
    case when f.codigo is null then null
         else a_hora_local(e.creado_en)::time >= f.hora_inicio
          and a_hora_local(e.creado_en)::time <  f.hora_fin
    end as en_ventana,
    -- ¿fue al primer intento (sin un intento fallido antes)?
    not exists (
      select 1 from entregas previa
      where previa.paquete_id = e.paquete_id
        and previa.resultado = 'intento_fallido'
        and previa.creado_en < e.creado_en
    ) as primer_intento,
    (e.foto_cedula_destinatario_url is not null
     and e.ubicacion_lat is not null
     and e.cedula_coincide is true
     and e.cargado_en_courier) as evidencia_completa
  from entregas e
  join paquetes p on p.id = e.paquete_id
  join repartidores r on r.id = e.repartidor_id and r.rol = 'repartidor'
  left join sectores s on s.id = p.sector_id
  left join franjas f on f.codigo = p.ventana_horaria
  where e.resultado = 'entregado' and e.tipo = 'domicilio'
),
agregado as (
  select
    repartidor_id,
    mes,
    count(*) as entregas_totales,
    count(*) filter (where en_ventana) as entregas_en_ventana,
    count(*) filter (where primer_intento) as entregas_primer_intento,
    -- si ninguna entrega tenía franja confirmada, este componente no penaliza (100%)
    coalesce(
      count(*) filter (where en_ventana)::numeric
        / nullif(count(*) filter (where en_ventana is not null), 0), 1) as pct_en_ventana,
    count(*) filter (where primer_intento)::numeric / count(*) as pct_primer_intento,
    count(*) filter (where evidencia_completa)::numeric / count(*) as pct_evidencia,
    avg(factor_dificultad) as factor_dificultad_promedio
  from base
  group by repartidor_id, mes
),
penalizacion as (
  select
    repartidor_asignado_id as repartidor_id,
    date_trunc('month', a_hora_local(fecha_devolucion))::date as mes,
    count(*) as penalizaciones
  from paquetes
  where estado = 'devuelto' and motivo_devolucion = 'falla_repartidor'
  group by 1, 2
)
select
  a.repartidor_id,
  a.mes,
  a.entregas_totales,
  a.entregas_en_ventana,
  a.entregas_primer_intento,
  round(a.pct_evidencia * 100, 1) as evidencia_completa_pct,
  round(coalesce(a.factor_dificultad_promedio, 1), 2) as factor_dificultad_promedio,
  coalesce(pz.penalizaciones, 0) as penalizaciones,
  round(greatest(0, least(100,
      100 * (pr.peso_cumplimiento_franja * a.pct_en_ventana
           + pr.peso_primer_intento * a.pct_primer_intento
           + pr.peso_evidencia * a.pct_evidencia)
      + (coalesce(a.factor_dificultad_promedio, 1) - 1) * pr.puntos_por_dificultad
      - coalesce(pz.penalizaciones, 0) * pr.puntos_penalizacion_devolucion
  )), 1) as puntaje
from agregado a
left join penalizacion pz on pz.repartidor_id = a.repartidor_id and pz.mes = a.mes
cross join pr;

-- Bonos del mes (solo para el panel de oficina: el ranking necesita ver a todos)
create view bonos_mensuales with (security_invoker = true) as
with calc as (
  select
    i.*,
    (i.entregas_totales >= pr.volumen_minimo_mensual
     and i.puntaje >= pr.umbral_bono_mensual) as califica_bono
  from indice_efectividad_mensual i
  cross join (select * from parametros_bono limit 1) pr
),
rankeado as (
  select
    c.*,
    case when c.califica_bono
         then rank() over (partition by c.mes, c.califica_bono order by c.puntaje desc)
    end as puesto_del_mes
  from calc c
)
select
  r.*,
  case when r.califica_bono
       then pr.monto_bono_mensual
            + case when r.puesto_del_mes = 1 then pr.monto_bono_primer_lugar else 0 end
       else 0
  end as monto_bono_estimado
from rankeado r
cross join (select * from parametros_bono limit 1) pr;

-- Bono anual: promedio de los meses YA congelados en indice_mensual
create view bonos_anuales with (security_invoker = true) as
with anual as (
  select
    repartidor_id,
    extract(year from mes)::int as anio,
    count(*) as meses_evaluados,
    round(avg(puntaje), 1) as puntaje_promedio
  from indice_mensual
  group by repartidor_id, extract(year from mes)
),
ranking as (
  select
    a.*,
    rank() over (partition by a.anio order by a.puntaje_promedio desc) as puesto_del_anio
  from anual a
  cross join (select * from parametros_bono limit 1) pr
  where a.meses_evaluados >= pr.meses_minimos_bono_anual
)
select
  r.*,
  case when r.puesto_del_anio = 1
       then (select monto_bono_anual from parametros_bono limit 1)
       else 0
  end as monto_bono_estimado
from ranking r;

-- Congela el índice de un mes: select cerrar_mes_bono('2026-10-01');
create function cerrar_mes_bono(mes_a_cerrar date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into indice_mensual (
    repartidor_id, mes, entregas_totales, entregas_en_ventana, entregas_primer_intento,
    evidencia_completa_pct, factor_dificultad_promedio, penalizaciones, puntaje,
    bono_calificado, monto_bono
  )
  select
    b.repartidor_id, b.mes, b.entregas_totales, b.entregas_en_ventana, b.entregas_primer_intento,
    b.evidencia_completa_pct, b.factor_dificultad_promedio, b.penalizaciones, b.puntaje,
    b.califica_bono, b.monto_bono_estimado
  from bonos_mensuales b
  where b.mes = mes_a_cerrar
  on conflict (repartidor_id, mes) do update set
    entregas_totales = excluded.entregas_totales,
    entregas_en_ventana = excluded.entregas_en_ventana,
    entregas_primer_intento = excluded.entregas_primer_intento,
    evidencia_completa_pct = excluded.evidencia_completa_pct,
    factor_dificultad_promedio = excluded.factor_dificultad_promedio,
    penalizaciones = excluded.penalizaciones,
    puntaje = excluded.puntaje,
    bono_calificado = excluded.bono_calificado,
    monto_bono = excluded.monto_bono;
end;
$$;

-- Liquidación quincenal: cuánto se le paga a cada repartidor.
-- Quincena 1 = días 1 al 15; quincena 2 = día 16 al fin de mes (hora de RD).
create view liquidacion_quincenal with (security_invoker = true) as
select
  e.repartidor_id,
  r.nombre as repartidor,
  case when extract(day from a_hora_local(e.creado_en)) <= 15
       then date_trunc('month', a_hora_local(e.creado_en))::date
       else date_trunc('month', a_hora_local(e.creado_en))::date + 15
  end as quincena_inicio,
  count(*) as entregas,
  sum(e.tarifa_aplicada) as total_a_pagar
from entregas e
join repartidores r on r.id = e.repartidor_id
where e.resultado = 'entregado' and e.tipo = 'domicilio'
group by e.repartidor_id, r.nombre, 3;

-- ------------------------------------------------------------
-- 6. PERMISOS (RLS) Y ALMACENAMIENTO PRIVADO DE FOTOS
-- ------------------------------------------------------------
-- Con RLS activado y sin política, NADIE (ni con la clave "anon") puede leer.
-- Solo el servidor de la app (con la clave service_role) se salta estas reglas.

alter table zonas enable row level security;
alter table sectores enable row level security;
alter table franjas enable row level security;
alter table repartidores enable row level security;
alter table repartidor_sectores enable row level security;
alter table usuarios enable row level security;
alter table destinatarios enable row level security;
alter table paquetes enable row level security;
alter table entregas enable row level security;
alter table mensajes_whatsapp enable row level security;
alter table parametros_bono enable row level security;
alter table indice_mensual enable row level security;

-- Catálogos: los ve cualquier usuario con sesión; los edita el dueño
create policy zonas_ver on zonas for select to authenticated using (rol_actual() is not null);
create policy zonas_editar on zonas for all to authenticated using (rol_actual() = 'dueno') with check (rol_actual() = 'dueno');
create policy sectores_ver on sectores for select to authenticated using (rol_actual() is not null);
create policy sectores_editar on sectores for all to authenticated using (rol_actual() = 'dueno') with check (rol_actual() = 'dueno');
create policy franjas_ver on franjas for select to authenticated using (rol_actual() is not null);
create policy franjas_editar on franjas for all to authenticated using (rol_actual() = 'dueno') with check (rol_actual() = 'dueno');
create policy parametros_ver on parametros_bono for select to authenticated using (rol_actual() is not null);
create policy parametros_editar on parametros_bono for all to authenticated using (rol_actual() = 'dueno') with check (rol_actual() = 'dueno');

-- Repartidores y sus rutas
create policy repartidores_ver on repartidores for select to authenticated
  using (rol_actual() in ('dueno','organizador') or id = repartidor_actual());
create policy repartidores_editar on repartidores for all to authenticated
  using (rol_actual() in ('dueno','organizador')) with check (rol_actual() in ('dueno','organizador'));
create policy rutas_ver on repartidor_sectores for select to authenticated using (rol_actual() is not null);
create policy rutas_editar on repartidor_sectores for all to authenticated
  using (rol_actual() in ('dueno','organizador')) with check (rol_actual() in ('dueno','organizador'));

-- Usuarios: cada quien ve el suyo; el dueño ve y edita todos
create policy usuarios_ver on usuarios for select to authenticated
  using (id = auth.uid() or rol_actual() in ('dueno','organizador'));
create policy usuarios_editar on usuarios for all to authenticated
  using (rol_actual() = 'dueno') with check (rol_actual() = 'dueno');

-- Destinatarios y paquetes: oficina ve todo; el repartidor solo lo que tiene asignado
create policy destinatarios_oficina on destinatarios for all to authenticated
  using (rol_actual() in ('dueno','organizador')) with check (rol_actual() in ('dueno','organizador'));
create policy destinatarios_repartidor on destinatarios for select to authenticated
  using (exists (select 1 from paquetes p
                 where p.destinatario_id = destinatarios.id
                   and p.repartidor_asignado_id = repartidor_actual()));

create policy paquetes_oficina on paquetes for all to authenticated
  using (rol_actual() in ('dueno','organizador')) with check (rol_actual() in ('dueno','organizador'));
create policy paquetes_repartidor on paquetes for select to authenticated
  using (repartidor_asignado_id = repartidor_actual());

-- Entregas: el repartidor registra las suyas (sin poder autorizar excepciones de cédula)
create policy entregas_oficina on entregas for all to authenticated
  using (rol_actual() in ('dueno','organizador')) with check (rol_actual() in ('dueno','organizador'));
create policy entregas_repartidor_ver on entregas for select to authenticated
  using (repartidor_id = repartidor_actual());
create policy entregas_repartidor_crear on entregas for insert to authenticated
  with check (
    repartidor_id = repartidor_actual()
    and tipo = 'domicilio'
    and excepcion_autorizada_por is null
    and exists (select 1 from paquetes p
                where p.id = entregas.paquete_id
                  and p.repartidor_asignado_id = repartidor_actual())
  );

create policy mensajes_oficina on mensajes_whatsapp for all to authenticated
  using (rol_actual() in ('dueno','organizador')) with check (rol_actual() in ('dueno','organizador'));

create policy indice_oficina on indice_mensual for select to authenticated
  using (rol_actual() in ('dueno','organizador'));
create policy indice_propio on indice_mensual for select to authenticated
  using (repartidor_id = repartidor_actual());

-- Fotos (cédulas y paquetes): bucket PRIVADO. Ruta: <repartidor_id>/<paquete_id>/<archivo>
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

create policy evidencias_oficina on storage.objects for all to authenticated
  using (bucket_id = 'evidencias' and rol_actual() in ('dueno','organizador'))
  with check (bucket_id = 'evidencias' and rol_actual() in ('dueno','organizador'));
create policy evidencias_repartidor_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias'
              and (storage.foldername(name))[1] = repartidor_actual()::text);
create policy evidencias_repartidor_ver on storage.objects for select to authenticated
  using (bucket_id = 'evidencias'
         and (storage.foldername(name))[1] = repartidor_actual()::text);

-- ------------------------------------------------------------
-- 7. DATOS INICIALES
-- ------------------------------------------------------------

insert into zonas (nombre, tarifa_pago) values
  ('San Pedro', 40.00),
  ('Municipios', 55.00);

insert into sectores (nombre, zona_id, factor_dificultad)
select s.nombre, z.id, s.factor
from (values
  ('SPM central',   'San Pedro',  1.00),
  ('Consuelo',      'Municipios', 1.20),
  ('Quisqueya',     'Municipios', 1.20),
  ('Guayacanes',    'Municipios', 1.20),
  ('Juan Dolio',    'Municipios', 1.20),
  ('Los Conucos',   'Municipios', 1.20),
  ('Los Llanos',    'Municipios', 1.40),
  ('Ramón Santana', 'Municipios', 1.40)
) as s(nombre, zona_nombre, factor)
join zonas z on z.nombre = s.zona_nombre;

-- Franjas confirmadas: los repartidores entregan después de las 4 pm si hace falta
insert into franjas (codigo, nombre, hora_inicio, hora_fin) values
  ('AM',  'Mañana (9:00 - 12:00)',  '09:00', '12:00'),
  ('MID', 'Mediodía (12:00 - 3:00)', '12:00', '15:00'),
  ('PM',  'Tarde (3:00 - 6:00)',    '15:00', '18:00');

-- Nombres de ejemplo: se reemplazan por los reales cuando el cliente los mande
insert into repartidores (nombre, rol, vehiculo) values
  ('Repartidor Costa (Guayacanes / Juan Dolio / Los Conucos)', 'repartidor', 'moto'),
  ('Repartidor Interior (Los Llanos / Quisqueya)', 'repartidor', 'moto'),
  ('Administrador (minivan, paquetes voluminosos)', 'administrador', 'minivan');

insert into repartidor_sectores (repartidor_id, sector_id)
select r.id, s.id
from repartidores r, sectores s
where r.nombre like 'Repartidor Costa%' and s.nombre in ('Guayacanes', 'Juan Dolio', 'Los Conucos');

insert into repartidor_sectores (repartidor_id, sector_id)
select r.id, s.id
from repartidores r, sectores s
where r.nombre like 'Repartidor Interior%' and s.nombre in ('Los Llanos', 'Quisqueya');

-- Fila única de bonos (los valores por defecto son los SUPUESTOS de arriba)
insert into parametros_bono default values;
