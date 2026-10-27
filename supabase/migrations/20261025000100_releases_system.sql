-- ============================================================================
-- DylanOS — Sistema de versiones (Crimson)
-- 001: modelo de datos, RLS y RPC de publicación.
--
-- TODO el modelo vive en el esquema `public`, el único que Supabase expone
-- por PostgREST sin cambiar la configuración del proyecto. Los nombres de
-- tablas y funciones llevan prefijo `release_` para evitar colisiones.
--
-- Aplicar con: npx supabase db push  (o el editor SQL del proyecto Supabase)
-- ============================================================================

-- --------------------------------------------------------------------------
-- NOTA DE ORDEN: las tablas se crean ANTES que las funciones. PostgreSQL
-- valida el cuerpo de las funciones SQL al crearlas (check_function_bodies),
-- así que una función que referencia una tabla aún inexistente rompería la
-- migración completa.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Lista de administradores autorizados.
--  * user_id → usuario real de Supabase Auth (no se admite cualquier cuenta).
--  * Sin policies de escritura: SOLO service_role puede añadir/quitar admins
--    (CLI: npm run releases:admin:add). Cada admin puede leer su propia fila
--    para que el panel confirme su estado.
-- ---------------------------------------------------------------------------
create table if not exists public.release_admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  email    text not null unique,
  added_at timestamptz not null default now(),
  added_by uuid
);

alter table public.release_admins enable row level security;

drop policy if exists release_admins_read_self on public.release_admins;
create policy release_admins_read_self
  on public.release_admins
  for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ¿Es administrador el usuario actual? SECURITY DEFINER para evaluar las
