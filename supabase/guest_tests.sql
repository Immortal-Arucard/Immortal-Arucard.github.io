-- DRP Compass: count every completed test (guests + signed-in users).
-- Stores no names, emails or answers. Insert-only for clients; no select policy.
create table if not exists public.test_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  registered boolean not null default false,
  user_id uuid null references auth.users(id) on delete set null,
  score numeric null
);

alter table public.test_events enable row level security;

revoke all on table public.test_events from anon, authenticated;
grant insert (registered, user_id, score) on table public.test_events to anon, authenticated;

drop policy if exists "test_events insert" on public.test_events;
create policy "test_events insert" on public.test_events
  for insert to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and registered = (user_id is not null)
  );

create index if not exists test_events_created_at_idx on public.test_events (created_at);
