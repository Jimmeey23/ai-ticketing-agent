import { describe, expect, it } from 'vitest';
import { isTicketDueToday, ticketEmailInFlightKey, ticketEmailRecipientHints } from './ticket-email-notifications';
import { buildTicketLifecycleEmail } from '../../supabase/functions/ticket-email-notifications/email-template';
import { Ticket } from './ticketing-data';

const baseTicket: Ticket = {
  id: 'P57-ABC123',
  title: 'Door lock not closing at Kwality',
  description: 'Door lock is not closing and needs repair.',
  category: 'Repair and Maintenance',
  subCategory: 'Door Lock Issues',
  priority: 'High',
  status: 'New',
  studio: 'Kwality House, Kemps Corner',
  assignedTo: 'Zahur Shaikh',
  team: 'Operations',
  tags: ['ai-approved'],
  createdAt: '2026-05-20T03:30:00.000Z',
  slaDueAt: '2026-05-20T12:00:00.000Z',
};

describe('ticket email notifications', () => {
  it('detects due-today tickets in the configured business timezone', () => {
    const now = new Date('2026-05-20T04:00:00.000Z');

    expect(isTicketDueToday(baseTicket, now, 'Asia/Kolkata')).toBe(true);
    expect(isTicketDueToday({ ...baseTicket, slaDueAt: '2026-05-19T12:00:00.000Z' }, now, 'Asia/Kolkata')).toBe(false);
    expect(isTicketDueToday({ ...baseTicket, status: 'Closed' }, now, 'Asia/Kolkata')).toBe(false);
  });

  it('builds stable in-flight keys per ticket lifecycle event', () => {
    expect(ticketEmailInFlightKey('ticket_assigned', baseTicket)).toBe('ticket_assigned:P57-ABC123');
    expect(ticketEmailInFlightKey('ticket_closed', baseTicket)).toBe('ticket_closed:P57-ABC123');
  });

  it('builds recipient fallback hints from the local master employee directory', () => {
    expect(ticketEmailRecipientHints({ assignedTo: 'Imran Shaikh' })).toEqual({
      ownerEmail: 'imran@physique57mumbai.com',
      escalationEmail: 'jimmeey@physique57india.com',
    });
  });

  it('builds professional inline-style email templates without style blocks', () => {
    const email = buildTicketLifecycleEmail({
      eventType: 'ticket_assigned',
      ticket: {
        id: baseTicket.id,
        title: baseTicket.title,
        description: baseTicket.description,
        category: baseTicket.category,
        subCategory: baseTicket.subCategory,
        priority: baseTicket.priority,
        status: baseTicket.status,
        studio: baseTicket.studio,
        assignedTo: baseTicket.assignedTo,
        team: baseTicket.team,
        createdAt: baseTicket.createdAt,
        slaDueAt: baseTicket.slaDueAt,
      },
      owner: { name: 'Zahur Shaikh', email: 'zahur@physique57mumbai.com' },
      escalation: { name: 'Saachi Shetty - Operations', email: 'saachi@physique57india.com' },
      appUrl: 'https://athena.example.com',
      actor: 'Athena',
    });

    expect(email.subject).toContain('[P57-ABC123] Ticket assigned');
    expect(email.html).toContain('style="');
    expect(email.html).not.toContain('<style');
    expect(email.html).toContain('Door lock not closing at Kwality');
    expect(email.html).toContain('Saachi Shetty - Operations');
    expect(email.text).toContain('Ticket assigned');
  });
});
