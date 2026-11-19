-- Productos que se venden por peso: cada renglón de pedido guarda en qué
-- unidad está su cantidad ('kg' = kilos, 0.3 es 300 g). Los renglones comunes
-- no la usan (queda en null = unidades).
-- Ejecutar una sola vez en el SQL Editor de Supabase, ANTES de subir el código.

alter table detalle_pedidos
  add column if not exists unidad text;
