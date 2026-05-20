-- Enforce ticket lifecycle details and prevent reopening tickets after they are Closed.

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

drop trigger if exists tickets_enforce_status_owner on public.tickets;
create trigger tickets_enforce_status_owner
before update on public.tickets
for each row execute function public.enforce_ticket_status_owner();
