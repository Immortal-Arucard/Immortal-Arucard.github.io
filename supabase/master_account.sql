-- Master TWGI account profile. Apply once on project xfswvbxuhgqbdqpqiywa.
-- Not applied by this change. Does not read or list Chess or any other subaccount.
begin;

create table public.master_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  bio text not null default '',
  avatar_type text,
  background_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint master_profiles_name_len check (char_length(display_name) <= 80),
  constraint master_profiles_bio_len check (char_length(bio) <= 280),
  constraint master_profiles_name_chars check (display_name !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  constraint master_profiles_bio_chars check (bio !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  constraint master_profiles_avatar_type check (avatar_type is null or avatar_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint master_profiles_background_type check (background_type is null or background_type in ('image/jpeg', 'image/png', 'image/webp'))
);

alter table public.master_profiles enable row level security;
alter table public.master_profiles force row level security;
revoke all on table public.master_profiles from public, anon, authenticated;

create policy master_profiles_select on public.master_profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy master_profiles_insert on public.master_profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy master_profiles_update on public.master_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy master_profiles_delete on public.master_profiles
  for delete to authenticated
  using (id = (select auth.uid()));

grant select, insert, update, delete on table public.master_profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'master-account',
  'master-account',
  false,
  524288,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy master_account_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'master-account'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy master_account_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'master-account'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy master_account_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'master-account'
    and split_part(name, '/', 1) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'master-account'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy master_account_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'master-account'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create or replace function public.save_master_profile(next_name text, next_bio text, next_avatar text, next_background text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_name text := pg_catalog.btrim(pg_catalog.coalesce(next_name, ''));
  clean_bio text := pg_catalog.btrim(pg_catalog.coalesce(next_bio, ''));
begin
  if actor is null then
    raise exception 'Sign in required.';
  end if;
  if pg_catalog.char_length(clean_name) > 80 or clean_name ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'A name can be at most 80 characters.';
  end if;
  if pg_catalog.char_length(clean_bio) > 280 or clean_bio ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'A bio can be at most 280 characters.';
  end if;
  if next_avatar is not null and next_avatar not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Use a JPEG, PNG, or WebP image up to 512 KB.';
  end if;
  if next_background is not null and next_background not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Use a JPEG, PNG, or WebP image up to 512 KB.';
  end if;
  insert into public.master_profiles as profiles (id, display_name, bio, avatar_type, background_type, updated_at)
  values (actor, clean_name, clean_bio, next_avatar, next_background, pg_catalog.now())
  on conflict (id) do update
  set display_name = excluded.display_name,
      bio = excluded.bio,
      avatar_type = excluded.avatar_type,
      background_type = excluded.background_type,
      updated_at = pg_catalog.now()
  where profiles.id = actor;
  return pg_catalog.jsonb_build_object(
    'display_name', clean_name,
    'bio', clean_bio,
    'avatar_type', next_avatar,
    'background_type', next_background
  );
end;
$$;

revoke all on function public.save_master_profile(text, text, text, text) from public, anon;
grant execute on function public.save_master_profile(text, text, text, text) to authenticated;

commit;
