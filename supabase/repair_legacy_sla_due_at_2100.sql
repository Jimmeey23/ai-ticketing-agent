-- Safe repair script for tickets that were previously frozen at 2100-01-01.
-- Review the SELECT output first. The UPDATE is wrapped in a transaction that
-- rolls back by default; replace ROLLBACK with COMMIT only after review.

select
  id,
  title,
  priority,
  created_at,
  sla_due_at
from public.tickets
where sla_due_at::date = date '2100-01-01'
order by created_at desc;

begin;

update public.tickets
set sla_due_at =
  created_at +
  case priority
    when 'Critical' then interval '2 hours'
    when 'High' then interval '8 hours'
    when 'Medium' then interval '24 hours'
    when 'Low' then interval '72 hours'
    else interval '24 hours'
  end
where sla_due_at::date = date '2100-01-01'
returning id, title, priority, created_at, sla_due_at;

rollback;
