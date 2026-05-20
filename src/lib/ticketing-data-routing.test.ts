import { describe, expect, it } from 'vitest';
import { resolveTicketAssignee, resolveTicketDepartment } from './ticketing-data';

describe('ticketing data routing', () => {
  it('routes billing and pricing categories to studio Sales & Client Servicing owners', () => {
    expect(resolveTicketAssignee('Billing & Membership', 'Supreme HQ, Bandra')).toBe('Imran Shaikh');
    expect(resolveTicketDepartment('Billing & Membership', 'Imran Shaikh')).toBe('Sales & Client Servicing');

    expect(resolveTicketAssignee('Pricing and Memberships', 'Kenkere House, Bengaluru')).toBe('Yashas K');
    expect(resolveTicketDepartment('Pricing and Memberships', 'Yashas K')).toBe('Sales & Client Servicing');
  });
});
