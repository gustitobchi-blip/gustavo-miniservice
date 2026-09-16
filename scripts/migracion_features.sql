-- ============================================================
-- Carrito guardado, búsquedas, tolerancia a tipeos y código de barras
-- Ejecutar en Supabase → SQL Editor → New query
-- Es idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CÓDIGO DE BARRAS
-- La tabla productos no tenía esta columna (el import desde el
-- miniservice nunca la trajo). El escáner del panel busca acá primero
-- y, cuando no encuentra, deja guardar el código escaneado sobre el
-- producto: así el mapeo se arma solo con el uso.
-- ------------------------------------------------------------
alter table public.productos
  add column if not exists cod_barra text;

create index if not exists productos_cod_barra_idx
  on public.productos (cod_barra)
  where cod_barra is not null;


-- ------------------------------------------------------------
-- 2. BÚSQUEDA TOLERANTE A ERRORES DE TIPEO
-- pg_trgm compara por trigramas, así que "cocacola" o "coka"
-- encuentran "COCA COLA". El índice GIN es lo que hace que no
-- tarde una eternidad sobre 2300 filas.
-- ------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists productos_descripcion_trgm_idx
  on public.productos using gin (descripcion gin_trgm_ops);

-- Se usa sólo como plan B, cuando la búsqueda exacta no devolvió nada.
-- Sin security definer: respeta las mismas policies que el resto.
create or replace function public.buscar_productos_similares(
  termino text,
  limite  int default 8
)
returns setof public.productos
language sql
stable
as $$
  select *
  from public.productos
  where publicado = true
    and precio > 0
    and descripcion % termino
  order by similarity(descripcion, termino) desc, descripcion
  limit least(greatest(limite, 1), 24);
$$;


-- ------------------------------------------------------------
-- 3. BÚSQUEDAS DE LOS CLIENTES
-- No guarda quién buscó, sólo qué se buscó y cuántos resultados
-- hubo. Las que dan 0 resultados son la lista de "lo que me piden
-- y no tengo".
-- ------------------------------------------------------------
create table if not exists public.busquedas (
  id         bigserial primary key,
  termino    text        not null,
  resultados int         not null default 0,
  creado_en  timestamptz not null default now()
);

create index if not exists busquedas_creado_en_idx
  on public.busquedas (creado_en desc);

alter table public.busquedas enable row level security;

drop policy if exists "registrar busqueda" on public.busquedas;
create policy "registrar busqueda" on public.busquedas
  for insert with check (true);

drop policy if exists "admin lee busquedas" on public.busquedas;
create policy "admin lee busquedas" on public.busquedas
  for select using (
    exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin')
  );

-- Los chips de "lo más buscado" los ve cualquier visitante, pero sólo
-- el agregado: por eso security definer acá y no en la tabla.
create or replace function public.busquedas_populares(limite int default 8)
returns table (termino text, veces bigint)
language sql
stable
security definer
set search_path = public
as $$
  select lower(b.termino) as termino, count(*) as veces
  from public.busquedas b
  where b.creado_en > now() - interval '30 days'
    and b.resultados > 0
    and length(b.termino) >= 3
  group by lower(b.termino)
  order by veces desc, termino
  limit least(greatest(limite, 1), 20);
$$;


-- ------------------------------------------------------------
-- 4. CARRITO GUARDADO (carrito abandonado)
-- El carrito vivía sólo en memoria: un refresh y se perdía todo.
-- Ahora se guarda por cliente y se recupera al volver, incluso
-- desde otro dispositivo.
-- ------------------------------------------------------------
create table if not exists public.carritos (
  cliente_id     uuid primary key references auth.users(id) on delete cascade,
  items          jsonb       not null default '[]'::jsonb,
  actualizado_en timestamptz not null default now()
);

alter table public.carritos enable row level security;

drop policy if exists "carrito propio" on public.carritos;
create policy "carrito propio" on public.carritos
  for all
  using (auth.uid() = cliente_id)
  with check (auth.uid() = cliente_id);

-- Para poder ver desde el panel qué carritos quedaron sin comprar.
drop policy if exists "admin ve carritos" on public.carritos;
create policy "admin ve carritos" on public.carritos
  for select using (
    exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin')
  );

create index if not exists carritos_actualizado_idx
  on public.carritos (actualizado_en desc);
