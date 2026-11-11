-- Public master-account profiles and follows.
-- REVIEW ONLY. Not applied. Do not run this against production from the site change.
-- Project xfswvbxuhgqbdqpqiywa.
-- Does not alter Chess, Compass, or any other section table.
-- Does not grant anon or authenticated direct access to master_profiles or master_follows.
-- Email stays on auth.users and is not returned.
-- Profile pictures stay in the private master-account bucket. This file does not publish them.

begin;

create table public.master_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint master_follows_no_self check (follower_id <> followee_id)
);

create index master_follows_followee_idx on public.master_follows (followee_id);

alter table public.master_follows enable row level security;
alter table public.master_follows force row level security;
revoke all on table public.master_follows from public, anon, authenticated;

-- No table policies are granted. Reads and writes go through the functions below.
-- Those functions are security definer and must stay single-row or own-row.

create or replace function public.public_master_profile(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  found_name text := '';
  found_bio text := '';
  found_since timestamptz := null;
  followers bigint := 0;
  following bigint := 0;
  viewer_follows boolean := false;
begin
  if target is null then
    raise exception 'A profile id is required.';
  end if;
  select profiles.display_name, profiles.bio, profiles.created_at
    into found_name, found_bio, found_since
  from public.master_profiles as profiles
  where profiles.id = target;

  select count(*) into followers
  from public.master_follows as edges
  where edges.followee_id = target;

  select count(*) into following
  from public.master_follows as edges
  where edges.follower_id = target;

  if viewer is not null then
    select exists (
      select 1
      from public.master_follows as edges
      where edges.follower_id = viewer
        and edges.followee_id = target
    ) into viewer_follows;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', target,
    'display_name', pg_catalog.coalesce(found_name, ''),
    'bio', pg_catalog.coalesce(found_bio, ''),
    'member_since', found_since,
    'follower_count', followers,
    'following_count', following,
    'viewer_follows', viewer_follows,
    'is_self', viewer is not null and viewer = target
  );
end;
$$;

create or replace function public.follow_master(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Sign in required.';
  end if;
  if target is null or target = actor then
    raise exception 'You cannot follow yourself.';
  end if;
  insert into public.master_follows (follower_id, followee_id)
  values (actor, target)
  on conflict (follower_id, followee_id) do nothing;
  return public.public_master_profile(target);
end;
$$;

create or replace function public.unfollow_master(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Sign in required.';
  end if;
  if target is null then
    raise exception 'A profile id is required.';
  end if;
  delete from public.master_follows
  where follower_id = actor
    and followee_id = target;
  return public.public_master_profile(target);
end;
$$;

revoke all on function public.public_master_profile(uuid) from public;
revoke all on function public.follow_master(uuid) from public;
revoke all on function public.unfollow_master(uuid) from public;

grant execute on function public.public_master_profile(uuid) to anon, authenticated;
grant execute on function public.follow_master(uuid) to authenticated;
grant execute on function public.unfollow_master(uuid) to authenticated;

commit;
