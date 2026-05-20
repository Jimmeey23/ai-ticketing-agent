import type { Ticket } from './ticketing-data';

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags || []).map((tag) => tag.trim()).filter(Boolean)));
}

export function buildTicketEditPatch(ticket: Ticket, editValues: Partial<Ticket>): Partial<Ticket> {
  const currentValues = { ...ticket, ...editValues };

  return {
    title: currentValues.title,
    description: currentValues.description,
    category: currentValues.category,
    subCategory: currentValues.subCategory,
    priority: currentValues.priority,
    studio: currentValues.studio,
    trainer: emptyToUndefined(currentValues.trainer),
    classType: emptyToUndefined(currentValues.classType),
    classDateTime: emptyToUndefined(currentValues.classDateTime),
    memberName: emptyToUndefined(currentValues.memberName),
    memberContact: emptyToUndefined(currentValues.memberContact),
    reportedBy: emptyToUndefined(currentValues.reportedBy),
    assignedTo: currentValues.assignedTo,
    team: currentValues.team,
    sentiment: currentValues.sentiment,
    tags: normalizeTags(currentValues.tags),
  };
}
