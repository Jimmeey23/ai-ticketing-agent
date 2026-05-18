-- Athena routing backfill
-- Run this after the base schema/access-level SQL to replace legacy placeholder owners
-- with the current Physique 57 employee routing.

create or replace function public.athena_backfill_assignee(ticket_category text, ticket_studio text)
returns text
language sql
immutable
as $$
  select case
    when ticket_category in ('Billing & Membership', 'Pricing and Memberships') then 'Pujal Jathar'
    when ticket_category in ('Class Experience', 'Trainer Feedback', 'Instructor & Class Quality', 'Member Progress & Transformation') then 'Anisha Shah'
    when ticket_category in ('Hosted Class & Partnerships', 'Brand Feedback') then 'Saachi Shetty'
    when ticket_category in ('Facility & Equipment', 'Repair and Maintenance', 'Studio Amenities and Facilities', 'Safety and Security', 'Safety & Medical', 'Theft and Lost Items', 'Operating Systems', 'Tech Issues', 'App & Digital')
      and coalesce(ticket_studio, '') ~* '(bengaluru|bangalore|copper)' then 'Shifa Ali'
    when ticket_category in ('Facility & Equipment', 'Repair and Maintenance', 'Studio Amenities and Facilities', 'Safety and Security', 'Safety & Medical', 'Theft and Lost Items', 'Operating Systems', 'Tech Issues', 'App & Digital') then 'Zahur Shaikh'
    when ticket_category in ('Scheduling', 'Booking & Schedule', 'Front Desk & Service', 'Customer Service and Communication', 'Sales & Consultation')
      and coalesce(ticket_studio, '') ~* '(bengaluru|bangalore|copper)' then 'Yashas K'
    when ticket_category in ('Scheduling', 'Booking & Schedule', 'Front Desk & Service', 'Customer Service and Communication', 'Sales & Consultation')
      and coalesce(ticket_studio, '') ~* '(bandra|supreme)' then 'Deesha Changwani'
    when ticket_category in ('Scheduling', 'Booking & Schedule', 'Front Desk & Service', 'Customer Service and Communication', 'Sales & Consultation') then 'Akshay Rane'
    else 'Nunu Yeptomi'
  end;
$$;

create or replace function public.athena_backfill_team(ticket_category text, assignee text)
returns text
language sql
immutable
as $$
  select case
    when assignee in ('Pujal Jathar', 'Sachin Nalawade', 'Rasika Kalambe', 'Gaurav Sogam') then 'Accounts'
    when assignee in ('Anisha Shah', 'Vivaran Dhasmana', 'Pushyank Nahar', 'Mrigakshi Jaiswal') then 'Training'
    when assignee in ('Saachi Shetty') then 'Marketing'
    when assignee in ('Saachi Shetty - Operations', 'Zahur Shaikh', 'Sagar Ingole') then 'Operations'
    when assignee in ('Shifa Ali', 'Mitali Kumar') then 'Management'
    when assignee in ('Yashas K', 'Deesha Changwani', 'Akshay Rane', 'Jimmeey Gondaa', 'Sashi Singh', 'Vahishta Fitter', 'Nadiya Shaikh', 'Zaheer Agarbattiwala', 'Taahira Sayyed', 'Api Serou', 'Prathap K P', 'Sheetal Kataria', 'Imran Shaikh', 'Shipra Pinge') then 'Sales & Client Servicing'
    when assignee = 'Nunu Yeptomi' then 'Customer Service'
    when ticket_category in ('Billing & Membership', 'Pricing and Memberships') then 'Accounts'
    when ticket_category in ('Class Experience', 'Trainer Feedback', 'Instructor & Class Quality', 'Member Progress & Transformation') then 'Training'
    when ticket_category in ('Hosted Class & Partnerships', 'Brand Feedback') then 'Marketing'
    else 'Customer Service'
  end;
$$;

