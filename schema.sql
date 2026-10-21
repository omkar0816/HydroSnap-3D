-- =====================================================================
-- HydroSnap-3D · Supabase schema
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query.
-- Safe to re-run: every statement is idempotent.
--
-- Flow (from the architecture sketch):
--   officer signs up / logs in  →  officers row (id, department, name,
--   location operating on, state, district)
--   officer saves data          →  field_observations / assets /
--   interventions / ai_summaries / reports  (all stamped with officer_id)
--   government admin logs in    →  can READ everything an officer sent,
--   joined to the officer's id + name.  Officers only ever see their own.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Human-readable IDs shown on the government dashboard
-- ---------------------------------------------------------------------
create sequence if not exists public.officer_code_seq start 1001;
create sequence if not exists public.government_code_seq start 101;

-- ---------------------------------------------------------------------
-- 2. Identity tables (one row per Supabase Auth user)
-- ---------------------------------------------------------------------
create table if not exists public.officers (
  id                    uuid primary key references auth.users (id) on delete cascade,
  officer_code          text not null unique
                          default ('OFF-' || nextval('public.officer_code_seq')::text),
  name                  text not null check (char_length(btrim(name)) between 2 and 100),
  email                 text not null,
  department            text not null check (char_length(btrim(department)) between 2 and 120),
  location_operating_on text not null check (char_length(btrim(location_operating_on)) between 2 and 160),
  state                 text not null check (char_length(btrim(state)) between 2 and 60),
  district              text not null check (char_length(btrim(district)) between 2 and 60),
  status                text not null default 'active' check (status in ('active', 'suspended')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists officers_state_district_idx on public.officers (state, district);

-- Government accounts are NEVER created from the browser. Create the auth
-- user in Dashboard → Authentication → Users, then insert the row here
-- (see the example at the bottom of this file).
create table if not exists public.government_admins (
  id               uuid primary key references auth.users (id) on delete cascade,
  government_code  text not null unique
                     default ('GOV-' || nextval('public.government_code_seq')::text),
  name             text not null check (char_length(btrim(name)) between 2 and 100),
  email            text not null,
  location_working text not null check (char_length(btrim(location_working)) between 2 and 160),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Role helpers (SECURITY DEFINER so policies can use them without
--    recursing into the tables they protect)
-- ---------------------------------------------------------------------
create or replace function public.is_government()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.government_admins g where g.id = (select auth.uid())
  );
$$;

create or replace function public.is_active_officer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.officers o
    where o.id = (select auth.uid()) and o.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------
-- 4. Sign-up trigger: creates the officers row from the sign-up metadata.
--    Works whether or not "Confirm email" is enabled (no session needed).
--    Only officers can be created this way; anything else gets no row and
--    is rejected by the app.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if meta ->> 'role' = 'officer' then
    insert into public.officers
      (id, email, name, department, location_operating_on, state, district)
    values (
      new.id,
      new.email,
      regexp_replace(btrim(meta ->> 'name'), '\s+', ' ', 'g'),
      regexp_replace(btrim(meta ->> 'department'), '\s+', ' ', 'g'),
      regexp_replace(btrim(meta ->> 'location_operating_on'), '\s+', ' ', 'g'),
      regexp_replace(btrim(meta ->> 'state'), '\s+', ' ', 'g'),
      regexp_replace(btrim(meta ->> 'district'), '\s+', ' ', 'g')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 5. Data tables. Every row carries officer_id so government can show
--    "report from officer <id> · <name>". sent_to_government_at is set on
--    save; government only sees rows where it is not null.
--    IDs are text because the app generates them client-side
--    (e.g. "obs-<uuid>") so offline retries stay idempotent.
--    watershed_id is text too: watershed geometry lives in the map layer.
-- ---------------------------------------------------------------------
create table if not exists public.field_observations (
  id                     text primary key,
  officer_id             uuid not null default auth.uid() references public.officers (id),
  watershed_id           text not null,
  asset_id               text,
  asset_type             text not null
                           check (asset_type in ('Check dam', 'Farm pond', 'Plantation', 'Percolation tank')),
  village                text not null default '',
  description            text not null default '',
  inspection_date        date not null,
  lat                    double precision not null check (lat between -90 and 90),
  lng                    double precision not null check (lng between -180 and 180),
  gps_accuracy_m         double precision check (gps_accuracy_m is null or gps_accuracy_m >= 0),
  location_source        text not null default 'device'
                           check (location_source in ('exif', 'device', 'manual', 'demo', 'snapped')),
  image_path             text,          -- key inside the field-photos bucket
  image_sha256           text,
  verification_status    text not null default 'Pending review'
                           check (verification_status in ('Verified', 'Pending review', 'Flagged')),
  trust                  jsonb,         -- TrustAssessment
  audit_history          jsonb not null default '[]'::jsonb,
  idempotency_key        text unique,
  payload                jsonb not null default '{}'::jsonb,  -- full FieldObservation
  sent_to_government_at  timestamptz default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists field_observations_officer_idx   on public.field_observations (officer_id, created_at desc);
create index if not exists field_observations_watershed_idx on public.field_observations (watershed_id);
create index if not exists field_observations_sha_idx       on public.field_observations (image_sha256);

create table if not exists public.assets (
  id                    text primary key,
  officer_id            uuid not null default auth.uid() references public.officers (id),
  watershed_id          text not null,
  name                  text not null,
  type                  text not null
                          check (type in ('Check dam', 'Farm pond', 'Plantation', 'Percolation tank')),
  village               text not null default '',
  description           text not null default '',
  lat                   double precision not null check (lat between -90 and 90),
  lng                   double precision not null check (lng between -180 and 180),
  status                text not null default 'Pending review'
                          check (status in ('Verified', 'Pending review', 'Flagged')),
  installed_at          date,
  last_inspected        date,
  sent_to_government_at timestamptz default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists assets_officer_idx   on public.assets (officer_id);
create index if not exists assets_watershed_idx on public.assets (watershed_id);

create table if not exists public.interventions (
  id                    text primary key,
  officer_id            uuid not null default auth.uid() references public.officers (id),
  watershed_id          text not null,
  name                  text not null,
  type                  text not null,
  village               text not null default '',
  status                text not null default 'Planned'
                          check (status in ('Planned', 'In progress', 'Completed')),
  progress              integer not null default 0 check (progress between 0 and 100),
  budget                numeric(14, 2) not null default 0 check (budget >= 0),
  due_date              date,
  sent_to_government_at timestamptz default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists interventions_officer_idx   on public.interventions (officer_id);
create index if not exists interventions_watershed_idx on public.interventions (watershed_id);

create table if not exists public.ai_summaries (
  id                    uuid primary key default gen_random_uuid(),
  officer_id            uuid not null default auth.uid() references public.officers (id),
  watershed_id          text,
  observation_id        text references public.field_observations (id) on delete set null,
  english               text not null,
  hindi                 text,
  marathi               text,
  model_name            text,
  language_review       text not null default 'unreviewed',
  generated_at          timestamptz not null default now(),
  sent_to_government_at timestamptz default now()
);
create index if not exists ai_summaries_officer_idx on public.ai_summaries (officer_id, generated_at desc);

create table if not exists public.reports (
  id                    text primary key,
  officer_id            uuid not null default auth.uid() references public.officers (id),
  watershed_id          text not null,
  asset_id              text,
  name                  text not null,
  type                  text not null
                          check (type in ('Watershed summary', 'Field inspection', 'Asset registry', 'Analytics')),
  status                text not null default 'Ready' check (status in ('Ready', 'Generating')),
  file_path             text,          -- optional PDF in the reports bucket
  sent_to_government_at timestamptz default now(),
  created_at            timestamptz not null default now()
);
create index if not exists reports_officer_idx on public.reports (officer_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
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

revoke update on public.officers from authenticated, anon;
grant update (name, department, location_operating_on, state, district)
  on public.officers to authenticated;

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
        with check (officer_id = (select auth.uid()))$p$, t);
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
on conflict (id) do nothing;

drop policy if exists field_photos_officer_insert on storage.objects;
drop policy if exists field_photos_officer_select on storage.objects;
drop policy if exists field_photos_officer_delete on storage.objects;
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
create policy field_photos_officer_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'field-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_active_officer()
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
