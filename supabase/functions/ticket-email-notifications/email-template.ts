export type TicketEmailEventType =
  | 'ticket_assigned'
  | 'ticket_due_today'
  | 'ticket_escalated'
  | 'ticket_closed';

export interface TicketEmailSummary {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  subCategory: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: string;
  studio: string;
  assignedTo: string;
  team: string;
  memberName?: string | null;
  memberContact?: string | null;
  reportedBy?: string | null;
  createdAt: string;
  slaDueAt: string;
}

export interface TicketEmailPerson {
  name: string;
  email?: string | null;
}

export interface TicketLifecycleEmailInput {
  eventType: TicketEmailEventType;
  ticket: TicketEmailSummary;
  owner: TicketEmailPerson;
  escalation?: TicketEmailPerson | null;
  appUrl?: string;
  actor?: string;
}

export interface TicketLifecycleEmail {
  subject: string;
  html: string;
  text: string;
}

const EVENT_COPY: Record<TicketEmailEventType, { label: string; headline: string; tone: string; summary: string }> = {
  ticket_assigned: {
    label: 'Ticket assigned',
    headline: 'A new Athena ticket has been assigned',
    tone: '#0f766e',
    summary: 'Please review the ticket context and take ownership of the next action.',
  },
  ticket_due_today: {
    label: 'Ticket due today',
    headline: 'This ticket is due today',
    tone: '#b45309',
    summary: 'Please close the loop or update the ticket with the current resolution path before the SLA expires.',
  },
  ticket_escalated: {
    label: 'Ticket escalated',
    headline: 'This ticket has been escalated',
    tone: '#be123c',
    summary: 'The ticket has reached escalation criteria and needs priority attention from the assigned owner.',
  },
  ticket_closed: {
    label: 'Ticket closed',
    headline: 'This ticket has been closed',
    tone: '#334155',
    summary: 'The ticket is marked closed. Review the resolution history if any follow-up is needed.',
  },
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function plain(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function row(label: string, value?: unknown): string {
  return `
    <tr>
      <td style="padding: 10px 0; width: 156px; color: #64748b; font-size: 12px; line-height: 18px; vertical-align: top;">${escapeHtml(label)}</td>
      <td style="padding: 10px 0; color: #0f172a; font-size: 13px; line-height: 19px; vertical-align: top; font-weight: 600;">${escapeHtml(plain(value) || '-')}</td>
    </tr>
  `;
}

function actionUrl(appUrl: string | undefined, ticketId: string): string {
  const base = (appUrl || '').replace(/\/+$/, '');
  return base ? `${base}/?ticket=${encodeURIComponent(ticketId)}` : '';
}

export function buildTicketLifecycleEmail(input: TicketLifecycleEmailInput): TicketLifecycleEmail {
  const event = EVENT_COPY[input.eventType];
  const ticketUrl = actionUrl(input.appUrl, input.ticket.id);
  const escalationName = input.escalation?.name || 'Not configured';
  const subject = `[${input.ticket.id}] ${event.label}: ${input.ticket.title}`;
  const description = plain(input.ticket.description).slice(0, 700);

  const html = `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #f8fafc; font-family: Arial, Helvetica, sans-serif; color: #0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; width: 100%; background: #f8fafc;">
      <tr>
        <td align="center" style="padding: 28px 16px;">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="border-collapse: collapse; width: 100%; max-width: 640px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden;">
            <tr>
              <td style="padding: 24px 28px 18px; border-bottom: 1px solid #e2e8f0;">
                <div style="font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: ${event.tone}; font-weight: 700;">Athena Ticketing</div>
                <h1 style="margin: 10px 0 8px; color: #0f172a; font-size: 22px; line-height: 30px; font-weight: 700;">${escapeHtml(event.headline)}</h1>
                <p style="margin: 0; color: #475569; font-size: 14px; line-height: 22px;">${escapeHtml(event.summary)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 22px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; width: 100%;">
                  ${row('Ticket ID', input.ticket.id)}
                  ${row('Title', input.ticket.title)}
                  ${row('Owner', `${input.owner.name}${input.owner.email ? ` <${input.owner.email}>` : ''}`)}
                  ${row('Escalation CC', `${escalationName}${input.escalation?.email ? ` <${input.escalation.email}>` : ''}`)}
                  ${row('Priority', input.ticket.priority)}
                  ${row('Status', input.ticket.status)}
                  ${row('Studio Space', input.ticket.studio)}
                  ${row('Category', `${input.ticket.category} / ${input.ticket.subCategory}`)}
                  ${row('SLA Due', formatDateTime(input.ticket.slaDueAt))}
                  ${row('Reported By', input.ticket.reportedBy || 'Not set')}
                  ${input.ticket.memberName || input.ticket.memberContact ? row('Community Member', [input.ticket.memberName, input.ticket.memberContact].filter(Boolean).join(' - ')) : ''}
                </table>
                ${description ? `<div style="margin-top: 18px; padding: 16px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0;">
                  <div style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; font-weight: 700;">Ticket Context</div>
                  <p style="margin: 8px 0 0; color: #334155; font-size: 13px; line-height: 21px;">${escapeHtml(description)}</p>
                </div>` : ''}
                ${ticketUrl ? `<div style="margin-top: 22px;">
                  <a href="${escapeHtml(ticketUrl)}" style="display: inline-block; text-decoration: none; background: #0f172a; color: #ffffff; border-radius: 12px; padding: 11px 16px; font-size: 13px; line-height: 18px; font-weight: 700;">Open ticket</a>
                </div>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px; line-height: 17px;">
                Sent by Athena${input.actor ? ` on behalf of ${escapeHtml(input.actor)}` : ''}. Please keep resolution notes updated in Submitted Tickets.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    event.label,
    input.ticket.title,
    '',
    event.summary,
    '',
    `Ticket ID: ${input.ticket.id}`,
    `Owner: ${input.owner.name}${input.owner.email ? ` <${input.owner.email}>` : ''}`,
    `Escalation CC: ${escalationName}${input.escalation?.email ? ` <${input.escalation.email}>` : ''}`,
    `Priority: ${input.ticket.priority}`,
    `Status: ${input.ticket.status}`,
    `Studio Space: ${input.ticket.studio}`,
    `Category: ${input.ticket.category} / ${input.ticket.subCategory}`,
    `SLA Due: ${formatDateTime(input.ticket.slaDueAt)}`,
    description ? `Context: ${description}` : '',
    ticketUrl ? `Open ticket: ${ticketUrl}` : '',
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}
