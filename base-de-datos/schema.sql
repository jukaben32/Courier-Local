-- ============================================================
-- Courier Local — Esquema de base de datos (Supabase / Postgres)
-- ============================================================
-- Este archivo crea todas las tablas del sistema. Se ejecuta una
-- sola vez en Supabase (pestaña "SQL Editor" > pegar todo > Run).
--
-- Orden de lectura sugerido:
--   1. zonas          -> las áreas de reparto (SPM, Consuelo, etc.)
--   2. repartidores   -> el personal que entrega
--   3. destinatarios  -> las personas que reciben paquetes
--   4. paquetes       -> cada envío de Temu
--   5. entregas       -> la prueba de entrega (foto cédula, GPS, hora)
--   6. mensajes_whatsapp -> historial de avisos enviados
--   7. indice_mensual -> el puntaje para los bonos
-- ============================================================

-- Necesario para generar IDs únicos automáticamente
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. ZONAS: las áreas de reparto en la provincia de San Pedro
-- ------------------------------------------------------------
create table zonas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- factor_dificultad se usa en el índice de efectividad:
  -- una entrega en zona rural vale un poco más que una en la ciudad
  factor_dificultad numeric(3,2) not null default 1.00,
  created_at timestamptz not null default now()
);

comment on table zonas is 'Áreas de reparto: SPM central, Consuelo y Quisqueya, Guayacanes/Juan Dolio, Rural/aislado, etc.';

-- ------------------------------------------------------------
-- 2. REPARTIDORES
-- ------------------------------------------------------------
create table repartidores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  -- si tiene zona fija (como el de Guayacanes/Juan Dolio), se guarda aquí.
  -- si es null, el repartidor trabaja en el "pool" flexible.
  zona_fija_id uuid references zonas(id),
  vehiculo text not null default 'moto',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. DESTINATARIOS: las personas que reciben paquetes
-- ------------------------------------------------------------
create table destinatarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- el teléfono es único: si la misma persona recibe varios paquetes,
  -- todos quedan agrupados bajo un solo destinatario (un solo aviso, una sola parada)
  telefono text not null unique,
  -- la cédula normalmente se conoce al momento de la ENTREGA (foto de la cédula),
  -- no cuando llega el paquete. Por eso puede quedar vacía al principio.
  cedula text,
  direccion_texto text,
  -- ubicación exacta que la persona comparte por WhatsApp (más confiable que la dirección escrita)
  ubicacion_lat double precision,
  ubicacion_lng double precision,
  -- para zonas rurales: "en el colmado de la esquina", "cruce de la 27", etc.
  punto_encuentro text,
  zona_id uuid references zonas(id),
  -- Foto de la cédula que el destinatario mandó por WhatsApp para autorizar a un tercero
  -- a recibir en su nombre (opción "o una captura de esta"). Sirve de respaldo si el día
  -- de la entrega el tercero no tiene el documento físico a mano.
  foto_cedula_referencia_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_destinatarios_telefono on destinatarios(telefono);

comment on column destinatarios.cedula is 'Dato sensible (Ley 172-13). Ver notas de privacidad al final del archivo.';

-- ------------------------------------------------------------
-- 4. PAQUETES: cada envío de Temu que llega a la oficina
-- ------------------------------------------------------------
create type estado_paquete as enum (
  'recibido',           -- se acaba de escanear
  'notificado',         -- se envió el WhatsApp
  'confirmado',         -- el destinatario eligió horario
  'en_ruta',            -- va con el repartidor
  'entregado',
  'intento_fallido',    -- no había nadie / no se pudo entregar
  'retiro_oficina',     -- el destinatario prefiere buscarlo
  'devuelto',           -- se venció el plazo de 3 días, se regresa al courier
  'rechazado'           -- el destinatario no lo quiere (dañado, etc.)
);

