import { describe, expect, it } from 'vitest';
import { findExistingSubmittedTicket } from './ticket-duplicate-matching';
import { Ticket } from './ticketing-data';

const baseTicket: Ticket = {
  id: 'P57-OLD123',
  title: 'Late cancellation dispute for Anita Rao',
  description: 'Member reported a late cancellation dispute for the 8am Studio Barre 57 session.',
  category: 'Scheduling',
  subCategory: 'Late Arrival Policy',
  priority: 'Medium',
  status: 'New',
  studio: 'Supreme HQ, Bandra',
  trainer: 'Anisha Shah',
  classType: 'Studio Barre 57',
  classDateTime: '2026-05-20T08:00:00+05:30',
  memberName: 'Anita Rao',
  memberContact: 'anita@example.com',
  reportedBy: 'Front Desk',
  assignedTo: 'Akshay Rane',
  team: 'Sales & Client Servicing',
  tags: ['ai-approved'],
  createdAt: '2026-05-20T04:00:00.000Z',
  slaDueAt: '2026-05-21T04:00:00.000Z',
  sourceRef: 'approved-draft:old',
  metadata: {
    intake_context: {
      sessionId: 'momence-100',
      incidentDateTime: '2026-05-20T08:00:00+05:30',
    },
  },
};

describe('findExistingSubmittedTicket', () => {
  it('matches an explicit ticket ID regardless of other details', () => {
    const result = findExistingSubmittedTicket(
      'Please update P57-OLD123 with this follow-up.',
      {
        memberName: 'Different Member',
        category: 'Repair and Maintenance',
        subCategory: 'Door Lock Issues',
      },
      [baseTicket]
    );

    expect(result?.id).toBe('P57-OLD123');
  });

  it('does not match an old ticket only because the member is the same', () => {
    const result = findExistingSubmittedTicket(
      'Member reported a waitlist concern for the 5pm Barre session on 24 May.',
      {
        memberName: 'Anita Rao',
        memberContact: 'anita@example.com',
        studio: 'Supreme HQ, Bandra',
        category: 'Scheduling',
        subCategory: 'Waitlist Concerns',
        classType: 'Studio Barre 57',
        classDateTime: '2026-05-24T17:00:00+05:30',
        sessionId: 'momence-200',
      },
      [baseTicket]
    );

    expect(result).toBeNull();
  });

  it('matches when member, issue type, and selected session match', () => {
    const result = findExistingSubmittedTicket(
      'Member reported a late cancellation dispute for the 8am Studio Barre 57 session.',
      {
        memberName: 'Anita Rao',
        memberContact: 'anita@example.com',
        studio: 'Supreme HQ, Bandra',
        category: 'Scheduling',
        subCategory: 'Late Arrival Policy',
        classType: 'Studio Barre 57',
        classDateTime: '2026-05-20T08:00:00+05:30',
        sessionId: 'momence-100',
      },
      [baseTicket]
    );

    expect(result?.id).toBe('P57-OLD123');
  });
});
