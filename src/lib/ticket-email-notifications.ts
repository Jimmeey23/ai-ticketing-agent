import { isClosedTicket, Ticket } from '@/lib/ticketing-data';

export type TicketEmailEventType =
  | 'ticket_assigned'
  | 'ticket_due_today'
  | 'ticket_escalated'
  | 'ticket_closed';

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

function zonedDateKey(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return [part('year'), part('month'), part('day')].filter(Boolean).join('-');
}

export function isTicketDueToday(ticket: Ticket, now = new Date(), timeZone = DEFAULT_TIME_ZONE): boolean {
  if (isClosedTicket(ticket)) return false;
  return Boolean(ticket.slaDueAt && zonedDateKey(ticket.slaDueAt, timeZone) === zonedDateKey(now, timeZone));
}

export function ticketEmailInFlightKey(eventType: TicketEmailEventType, ticket: Pick<Ticket, 'id'>): string {
  return `${eventType}:${ticket.id}`;
}

export async function sendTicketLifecycleEmail(
  eventType: TicketEmailEventType,
  ticket: Pick<Ticket, 'id'>,
  actor?: string
): Promise<void> {
  const { backendSupabase } = await import('@/lib/backend-supabase');
  const { error } = await backendSupabase.functions.invoke('ticket-email-notifications', {
    body: {
      eventType,
      ticketId: ticket.id,
      actor,
    },
  });

  if (error) throw error;
}
