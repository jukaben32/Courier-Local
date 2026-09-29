-- ============================================================
-- Courier Local — Datos iniciales
-- ============================================================
-- Esto se ejecuta UNA VEZ, justo después de schema.sql.
-- Llena las zonas de reparto para que ya se puedan usar en el sistema.
-- Los factores de dificultad son un punto de partida (ver anteproyecto pág. 6);
-- se ajustan más adelante con los tiempos reales de entrega.
-- ============================================================

insert into zonas (nombre, factor_dificultad) values
  ('SPM central', 1.00),
  ('Consuelo y Quisqueya', 1.20),
  ('Guayacanes / Juan Dolio', 1.20),
  ('Rural / aislado', 1.40);

-- Ejemplo de cómo registrar al repartidor fijo de la costa
-- (descomenta y ajusta el nombre real cuando lo tengas):
--
-- insert into repartidores (nombre, telefono, zona_fija_id, vehiculo)
-- select 'Nombre del repartidor', '8095551234', id, 'moto'
-- from zonas where nombre = 'Guayacanes / Juan Dolio';
