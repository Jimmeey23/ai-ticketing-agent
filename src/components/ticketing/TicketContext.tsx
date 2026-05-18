import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { ASSOCIATES, getEmployee, getEscalationTarget, isTicketBreached, PRIORITY_SLA, resolveTicketAssignee, resolveTicketDepartment, Ticket } from '@/lib/ticketing-data';
import { backendSupabase } from '@/lib/backend-supabase';
import { toast } from '@/components/ui/sonner';
import { useBackendAuth } from '@/contexts/BackendAuthContext';
import { ResolvedAssignment, resolveConfiguredAssignment } from '@/lib/routing-settings';

interface TicketContextValue {
  tickets: Ticket[];
  loading: boolean;
  error: string | null;
  updateTicket: (id: string, patch: Partial<Ticket>, actor?: string) => Promise<void>;
  createApprovedTicket: (draft: DraftTicket, conversationId?: string | null, context?: Record<string, unknown>) => Promise<Ticket>;
  createManualTicket: (draft: ManualTicketInput) => Promise<Ticket>;
  deleteTicket: (id: string) => Promise<void>;
  selectedTicket: Ticket | null;
  setSelectedTicket: (t: Ticket | null) => void;
  refresh: () => Promise<void>;
}

interface DraftTicket {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: Ticket['priority'];
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  reportedBy?: string | null;
  tags: string[];
  sentiment?: string;
  conversationSummary?: string;
}

export interface ManualTicketInput {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: Ticket['priority'];
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  assignedTo?: string | null;
  tags?: string[];
  sentiment?: string;
}

const TicketContext = createContext<TicketContextValue | null>(null);

interface HistoricTicketRow {
  ticket_id: string;
  issue_summary: string;
  complaint_category: string;
  complaint_subcategory: string;
  priority: string;
  current_status: string;
  customer_name?: string;
  customer_email?: string;
  ownership?: string;
  intelligence_bucket?: string;
  date_opened: string;
  last_response_date?: string;
  key_customer_statements?: string[];
  internal_risk_flags?: string[];
  recommended_actions?: string[];
  email_type?: string;
  cx_ticket_confidence?: string;
  sentiment?: {
    emotional_tone?: string;
    frustration_level?: string;
    churn_likelihood?: string;
  };
}

interface DbTicketRow {
  id: string;
  source_ref?: string | null;
  title: string;
  description?: string | null;
  category: string;
  sub_category: string;
  priority: Ticket['priority'];
  status: Ticket['status'];
  studio: string;
  trainer?: string | null;
  class_type?: string | null;
  class_date_time?: string | null;
  member_name?: string | null;
  member_contact?: string | null;
  reported_by?: string | null;
  assigned_to: string;
  team: string;
  tags?: string[] | null;
  sentiment?: Ticket['sentiment'] | null;
  conversation_summary?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  created_by?: string | null;
  sla_due_at: string;
}

type DbTicketPatch = Record<string, unknown>;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const parts = [
      typeof value.message === 'string' ? value.message : '',
      typeof value.details === 'string' ? value.details : '',
      typeof value.hint === 'string' ? value.hint : '',
      typeof value.code === 'string' ? `Code: ${value.code}` : '',
    ].filter(Boolean);
    if (parts.length) return parts.join(' ');
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function throwSupabaseError(error: unknown, fallback: string): never {
  throw new Error(getErrorMessage(error, fallback));
}

function getMissingColumnName(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const value = error as Record<string, unknown>;
  if (value.code !== '42703') return null;
  const message = typeof value.message === 'string' ? value.message : '';
  const details = typeof value.details === 'string' ? value.details : '';
  const match = `${message} ${details}`.match(/column "([^"]+)"/i);
  return match?.[1] || null;
}

function removeUnsupportedTicketColumn(row: DbTicketPatch, column: string): DbTicketPatch {
  if (!(column in row)) return row;
  const next = { ...row };
  delete next[column];
  return next;
}

function normalizeHistoricStatus(status: string): Ticket['status'] {
  const normalized = status?.toLowerCase();
  if (normalized === 'resolved') return 'Resolved';
  if (normalized === 'awaiting_customer_response') return 'Awaiting Member';
  return 'In Progress';
}

