-- ============================================================
-- ESTADO "LISTO PARA RETIRAR" — pedidos con retiro en el local
-- Ejecutar en Supabase → SQL Editor → New query → Run (se puede correr más de una vez)
-- ============================================================
-- Un pedido para retirar pasa por: pendiente → confirmado → listo_retiro → entregado
-- (no existe "en camino" porque no hay envío). Para eso la base tiene que aceptar
-- el estado nuevo: se reemplaza la restricción que limita los valores de `estado`.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.pedidos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table public.pedidos drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.pedidos
  add constraint pedidos_estado_check
  check (estado in ('pendiente_mp', 'pendiente', 'confirmado', 'en_camino', 'listo_retiro', 'entregado', 'cancelado'));
