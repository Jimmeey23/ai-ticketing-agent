-- Persist cleared/read notifications per authenticated user.
-- Run after supabase/access_levels.sql.
--
-- Safe to re-run.

create table if not exists public.notification_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

alter table public.notification_dismissals enable row level security;

drop policy if exists "Users read own notification dismissals" on public.notification_dismissals;
create policy "Users read own notification dismissals"
on public.notification_dismissals for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own notification dismissals" on public.notification_dismissals;
create policy "Users insert own notification dismissals"
on public.notification_dismissals for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own notification dismissals" on public.notification_dismissals;
create policy "Users update own notification dismissals"
on public.notification_dismissals for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own notification dismissals" on public.notification_dismissals;
create policy "Users delete own notification dismissals"
on public.notification_dismissals for delete
to authenticated
using ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
