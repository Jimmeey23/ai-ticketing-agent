import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  buildTicketEmailAutomationJobs,
  TicketEmailAutomationJob,
  TicketEmailAutomationTicket,
} from '../_shared/ticket-email-automation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ticket-email-automation-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type RequestBody = {
  actor?: string;
  dryRun?: boolean;
  assignmentLookbackHours?: number;
  maxJobs?: number;
};

type AuditRow = {
  event_key: string;
  status: string;
};

const DEFAULT_ASSIGNMENT_LOOKBACK_HOURS = 24;
const DEFAULT_MAX_JOBS = 100;
const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function optionalEnv(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return '';
}

function bearerToken(authorization: string): string {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function isAuthorized(request: Request, serviceRoleKey: string): boolean {
  const automationSecret = optionalEnv('TICKET_EMAIL_AUTOMATION_SECRET');
  const requestSecret = request.headers.get('x-ticket-email-automation-secret') || '';
  return (
    bearerToken(request.headers.get('authorization') || '') === serviceRoleKey ||
    Boolean(automationSecret && requestSecret && requestSecret === automationSecret)
  );
}

function hoursAgoIso(hours: number, now = new Date()): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function indiaBusinessDayUtcBounds(now = new Date()): { startIso: string; endIso: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const utcMidnight = Date.UTC(value('year'), value('month') - 1, value('day'));
  const indiaOffsetMs = 5.5 * 60 * 60 * 1000;
  const start = new Date(utcMidnight - indiaOffsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function uniqueTickets(...groups: TicketEmailAutomationTicket[][]): TicketEmailAutomationTicket[] {
  const byId = new Map<string, TicketEmailAutomationTicket>();
  for (const group of groups) {
    for (const ticket of group) byId.set(ticket.id, ticket);
  }
  return Array.from(byId.values());
}

async function fetchExistingEventKeys(
  admin: ReturnType<typeof createClient>,
  jobs: TicketEmailAutomationJob[],
): Promise<Set<string>> {
  if (!jobs.length) return new Set();

  const keys = jobs.map((job) => job.eventKey);
  const { data, error } = await admin
    .from('ticket_email_notifications')
    .select('event_key,status')
    .in('event_key', keys);

  if (error) throw error;
  return new Set(
    ((data || []) as AuditRow[])
      .filter((row) => row.status !== 'failed')
      .map((row) => row.event_key),
  );
}

async function invokeLifecycleEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  automationSecret: string,
  job: TicketEmailAutomationJob,
  actor: string,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/ticket-email-notifications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      ...(automationSecret ? { 'x-ticket-email-automation-secret': automationSecret } : {}),
    },
    body: JSON.stringify({
      eventType: job.eventType,
      ticketId: job.ticketId,
      actor,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!isAuthorized(request, serviceRoleKey)) return json({ error: 'Unauthorized' }, 401);

    const body = await request.json().catch(() => ({})) as RequestBody;
    const now = new Date();
    const assignmentLookbackHours = Math.max(
      1,
      Math.min(Number(body.assignmentLookbackHours || DEFAULT_ASSIGNMENT_LOOKBACK_HOURS), 168),
    );
    const maxJobs = Math.max(1, Math.min(Number(body.maxJobs || DEFAULT_MAX_JOBS), 500));
    const candidateLimit = Math.min(Math.max(maxJobs * 5, 250), 1000);
    const actor = body.actor || 'SLA Automation';

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const selectColumns = 'id,assigned_to,created_at,updated_at,sla_due_at,status';
    const openStatuses = ['Resolved', 'Closed'];
    const dueTodayBounds = indiaBusinessDayUtcBounds(now);
    const { data: recentlyCreated, error: recentError } = await admin
      .from('tickets')
      .select(selectColumns)
      .not('status', 'in', `(${openStatuses.map((status) => `"${status}"`).join(',')})`)
      .gte('created_at', hoursAgoIso(assignmentLookbackHours, now))
      .order('created_at', { ascending: true })
      .limit(candidateLimit);
    if (recentError) throw recentError;

    const { data: dueWindow, error: dueError } = await admin
      .from('tickets')
      .select(selectColumns)
      .not('status', 'in', `(${openStatuses.map((status) => `"${status}"`).join(',')})`)
      .gte('sla_due_at', dueTodayBounds.startIso)
      .lt('sla_due_at', dueTodayBounds.endIso)
      .order('sla_due_at', { ascending: true })
      .limit(candidateLimit);
    if (dueError) throw dueError;

    const tickets = uniqueTickets(
      (recentlyCreated || []) as TicketEmailAutomationTicket[],
      (dueWindow || []) as TicketEmailAutomationTicket[],
    );
    const assignmentTicketIds = new Set(
      ((recentlyCreated || []) as TicketEmailAutomationTicket[]).map((ticket) => ticket.id),
    );

    const potentialJobs = buildTicketEmailAutomationJobs({
      tickets,
      existingEventKeys: new Set(),
      assignmentTicketIds,
      now,
      timeZone: DEFAULT_TIME_ZONE,
    });
    const existingEventKeys = await fetchExistingEventKeys(admin, potentialJobs);
    const jobs = buildTicketEmailAutomationJobs({
      tickets,
      existingEventKeys,
      assignmentTicketIds,
      now,
      timeZone: DEFAULT_TIME_ZONE,
    }).slice(0, maxJobs);

    if (body.dryRun) {
      return json({
        ok: true,
        dryRun: true,
        ticketsScanned: tickets.length,
        jobs,
      });
    }

    const automationSecret = optionalEnv('TICKET_EMAIL_AUTOMATION_SECRET');
    const sent: unknown[] = [];
    const failed: { job: TicketEmailAutomationJob; error: string }[] = [];

    for (const job of jobs) {
      try {
        sent.push(await invokeLifecycleEmail(supabaseUrl, serviceRoleKey, automationSecret, job, actor));
      } catch (error) {
        failed.push({
          job,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return json({
      ok: failed.length === 0,
      ticketsScanned: tickets.length,
      jobsAttempted: jobs.length,
      sent,
      failed,
    }, failed.length ? 207 : 200);
  } catch (error) {
    console.error('ticket-email-automation failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
