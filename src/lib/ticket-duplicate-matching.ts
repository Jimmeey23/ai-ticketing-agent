import { Ticket } from './ticketing-data';

export interface DuplicateTicketContext {
  memberName?: string | null;
  memberContact?: string | null;
  studio?: string | null;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  incidentDateTime?: string | null;
  category?: string | null;
  subCategory?: string | null;
  sessionId?: string | null;
}

const GENERIC_ISSUE_TYPES = new Set(['', 'other', 'member reported issue', 'member-reported issue', 'general feedback']);

function normalizeComparable(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitMultiValue(value?: string | null): string[] {
  return (value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTicketSearchText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2 && ![
          'the',
          'and',
          'for',
          'with',
          'from',
          'this',
          'that',
          'member',
          'client',
          'class',
          'studio',
          'house',
          'kwality',
          'kemps',
          'corner',
          'bandra',
          'mumbai',
          'bengaluru',
          'bangalore',
        ].includes(token))
    )
  );
}

function ticketCategoryFamily(category?: string | null): string {
  const value = (category || '').toLowerCase();
  if (/(billing|membership|pricing|refund|payment|charge)/.test(value)) return 'billing';
  if (/(facility|equipment|repair|amenit|safety|medical|theft|operating|tech|app)/.test(value)) return 'operations';
  if (/(trainer|instructor|class experience|progress|transformation)/.test(value)) return 'class';
  if (/(hosted|partnership|brand)/.test(value)) return 'partnership';
  if (/(booking|schedul|front desk|service|sales|consultation)/.test(value)) return 'service';
  return value || 'general';
}

function isGenericIssueType(value?: string | null): boolean {
  return GENERIC_ISSUE_TYPES.has(normalizeComparable(value));
}

function hasExactIdentityMatch(ctx: DuplicateTicketContext, ticket: Ticket): boolean {
  const memberName = ctx.memberName?.trim().toLowerCase();
  const memberContact = ctx.memberContact?.trim().toLowerCase();
  return Boolean(
    (memberName && ticket.memberName?.toLowerCase() === memberName) ||
    (memberContact && ticket.memberContact?.toLowerCase() === memberContact)
  );
}

function hasProvidedIdentity(ctx: DuplicateTicketContext): boolean {
  return Boolean(ctx.memberName?.trim() || ctx.memberContact?.trim());
}

function issueTypeMatches(ctx: DuplicateTicketContext, ticket: Ticket): boolean {
  if (ctx.category && ticketCategoryFamily(ctx.category) !== ticketCategoryFamily(ticket.category)) return false;
  if (!ctx.subCategory || isGenericIssueType(ctx.subCategory)) return true;
  if (!ticket.subCategory || isGenericIssueType(ticket.subCategory)) return false;
  return normalizeComparable(ctx.subCategory) === normalizeComparable(ticket.subCategory);
}

function metadataContext(ticket: Ticket): Record<string, unknown> {
  const metadata = ticket.metadata;
  if (!metadata || typeof metadata !== 'object') return {};
  const rawContext = (metadata as Record<string, unknown>).intake_context;
  return rawContext && typeof rawContext === 'object' ? rawContext as Record<string, unknown> : {};
}

function contextString(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : '';
}

function localDateTimeKey(value: string, precision: 'date' | 'minute'): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dateKey = `${lookup.year}-${lookup.month}-${lookup.day}`;
  return precision === 'date' ? dateKey : `${dateKey}T${lookup.hour}:${lookup.minute}`;
}

function dateKeys(value?: string | null, precision: 'date' | 'minute' = 'minute'): Set<string> {
  return new Set(
    splitMultiValue(value)
      .map((item) => localDateTimeKey(item, precision))
      .filter(Boolean) as string[]
  );
}

