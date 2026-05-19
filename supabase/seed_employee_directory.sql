-- Seed Physique 57 departments, employees, and locations for Settings routing.
-- Run after:
--   1. supabase/access_levels.sql
--   2. supabase/routing_settings.sql
--
-- Safe to re-run. Existing rows with the same id are updated.

-- Repair required location columns before seeding. Some Supabase projects
-- already have public.locations with required operational columns and no defaults.
alter table public.locations add column if not exists short_name text;
alter table public.locations add column if not exists city text;
alter table public.locations add column if not exists color text;
alter table public.locations add column if not exists capacity integer;
alter table public.locations add column if not exists avg_fill_rate numeric;
alter table public.locations add column if not exists active boolean;
alter table public.locations add column if not exists is_active boolean;

update public.locations
set
  short_name = coalesce(nullif(short_name, ''), nullif(name, ''), id),
  city = coalesce(nullif(city, ''), case when name ~* 'bengaluru|bangalore|copper' then 'Bengaluru' else 'Mumbai' end),
  color = coalesce(nullif(color, ''), '#2563eb'),
  capacity = greatest(coalesce(capacity, 20), 1),
  avg_fill_rate = coalesce(avg_fill_rate, 0),
  active = coalesce(active, true),
  is_active = coalesce(is_active, active, true);

alter table public.locations alter column short_name set default '';
alter table public.locations alter column short_name set not null;
alter table public.locations alter column color set default '#2563eb';
alter table public.locations alter column color set not null;
alter table public.locations alter column capacity set default 20;
alter table public.locations alter column capacity set not null;
alter table public.locations alter column avg_fill_rate set default 0;
alter table public.locations alter column avg_fill_rate set not null;
alter table public.locations alter column active set default true;
alter table public.locations alter column active set not null;
alter table public.locations alter column is_active set default true;
alter table public.locations alter column is_active set not null;

insert into public.departments (id, name, description, active)
values
  ('sales-client-servicing', 'Sales & Client Servicing', 'Sales & Client Servicing routing queue', true),
  ('accounts', 'Accounts', 'Accounts routing queue', true),
  ('marketing', 'Marketing', 'Marketing routing queue', true),
  ('customer-service', 'Customer Service', 'Customer Service routing queue', true),
  ('operations', 'Operations', 'Operations routing queue', true),
  ('training', 'Training', 'Training routing queue', true),
  ('management', 'Management', 'Management routing queue', true)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  active = excluded.active;

insert into public.locations (
  id,
  name,
  short_name,
  city,
  color,
  capacity,
  avg_fill_rate,
  active,
  is_active
)
values
  ('kwality-house-kemps-corner', 'Kwality House, Kemps Corner', 'Kwality House', 'Mumbai', '#2563eb', 20, 0, true, true),
  ('supreme-hq-bandra', 'Supreme HQ, Bandra', 'Supreme HQ', 'Mumbai', '#7c3aed', 20, 0, true, true),
  ('kenkere-house-bengaluru', 'Kenkere House, Bengaluru', 'Kenkere House', 'Bengaluru', '#059669', 20, 0, true, true),
  ('courtside-mumbai', 'Courtside, Mumbai', 'Courtside', 'Mumbai', '#0891b2', 20, 0, true, true),
  ('the-studio-by-copper-cloves-bengaluru', 'the Studio by Copper & Cloves, Bengaluru', 'Copper & Cloves', 'Bengaluru', '#dc2626', 20, 0, true, true)
on conflict (id) do update
set
  name = excluded.name,
  short_name = excluded.short_name,
  city = excluded.city,
  color = excluded.color,
  capacity = public.locations.capacity,
  avg_fill_rate = public.locations.avg_fill_rate,
  active = excluded.active,
  is_active = excluded.is_active;

