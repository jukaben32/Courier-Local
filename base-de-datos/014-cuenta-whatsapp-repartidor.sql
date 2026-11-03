-- Cuenta de WhatsApp propia de cada repartidor.
-- Si un repartidor tiene su teléfono vinculado en OpenWA, los avisos de su ruta salen de SU número.
-- Guarda el id de la sesión de OpenWA. Vacío = sus avisos salen por la cuenta de la oficina.

alter table repartidores add column if not exists sesion_openwa text;

-- Una sesión no puede pertenecer a dos repartidores
create unique index if not exists repartidores_sesion_openwa_unica
  on repartidores (sesion_openwa)
  where sesion_openwa is not null;
