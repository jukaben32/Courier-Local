-- ============================================================
-- Courier Local — Seguimiento de la subida de pruebas al courier
-- ============================================================
-- Se ejecuta UNA vez, después de 002-whatsapp.sql.
-- Guarda CUÁNDO se subió la prueba al programa del courier, para medir la demora entre
-- entregar y subir (algunos repartidores suben todo al llegar a casa) y poder avisar.

alter table entregas add column cargado_en_courier_en timestamptz;

-- Acelera la lista de "pruebas sin subir" del panel
create index idx_entregas_sin_subir on entregas (creado_en)
  where resultado = 'entregado' and not cargado_en_courier;
