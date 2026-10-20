begin
  foreach t in array array['officers', 'field_observations', 'assets', 'interventions']
  loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Row Level Security  (this is the real access control; the React
--    route guard is only convenience)
-- ---------------------------------------------------------------------
alter table public.officers           enable row level security;
alter table public.government_admins  enable row level security;
alter table public.field_observations enable row level security;
alter table public.assets             enable row level security;
alter table public.interventions      enable row level security;
alter table public.ai_summaries       enable row level security;
alter table public.reports            enable row level security;

grant usage on schema public to authenticated;
revoke all on public.officers, public.government_admins, public.field_observations,
  public.assets, public.interventions, public.ai_summaries, public.reports
  from public, anon;
grant select on public.officers, public.government_admins to authenticated;
grant update (name, department, location_operating_on, state, district)
  on public.officers to authenticated;
grant select, insert, update on public.field_observations, public.assets,
  public.interventions, public.ai_summaries, public.reports to authenticated;

-- officers: read your own row; government reads all. No client INSERT or
-- DELETE (the signup trigger inserts). Officers may edit profile fields only.
drop policy if exists officers_select_own  on public.officers;
drop policy if exists officers_select_gov  on public.officers;
drop policy if exists officers_update_own  on public.officers;
create policy officers_select_own on public.officers
  for select to authenticated using (id = (select auth.uid()));
create policy officers_select_gov on public.officers
  for select to authenticated using (public.is_government());
create policy officers_update_own on public.officers
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- government_admins: you can read only your own row. Nobody writes from the client.
drop policy if exists gov_select_own on public.government_admins;
create policy gov_select_own on public.government_admins
  for select to authenticated using (id = (select auth.uid()));

-- Data tables: identical pattern.
--   officer: select / insert / update own rows while status = 'active'
--   government: select rows that were sent to it
do $$
declare t text;
begin
  foreach t in array array['field_observations', 'assets', 'interventions', 'ai_summaries', 'reports']
  loop
    execute format('drop policy if exists %1$s_officer_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_officer_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_officer_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_gov_select    on public.%1$s', t);

    execute format($p$
      create policy %1$s_officer_select on public.%1$s
        for select to authenticated using (officer_id = (select auth.uid()))$p$, t);
    execute format($p$
      create policy %1$s_officer_insert on public.%1$s
        for insert to authenticated
        with check (officer_id = (select auth.uid()) and public.is_active_officer())$p$, t);
    execute format($p$
      create policy %1$s_officer_update on public.%1$s
        for update to authenticated
        using (officer_id = (select auth.uid()) and public.is_active_officer())
        with check (
          officer_id = (select auth.uid()) and public.is_active_officer()
        )$p$, t);
    execute format($p$
      create policy %1$s_gov_select on public.%1$s
        for select to authenticated
        using (public.is_government() and sent_to_government_at is not null)$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. Storage: private bucket for field photos.
--    Object path convention: <officer uuid>/<observation id>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('field-photos', 'field-photos', false)
on conflict (id) do update set public = false;

drop policy if exists field_photos_officer_insert on storage.objects;
drop policy if exists field_photos_officer_select on storage.objects;
drop policy if exists field_photos_gov_select     on storage.objects;

create policy field_photos_officer_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'field-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_active_officer()
  );
create policy field_photos_officer_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'field-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy field_photos_gov_select on storage.objects
  for select to authenticated
  using (bucket_id = 'field-photos' and public.is_government());

-- ---------------------------------------------------------------------
-- 9. Creating a government admin (later, when we build that login):
--    1) Dashboard → Authentication → Users → Add user (email + password)
--    2) Run, with that user's id:
--
--    insert into public.government_admins (id, name, email, location_working)
--    values ('<auth user uuid>', 'Name', 'email@gov.in', 'Pune district');
-- ---------------------------------------------------------------------
