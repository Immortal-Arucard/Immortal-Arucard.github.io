-- DRP Compass: page-visit counter. Raw IPs are never stored, only sha256(ip || salt) hex.
create extension if not exists pgcrypto with schema extensions;

-- Salt is generated once inside the database (not committed to the public repo).
create table if not exists public.visit_salt (id int primary key default 1 check (id = 1), salt text not null);
alter table public.visit_salt enable row level security;  -- no policies: clients cannot read it
revoke all on table public.visit_salt from anon, authenticated;
insert into public.visit_salt (id, salt)
  values (1, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (id) do nothing;

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ip_hash text,
  path text
);
alter table public.site_visits enable row level security;  -- no policies: writes only via log_visit()
revoke all on table public.site_visits from anon, authenticated;
create index if not exists site_visits_created_at_idx on public.site_visits (created_at);

create or replace function public.log_visit(path text) returns void
language plpgsql security definer set search_path = public as $$
declare
  ip text;
  s text;
begin
  begin
    ip := trim(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1));
  exception when others then ip := null;
  end;
  select salt into s from public.visit_salt where id = 1;
  insert into public.site_visits (ip_hash, path)
  values (
    case when coalesce(ip,'') = '' then null
         else encode(sha256(convert_to(ip || s, 'UTF8')), 'hex') end,
    left(coalesce(log_visit.path, ''), 200)
  );
end $$;
revoke all on function public.log_visit(text) from public;
grant execute on function public.log_visit(text) to anon, authenticated;
