-- 007: versión de prueba con OpenWA (hora exacta de entrega y menú de respuestas por texto)
-- Solo AGREGA cosas; no cambia ni borra nada, así que el programa original no se afecta.

-- 1. Hora exacta que eligió el cliente (inicio del bloque de una hora). Puede quedar vacía.
alter table paquetes add column if not exists hora_preferida time;
comment on column paquetes.hora_preferida is 'Hora de inicio del bloque de entrega que eligió el cliente por WhatsApp (OpenWA). ventana_horaria guarda la franja que la contiene.';

-- 2. Menú de opciones del último mensaje enviado a cada teléfono, para entender qué significa
--    la respuesta "3" de un cliente. Solo lo usa el servidor (clave de servicio).
create table if not exists menus_whatsapp (
  telefono text primary key,
  opciones jsonb not null,
  creado_en timestamptz not null default now()
);
alter table menus_whatsapp enable row level security;
