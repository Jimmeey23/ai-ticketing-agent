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
  city text,
  active boolean not null default true,
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

alter table public.issue_routing_rules add column if not exists owners text[] not null default '{}';

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
