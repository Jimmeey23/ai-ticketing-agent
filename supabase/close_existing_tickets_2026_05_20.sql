-- One-time repair for the May 20, 2026 email-notification rollout.
-- Marks tickets that existed before this rollout as Closed so lifecycle emails
-- apply only to newly-created tickets going forward.
--
-- Review the cutoff before running. This file is intentionally not invoked by
-- the client application.

begin;

alter table public.tickets disable trigger tickets_enforce_status_owner;

with params as (
  select timestamptz '2026-05-20 00:05:03+05:30' as cutoff_at
),
closed as (
  update public.tickets t
  set
    status = 'Closed',
    tags = (
      select array_agg(distinct tag)
      from unnest(coalesce(t.tags, '{}'::text[]) || array['closed-before-email-rollout']) as tag
    ),
    metadata = jsonb_set(
      coalesce(t.metadata, '{}'::jsonb),
      '{bulkClosure}',
      jsonb_build_object(
        'reason', 'Closed existing tickets before lifecycle email rollout',
        'cutoffAt', (select cutoff_at from params),
        'closedAt', now()
      ),
      true
    ),
    updated_at = now()
  from params
  where t.status <> 'Closed'
    and t.created_at < params.cutoff_at
  returning t.id, t.status
)
insert into public.ticket_events (ticket_id, event_type, actor, from_value, to_value, metadata)
select
  id,
  'status_change',
  'Email rollout migration',
  null,
  'Closed',
  jsonb_build_object('bulkClosure', true, 'script', 'close_existing_tickets_2026_05_20.sql')
from closed;

alter table public.tickets enable trigger tickets_enforce_status_owner;

commit;