-- políticas de RLS sin recursión. (Definida después de crear release_admins;
-- la usan todas las políticas y RPC de releases.)
-- ---------------------------------------------------------------------------
create or replace function public.is_release_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.role() = 'service_role' or exists (
    select 1
    from public.release_admins a
    where a.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Publicaciones (ISO) por canal.
-- ---------------------------------------------------------------------------
create table if not exists public.releases (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null
                     check (channel in ('pre-beta','beta','stable')),
  version          text not null
                     check (version ~ '^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$'),
  name             text not null check (char_length(name) between 1 and 120),
  description      text check (description is null or char_length(description) <= 300),
  changelog        text check (changelog is null or char_length(changelog) <= 8000),
  arch             text not null default 'x86_64'
                     check (arch ~ '^[a-z0-9][a-z0-9_-]{0,31}[a-z0-9_]$'),
  status           text not null default 'draft'
                     check (status in ('draft','published','retired')),
  storage_provider text not null default 'supabase'
                     check (storage_provider in ('supabase','r2')),
  file_path        text not null check (char_length(file_path) between 1 and 300),
  file_size        numeric(20,0) check (file_size is null or file_size >= 0),
  sha256           text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  published_at     timestamptz,
  retired_at       timestamptz,
  retire_reason    text check (retire_reason in ('reemplazada','retirada')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint releases_published_integrity_check
    check (status <> 'published' or (file_size > 0 and sha256 is not null)),

  -- Un archivo físico respalda exactamente una publicación.
  constraint releases_file_path_key
    unique (storage_provider, file_path)
);

-- La pareja (canal, versión) nunca se repite (insensible a mayúsculas).
create unique index if not exists releases_channel_version_key
  on public.releases (channel, lower(version));

create index if not exists releases_channel_status_idx
  on public.releases (channel, status, published_at desc);

create index if not exists releases_status_created_idx
  on public.releases (status, created_at desc);

create index if not exists releases_published_at_idx
  on public.releases (published_at desc nulls last);

-- updated_at automático
create or replace function public.releases_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists releases_touch_updated_at on public.releases;
create trigger releases_touch_updated_at
  before update on public.releases
  for each row execute function public.releases_touch_updated_at();

-- INVARIANTE CLAVE: como máximo UNA versión publicada por canal. Postgres
-- la aplica también cuando llegan dos publicaciones a la vez.
create unique index if not exists releases_one_published_per_channel
  on public.releases (channel)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- RLS de releases
--  * lectura pública: publicado + historial; administradores ven borradores
--  * escritura: exclusivamente administradores
-- ---------------------------------------------------------------------------
alter table public.releases enable row level security;

drop policy if exists releases_select on public.releases;
create policy releases_select
  on public.releases
  for select
  to anon, authenticated
  using (status in ('published', 'retired') or public.is_release_admin());

drop policy if exists releases_admin_insert on public.releases;
create policy releases_admin_insert
  on public.releases
  for insert
  to authenticated
  with check (public.is_release_admin() and status = 'draft');

drop policy if exists releases_admin_update on public.releases;
create policy releases_admin_update
  on public.releases
  for update
  to authenticated
  using (public.is_release_admin())
  with check (public.is_release_admin());

drop policy if exists releases_admin_delete on public.releases;
create policy releases_admin_delete
  on public.releases
  for delete
  to authenticated
  using (public.is_release_admin());

-- ---------------------------------------------------------------------------
-- RPC (transacciones seguras, ejecución con definer + comprobación admin)
-- ---------------------------------------------------------------------------

-- Publica una versión: retira la principal actual del canal (motivo
-- "reemplazada") y promueve la nueva. Una única transacción garantiza que
-- el canal nunca queda sin principal ni con dos principales simultáneos.
create or replace function public.release_publish(p_release_id uuid)
returns public.releases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.releases;
begin
  if not public.is_release_admin() then
    raise exception 'solo_administradores' using errcode = 'P0003';
  end if;

  select * into v_target
  from public.releases
  where id = p_release_id
  for update;

  if not found then
    raise exception 'version_no_hallada' using errcode = 'P0002';
  end if;

  if v_target.status = 'published' then
    return v_target;  -- idempotente
  end if;

  if v_target.status <> 'draft' then
    raise sqlstate 'PT409' using message = 'estado_no_publicable';
  end if;

  if v_target.file_size is null or v_target.file_size <= 0
     or v_target.sha256 is null then
    raise exception 'integridad_no_verificada' using errcode = 'P0005';
  end if;

  -- Serializa publicaciones del mismo canal. Canales distintos conservan
  -- concurrencia y el índice parcial sigue siendo la última defensa.
  perform pg_advisory_xact_lock(hashtextextended(v_target.channel, 0));

  update public.releases
     set status        = 'retired',
         retire_reason = 'reemplazada',
         retired_at    = now(),
         updated_at    = now()
   where channel = v_target.channel
     and status  = 'published';

  update public.releases
     set status       = 'published',
         published_at = coalesce(published_at, now()),
         retired_at   = null,
         retire_reason = null,
         updated_at   = now()
   where id = p_release_id
   returning * into v_target;

  return v_target;
end;
$$;

-- Retira una versión de la principal (pasa a "retirada": ya no es la
-- activa, pero sigue listada en el historial con su descarga).
create or replace function public.release_retire(p_release_id uuid)
returns public.releases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.releases;
begin
  if not public.is_release_admin() then
    raise exception 'solo_administradores' using errcode = 'P0003';
  end if;

  update public.releases
     set status        = 'retired',
         retire_reason = 'retirada',
         retired_at    = now(),
         updated_at    = now()
   where id = p_release_id
     and status = 'published'
   returning * into v_row;

  if not found then
    raise exception 'version_no_publicada' using errcode = 'P0004';
  end if;

  return v_row;
end;
$$;

-- Borra un registro. El archivo físico lo elimina el cliente inmediatamente
-- después (la restricción unique(file_path) impide compartir archivos).
create or replace function public.release_delete(p_release_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted uuid;
begin
  if not public.is_release_admin() then
    raise exception 'solo_administradores' using errcode = 'P0003';
  end if;

  delete from public.releases
   where id = p_release_id
     and status <> 'published'
   returning id into v_deleted;

  if not found then
    raise sqlstate 'PT409' using message = 'version_no_eliminable';
  end if;

  return v_deleted;
end;
$$;

-- Resumen para el panel (una llamada).
create or replace function public.release_panel_stats()
returns json
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_release_admin() then
    raise exception 'solo_administradores' using errcode = 'P0003';
  end if;

  return json_build_object(
    'published',  (select count(*) from public.releases where status = 'published'),
    'drafts',     (select count(*) from public.releases where status = 'draft'),
    'retired',    (select count(*) from public.releases where status = 'retired'),
    'total',      (select count(*) from public.releases),
    'last_published_at', (select max(published_at) from public.releases),
    'active',     (
      select coalesce(json_object_agg(r.channel, json_build_object(
                 'version', r.version, 'name', r.name, 'id', r.id
               )), '{}'::json)
      from public.releases r
      where r.status = 'published'
    )
  );
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
-- Supabase concede privilegios amplios por defecto a tablas nuevas. Se
-- revocan antes de reconstruir la matriz mínima; RLS por sí solo no evita
-- que un administrador salte el ciclo atómico cambiando `status` directo.
revoke all privileges on public.release_admins from anon, authenticated;
revoke all privileges on public.releases from anon, authenticated;
grant select on public.release_admins to authenticated;
grant all privileges on public.release_admins to service_role;
grant select on public.releases to anon, authenticated, service_role;
grant insert on public.releases to authenticated;
grant update (name, version, description, changelog, arch, sha256)
  on public.releases to authenticated;
grant insert, update, delete on public.releases to service_role;
grant execute on function
  public.is_release_admin(),
  public.release_publish(uuid),
  public.release_retire(uuid),
  public.release_delete(uuid),
  public.release_panel_stats()
  to authenticated, service_role;
