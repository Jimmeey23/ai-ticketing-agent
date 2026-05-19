import { describe, expect, it } from 'vitest';
import { canUpdateTicketStatus } from './ticket-permissions';

describe('ticket status permissions', () => {
  it('allows admins to update any ticket status', () => {
    expect(
      canUpdateTicketStatus({
        accessRole: 'admin',
        identityValues: new Set(['frontdesk@physique57india.com']),
        ticket: { assignedTo: 'Anisha Shah' },
      })
    ).toBe(true);
  });

  it('allows the assigned owner to update status by name', () => {
    expect(
      canUpdateTicketStatus({
        accessRole: 'support',
        identityValues: new Set(['anisha shah']),
        ticket: { assignedTo: 'Anisha Shah' },
      })
    ).toBe(true);
  });

  it('allows the assigned owner to update status by employee email', () => {
    expect(
      canUpdateTicketStatus({
        accessRole: 'support',
        identityValues: new Set(['anisha@physique57india.com']),
        ticket: { assignedTo: 'Anisha Shah' },
      })
    ).toBe(true);
  });

  it('blocks support users who are not the assigned owner', () => {
    expect(
      canUpdateTicketStatus({
        accessRole: 'support',
        identityValues: new Set(['operations@physique57india.com', 'zahur shaikh']),
        ticket: { assignedTo: 'Anisha Shah' },
      })
    ).toBe(false);
  });
});
