-- 008: varias cuentas de WhatsApp a la vez (OpenWA, hasta 5 sesiones)
-- Solo AGREGA columnas; no cambia ni borra nada.

-- Qué cuenta (sesión de OpenWA) mandó cada mensaje: sirve para contar el tope del día y los fallos por cuenta.
alter table mensajes_whatsapp add column if not exists sesion text;
create index if not exists idx_mensajes_sesion on mensajes_whatsapp(sesion, creado_en);

-- Qué cuenta le escribió por última vez a cada teléfono: la persona sigue hablando con la misma cuenta.
alter table menus_whatsapp add column if not exists sesion text;