insert into public.employees (id, name, email, department, role, location, manager, active)
values
  ('yashas-physique57bengaluru-com', 'Yashas K', 'yashas@physique57bengaluru.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Bengaluru', 'Shifa Ali', true),
  ('pujal-physique57mumbai-com', 'Pujal Jathar', 'pujal@physique57mumbai.com', 'Accounts', 'Sr. Finance & Accounts Executive', 'Physique 57, Mumbai', 'Sachin Nalawade', true),
  ('rasika-physique57mumbai-com', 'Rasika Kalambe', 'rasika@physique57mumbai.com', 'Accounts', 'Accounts Executive', 'Physique 57, Mumbai', 'Sachin Nalawade', true),
  ('sashi-physique57bengaluru-com', 'Sashi Singh', 'sashi@physique57bengaluru.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Bengaluru', 'Shifa Ali', true),
  ('deesha-physique57mumbai-com', 'Deesha Changwani', 'deesha@physique57mumbai.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Bandra', 'Jimmeey Gondaa', true),
  ('vahishta-physique57mumbai-com', 'Vahishta Fitter', 'vahishta@physique57mumbai.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Mumbai', 'Jimmeey Gondaa', true),
  ('nadiya-physique57mumbai-com', 'Nadiya Shaikh', 'nadiya@physique57mumbai.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Mumbai', 'Jimmeey Gondaa', true),
  ('saachi-s-physique57bengaluru-com', 'Saachi Shetty', 'saachi.s@physique57bengaluru.com', 'Marketing', 'Marketing Lead', 'Physique 57, Bengaluru', 'Shifa Ali', true),
  ('zaheer-physique57mumbai-com', 'Zaheer Agarbattiwala', 'zaheer@physique57mumbai.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Mumbai', 'Jimmeey Gondaa', true),
  ('nunu-physique57bengaluru-com', 'Nunu Yeptomi', 'nunu@physique57bengaluru.com', 'Customer Service', 'CSA', 'Physique 57, Bengaluru', 'Shifa Ali', true),
  ('sachin-physique57mumbai-com', 'Sachin Nalawade', 'sachin@physique57mumbai.com', 'Accounts', 'Accounts Assistant', 'Physique 57, India', 'Mitali Kumar', true),
  ('saachi-physique57india-com', 'Saachi Shetty - Operations', 'saachi@physique57india.com', 'Operations', 'Senior Operations Manager', 'Physique 57, Mumbai', 'Mitali Kumar', true),
  ('tahira-physique57mumbai-com', 'Taahira Sayyed', 'tahira@physique57mumbai.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Mumbai', 'Jimmeey Gondaa', true),
  ('api-physique57bengaluru-com', 'Api Serou', 'api@physique57bengaluru.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Bengaluru', 'Shifa Ali', true),
  ('prathap-physique57bengaluru-com', 'Prathap K P', 'prathap@physique57bengaluru.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Bengaluru', 'Shifa Ali', true),
  ('sheetal-physique57mumbai-com', 'Sheetal Kataria', 'sheetal@physique57mumbai.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Mumbai', 'Jimmeey Gondaa', true),
  ('imran-physique57mumbai-com', 'Imran Shaikh', 'imran@physique57mumbai.com', 'Sales & Client Servicing', 'Sr. Sales & Client Servicing Associate', 'Physique 57, Bandra', 'Jimmeey Gondaa', true),
  ('accounts-physique57mumbai-com', 'Sagar Ingole', 'accounts@physique57mumbai.com', 'Operations', 'Associate', 'Physique 57, Mumbai', 'Zahur Shaikh', true),
  ('vivaran-physique57mumbai-com', 'Vivaran Dhasmana', 'vivaran@physique57mumbai.com', 'Training', 'Trainer', 'Physique 57, Mumbai', 'Anisha Shah', true),
  ('shipra-physique57mumbai-com', 'Shipra Pinge', 'shipra@physique57mumbai.com', 'Sales & Client Servicing', 'Sales & Client Servicing Associate', 'Physique 57, Bandra', 'Jimmeey Gondaa', true),
  ('gaurav-physique57mumbai-com', 'Gaurav Sogam', 'gaurav@physique57mumbai.com', 'Accounts', 'Accounts Assistant', 'Physique 57, Mumbai', 'Sachin Nalawade', true),
  ('pushyank-physique57bengaluru-com', 'Pushyank Nahar', 'pushyank@physique57bengaluru.com', 'Training', 'Trainer', 'Physique 57, Bengaluru', 'Anisha Shah', true),
  ('shifa-physique57bengaluru-com', 'Shifa Ali', 'shifa@physique57bengaluru.com', 'Management', 'Regional Operations Head - South', 'Physique 57, Bengaluru', 'Mitali Kumar', true),
  ('akshay-physique57mumbai-com', 'Akshay Rane', 'akshay@physique57mumbai.com', 'Sales & Client Servicing', 'Sr. Sales & Client Servicing Associate', 'Physique 57, Mumbai', 'Jimmeey Gondaa', true),
  ('mrigakshi-physique57mumbai-com', 'Mrigakshi Jaiswal', 'mrigakshi@physique57mumbai.com', 'Training', 'Trainer', 'Physique 57, Mumbai', 'Anisha Shah', true),
  ('jimmeey-physique57india-com', 'Jimmeey Gondaa', 'jimmeey@physique57india.com', 'Sales & Client Servicing', 'Head - Sales & Client Services', 'Physique 57, Mumbai', 'Mitali Kumar', true),
  ('zahur-physique57mumbai-com', 'Zahur Shaikh', 'zahur@physique57mumbai.com', 'Operations', 'Studio Coordinator', 'Physique 57, Mumbai', 'Saachi Shetty - Operations', true),
  ('anisha-physique57india-com', 'Anisha Shah', 'anisha@physique57india.com', 'Training', 'Master Trainer', 'Physique 57, Mumbai', 'Mitali Kumar', true),
  ('mitali-physique57india-com', 'Mitali Kumar', 'mitali@physique57india.com', 'Management', 'Chief Operating Officer', 'Physique 57, Mumbai', 'Mitali Kumar', true),
  ('reyna', 'Reyna', null, 'Marketing', 'Marketing Lead', 'Physique 57, Mumbai', 'Mitali Kumar', true),
  ('saachi-jr', 'Saachi Jr.', null, 'Marketing', 'Marketing Associate', 'Physique 57, Bengaluru', 'Reyna', true),
  ('jhanvi', 'Jhanvi', null, 'Marketing', 'Social Media', 'Physique 57, Mumbai', 'Reyna', true)
on conflict (id) do update
set
  name = excluded.name,
  email = excluded.email,
  department = excluded.department,
  role = excluded.role,
  location = excluded.location,
  manager = excluded.manager,
  active = excluded.active;

-- Optional but recommended: align existing authenticated profiles with the employee directory.
-- This lets support users match assigned ticket owners by profile full_name/email.
update public.profiles p
set
  full_name = e.name,
  team = e.department,
  updated_at = now()
from public.employees e
where e.email is not null
  and lower(p.email) = lower(e.email);
