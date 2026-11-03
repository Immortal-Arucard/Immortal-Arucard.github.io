-- DRP Compass: count every completed test (guests + signed-in users).
-- Guest rows are anonymous (user_id null); signed-in rows carry user_id = auth.uid().
-- No names, emails or IPs are stored. Insert-only for clients; no select policy.
create table if not exists public.test_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  registered boolean not null default false,
  user_id uuid null references auth.users(id) on delete set null,
  score numeric null,
  answers jsonb null  -- e.g. array of 30 'agree'/'disagree' values; no names, emails or IPs
);
alter table public.test_events add column if not exists answers jsonb null;
alter table public.test_events add column if not exists user_id uuid null references auth.users(id) on delete set null;

alter table public.test_events enable row level security;

revoke all on table public.test_events from anon, authenticated;
grant insert (registered, user_id, score, answers) on table public.test_events to anon, authenticated;

drop policy if exists "test_events insert" on public.test_events;
create policy "test_events insert" on public.test_events
  for insert to anon, authenticated
  with check (
    (registered and user_id = auth.uid())
    or (not registered and user_id is null and auth.uid() is null)
  );

create index if not exists test_events_created_at_idx on public.test_events (created_at);
