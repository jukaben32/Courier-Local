-- ============================================================
-- Courier Local — Cambios para WhatsApp con YCloud
-- ============================================================
-- Se ejecuta UNA vez, después de courier-local.sql.

-- 1. Ubicación donde el cliente quiere recibir ESTE paquete.
-- Es por paquete (no por persona) porque a veces quien recibe está en otro lugar ese día.
alter table paquetes
  add column ubicacion_entrega_lat double precision,
  add column ubicacion_entrega_lng double precision,
  add column ubicacion_entrega_en timestamptz;

comment on column paquetes.ubicacion_entrega_lat is 'Pin que el cliente comparte por WhatsApp. Manda sobre la dirección escrita de la etiqueta.';

-- 2. Historial de mensajes: ahora guarda también lo que escribe el cliente y el id de YCloud.
alter table mensajes_whatsapp
  alter column paquete_id drop not null,
  add column telefono text,
  add column direccion text not null default 'saliente' check (direccion in ('saliente', 'entrante')),
  add column proveedor_id text,
  add column plantilla text,
  add column error text;

alter table mensajes_whatsapp drop constraint mensajes_whatsapp_tipo_check;
alter table mensajes_whatsapp add constraint mensajes_whatsapp_tipo_check check (
  tipo in ('aviso', 'recordatorio', 'confirmacion', 'entregado', 'franjas', 'ubicacion', 'respuesta', 'otro')
);

-- Para cruzar los avisos de "entregado / leído / falló" que manda YCloud
create index idx_mensajes_proveedor on mensajes_whatsapp(proveedor_id);
create index idx_mensajes_telefono on mensajes_whatsapp(telefono);

-- 3. Eventos de YCloud ya procesados. YCloud reintenta hasta 7 veces si no recibe un 200 a tiempo,
-- así que sin esto un mismo clic del cliente podría aplicarse dos veces.
create table eventos_whatsapp (
  id text primary key,
  recibido_en timestamptz not null default now()
);

-- Solo el servidor (clave service_role) puede tocarla: RLS activado y sin políticas.
alter table eventos_whatsapp enable row level security;
