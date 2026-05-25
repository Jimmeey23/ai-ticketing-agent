-- Server-side lifecycle email automation for Athena tickets.
--
-- Prerequisites:
-- 1. Run supabase/ticket_email_notifications.sql.
-- 2. Deploy both Edge Functions:
--    - ticket-email-notifications
--    - ticket-email-automation
-- 3. Set the same TICKET_EMAIL_AUTOMATION_SECRET secret on both functions.
-- 4. Replace the placeholders below before running this file.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('ticket-email-automation-every-10-min')
where exists (
  select 1
  from cron.job
  where jobname = 'ticket-email-automation-every-10-min'
);

select cron.schedule(
  'ticket-email-automation-every-10-min',
  '*/10 * * * *',
  $$
  select
    net.http_post(
      url := 'https://nujgmxqefoumhhreqzxm.supabase.co/functions/v1/ticket-email-automation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ticket-email-automation-secret', 'T1CKET@UTOM@T1ON'
      ),
      body := jsonb_build_object(
        'actor', 'SLA Automation',
        'assignmentLookbackHours', 24,
        'maxJobs', 100
      )
    );
  $$
);