function hasIntersection(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function ticketSessionIds(ticket: Ticket): Set<string> {
  const rawContext = metadataContext(ticket);
  return new Set(splitMultiValue(contextString(rawContext, 'sessionId')).map((value) => value.toLowerCase()));
}

function contextSessionIds(ctx: DuplicateTicketContext): Set<string> {
  return new Set(splitMultiValue(ctx.sessionId).map((value) => value.toLowerCase()));
}

function sessionDateMatches(ctx: DuplicateTicketContext, ticket: Ticket): boolean {
  const rawContext = metadataContext(ticket);
  const inputDates = dateKeys(ctx.classDateTime, 'minute');
  const ticketDates = new Set([
    ...dateKeys(ticket.classDateTime, 'minute'),
    ...dateKeys(contextString(rawContext, 'classDateTime'), 'minute'),
  ]);
  return inputDates.size > 0 && ticketDates.size > 0 && hasIntersection(inputDates, ticketDates);
}

function sessionAnchorMatches(ctx: DuplicateTicketContext, ticket: Ticket): boolean {
  const inputSessionIds = contextSessionIds(ctx);
  if (inputSessionIds.size === 0) return true;
  const existingSessionIds = ticketSessionIds(ticket);
  if (existingSessionIds.size > 0) return hasIntersection(inputSessionIds, existingSessionIds);
  return sessionDateMatches(ctx, ticket);
}

function dateAnchorsMatch(ctx: DuplicateTicketContext, ticket: Ticket): boolean {
  const rawContext = metadataContext(ticket);
  const inputClassDates = dateKeys(ctx.classDateTime, 'minute');
  if (inputClassDates.size > 0) {
    const ticketClassDates = new Set([
      ...dateKeys(ticket.classDateTime, 'minute'),
      ...dateKeys(contextString(rawContext, 'classDateTime'), 'minute'),
    ]);
    if (ticketClassDates.size === 0 || !hasIntersection(inputClassDates, ticketClassDates)) return false;
  }

  const inputIncidentDates = dateKeys(ctx.incidentDateTime, 'date');
  if (inputIncidentDates.size > 0) {
    const ticketIncidentDates = dateKeys(contextString(rawContext, 'incidentDateTime'), 'date');
    if (ticketIncidentDates.size === 0 || !hasIntersection(inputIncidentDates, ticketIncidentDates)) return false;
  }

  return true;
}

function hasRequiredDuplicateAnchors(ctx: DuplicateTicketContext, ticket: Ticket): boolean {
  if (hasProvidedIdentity(ctx) && !hasExactIdentityMatch(ctx, ticket)) return false;
  if (!issueTypeMatches(ctx, ticket)) return false;
  if (!sessionAnchorMatches(ctx, ticket)) return false;
  return dateAnchorsMatch(ctx, ticket);
}

export function findExistingSubmittedTicket(text: string, ctx: DuplicateTicketContext, tickets: Ticket[]): Ticket | null {
  const explicitId = text.match(/\b(?:P57|TKT|TK)-?[A-Z0-9-]{3,}\b/i)?.[0]?.toLowerCase();
  if (explicitId) {
    const byId = tickets.find((ticket) => ticket.id.toLowerCase() === explicitId);
    if (byId) return byId;
  }

  const inputTokens = normalizeTicketSearchText([
    text,
    ctx.memberName,
    ctx.memberContact,
    ctx.studio,
    ctx.trainer,
    ctx.classType,
    ctx.category,
    ctx.subCategory,
  ].filter(Boolean).join(' '));
  if (inputTokens.length < 4) return null;

  let best: { ticket: Ticket; score: number } | null = null;
  for (const ticket of tickets) {
    if (!hasRequiredDuplicateAnchors(ctx, ticket)) continue;

    const haystackTokens = normalizeTicketSearchText([
      ticket.id,
      ticket.title,
      ticket.description,
      ticket.conversationSummary,
      ticket.category,
      ticket.subCategory,
      ticket.memberName,
      ticket.memberContact,
      ticket.studio,
      ticket.trainer,
      ticket.classType,
    ].filter(Boolean).join(' '));
    const haystack = new Set(haystackTokens);
    const overlap = inputTokens.filter((token) => haystack.has(token)).length;
    const hasIssueOverlap = overlap >= 3;
    const exactIdentityMatch = hasExactIdentityMatch(ctx, ticket);
    const contextBoost =
      (exactIdentityMatch ? 0.12 : 0) +
      (ctx.studio && ticket.studio === ctx.studio ? 0.04 : 0) +
      (ctx.trainer && ticket.trainer === ctx.trainer ? 0.04 : 0) +
      (sessionAnchorMatches(ctx, ticket) && ctx.sessionId ? 0.18 : 0);
    const score = overlap / Math.max(8, Math.min(inputTokens.length, haystackTokens.length)) + contextBoost;
    const threshold = exactIdentityMatch ? 0.68 : 0.74;
    if (hasIssueOverlap && score >= threshold && (!best || score > best.score)) best = { ticket, score };
  }

  return best?.ticket || null;
}
