-- DylanOSforms: creador, publicación y respuestas con RLS.

create table if not exists public.dylanos_forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dylanos_form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.dylanos_forms (id) on delete cascade,
  type text not null check (type in ('text', 'textarea', 'email', 'number', 'select', 'checkbox')),
  label text not null check (char_length(label) between 1 and 120),
  description text not null default '' check (char_length(description) <= 240),
  required boolean not null default false,
  position integer not null check (position between 0 and 29),
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (form_id, position)
);

create table if not exists public.dylanos_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.dylanos_forms (id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  respondent_email text check (respondent_email is null or char_length(respondent_email) <= 160),
  submitted_at timestamptz not null default now()
);

create index if not exists dylanos_forms_owner_updated_idx
  on public.dylanos_forms (owner_id, updated_at desc);
create index if not exists dylanos_form_fields_form_position_idx
  on public.dylanos_form_fields (form_id, position);
create index if not exists dylanos_form_submissions_form_date_idx
  on public.dylanos_form_submissions (form_id, submitted_at desc);

create or replace function public.dylanos_forms_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dylanos_forms_touch_updated_at on public.dylanos_forms;
create trigger dylanos_forms_touch_updated_at
  before update on public.dylanos_forms
  for each row execute function public.dylanos_forms_touch_updated_at();

alter table public.dylanos_forms enable row level security;
alter table public.dylanos_form_fields enable row level security;
alter table public.dylanos_form_submissions enable row level security;

drop policy if exists dylanos_forms_public_read on public.dylanos_forms;
create policy dylanos_forms_public_read
  on public.dylanos_forms for select
  to anon, authenticated
  using (status = 'published' or owner_id = auth.uid());

drop policy if exists dylanos_forms_owner_write on public.dylanos_forms;
create policy dylanos_forms_owner_write
  on public.dylanos_forms for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists dylanos_form_fields_public_read on public.dylanos_form_fields;
create policy dylanos_form_fields_public_read
  on public.dylanos_form_fields for select
  to anon, authenticated
  using (exists (
    select 1 from public.dylanos_forms f
    where f.id = form_id and (f.status = 'published' or f.owner_id = auth.uid())
  ));

drop policy if exists dylanos_form_fields_owner_write on public.dylanos_form_fields;
create policy dylanos_form_fields_owner_write
  on public.dylanos_form_fields for all
  to authenticated
  using (exists (
    select 1 from public.dylanos_forms f
    where f.id = form_id and f.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.dylanos_forms f
    where f.id = form_id and f.owner_id = auth.uid()
  ));

drop policy if exists dylanos_submissions_owner_read on public.dylanos_form_submissions;
create policy dylanos_submissions_owner_read
  on public.dylanos_form_submissions for select
  to authenticated
  using (exists (
    select 1 from public.dylanos_forms f
    where f.id = form_id and f.owner_id = auth.uid()
  ));

drop policy if exists dylanos_submissions_public_insert on public.dylanos_form_submissions;
create policy dylanos_submissions_public_insert
  on public.dylanos_form_submissions for insert
  to anon, authenticated
  with check (exists (
    select 1 from public.dylanos_forms f
    where f.id = form_id and f.status = 'published'
  ));

grant usage on schema public to anon, authenticated;
grant select on public.dylanos_forms, public.dylanos_form_fields to anon, authenticated;
grant insert, update, delete on public.dylanos_forms to authenticated;
grant insert, update, delete on public.dylanos_form_fields to authenticated;
grant insert on public.dylanos_form_submissions to anon, authenticated;
grant select on public.dylanos_form_submissions to authenticated;