function normalizePriority(priority: string): Ticket['priority'] {
  if (priority === 'Critical' || priority === 'High' || priority === 'Medium' || priority === 'Low') {
    return priority;
  }
  return 'Medium';
}

function toIsoDate(value?: string): string {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function tagFrom(value?: string): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || null;
}

function buildHistoricTags(row: HistoricTicketRow): string[] {
  const tags = [
    'historic',
    tagFrom(row.email_type),
    tagFrom(row.intelligence_bucket),
    row.cx_ticket_confidence ? `confidence-${row.cx_ticket_confidence.toLowerCase()}` : null,
    tagFrom(row.complaint_category),
    tagFrom(row.complaint_subcategory),
  ].filter(Boolean) as string[];

  return Array.from(new Set(tags));
}

function normalizeTicketOwner(category: string, studio?: string | null, assignedTo?: string | null): string {
  if (assignedTo && getEmployee(assignedTo)) return assignedTo;
  return resolveTicketAssignee(category, studio || undefined);
}

function normalizeTicketTeam(category: string, assignedTo: string): string {
  return resolveTicketDepartment(category, assignedTo);
}

function mapHistoricTicket(row: HistoricTicketRow): Ticket {
  const createdAt = toIsoDate(row.date_opened);
  const slaDueAt = toIsoDate(row.last_response_date || row.date_opened);
  const title = row.issue_summary.length > 140 ? `${row.issue_summary.slice(0, 137)}...` : row.issue_summary;
  const assignedTo = normalizeTicketOwner(row.complaint_category, 'Historic Import', row.ownership);
  const team = normalizeTicketTeam(row.complaint_category, assignedTo);
  const conversationSummary = [
    row.key_customer_statements?.length ? `Key statements: ${row.key_customer_statements.join(' | ')}` : '',
    row.internal_risk_flags?.length ? `Risk flags: ${row.internal_risk_flags.join(' | ')}` : '',
    row.recommended_actions?.length ? `Recommended actions: ${row.recommended_actions.join(' | ')}` : '',
    row.email_type ? `Email type: ${row.email_type}` : '',
    row.cx_ticket_confidence ? `CX confidence: ${row.cx_ticket_confidence}` : '',
  ].filter(Boolean).join('\n');

  return {
    id: row.ticket_id,
    title,
    description: row.issue_summary,
    category: row.complaint_category,
    subCategory: row.complaint_subcategory,
    priority: normalizePriority(row.priority),
    status: normalizeHistoricStatus(row.current_status),
    studio: 'Historic Import',
    memberName: row.customer_name || undefined,
    memberContact: row.customer_email || undefined,
    reportedBy: row.email_type || undefined,
    assignedTo,
    team,
    tags: buildHistoricTags(row),
    createdAt,
    slaDueAt,
    sentiment: row.sentiment?.frustration_level === 'High' ? 'Angry' : undefined,
    conversationSummary,
  };
}

// DB row → UI Ticket
function fromRow(row: DbTicketRow): Ticket {
  const assignedTo = normalizeTicketOwner(row.category, row.studio, row.assigned_to);
  const team = normalizeTicketTeam(row.category, assignedTo);

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    category: row.category,
    subCategory: row.sub_category,
    priority: row.priority,
    status: row.status,
    studio: row.studio,
    trainer: row.trainer || undefined,
    classType: row.class_type || undefined,
    classDateTime: row.class_date_time || undefined,
    memberName: row.member_name || undefined,
    memberContact: row.member_contact || undefined,
    reportedBy: row.reported_by || undefined,
    assignedTo,
    team,
    tags: row.tags || [],
    sentiment: row.sentiment || undefined,
    conversationSummary: row.conversation_summary || undefined,
    createdAt: row.created_at,
    createdBy: row.created_by || undefined,
    slaDueAt: row.sla_due_at,
    sourceRef: row.source_ref || (typeof row.metadata?.source_ref === 'string' ? row.metadata.source_ref : undefined),
  };
}