create table paquetes (
  id uuid primary key default gen_random_uuid(),
  -- número de guía que trae la etiqueta del courier; no se puede repetir
  numero_guia text not null unique,
  destinatario_id uuid not null references destinatarios(id),
  -- lo que dice la etiqueta (ej. "Paquete Temu - ropa"), cuando el escaneo lo captura
  contenido text,
  voluminoso boolean not null default false,
  estado estado_paquete not null default 'recibido',
  zona_id uuid references zonas(id),
  repartidor_asignado_id uuid references repartidores(id),
  -- franja horaria que el destinatario eligió por WhatsApp: 'AM' (9-12), 'MID' (12-3), 'PM' (3-6)
  ventana_horaria text check (ventana_horaria in ('AM','MID','PM')),
  fecha_recibido timestamptz not null default now(),
  -- el plazo del courier es de 3 días; se calcula solo
  fecha_limite timestamptz generated always as (fecha_recibido + interval '3 days') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_paquetes_destinatario on paquetes(destinatario_id);
create index idx_paquetes_estado on paquetes(estado);
create index idx_paquetes_fecha_limite on paquetes(fecha_limite);

comment on column paquetes.fecha_limite is 'Se calcula sola: fecha_recibido + 3 días. Es la base del semáforo verde/amarillo/rojo del panel.';

-- ------------------------------------------------------------
-- 5. ENTREGAS: la prueba de que el paquete se entregó (o no)
-- ------------------------------------------------------------
-- Un paquete puede tener más de un intento (ej. día 2 falló, día 3 se entregó),
-- por eso esto es una tabla aparte y no columnas dentro de "paquetes".
create table entregas (
  id uuid primary key default gen_random_uuid(),
  paquete_id uuid not null references paquetes(id),
  repartidor_id uuid not null references repartidores(id),
  resultado text not null check (resultado in ('entregado','intento_fallido','rechazado')),

  -- REGLA DE NEGOCIO: toda entrega exitosa necesita la cédula del DESTINATARIO
  -- ORIGINAL, aunque no sea él quien reciba el paquete. Si un tercero recibe,
  -- el destinatario debe haberle dejado su cédula física para que la foto se tome
  -- en la puerta, o haber mandado antes una captura de ella por WhatsApp
  -- (queda guardada como respaldo en destinatarios.foto_cedula_referencia_url).
  foto_cedula_destinatario_url text,
  cedula_origen text check (cedula_origen in ('fisica_en_entrega','captura_whatsapp')),

  -- Quién recibió el paquete en la puerta (puede ser el propio destinatario u otra persona)
  receptor_es_destinatario boolean not null default true,
  receptor_nombre text,
  receptor_cedula text,

  foto_paquete_url text,
  ubicacion_lat double precision,
  ubicacion_lng double precision,
  motivo_fallo text,
  -- se marca cuando la misma foto ya se subió también en la app del courier
  cargado_en_courier boolean not null default false,
  creado_en timestamptz not null default now(),

  -- El sistema no deja marcar "entregado" a un tercero sin la cédula del destinatario
  constraint evidencia_tercero_requiere_cedula check (
    resultado <> 'entregado'
    or receptor_es_destinatario
    or foto_cedula_destinatario_url is not null
  )
);

create index idx_entregas_paquete on entregas(paquete_id);
create index idx_entregas_repartidor on entregas(repartidor_id);

-- ------------------------------------------------------------
-- 6. MENSAJES_WHATSAPP: historial de avisos (para no perder el rastro)
-- ------------------------------------------------------------
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
-- 7. INDICE_MENSUAL: puntaje para los bonos de cada repartidor
-- ------------------------------------------------------------
create table indice_mensual (
  id uuid primary key default gen_random_uuid(),
  repartidor_id uuid not null references repartidores(id),
  mes date not null, -- primer día del mes, ej. 2026-09-01
  entregas_totales int not null default 0,
  entregas_en_ventana int not null default 0,
  entregas_primer_intento int not null default 0,
  tiempo_promedio_minutos numeric,
  evidencia_completa_pct numeric,
  penalizaciones int not null default 0,
  puntaje numeric, -- resultado final 0-100
  unique (repartidor_id, mes)
);

-- ============================================================
-- NOTAS DE PRIVACIDAD (Ley 172-13 de protección de datos, RD)
-- ============================================================
-- La cédula y su foto son datos sensibles. Recomendado:
--  1. Activar Row Level Security (RLS) en Supabase para estas tablas,
--     así solo el dueño y los organizadores pueden leerlas (no cualquiera
--     con la URL del proyecto).
--  2. Guardar las fotos en un bucket PRIVADO de Supabase Storage
--     (no público), con URLs firmadas y de corta duración.
--  3. Borrar las fotos automáticamente después de 30-90 días
--     (según lo que el cliente decida, ver anteproyecto pág. 9).
-- Esto se configura en un paso aparte, cuando conectemos el proyecto
-- real de Supabase.
