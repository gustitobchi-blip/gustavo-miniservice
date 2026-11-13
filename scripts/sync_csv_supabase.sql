-- Sincronización de precio y stock desde el CSV del súper (PRODUCTO.csv).
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- La PC del súper NO usa la clave maestra: llama a la función sync_precios_stock
-- con un token propio (guardado en sync_config) que solo sirve para esto.

create table if not exists sync_config (
  clave text primary key,
  valor text not null
);

create table if not exists sync_log (
  id              bigserial primary key,
  fecha           timestamptz not null default now(),
  ok              boolean not null,
  simulacion      boolean not null default false,
  mensaje         text,
  filas_recibidas int,
  actualizados    int,
  sin_cambios     int,
  no_publicados   int
);

-- Sin policies: con la clave pública nadie puede leer ni escribir estas tablas.
alter table sync_config enable row level security;
alter table sync_log    enable row level security;

-- Token aleatorio de 64 caracteres (se genera una sola vez).
insert into sync_config (clave, valor)
values ('token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;

create or replace function sync_precios_stock(
  p_token    text,
  p_datos    jsonb,            -- [{"codigo":"154","precio":1000,"stock":-3}, ...]
  p_simular  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token        text;
  v_recibidas    int;
  v_publicados   int;
  v_coinciden    int;
  v_a_cambiar    int;
  v_actualizados int := 0;
  v_sin_cambios  int;
  v_faltantes    int;
  v_msg          text;
begin
  select valor into v_token from sync_config where clave = 'token';
  if v_token is null or p_token is distinct from v_token then
    raise exception 'token invalido';
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'array' then
    raise exception 'datos invalidos';
  end if;
  v_recibidas := jsonb_array_length(p_datos);

  -- Freno 1: un archivo cortado o vacío no debe tocar nada.
  if v_recibidas < 5000 then
    v_msg := 'Archivo con pocas filas (' || v_recibidas || '). No se actualizó nada.';
    insert into sync_log (ok, simulacion, mensaje, filas_recibidas) values (false, p_simular, v_msg, v_recibidas);
    return jsonb_build_object('ok', false, 'mensaje', v_msg);
  end if;

  create temp table _sync_datos on commit drop as
    select distinct on (codigo) codigo, precio, greatest(stock, 0) as stock
    from (
      select trim(x->>'codigo')     as codigo,
             (x->>'precio')::numeric as precio,
             (x->>'stock')::numeric  as stock
      from jsonb_array_elements(p_datos) x
    ) t
    where codigo is not null and codigo <> '' and precio is not null and stock is not null;

  select count(*) into v_publicados from productos where publicado;
  select count(*) into v_coinciden
    from productos p join _sync_datos d on d.codigo = p.codigo
    where p.publicado;

  -- Freno 2: si casi no coinciden los códigos, es otro archivo (o de otro negocio).
  if v_publicados > 0 and v_coinciden < v_publicados * 0.8 then
    v_msg := 'Solo coinciden ' || v_coinciden || ' de ' || v_publicados
             || ' productos publicados. No se actualizó nada.';
    insert into sync_log (ok, simulacion, mensaje, filas_recibidas, no_publicados)
      values (false, p_simular, v_msg, v_recibidas, v_publicados - v_coinciden);
    return jsonb_build_object('ok', false, 'mensaje', v_msg);
  end if;

  select count(*) into v_a_cambiar
    from productos p join _sync_datos d on d.codigo = p.codigo
    where p.precio is distinct from d.precio
       or p.stock  is distinct from d.stock
       or p.activo is distinct from (d.precio > 0);

  select count(*) into v_sin_cambios
    from productos p join _sync_datos d on d.codigo = p.codigo;
  v_sin_cambios := v_sin_cambios - v_a_cambiar;

  v_faltantes := v_publicados - v_coinciden;

  if not p_simular then
    update productos p
       set precio = d.precio,
           stock  = d.stock,
           activo = d.precio > 0
      from _sync_datos d
     where p.codigo = d.codigo
       and (p.precio is distinct from d.precio
         or p.stock  is distinct from d.stock
         or p.activo is distinct from (d.precio > 0));
    get diagnostics v_actualizados = row_count;
  end if;

  v_msg := case when p_simular
                then 'Simulación: se actualizarían ' || v_a_cambiar || ' productos.'
                else 'Actualizados ' || v_actualizados || ' productos.' end;
  if v_faltantes > 0 then
    v_msg := v_msg || ' Publicados que no vinieron en el archivo: ' || v_faltantes || '.';
  end if;

  insert into sync_log (ok, simulacion, mensaje, filas_recibidas, actualizados, sin_cambios, no_publicados)
    values (true, p_simular, v_msg, v_recibidas, case when p_simular then v_a_cambiar else v_actualizados end,
            v_sin_cambios, v_faltantes);

  return jsonb_build_object(
    'ok', true, 'simulacion', p_simular, 'mensaje', v_msg,
    'filas_recibidas', v_recibidas, 'actualizados', case when p_simular then v_a_cambiar else v_actualizados end,
    'sin_cambios', v_sin_cambios, 'publicados_faltantes', v_faltantes
  );
end;
$$;

grant execute on function sync_precios_stock(text, jsonb, boolean) to anon, authenticated;
