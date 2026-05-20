import { describe, expect, it } from 'vitest';
import {
  buildTicketResolutionDetail,
  mergeTicketResolutionMetadata,
  validateTicketStatusUpdate,
} from './ticket-status-lifecycle';
import type { Ticket } from './ticketing-data';
import type { TicketStatusUpdateInput } from '@/components/ticketing/ticket-context-core';

const baseTicket: Ticket = {
  id: 'P57-STATUS',
  title: 'Member refund follow-up',
  description: 'Member requested refund update.',
  category: 'Billing & Membership',
  subCategory: 'Refund Request',
  priority: 'High',
  status: 'In Progress',
  studio: 'Supreme HQ, Bandra',
  assignedTo: 'Imran Shaikh',
  team: 'Sales & Client Servicing',
  tags: [],
  createdAt: '2026-05-20T08:00:00.000Z',
  slaDueAt: '2026-05-20T16:00:00.000Z',
};

const validClosedInput: TicketStatusUpdateInput = {
  status: 'Closed',
  reason: 'Member request has been completed',
  actionTaken: 'Owner confirmed the refund status and informed the member.',
  actionDate: '2026-05-20',
  resolutionSummary: 'Refund query closed after owner confirmation.',
  outcome: 'Member informed and no further action pending.',
  followUps: [
    { date: '2026-05-21', notes: 'Check whether the member confirms receipt.' },
    { date: '2026-05-24', notes: 'Confirm finance reference is visible in account notes.' },
  ],
};

describe('ticket status lifecycle', () => {
  it('requires complete resolution details before resolving or closing tickets', () => {
    expect(validateTicketStatusUpdate(baseTicket, {
      ...validClosedInput,
      resolutionSummary: '',
    })).toEqual(['Resolved or closed tickets require a resolution summary.']);
  });

  it('prevents closed tickets from being reopened', () => {
    expect(validateTicketStatusUpdate({ ...baseTicket, status: 'Closed' }, {
      ...validClosedInput,
      status: 'In Progress',
    })).toEqual(['Closed tickets cannot be reopened.']);
  });

  it('allows owner follow-up notes without changing the ticket status', () => {
    const followUpOnlyInput: TicketStatusUpdateInput = {
      status: 'In Progress',
      reason: '',
      actionTaken: '',
      actionDate: '',
      followUps: [
        { date: '2026-05-23', notes: 'Call member after accounts confirmation.' },
        { date: '2026-05-26', notes: 'Send written update if member has not replied.' },
      ],
    };

    expect(validateTicketStatusUpdate(baseTicket, followUpOnlyInput)).toEqual([]);

    const detail = buildTicketResolutionDetail(baseTicket, followUpOnlyInput, 'Imran Shaikh', '2026-05-20T10:00:00.000Z');

    expect(detail.reason).toBe('Follow-up added');
    expect(detail.actionTaken).toBe('Follow-up scheduled');
    expect(detail.followUps).toHaveLength(2);
  });

  it('records closure date and multiple follow-up notes in metadata', () => {
    const detail = buildTicketResolutionDetail(baseTicket, validClosedInput, 'Imran Shaikh', '2026-05-20T09:00:00.000Z');
    const metadata = mergeTicketResolutionMetadata(baseTicket.metadata, detail);

    expect(detail.closedAt).toBe('2026-05-20T09:00:00.000Z');
    expect(detail.followUps).toHaveLength(2);
    expect(metadata.closedAt).toBe('2026-05-20T09:00:00.000Z');
    expect(metadata.followUpHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-05-21', notes: 'Check whether the member confirms receipt.' }),
      expect.objectContaining({ date: '2026-05-24', notes: 'Confirm finance reference is visible in account notes.' }),
    ]));
  });
});
