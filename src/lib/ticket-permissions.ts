import { getEmployee } from './ticketing-data';

type AccessRole = 'admin' | 'support' | string;

interface StatusPermissionTicket {
  assignedTo?: string | null;
}

interface StatusPermissionInput {
  accessRole: AccessRole;
  identityValues: Iterable<string>;
  ticket: StatusPermissionTicket;
}

function normalizeIdentity(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function canUpdateTicketStatus({ accessRole, identityValues, ticket }: StatusPermissionInput): boolean {
  if (accessRole === 'admin') return true;

  const ownerName = normalizeIdentity(ticket.assignedTo);
  if (!ownerName) return false;

  const owner = ticket.assignedTo ? getEmployee(ticket.assignedTo) : undefined;
  const ownerKeys = new Set([
    ownerName,
    normalizeIdentity(owner?.email),
  ].filter(Boolean));

  for (const identity of identityValues) {
    if (ownerKeys.has(normalizeIdentity(identity))) return true;
  }

  return false;
}