create or replace function public.athena_backfill_escalation(assignee text)
returns text
language sql
immutable
as $$
  select case assignee
    when 'Yashas K' then 'Shifa Ali'
    when 'Sashi Singh' then 'Shifa Ali'
    when 'Nunu Yeptomi' then 'Shifa Ali'
    when 'Api Serou' then 'Shifa Ali'
    when 'Prathap K P' then 'Shifa Ali'
    when 'Shifa Ali' then 'Mitali Kumar'
    when 'Akshay Rane' then 'Jimmeey Gondaa'
    when 'Deesha Changwani' then 'Jimmeey Gondaa'
    when 'Vahishta Fitter' then 'Jimmeey Gondaa'
    when 'Nadiya Shaikh' then 'Jimmeey Gondaa'
    when 'Zaheer Agarbattiwala' then 'Jimmeey Gondaa'
    when 'Taahira Sayyed' then 'Jimmeey Gondaa'
    when 'Sheetal Kataria' then 'Jimmeey Gondaa'
    when 'Imran Shaikh' then 'Jimmeey Gondaa'
    when 'Shipra Pinge' then 'Jimmeey Gondaa'
    when 'Jimmeey Gondaa' then 'Mitali Kumar'
    when 'Pujal Jathar' then 'Sachin Nalawade'
    when 'Rasika Kalambe' then 'Sachin Nalawade'
    when 'Gaurav Sogam' then 'Sachin Nalawade'
    when 'Sachin Nalawade' then 'Mitali Kumar'
    when 'Zahur Shaikh' then 'Saachi Shetty - Operations'
    when 'Sagar Ingole' then 'Zahur Shaikh'
    when 'Saachi Shetty - Operations' then 'Mitali Kumar'
    when 'Saachi Shetty' then 'Shifa Ali'
    when 'Vivaran Dhasmana' then 'Anisha Shah'
    when 'Pushyank Nahar' then 'Anisha Shah'
    when 'Mrigakshi Jaiswal' then 'Anisha Shah'
    when 'Anisha Shah' then 'Mitali Kumar'
    else 'Mitali Kumar'
  end;
$$;

with routed as (
  select
    id,
    athena_backfill_assignee(category, studio) as new_assignee
  from public.tickets
  where assigned_to is null
     or assigned_to in (
       'Rahul Mehta',
       'Neha Kapoor',
       'Priya Sharma',
       'Sanya Iyer',
       'Vikram Singh',
       'Arjun Nair',
       'Aditya Verma',
       'Admin Admin',
       'Unassigned',
       '-'
     )
     or assigned_to not in (
       'Yashas K',
       'Pujal Jathar',
       'Rasika Kalambe',
       'Sashi Singh',
       'Deesha Changwani',
       'Vahishta Fitter',
       'Nadiya Shaikh',
       'Saachi Shetty',
       'Zaheer Agarbattiwala',
       'Nunu Yeptomi',
       'Sachin Nalawade',
       'Saachi Shetty - Operations',
       'Taahira Sayyed',
       'Api Serou',
       'Prathap K P',
       'Sheetal Kataria',
       'Imran Shaikh',
       'Sagar Ingole',
       'Vivaran Dhasmana',
       'Shipra Pinge',
       'Gaurav Sogam',
       'Pushyank Nahar',
       'Shifa Ali',
       'Akshay Rane',
       'Mrigakshi Jaiswal',
       'Jimmeey Gondaa',
       'Zahur Shaikh',
       'Anisha Shah',
       'Mitali Kumar'
     )
)
update public.tickets t
set
  assigned_to = routed.new_assignee,
  team = athena_backfill_team(t.category, routed.new_assignee),
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'routing',
    jsonb_build_object(
      'department', athena_backfill_team(t.category, routed.new_assignee),
      'assigned_to', routed.new_assignee,
      'next_escalation', athena_backfill_escalation(routed.new_assignee),
      'status', t.status,
      'priority', t.priority,
      'sla_due_at', t.sla_due_at,
      'routing_source', 'athena_employee_directory_backfill'
    )
  ),
  updated_at = now()
from routed
where t.id = routed.id;

drop function if exists public.athena_backfill_assignee(text, text);
drop function if exists public.athena_backfill_team(text, text);
drop function if exists public.athena_backfill_escalation(text);
