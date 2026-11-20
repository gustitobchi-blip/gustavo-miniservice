-- ============================================================
-- DIRECCIÓN DEL CLIENTE — registro, Mi cuenta y checkout comparten la misma
-- Ejecutar en Supabase → SQL Editor → New query → Run (se puede correr más de una vez)
-- ============================================================

-- 1. Piso/depto y ubicación exacta (la del pin en el mapa)
alter table public.clientes
  add column if not exists depto         text,
  add column if not exists direccion_lat double precision,
  add column if not exists direccion_lng double precision;

-- 2. Al crearse la cuenta, copiar TODOS los datos del registro a `clientes`.
--    (Antes sólo se copiaba nombre y apellido: el teléfono y la dirección se
--    perdían porque, con la confirmación por email, el registro todavía no tiene
--    sesión y la base no deja escribir desde el navegador.)
create or replace function public.handle_new_user()
returns trigger as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  begin
    insert into public.clientes
      (id, email, nombre, apellido, telefono, direccion, depto, barrio, ciudad, direccion_lat, direccion_lng)
    values (
      new.id,
      new.email,
      coalesce(nullif(m->>'nombre', ''), split_part(new.email, '@', 1)),
      coalesce(m->>'apellido', ''),
      nullif(m->>'telefono', ''),
      nullif(m->>'direccion', ''),
      nullif(m->>'depto', ''),
      nullif(m->>'barrio', ''),
      coalesce(nullif(m->>'ciudad', ''), 'Tucumán'),
      nullif(m->>'direccion_lat', '')::double precision,
      nullif(m->>'direccion_lng', '')::double precision
    )
    on conflict (id) do nothing;
  exception when others then
    null;  -- nunca bloquear el alta de la cuenta por un dato mal formado
  end;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
