-- Idempotent audit table for Athena lifecycle email notifications.
-- Run this before deploying supabase/functions/ticket-email-notifications.

create table if not exists public.ticket_email_notifications (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets(id) on delete cascade,
  event_type text not null check (event_type in ('ticket_assigned', 'ticket_due_today', 'ticket_escalated', 'ticket_closed')),
  event_key text not null unique,
  owner_name text not null,
  owner_email text not null,
  escalation_name text,
  escalation_email text,
  actor text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ticket_email_notifications_ticket_idx
on public.ticket_email_notifications (ticket_id, created_at desc);

create index if not exists ticket_email_notifications_status_idx
on public.ticket_email_notifications (status, created_at desc);

alter table public.ticket_email_notifications enable row level security;

drop policy if exists "Admins can read ticket email notifications" on public.ticket_email_notifications;
create policy "Admins can read ticket email notifications"
on public.ticket_email_notifications for select
to authenticated
using (public.current_user_role() = 'admin');

notify pgrst, 'reload schema';
