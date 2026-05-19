-- Athena configurable routing settings
-- Run after the base ticketing schema and access-level SQL.

create table if not exists public.departments (
  id text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id text primary key,
  name text not null,
  email text,
  department text not null,
  role text,
  location text,
  manager text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.locations (
  id text primary key,
  name text not null,
  short_name text not null default '',
  city text,
  color text not null default '#2563eb',
  capacity integer not null default 20,
  avg_fill_rate numeric not null default 0,
  active boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.issue_routing_rules (
  id text primary key,
  category text not null,
  sub_category text,
  location text,
  owner text not null,
  owners text[] not null default '{}',
  department text not null,
  escalation text not null,
  priority text not null default 'Medium',
  sla_hours integer not null default 24,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_routing_rules_priority_check check (priority in ('Critical', 'High', 'Medium', 'Low'))
);

-- Existing Supabase projects may already have these tables from an older script.
-- CREATE TABLE IF NOT EXISTS does not add missing columns, so keep this repair
-- section before policies/triggers and before the app upserts settings.
alter table public.departments add column if not exists description text;
alter table public.departments add column if not exists active boolean;
alter table public.departments add column if not exists created_at timestamptz;
alter table public.departments add column if not exists updated_at timestamptz;

update public.departments
set
  active = coalesce(active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.departments alter column active set default true;
alter table public.departments alter column active set not null;
alter table public.departments alter column created_at set default now();
alter table public.departments alter column created_at set not null;
alter table public.departments alter column updated_at set default now();
alter table public.departments alter column updated_at set not null;

alter table public.employees add column if not exists email text;
alter table public.employees add column if not exists department text;
alter table public.employees add column if not exists role text;
alter table public.employees add column if not exists location text;
alter table public.employees add column if not exists manager text;
alter table public.employees add column if not exists active boolean;
alter table public.employees add column if not exists created_at timestamptz;
alter table public.employees add column if not exists updated_at timestamptz;

update public.employees
set
  department = coalesce(nullif(department, ''), 'Customer Service'),
  active = coalesce(active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.employees alter column department set default 'Customer Service';
alter table public.employees alter column department set not null;
alter table public.employees alter column active set default true;
alter table public.employees alter column active set not null;
alter table public.employees alter column created_at set default now();
alter table public.employees alter column created_at set not null;
alter table public.employees alter column updated_at set default now();
alter table public.employees alter column updated_at set not null;

alter table public.locations add column if not exists short_name text;
alter table public.locations add column if not exists city text;
alter table public.locations add column if not exists color text;
alter table public.locations add column if not exists capacity integer;
alter table public.locations add column if not exists avg_fill_rate numeric;
alter table public.locations add column if not exists active boolean;
alter table public.locations add column if not exists is_active boolean;
alter table public.locations add column if not exists created_at timestamptz;
alter table public.locations add column if not exists updated_at timestamptz;

update public.locations
set
  short_name = coalesce(nullif(short_name, ''), nullif(name, ''), id),
  city = coalesce(nullif(city, ''), case when name ~* 'bengaluru|bangalore|copper' then 'Bengaluru' else 'Mumbai' end),
  color = coalesce(
    nullif(color, ''),
    case
      when name ~* 'supreme|bandra' then '#7c3aed'
      when name ~* 'kenkere|bengaluru|bangalore' then '#059669'
      when name ~* 'copper|cloves' then '#dc2626'
      when name ~* 'courtside' then '#0891b2'
      else '#2563eb'
    end
  ),
  capacity = greatest(coalesce(capacity, 20), 1),
  avg_fill_rate = coalesce(avg_fill_rate, 0),
  active = coalesce(active, true),
  is_active = coalesce(is_active, active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.locations alter column short_name set default '';
alter table public.locations alter column short_name set not null;
alter table public.locations alter column color set default '#2563eb';
alter table public.locations alter column color set not null;
alter table public.locations alter column capacity set default 20;
alter table public.locations alter column capacity set not null;
alter table public.locations alter column avg_fill_rate set default 0;
alter table public.locations alter column avg_fill_rate set not null;
alter table public.locations alter column active set default true;
alter table public.locations alter column active set not null;
alter table public.locations alter column is_active set default true;
alter table public.locations alter column is_active set not null;
alter table public.locations alter column created_at set default now();
alter table public.locations alter column created_at set not null;
alter table public.locations alter column updated_at set default now();
alter table public.locations alter column updated_at set not null;

alter table public.issue_routing_rules add column if not exists category text;
alter table public.issue_routing_rules add column if not exists sub_category text;
alter table public.issue_routing_rules add column if not exists location text;
alter table public.issue_routing_rules add column if not exists owner text;
alter table public.issue_routing_rules add column if not exists owners text[];
alter table public.issue_routing_rules add column if not exists department text;
alter table public.issue_routing_rules add column if not exists escalation text;
alter table public.issue_routing_rules add column if not exists priority text;
alter table public.issue_routing_rules add column if not exists sla_hours integer;
alter table public.issue_routing_rules add column if not exists active boolean;
alter table public.issue_routing_rules add column if not exists created_at timestamptz;
alter table public.issue_routing_rules add column if not exists updated_at timestamptz;

update public.issue_routing_rules
set
  category = coalesce(nullif(category, ''), 'General Feedback'),
  owner = coalesce(nullif(owner, ''), 'Nunu Yeptomi'),
  department = coalesce(nullif(department, ''), 'Customer Service'),
  escalation = coalesce(nullif(escalation, ''), 'Mitali Kumar'),
  priority = case when priority in ('Critical', 'High', 'Medium', 'Low') then priority else 'Medium' end,
  sla_hours = coalesce(sla_hours, 24),
  active = coalesce(active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

update public.issue_routing_rules
set owners = array[owner]
where owners is null or coalesce(cardinality(owners), 0) = 0;

alter table public.issue_routing_rules alter column category set not null;
alter table public.issue_routing_rules alter column owner set not null;
alter table public.issue_routing_rules alter column owners set default '{}';
alter table public.issue_routing_rules alter column owners set not null;
alter table public.issue_routing_rules alter column department set not null;
alter table public.issue_routing_rules alter column escalation set not null;
alter table public.issue_routing_rules alter column priority set default 'Medium';
alter table public.issue_routing_rules alter column priority set not null;
alter table public.issue_routing_rules alter column sla_hours set default 24;
alter table public.issue_routing_rules alter column sla_hours set not null;
alter table public.issue_routing_rules alter column active set default true;
alter table public.issue_routing_rules alter column active set not null;
alter table public.issue_routing_rules alter column created_at set default now();
alter table public.issue_routing_rules alter column created_at set not null;
alter table public.issue_routing_rules alter column updated_at set default now();
alter table public.issue_routing_rules alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'issue_routing_rules_priority_check'
      and conrelid = 'public.issue_routing_rules'::regclass
  ) then
    alter table public.issue_routing_rules
      add constraint issue_routing_rules_priority_check
      check (priority in ('Critical', 'High', 'Medium', 'Low'));
  end if;
end;
$$;

create table if not exists public.settings_audit_log (
  id uuid primary key default gen_random_uuid(),
  setting_type text not null,
  setting_id text,
  action text not null,
  actor uuid references auth.users(id) on delete set null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.locations enable row level security;
alter table public.issue_routing_rules enable row level security;
alter table public.settings_audit_log enable row level security;

drop policy if exists "Routing settings readable by authenticated users" on public.departments;
create policy "Routing settings readable by authenticated users"
on public.departments for select to authenticated using (true);

drop policy if exists "Employees readable by authenticated users" on public.employees;
create policy "Employees readable by authenticated users"
on public.employees for select to authenticated using (true);

drop policy if exists "Locations readable by authenticated users" on public.locations;
create policy "Locations readable by authenticated users"
on public.locations for select to authenticated using (true);

drop policy if exists "Issue routing readable by authenticated users" on public.issue_routing_rules;
create policy "Issue routing readable by authenticated users"
on public.issue_routing_rules for select to authenticated using (true);

drop policy if exists "Settings audit readable by admins" on public.settings_audit_log;
create policy "Settings audit readable by admins"
on public.settings_audit_log for select to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Admins manage departments" on public.departments;
create policy "Admins manage departments"
on public.departments for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Admins manage employees" on public.employees;
create policy "Admins manage employees"
on public.employees for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Admins manage locations" on public.locations;
create policy "Admins manage locations"
on public.locations for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Admins manage issue routing" on public.issue_routing_rules;
create policy "Admins manage issue routing"
on public.issue_routing_rules for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Admins insert settings audit" on public.settings_audit_log;
create policy "Admins insert settings audit"
on public.settings_audit_log for insert to authenticated
with check (public.current_user_role() = 'admin');

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists departments_touch_updated_at on public.departments;
create trigger departments_touch_updated_at
before update on public.departments
for each row execute function public.touch_updated_at();

drop trigger if exists employees_touch_updated_at on public.employees;
create trigger employees_touch_updated_at
before update on public.employees
for each row execute function public.touch_updated_at();

drop trigger if exists locations_touch_updated_at on public.locations;
create trigger locations_touch_updated_at
before update on public.locations
for each row execute function public.touch_updated_at();

drop trigger if exists issue_routing_rules_touch_updated_at on public.issue_routing_rules;
create trigger issue_routing_rules_touch_updated_at
before update on public.issue_routing_rules
for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
