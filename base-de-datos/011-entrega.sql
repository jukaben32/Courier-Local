-- 011: entrega — verificación diferida de la cédula, foto del intento fallido, motivo de "no pude subirla"
-- y borrado de las fotos de cédula a los 90 días (Ley 172-13).
-- Solo AGREGA columnas e índices y relaja UNA regla para permitir la verificación diferida.

-- Si la IA falla al entregar, la entrega se guarda como 'pendiente' y la oficina la verifica después.
alter table entregas add column if not exists verificacion text not null default 'verificada'
  check (verificacion in ('verificada', 'pendiente'));

-- Foto opcional de evidencia en un intento fallido o un paquete rechazado.
alter table entregas add column if not exists foto_evidencia_url text;

-- Si el repartidor no pudo subir la prueba al courier en el momento, aquí queda por qué.
alter table entregas add column if not exists motivo_sin_subir text;

-- Cuándo se borró la foto de la cédula (a los 90 días). La fila se conserva, la foto no.
alter table entregas add column if not exists foto_borrada_en timestamptz;
alter table solicitudes_excepcion add column if not exists foto_borrada_en timestamptz;

-- Una entrega 'pendiente' de verificar no tiene todavía la cédula comprobada.
alter table entregas drop constraint if exists entrega_requiere_cedula_coincidente;
alter table entregas add constraint entrega_requiere_cedula_coincidente check (
  resultado <> 'entregado'
  or cedula_coincide is true
  or verificacion = 'pendiente'
  or (excepcion_motivo is not null and excepcion_autorizada_por is not null)
);

-- Aceleran la pantalla "Entrega" y el borrado programado.
create index if not exists idx_entregas_verificacion_pendiente on entregas (creado_en) where verificacion = 'pendiente';
create index if not exists idx_entregas_foto_vigente on entregas (creado_en)
  where foto_cedula_destinatario_url is not null and foto_borrada_en is null;
create index if not exists idx_excepciones_foto_vigente on solicitudes_excepcion (creada_en)
  where foto_borrada_en is null;
