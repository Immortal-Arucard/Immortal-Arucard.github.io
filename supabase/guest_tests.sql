-- DRP Compass: count every completed test (guests + signed-in users).
-- Rows are anonymous: no user ids, names, emails or IPs (answers + score only). Insert-only for clients; no select policy.
create table if not exists public.test_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  registered boolean not null default false,
  score numeric null,
  answers jsonb null  -- e.g. array of 30 'agree'/'disagree' values; no names, emails or IPs
);
alter table public.test_events add column if not exists answers jsonb null;

alter table public.test_events enable row level security;

revoke all on table public.test_events from anon, authenticated;
grant insert (registered, score, answers) on table public.test_events to anon, authenticated;

drop policy if exists "test_events insert" on public.test_events;
alter table public.test_events drop column if exists user_id;  -- in case an older version was run
create policy "test_events insert" on public.test_events
  for insert to anon, authenticated
  with check (
    -- rows are anonymous: registered must match whether the caller is signed in
    registered = (auth.uid() is not null)
  );

create index if not exists test_events_created_at_idx on public.test_events (created_at);
