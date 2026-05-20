-- Allow staff who can access an existing ticket to edit its non-status fields,
-- including reassignment. The status-owner trigger still controls status changes.

drop policy if exists "Authenticated users can update accessible tickets" on public.tickets;
create policy "Authenticated users can update accessible tickets"
on public.tickets for update
to authenticated
using (public.can_access_ticket(created_by, assigned_to))
with check (auth.uid() is not null);
