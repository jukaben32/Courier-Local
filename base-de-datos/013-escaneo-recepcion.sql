-- Recepción por escáner: cada paquete que llega a la oficina se escanea y queda marcado.
alter table paquetes
  add column if not exists escaneado_en timestamptz,
  add column if not exists escaneado_por uuid references auth.users(id);

create index if not exists paquetes_escaneado_en_idx on paquetes (escaneado_en);
