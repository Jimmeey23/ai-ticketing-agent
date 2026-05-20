-- Athena access levels: admin and support
-- Run this in Supabase SQL editor after the base ticketing schema.

alter table public.profiles add column if not exists role text;
update public.profiles
set role = 'support'
where role is null or role not in ('admin', 'support');
alter table public.profiles alter column role set default 'support';
alter table public.profiles alter column role set not null;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'support'));

alter table public.tickets add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.tickets add column if not exists assigned_to text not null default 'Unassigned';

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

create or replace function public.enforce_ticket_status_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'Closed' and new.status is distinct from 'Closed' then
    raise exception 'Closed tickets cannot be reopened.'
      using errcode = '42501';
  end if;

  if old.status is distinct from new.status
     and not public.can_update_ticket_status(old.assigned_to) then
    raise exception 'Only the assigned ticket owner or an admin can change ticket status.'
      using errcode = '42501';
  end if;

  if old.status is distinct from new.status then
    if btrim(coalesce(new.metadata #>> '{latestResolution,reason}', '')) = '' then
      raise exception 'Status changes require a reason.'
        using errcode = '23514';
    end if;

    if btrim(coalesce(new.metadata #>> '{latestResolution,actionTaken}', '')) = '' then
      raise exception 'Status changes require actions taken by the owner.'
        using errcode = '23514';
    end if;

    if btrim(coalesce(new.metadata #>> '{latestResolution,actionDate}', '')) = '' then
      raise exception 'Status changes require the action date.'
        using errcode = '23514';
    end if;

    if new.status in ('Resolved', 'Closed')
       and btrim(coalesce(new.metadata #>> '{latestResolution,resolutionSummary}', '')) = '' then
      raise exception 'Resolved or closed tickets require a resolution summary.'
        using errcode = '23514';
    end if;

    if new.status in ('Resolved', 'Closed')
       and btrim(coalesce(new.metadata #>> '{latestResolution,outcome}', '')) = '' then
      raise exception 'Resolved or closed tickets require the final member or operational outcome.'
        using errcode = '23514';
    end if;

    if new.status = 'Closed'
       and btrim(coalesce(new.metadata #>> '{latestResolution,closedAt}', new.metadata ->> 'closedAt', '')) = '' then
      new.metadata = jsonb_set(
        jsonb_set(new.metadata, '{closedAt}', to_jsonb(now()), true),
        '{latestResolution,closedAt}', to_jsonb(now()), true
      );
    end if;
  end if;

  return new;
end;
$$;

alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;

drop trigger if exists tickets_enforce_status_owner on public.tickets;
create trigger tickets_enforce_status_owner
before update on public.tickets
for each row execute function public.enforce_ticket_status_owner();

drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
drop policy if exists "Profiles are readable by owner or admins" on public.profiles;
create policy "Profiles are readable by owner or admins"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id and role = public.current_user_role());

drop policy if exists "Admins can update profiles" on public.profiles;
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

-- Promote a user to admin:
-- update public.profiles set role = 'admin' where email = 'admin@example.com';

-- Set support display names to match assigned_to values:
-- update public.profiles set full_name = 'Akshay Rane', role = 'support' where email = 'akshay@example.com';
