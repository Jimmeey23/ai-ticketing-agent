-- Physique 57 India Support OS backend schema
-- Run this in the NEW Supabase project's SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'support' check (role in ('admin', 'support')),
  team text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id text primary key default ('P57-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  source_ref text,
  title text not null,
  description text,
  category text not null,
  sub_category text not null,
  priority text not null default 'Medium' check (priority in ('Critical', 'High', 'Medium', 'Low')),
  status text not null default 'New' check (status in ('New', 'In Progress', 'Awaiting Member', 'Resolved', 'Closed')),
  studio text not null default 'Unspecified Studio',
  trainer text,
  class_type text,
  class_date_time timestamptz,
  member_name text,
  member_contact text,
  reported_by text,
  assigned_to text not null default 'Unassigned',
  team text not null default 'Member Experience',
  tags text[] not null default '{}',
  sentiment text,
  conversation_summary text,
  metadata jsonb not null default '{}'::jsonb,
  sla_due_at timestamptz not null default (now() + interval '24 hours'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets(id) on delete cascade,
  event_type text not null,
  actor text,
  from_value text,
  to_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tickets_created_at_idx on public.tickets (created_at desc);
create unique index if not exists tickets_source_ref_uidx on public.tickets (source_ref) where source_ref is not null;
create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_priority_idx on public.tickets (priority);
create index if not exists tickets_assigned_to_idx on public.tickets (assigned_to);
create index if not exists tickets_sla_due_at_idx on public.tickets (sla_due_at);
create index if not exists tickets_metadata_gin_idx on public.tickets using gin (metadata);
create index if not exists ticket_events_ticket_id_idx on public.ticket_events (ticket_id, created_at desc);

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'support');
$$;

create or replace function public.current_user_assignment_keys()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    lower(coalesce((select email from public.profiles where id = auth.uid()), '')),
    lower(coalesce((select full_name from public.profiles where id = auth.uid()), '')),
    lower(coalesce((select raw_user_meta_data ->> 'full_name' from auth.users where id = auth.uid()), '')),
    lower(coalesce((select raw_user_meta_data ->> 'name' from auth.users where id = auth.uid()), '')),
    lower(coalesce((select email from auth.users where id = auth.uid()), ''))
  ], '');
$$;

create or replace function public.can_access_ticket(ticket_created_by uuid, ticket_assigned_to text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() = 'admin'
    or ticket_created_by = auth.uid()
    or lower(coalesce(ticket_assigned_to, '')) = any(public.current_user_assignment_keys());
$$;

create or replace function public.can_update_ticket_status(ticket_assigned_to text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() = 'admin'
    or lower(coalesce(ticket_assigned_to, '')) = any(public.current_user_assignment_keys());
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_ticket_status_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
     and not public.can_update_ticket_status(old.assigned_to) then
    raise exception 'Only the assigned ticket owner or an admin can change ticket status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

drop trigger if exists tickets_enforce_status_owner on public.tickets;
create trigger tickets_enforce_status_owner
before update on public.tickets
for each row execute function public.enforce_ticket_status_owner();

alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;

drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
drop policy if exists "Profiles are readable by owner or admins" on public.profiles;
create policy "Profiles are readable by owner or admins"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id and role = public.current_user_role());

create policy "Admins can update profiles"
on public.profiles for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Tickets are readable by authenticated users" on public.tickets;
drop policy if exists "Tickets are readable by role access" on public.tickets;
create policy "Tickets are readable by role access"
on public.tickets for select
to authenticated
using (public.can_access_ticket(created_by, assigned_to));

drop policy if exists "Authenticated users can create tickets" on public.tickets;
create policy "Authenticated users can create tickets"
on public.tickets for insert
to authenticated
with check (created_by is null or created_by = auth.uid());

drop policy if exists "Authenticated users can update tickets" on public.tickets;
drop policy if exists "Authenticated users can update accessible tickets" on public.tickets;
create policy "Authenticated users can update accessible tickets"
on public.tickets for update
to authenticated
using (public.can_access_ticket(created_by, assigned_to))
with check (auth.uid() is not null);

drop policy if exists "Authenticated users can delete tickets" on public.tickets;
drop policy if exists "Admins and creators can delete tickets" on public.tickets;
create policy "Admins and creators can delete tickets"
on public.tickets for delete
to authenticated
using (public.current_user_role() = 'admin' or created_by = auth.uid());

drop policy if exists "Ticket events are readable by authenticated users" on public.ticket_events;
drop policy if exists "Ticket events are readable by ticket access" on public.ticket_events;
create policy "Ticket events are readable by ticket access"
on public.ticket_events for select
to authenticated
using (
  exists (
    select 1
    from public.tickets t
    where t.id = ticket_events.ticket_id
      and public.can_access_ticket(t.created_by, t.assigned_to)
  )
);

drop policy if exists "Authenticated users can create ticket events" on public.ticket_events;
create policy "Authenticated users can create ticket events"
on public.ticket_events for insert
to authenticated
with check (created_by is null or created_by = auth.uid());

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'support')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_on_signup on auth.users;
create trigger create_profile_on_signup
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.ticket_events;
