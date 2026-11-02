-- 010: el cliente escribe entre qué hora y qué hora quiere recibir su paquete (y puede pedir "mañana").
-- Solo AGREGA dos columnas; no cambia ni borra nada.

-- Fin del rango de entrega. hora_preferida (que ya existe) es el inicio.
alter table paquetes add column if not exists hora_hasta time;

-- Día de entrega pedido por el cliente. null = hoy.
alter table paquetes add column if not exists dia_entrega date;
