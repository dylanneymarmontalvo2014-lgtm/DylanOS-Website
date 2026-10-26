-- DylanOS Crimson: add SourceForge FRS without rewriting legacy release rows.
alter table public.releases
  drop constraint if exists releases_storage_provider_check;

alter table public.releases
  add constraint releases_storage_provider_check
  check (storage_provider in ('supabase','r2','sourceforge'));

comment on column public.releases.storage_provider is
  'Proveedor del archivo inmutable: supabase o r2 (legado), sourceforge (publicaciones nuevas).';
