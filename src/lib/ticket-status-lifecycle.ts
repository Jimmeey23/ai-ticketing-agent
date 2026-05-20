import {
  Ticket,
  TicketFollowUpDetail,
  TicketMetadata,
  TicketResolutionDetail,
} from './ticketing-data';

export interface TicketFollowUpInput {
  date?: string;
  notes?: string;
}

export interface TicketStatusUpdateInputLike {
  status: Ticket['status'];
  reason: string;
  actionTaken: string;
  actionDate: string;
  followUpDate?: string;
  comments?: string;
  notes?: string;
  resolutionSummary?: string;
  outcome?: string;
  followUps?: TicketFollowUpInput[];
}

function cleanText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function hasPartialFollowUp(followUp: TicketFollowUpInput): boolean {
  return Boolean(cleanText(followUp.date) || cleanText(followUp.notes));
}

function hasCompleteFollowUp(followUp: TicketFollowUpInput): boolean {
  return Boolean(cleanText(followUp.date) && cleanText(followUp.notes));
}

function completeFollowUpCount(input: TicketStatusUpdateInputLike): number {
  return (input.followUps || []).filter(hasCompleteFollowUp).length;
}

function normalizedFollowUps(
  input: TicketStatusUpdateInputLike,
  actor: string,
  createdAt: string
): TicketFollowUpDetail[] {
  const explicitFollowUps = (input.followUps || [])
    .filter(hasCompleteFollowUp)
    .map((followUp) => ({
      date: cleanText(followUp.date) || '',
      notes: cleanText(followUp.notes) || '',
      status: input.status,
      actor,
      createdAt,
    }));

  if (explicitFollowUps.length > 0) return explicitFollowUps;

  const legacyFollowUpDate = cleanText(input.followUpDate);
  const legacyNotes = cleanText(input.notes);
  if (!legacyFollowUpDate || !legacyNotes) return [];
  return [{
    date: legacyFollowUpDate,
    notes: legacyNotes,
    status: input.status,
    actor,
    createdAt,
  }];
}

export function validateTicketStatusUpdate(
  current: Ticket,
  input: TicketStatusUpdateInputLike
): string[] {
  const errors: string[] = [];
  const nextStatus = input.status;
  const statusChanged = nextStatus !== current.status;
  const isClosing = nextStatus === 'Resolved' || nextStatus === 'Closed';
  const hasCompleteFollowUps = completeFollowUpCount(input) > 0;
  const partialFollowUps = (input.followUps || []).some((followUp) => hasPartialFollowUp(followUp) && !hasCompleteFollowUp(followUp));

  if (current.status === 'Closed' && nextStatus !== 'Closed') {
    errors.push('Closed tickets cannot be reopened.');
  }
  if (!statusChanged && !hasCompleteFollowUps) {
    errors.push('Choose a new status or add a complete follow-up date and note.');
  }
  if (statusChanged && !cleanText(input.reason)) {
    errors.push('Status updates require a reason.');
  }
  if (statusChanged && !cleanText(input.actionTaken)) {
    errors.push('Status updates require actions taken by the owner.');
  }
  if (statusChanged && !cleanText(input.actionDate)) {
    errors.push('Status updates require the action date.');
  }
  if (isClosing && !cleanText(input.resolutionSummary)) {
    errors.push('Resolved or closed tickets require a resolution summary.');
  }
  if (isClosing && !cleanText(input.outcome)) {
    errors.push('Resolved or closed tickets require the final member or operational outcome.');
  }
  if (partialFollowUps) {
    errors.push('Each follow-up row needs both a date and notes.');
  }

  return errors;
}

export function buildTicketResolutionDetail(
  current: Ticket,
  input: TicketStatusUpdateInputLike,
  actor: string,
  createdAt = new Date().toISOString()
): TicketResolutionDetail {
  const followUps = normalizedFollowUps(input, actor, createdAt);
  const resolvedAt = input.status === 'Resolved' && current.status !== 'Resolved'
    ? createdAt
    : undefined;
  const closedAt = input.status === 'Closed' && current.status !== 'Closed'
    ? createdAt
    : undefined;

  return {
    status: input.status,
    previousStatus: current.status,
    reason: input.reason.trim() || 'Follow-up added',
    actionTaken: input.actionTaken.trim() || 'Follow-up scheduled',
    actionDate: input.actionDate || new Date().toISOString().slice(0, 10),
    followUpDate: cleanText(input.followUpDate) || followUps[0]?.date,
    followUps,
    comments: cleanText(input.comments),
    notes: cleanText(input.notes),
    resolutionSummary: cleanText(input.resolutionSummary),
    outcome: cleanText(input.outcome),
    resolvedAt,
    closedAt,
    actor,
    createdAt,
  };
}

export function mergeTicketResolutionMetadata(
  metadata: TicketMetadata | undefined,
  detail: TicketResolutionDetail
): TicketMetadata {
  const resolutionHistory = Array.isArray(metadata?.resolutionHistory)
    ? metadata.resolutionHistory.filter(Boolean)
    : [];
  const followUpHistory = Array.isArray(metadata?.followUpHistory)
    ? metadata.followUpHistory.filter(Boolean)
    : [];
  const nextFollowUps = detail.followUps || [];

  return {
    ...(metadata || {}),
    latestResolution: detail,
    resolutionHistory: [detail, ...resolutionHistory].slice(0, 50),
    followUpHistory: [...nextFollowUps, ...followUpHistory].slice(0, 100),
    resolvedAt: detail.resolvedAt || metadata?.resolvedAt,
    closedAt: detail.closedAt || metadata?.closedAt,
  };
}

export function canSelectStatusFromTicket(ticket: Ticket, status: Ticket['status']): boolean {
  return ticket.status !== 'Closed' || status === 'Closed';
}