function ticketDedupeKey(ticket: Ticket): string {
  if (ticket.sourceRef) return `source:${ticket.sourceRef}`;
  const title = ticket.title.trim().toLowerCase();
  const member = (ticket.memberContact || ticket.memberName || '').trim().toLowerCase();
  const createdDay = Number.isNaN(new Date(ticket.createdAt).getTime())
    ? ''
    : new Date(ticket.createdAt).toISOString().slice(0, 10);
  return `fingerprint:${title}|${ticket.category}|${ticket.subCategory}|${member}|${createdDay}`;
}

function dedupeAndSortTickets(tickets: Ticket[]): Ticket[] {
  const byKey = new Map<string, Ticket>();
  for (const ticket of tickets) {
    const key = ticketDedupeKey(ticket);
    const current = byKey.get(key);
    if (!current || new Date(ticket.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      byKey.set(key, ticket);
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function normalizeCreatedTicket(created: DbTicketRow | Ticket): Ticket {
  if ('sub_category' in created) return fromRow(created);
  return created;
}

function getReporterNameFromAuthUser(user?: { email?: string; user_metadata?: Record<string, unknown> } | null): string {
  const metadata = user?.user_metadata || {};
  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  return fullName || name || user?.email || 'Authenticated user';
}

function cleanInlineMarkdown(value: string): string {
  return value.replace(/\*\*(.*?)\*\*/g, '$1').trim();
}

function formatTicketBody(value: string): string {
  const lines = value
    .split('\n')
    .map((line) => cleanInlineMarkdown(line))
    .filter((line) => line && !/^(\*{3,}|-{3,})$/.test(line));

  if (lines.some((line) => /^[-*]\s+/.test(line)) || lines.length <= 1) {
    return lines.join('\n');
  }

  return lines.map((line) => {
    if (/^[A-Z][A-Za-z0-9/&().,'’ -]{2,48}:/.test(line)) return `- ${line}`;
    if (/^(member|client|community member|guest|prospect|host|trainer)\b/i.test(line)) return `- ${line}`;
    return line;
  }).join('\n');
}

function extractCreatedTicket(data: unknown, depth = 0): DbTicketRow | Ticket | null {
  if (!data || depth > 5) return null;

  if (typeof data === 'string') {
    try {
      return extractCreatedTicket(JSON.parse(data), depth + 1);
    } catch {
      return null;
    }
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = extractCreatedTicket(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if ('id' in value && ('title' in value || 'description' in value)) return value as unknown as DbTicketRow | Ticket;

  for (const key of ['createdTicket', 'created_ticket', 'ticket', 'data', 'record', 'inserted', 'result', 'body']) {
    const found = extractCreatedTicket(value[key], depth + 1);
    if (found) return found;
  }

  for (const candidate of Object.values(value)) {
    const found = extractCreatedTicket(candidate, depth + 1);
    if (found) return found;
  }

  return null;
}

function extractCreatedTicketId(data: unknown, depth = 0): string | null {
  if (!data || depth > 5) return null;
  if (typeof data === 'string') return /^[A-Za-z0-9_-]+$/.test(data) ? data : null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = extractCreatedTicketId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof data !== 'object') return null;

  const value = data as Record<string, unknown>;
  for (const key of ['id', 'ticketId', 'ticket_id', 'createdTicketId', 'created_ticket_id']) {
    if (typeof value[key] === 'string') return value[key] as string;
    if (typeof value[key] === 'number') return String(value[key]);
  }

  for (const candidate of Object.values(value)) {
    const found = extractCreatedTicketId(candidate, depth + 1);
    if (found) return found;
  }
  return null;
}

// UI patch → DB patch (snake_case mapping)
function toRowPatch(patch: Partial<Ticket>): DbTicketPatch {
  const map: Record<string, string> = {
    title: 'title',
    description: 'description',
    category: 'category',
    subCategory: 'sub_category',
    priority: 'priority',
    status: 'status',
    studio: 'studio',
    trainer: 'trainer',
    classType: 'class_type',
    classDateTime: 'class_date_time',
    memberName: 'member_name',
    memberContact: 'member_contact',
    reportedBy: 'reported_by',
    assignedTo: 'assigned_to',
    team: 'team',
    tags: 'tags',
    sentiment: 'sentiment',
    conversationSummary: 'conversation_summary',
    slaDueAt: 'sla_due_at',
  };
  const out: DbTicketPatch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!map[k]) continue;
    out[map[k]] = k === 'description' && typeof v === 'string' ? formatTicketBody(v) : v;
  }
  return out;
}

function computeSlaDueAt(priority: Ticket['priority']): string {
  const hours = PRIORITY_SLA[priority]?.hours || PRIORITY_SLA.Medium.hours;
  const dueAt = new Date();
  dueAt.setHours(dueAt.getHours() + hours);
  return dueAt.toISOString();
}

function resolveTeam(assignedTo: string, category: string): string {
  return resolveTicketDepartment(category, assignedTo);
}

function buildSourceRef(draft: DraftTicket, context: Record<string, unknown> = {}, conversationId?: string | null): string {
  const explicitConversationId =
    conversationId ||
    (typeof context.conversationId === 'string' ? context.conversationId : null);
  if (explicitConversationId) return `approved-draft:${explicitConversationId}`;

  const seed = [
    draft.title,
    draft.category,
    draft.subCategory,
    draft.memberName || '',
    draft.memberContact || '',
    draft.studio || '',
    draft.description.slice(0, 180),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `approved-draft:${Math.abs(hash).toString(36)}`;
}

function toInsertRow(draft: DraftTicket, context: Record<string, unknown> = {}, assignment?: ResolvedAssignment): DbTicketPatch {
  const assignedTo = assignment?.assignedTo || resolveTicketAssignee(draft.category, draft.studio);
  const team = assignment?.team || resolveTeam(assignedTo, draft.category);
  const nextEscalation = assignment?.nextEscalation || getEscalationTarget(assignedTo);
  const priority = assignment?.priority || draft.priority;
  const slaDueAt = assignment?.slaHours
    ? new Date(Date.now() + assignment.slaHours * 60 * 60 * 1000).toISOString()
    : computeSlaDueAt(priority);
  const formattedDescription = formatTicketBody(draft.description);
  const metadata = {
    source_ref: buildSourceRef(draft, context),
    intake_context: context,
      routing: {
        department: team,
        assigned_to: assignedTo,
        owner_pool: assignment?.ownerPool || [assignedTo],
        next_escalation: nextEscalation,
      priority,
      sla_due_at: slaDueAt,
      status: 'New',
      routing_source: assignment?.source || 'athena_employee_directory',
    },
    dynamic_fields: Object.fromEntries(
      Object.entries(context).filter(([key, value]) =>
        value != null &&
        value !== '' &&
        ![
          'intakeRoute',
          'category',
          'subCategory',
          'studio',
          'trainer',
          'classType',
          'classDateTime',
          'memberName',
          'memberContact',
          'reportedBy',
          'priority',
          'description',
        ].includes(key)
      )
    ),
  };

  return {
    source_ref: metadata.source_ref,
    title: draft.title,
    description: formattedDescription,
    category: draft.category,
    sub_category: draft.subCategory,
    priority,
    status: 'New',
    studio: draft.studio || 'Unspecified Studio',
    trainer: draft.trainer || null,
    class_type: draft.classType || null,
    class_date_time: draft.classDateTime || null,
    member_name: draft.memberName || null,
    member_contact: draft.memberContact || null,
    reported_by: draft.reportedBy || null,
    assigned_to: assignedTo,
    team,
    tags: Array.from(new Set([...(draft.tags || []), 'ai-approved', assignment?.source || 'default-routing'])),
    sentiment: draft.sentiment || null,
    conversation_summary: draft.conversationSummary || formattedDescription,
    sla_due_at: slaDueAt,
    metadata,
  };
}

function manualInputToDraft(input: ManualTicketInput, reporterName: string): DraftTicket {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    subCategory: input.subCategory,
    priority: input.priority,
    studio: input.studio || 'Unspecified Studio',
    trainer: input.trainer || null,
    classType: input.classType || null,
    classDateTime: input.classDateTime || null,
    memberName: input.memberName || null,
    memberContact: input.memberContact || null,
    reportedBy: reporterName,
    tags: Array.from(new Set(['manual-entry', ...(input.tags || [])])),
    sentiment: input.sentiment,
    conversationSummary: input.description.trim(),
  };
}

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, accessRole } = useBackendAuth();
  const [liveTickets, setLiveTickets] = useState<Ticket[]>([]);
  const [historicTickets, setHistoricTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicketState] = useState<Ticket | null>(null);

  const visibleIdentityValues = useMemo(() => {
    const values = [
      user?.id,
      user?.email,
      profile?.email,
      profile?.full_name,
      typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
      typeof user?.user_metadata?.name === 'string' ? user.user_metadata.name : null,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    return new Set(values);
  }, [profile?.email, profile?.full_name, user]);

  const canSeeTicket = useCallback((ticket: Ticket) => {
    if (accessRole === 'admin') return true;
    const candidates = [
      ticket.createdBy,
      ticket.assignedTo,
      ticket.reportedBy,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    return candidates.some((value) => visibleIdentityValues.has(value));
  }, [accessRole, visibleIdentityValues]);

  const tickets = useMemo(() => {
    const byId = new Map<string, Ticket>();
    for (const ticket of historicTickets) byId.set(ticket.id, ticket);
    for (const ticket of liveTickets) byId.set(ticket.id, ticket);
    return dedupeAndSortTickets(Array.from(byId.values()).filter(canSeeTicket));
  }, [canSeeTicket, historicTickets, liveTickets]);

  const fetchHistoricTickets = useCallback(async () => {
    const response = await fetch('/tickets.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to load historic tickets (${response.status})`);
    }
    const rows = await response.json() as HistoricTicketRow[];
    setHistoricTickets(rows.map(mapHistoricTicket));
  }, [canSeeTicket]);

  const fetchTickets = useCallback(async () => {
    const { data, error } = await backendSupabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
      return;
    }
    setLiveTickets(((data || []) as DbTicketRow[]).map(fromRow));
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    const failures: string[] = [];
    await Promise.all([
      fetchHistoricTickets().catch((e: unknown) => failures.push(getErrorMessage(e, 'Historic ticket load failed'))),
      fetchTickets().catch((e: unknown) => failures.push(getErrorMessage(e, 'Live ticket load failed'))),
    ]);
    if (failures.length) setError(failures.join(' · '));
  }, [fetchHistoricTickets, fetchTickets]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        await refresh();
      } catch (e: unknown) {
        if (mounted) setError(getErrorMessage(e, 'Ticket load failed'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [refresh]);

  // Realtime subscription on tickets
  useEffect(() => {
    const channel = backendSupabase
      .channel('tickets-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const t = fromRow(payload.new as DbTicketRow);
            if (!canSeeTicket(t)) return;
            setLiveTickets((prev) => {
              if (prev.some((x) => x.id === t.id)) return prev;
              return [t, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const t = fromRow(payload.new as DbTicketRow);
            if (!canSeeTicket(t)) {
              setLiveTickets((prev) => prev.filter((x) => x.id !== t.id));
              setSelectedTicketState((prev) => (prev?.id === t.id ? null : prev));
              return;
            }
            setLiveTickets((prev) => prev.map((x) => (x.id === t.id ? t : x)));
            setSelectedTicketState((prev) => (prev && prev.id === t.id ? t : prev));
          } else if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id;
            if (!id) return;
            setLiveTickets((prev) => prev.filter((x) => x.id !== id));
          }
        }
      )
      .subscribe();
    return () => { backendSupabase.removeChannel(channel); };
  }, [canSeeTicket]);

  const updateTicket = useCallback(
    async (id: string, patch: Partial<Ticket>, actor = 'Athena') => {
      const rowPatch = toRowPatch(patch);

      // Get current ticket to compute event diff
      const current = tickets.find((t) => t.id === id);

      // Optimistic update
      setLiveTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      setHistoricTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      setSelectedTicketState((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));

      const { error } = await backendSupabase.from('tickets').update(rowPatch).eq('id', id);
      if (error) {
        console.error('Update ticket error:', error);
        // Revert via refresh
        await refresh();
        return;
      }

      // Log events for important changes
      if (current) {
        if (patch.status && patch.status !== current.status) {
          await backendSupabase.from('ticket_events').insert({
            ticket_id: id,
            event_type: 'status_change',
            actor,
            from_value: current.status,
            to_value: patch.status,
          });
        }
        if (patch.assignedTo && patch.assignedTo !== current.assignedTo) {
          await backendSupabase.from('ticket_events').insert({
            ticket_id: id,
            event_type: 'assignment_change',
            actor,
            from_value: current.assignedTo,
            to_value: patch.assignedTo,
          });
        }
        if (patch.priority && patch.priority !== current.priority) {
          await backendSupabase.from('ticket_events').insert({
            ticket_id: id,
            event_type: 'priority_change',
            actor,
            from_value: current.priority,
            to_value: patch.priority,
          });
        }
      }
    },
    [tickets, refresh]
  );

  const createManualTicket = useCallback(
    async (input: ManualTicketInput) => {
      const { data: authData } = await backendSupabase.auth.getSession();
      const reporterName = getReporterNameFromAuthUser(authData.session?.user);
      const draft = manualInputToDraft(input, reporterName);
      const configuredAssignment = await resolveConfiguredAssignment(input.category, input.subCategory, input.studio);
      const assignedTo = input.assignedTo || configuredAssignment.assignedTo;
      const assignment = input.assignedTo
        ? {
            ...configuredAssignment,
            assignedTo,
            team: resolveTeam(assignedTo, input.category),
            nextEscalation: getEscalationTarget(assignedTo),
          }
        : configuredAssignment;
      const row = {
        ...toInsertRow(draft, { source: 'manual_ticket' }, assignment),
        assigned_to: assignedTo,
        team: resolveTeam(assignedTo, input.category),
        created_by: authData.session?.user.id,
      };
      row.metadata = {
        ...((row.metadata as Record<string, unknown>) || {}),
        routing: {
          ...(((row.metadata as Record<string, unknown>)?.routing as Record<string, unknown>) || {}),
          assigned_to: assignedTo,
          department: resolveTeam(assignedTo, input.category),
          next_escalation: getEscalationTarget(assignedTo),
        },
      };

      let rowForInsert = row;
      let created: DbTicketRow | null = null;
      let createError: unknown = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await backendSupabase
          .from('tickets')
          .insert(rowForInsert)
          .select('*')
          .single();

        if (!error) {
          created = data as DbTicketRow;
          createError = null;
          break;
        }

        createError = error;
        const missingColumn = getMissingColumnName(error);
        if (!missingColumn || !(missingColumn in rowForInsert)) break;
        rowForInsert = removeUnsupportedTicketColumn(rowForInsert, missingColumn);
      }

      if (createError || !created) throwSupabaseError(createError, 'Manual ticket creation failed');

      const ticket = normalizeCreatedTicket(created);
      setLiveTickets((prev) => dedupeAndSortTickets([ticket, ...prev]));
      setSelectedTicketState(ticket);
      await refresh();
      return ticket;
    },
    [refresh]
  );

  const deleteTicket = useCallback(
    async (id: string) => {
      const current = tickets.find((ticket) => ticket.id === id);
      setLiveTickets((prev) => prev.filter((ticket) => ticket.id !== id));
      setSelectedTicketState((prev) => (prev?.id === id ? null : prev));

      const { error } = await backendSupabase.from('tickets').delete().eq('id', id);
      if (error) {
        if (current?.tags.includes('historic')) {
          setHistoricTickets((prev) => prev.filter((ticket) => ticket.id !== id));
          return;
        }
        await refresh();
        throwSupabaseError(error, 'Ticket deletion failed');
      }
      await refresh();
    },
    [tickets, refresh]
  );

  const createApprovedTicket = useCallback(
    async (draft: DraftTicket, conversationId?: string | null, context?: Record<string, unknown>) => {
      const { data: authData } = await backendSupabase.auth.getSession();
      const signedInReporter = getReporterNameFromAuthUser(authData.session?.user);
      const publishDraft = {
        ...draft,
        reportedBy: signedInReporter,
      };
      const publishContext = { ...(context || {}), reportedBy: signedInReporter };
      const sourceRef = buildSourceRef(draft, context || {}, conversationId);
      const configuredAssignment = await resolveConfiguredAssignment(publishDraft.category, publishDraft.subCategory, publishDraft.studio);
      const insertRow = {
        ...toInsertRow(publishDraft, { ...publishContext, conversationId }, configuredAssignment),
        created_by: authData.session?.user.id,
      };

      const findExistingTicket = async () => {
        const byMetadata = await backendSupabase
          .from('tickets')
          .select('*')
          .contains('metadata', { source_ref: sourceRef })
          .maybeSingle();
        if (!byMetadata.error || byMetadata.data) return byMetadata;

        const bySourceRef = await backendSupabase
          .from('tickets')
          .select('*')
          .eq('source_ref', sourceRef)
          .maybeSingle();
        if (bySourceRef.error?.code === '42703') return byMetadata;
        return bySourceRef;
      };

      const { data: existing, error: existingError } = await findExistingTicket();
      if (existingError && existingError.code !== 'PGRST116') {
        console.warn('Existing ticket lookup failed:', getErrorMessage(existingError, 'Unknown lookup error'));
      }

      if (existing) return normalizeCreatedTicket(existing as DbTicketRow);

      let rowForInsert = insertRow;
      let created: DbTicketRow | null = null;
      let createError: unknown = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await backendSupabase
          .from('tickets')
          .insert(rowForInsert)
          .select('*')
          .single();

        if (!error) {
          created = data as DbTicketRow;
          createError = null;
          break;
        }

        createError = error;
        const missingColumn = getMissingColumnName(error);
        if (!missingColumn || !(missingColumn in rowForInsert)) break;
        rowForInsert = removeUnsupportedTicketColumn(rowForInsert, missingColumn);
      }

      if (createError || !created) {
        const error = createError as { code?: string } | null;
        if (error?.code === '23505') {
          const { data: duplicated, error: duplicateFetchError } = await findExistingTicket();
          if (duplicated) return normalizeCreatedTicket(duplicated as DbTicketRow);
          if (duplicateFetchError) throwSupabaseError(duplicateFetchError, 'Could not fetch the existing approved ticket');
        }
        throwSupabaseError(createError, 'Ticket creation failed');
      }

      const { error: eventError } = await backendSupabase.from('ticket_events').insert({
        ticket_id: created.id,
        event_type: 'ticket_created',
        actor: signedInReporter,
        to_value: 'New',
        metadata: {
          conversationId,
          source: 'approved_draft',
        },
        created_by: authData.session?.user.id,
      });
      if (eventError) {
        console.warn('Ticket event logging failed:', getErrorMessage(eventError, 'Unknown ticket event error'));
      }

      await refresh();
      return normalizeCreatedTicket(created as DbTicketRow | Ticket);
    },
    [refresh]
  );

  useEffect(() => {
    const breached = tickets.filter((ticket) => isTicketBreached(ticket));
    for (const ticket of breached) {
      const alreadyEscalated = ticket.tags.includes('sla-breached') || ticket.tags.includes('escalated');
      const target = getEscalationTarget(ticket.assignedTo);

      if (import.meta.env.PROD) {
        toast.warning(`SLA breached: ${ticket.title}`, {
          id: `sla-${ticket.id}`,
          description: `Escalating from ${ticket.assignedTo} to ${target}.`,
          duration: Infinity,
        });
      }

      if (alreadyEscalated || ticket.assignedTo === target) continue;

      const nextTags = Array.from(new Set([...ticket.tags, 'sla-breached', 'escalated']));
      const patch: Partial<Ticket> = {
        assignedTo: target,
        priority: 'Critical',
        tags: nextTags,
      };

      if (ticket.tags.includes('historic')) {
        setHistoricTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, ...patch } : t)));
        setSelectedTicketState((prev) => (prev && prev.id === ticket.id ? { ...prev, ...patch } : prev));
      } else {
        void updateTicket(ticket.id, patch, 'SLA Automation');
      }
    }
  }, [tickets, updateTicket]);

  return (
    <TicketContext.Provider
      value={{
        tickets,
        loading,
        error,
        updateTicket,
        createApprovedTicket,
        createManualTicket,
        deleteTicket,
        selectedTicket,
        setSelectedTicket: setSelectedTicketState,
        refresh,
      }}
    >
      {children}
    </TicketContext.Provider>
  );
};

export const useTickets = () => {
  const ctx = useContext(TicketContext);
  if (!ctx) throw new Error('useTickets must be used within TicketProvider');
  return ctx;
};
