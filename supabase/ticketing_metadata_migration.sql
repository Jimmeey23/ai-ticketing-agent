-- Add dynamic field persistence to an existing ticketing backend.
-- Run this if you already created the tables before metadata existed.

alter table public.tickets
add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.tickets
add column if not exists source_ref text;

create unique index if not exists tickets_source_ref_uidx
on public.tickets (source_ref)
where source_ref is not null;

create index if not exists tickets_metadata_gin_idx
on public.tickets using gin (metadata);
