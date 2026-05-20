import { createContext } from 'react';
import { Ticket } from '@/lib/ticketing-data';

export interface TicketNotification {
  id: string;
  ticketId: string;
  title: string;
  message: string;
  level: 'critical' | 'warning';
  ticket: Ticket;
  owner: string;
  createdAt: string;
}

export interface TicketStatusUpdateInput {
  status: Ticket['status'];
  reason: string;
  actionTaken: string;
  actionDate: string;
  followUpDate?: string;
  followUps?: Array<{
    date?: string;
    notes?: string;
  }>;
  comments?: string;
  notes?: string;
  resolutionSummary?: string;
  outcome?: string;
}

export interface ApprovedTicketDraft {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: Ticket['priority'];
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  reportedBy?: string | null;
  assignedTo?: string | null;
  department?: string | null;
  tags: string[];
  sentiment?: string;
  conversationSummary?: string;
}

export interface ManualTicketInput {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: Ticket['priority'];
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  assignedTo?: string | null;
  tags?: string[];
  sentiment?: string;
}

export interface TicketContextValue {
  tickets: Ticket[];
  notifications: TicketNotification[];
  loading: boolean;
  error: string | null;
  updateTicket: (id: string, patch: Partial<Ticket>, actor?: string) => Promise<void>;
  updateTicketStatus: (id: string, detail: TicketStatusUpdateInput, actor?: string) => Promise<void>;
  canUpdateTicketStatus: (ticket: Ticket) => boolean;
  clearAllNotifications: () => void;
  createApprovedTicket: (draft: ApprovedTicketDraft, conversationId?: string | null, context?: Record<string, unknown>, attachments?: File[]) => Promise<Ticket>;
  createManualTicket: (draft: ManualTicketInput) => Promise<Ticket>;
  deleteTicket: (id: string) => Promise<void>;
  selectedTicket: Ticket | null;
  setSelectedTicket: (t: Ticket | null) => void;
  refresh: () => Promise<void>;
}

export const TicketContext = createContext<TicketContextValue | null>(null);
