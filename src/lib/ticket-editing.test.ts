import { describe, expect, it } from 'vitest';
import { buildTicketEditPatch } from './ticket-editing';
import type { Ticket } from './ticketing-data';

const baseTicket: Ticket = {
  id: 'P57-1',
  title: 'Original title',
  description: 'Original description',
  category: 'Scheduling',
  subCategory: 'Booking Confirmation Issues',
  priority: 'Medium',
  status: 'New',
  studio: 'Kwality House, Kemps Corner',
  assignedTo: 'Akshay Rane',
  team: 'Sales & Client Servicing',
  tags: ['manual'],
  createdAt: '2026-05-20T00:00:00.000Z',
  slaDueAt: '2026-05-21T00:00:00.000Z',
};

describe('buildTicketEditPatch', () => {
  it('keeps manually editable ticket fields in the saved patch', () => {
    expect(
      buildTicketEditPatch(baseTicket, {
        title: 'Updated title',
        classDateTime: '2026-05-22T10:30',
        reportedBy: 'Smita',
        memberName: 'Asha Rao',
        tags: ['manual', 'edited'],
      })
    ).toMatchObject({
      title: 'Updated title',
      classDateTime: '2026-05-22T10:30',
      reportedBy: 'Smita',
      memberName: 'Asha Rao',
      tags: ['manual', 'edited'],
    });
  });
});
