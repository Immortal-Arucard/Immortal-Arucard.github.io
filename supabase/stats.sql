create or replace function public.admin_stats() returns json language plpgsql security definer set search_path = public, auth as $$
begin
  if lower(coalesce(auth.jwt()->>'email','')) <> 'cubzub@gmail.com' then raise exception 'not allowed'; end if;
  return json_build_object(
    'accounts', (select count(*) from auth.users),
    'tests', (select count(*) from public.results),
    'notes', (select count(*) from public.results where coalesce(note,'') <> ''),
    'avg_score', (select round(avg(score)::numeric,1) from public.results),
    'signups_by_day', (select coalesce(json_agg(d order by d.day),'[]') from (select date(created_at at time zone 'America/New_York') as day, count(*) as n from auth.users group by 1) d),
    'tests_by_day', (select coalesce(json_agg(d order by d.day),'[]') from (select date(taken_at at time zone 'America/New_York') as day, count(*) as n from public.results group by 1) d),
    'score_buckets', (select coalesce(json_agg(d order by d.score),'[]') from (select score, count(*) as n from public.results group by 1) d),
    -- Registered vs guest split, from public.test_events (counts start when guest_tests.sql + the site update went live).
    'registered_tests', (select count(*) from public.test_events where registered),
    'guest_tests', (select count(*) from public.test_events where not registered),
    'events_by_day', (select coalesce(json_agg(d order by d.day),'[]') from (
        select date(created_at at time zone 'America/New_York') as day,
               count(*) filter (where registered) as registered,
               count(*) filter (where not registered) as guest
        from public.test_events group by 1) d),
    -- Site visits (from public.site_visits; counts start when site_visits.sql + the site update went live).
    'total_visits', (select count(*) from public.site_visits),
    'unique_visitors', (select count(distinct ip_hash) from public.site_visits),
    'visits_by_day', (select coalesce(json_agg(d order by d.day),'[]') from (
        select date(created_at at time zone 'America/New_York') as day,
               count(*) as total,
               count(distinct ip_hash) as uniq
        from public.site_visits group by 1) d)
  );
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
