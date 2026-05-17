import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Send, Sparkles, Bot, User as UserIcon, RotateCcw, CheckCircle2 } from 'lucide-react';
import { TicketPreviewCard } from './TicketPreviewCard';
import { ContextPicker, Context } from './ContextPicker';
import { useTickets } from './TicketContext';
import { useBackendAuth } from '@/contexts/BackendAuthContext';
import {
  getMomenceMemberMemberships,
  MomenceMemberOption,
  MomenceMembership,
  MomenceSessionOption,
  searchMomenceMembers,
  searchMomenceSessions,
} from '@/lib/momence-api';
import {
  captureMemberVoiceFromText,
  getMissingIntakeFields,
  inferIntakeContextFromText,
  isMissingIntakeValue,
  IntakeContext,
} from '@/lib/intake-rules';
import {
  ASSOCIATES,
  CATEGORIES,
  CLASS_TYPES,
  FREEZE_REASONS,
  HOSTED_CLASS_FEEDBACK_AREAS,
  INTAKE_ROUTES,
  MEMBER_SENTIMENT_OPTIONS,
  MEMBERSHIPS,
  PRIORITY_SLA,
  REQUEST_TYPES,
  ROLLOVER_REASONS,
  STUDIOS,
  TRAINERS,
} from '@/lib/ticketing-data';

interface SuggestedChip {
  label: string;
  value: string;
  field: string;
}

type DetailFieldType = 'select' | 'text' | 'textarea' | 'date' | 'datetime-local' | 'number';

interface DetailFormField {
  id: string;
  label: string;
  type: DetailFieldType;
  required?: boolean;
  options?: string[];
  dependsOn?: string;
}

interface DetailForm {
  title: string;
  description?: string;
  fields: DetailFormField[];
  submitLabel?: string;
}

interface DraftTicket {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  reportedBy?: string | null;
  tags: string[];
  sentiment?: string;
  conversationSummary?: string;
}

type DetailContext = Context & IntakeContext;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ticket?: DraftTicket | null;
  suggestedChips?: SuggestedChip[];
  ticketId?: string;
  published?: boolean;
  detailForm?: DetailForm | null;
}

interface AiIntakeResponse {
  conversationId?: string;
  needsMoreInfo?: boolean;
  reply?: string;
  detailForm?: DetailForm | null;
  ticket?: DraftTicket | null;
  suggestedChips?: SuggestedChip[];
  inferredContext?: Partial<DetailContext>;
  missingFields?: string[];
  publishable?: boolean;
  urgencyReason?: string;
}

const GREETING: Message = {
  id: 'greet',
  role: 'assistant',
  content:
    "I'm **Athena**, your Physique 57 India ticket intake assistant.\n\nDocument what the member, client, guest, or team member reported. I'll classify the route, category, subcategory, and urgency before asking only for missing details.",
};

function getDisplayError(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const parts = [
      typeof value.message === 'string' ? value.message : '',
      typeof value.details === 'string' ? value.details : '',
      typeof value.hint === 'string' ? value.hint : '',
      typeof value.code === 'string' ? `Code: ${value.code}` : '',
    ].filter(Boolean);
    if (parts.length) return parts.join(' ');
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function getReporterName(user: ReturnType<typeof useBackendAuth>['user']): string {
  const metadata = user?.user_metadata || {};
  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  return fullName || name || user?.email || 'Authenticated user';
}

const ATHENA_SYSTEM_PROMPT = `
You are Athena, the Physique 57 India internal operations ticket intake assistant.

Primary behavior:
- Start from the internal team member's free-text documentation of member voice.
- Infer exactly one route: Request, Complaint, Feedback, or Internal Reporting.
- Infer the best category and subcategory from the approved master data. Do not require the user to manually select them before asking issue-specific details.
- Infer priority and include a short urgency reason based on member impact, safety risk, retention risk, billing urgency, and escalation language.
- Ask only for operational details that are missing after inference.
- Never create or return a ticket draft with partial information. Gather missing required fields first.
- Never ask multiple questions as prose. If more than one field is missing, return a structured detailForm with complete field objects.
- The AI must decide issue-specific fields from the inferred route, category, subcategory, current context, and member voice. Do not rely on fixed subcategory templates.
- For issue-specific fields, return full field definitions: id, label, type, required, and options when useful.
- Use only the application-provided constants for routes, studios, instructors, class types, categories, subcategories, associates, priorities, and option buttons.
- Member name/contact and class/session context must come from Momence search fields in the UI; do not ask users to type those as ordinary text when a form is used.
- For freeze, rollover, membership, and package-specific requests, require the selected Momence member before requesting membership, and use only that member's currently active memberships.
- Always write in third-person internal documentation language: "Member reported...", "Client requested...", "Community member stated...".
- Always return draftOnly behavior until the user explicitly approves the displayed draft.

Required ticket draft quality:
- Title: concise operational summary, not a raw transcript.
- Description: factual member voice, stated impact, requested resolution, and immediate context.
- Category/subCategory: match the app's category constants.
- Priority: Critical for safety/security, High for urgent service failure, otherwise Medium/Low based on stated impact.
- Tags: include route and meaningful operational tags.
`.trim();

const DETAIL_FORM_FIELD_LIBRARY: Record<string, DetailFormField> = {
  intakeRoute: {
    id: 'intakeRoute',
    label: 'Intake Route',
    type: 'select',
    required: true,
    options: INTAKE_ROUTES,
  },
  requestType: {
    id: 'requestType',
    label: 'Specific Ticket Type',
    type: 'select',
    required: true,
    options: REQUEST_TYPES,
  },
  studio: {
    id: 'studio',
    label: 'Studio Space',
    type: 'select',
    required: true,
    options: STUDIOS,
  },
  category: {
    id: 'category',
    label: 'Member Voice Category',
    type: 'select',
    required: true,
    options: Object.keys(CATEGORIES),
  },
  subCategory: {
    id: 'subCategory',
    label: 'Specific Touchpoint',
    type: 'select',
    required: true,
    dependsOn: 'category',
    options: Object.values(CATEGORIES).flat(),
  },
  trainer: {
    id: 'trainer',
    label: 'Studio Instructor',
    type: 'select',
    options: TRAINERS,
  },
  classType: {
    id: 'classType',
    label: 'Signature Experience',
    type: 'select',
    required: true,
    options: CLASS_TYPES,
  },
  membership: {
    id: 'membership',
    label: 'Package / Membership',
    type: 'select',
    options: MEMBERSHIPS,
  },
  memberName: {
    id: 'memberName',
    label: 'Community Member Name',
    type: 'text',
    required: true,
  },
  memberContact: {
    id: 'memberContact',
    label: 'Member Contact',
    type: 'text',
    required: true,
  },
  priority: {
    id: 'priority',
    label: 'Priority',
    type: 'select',
    required: true,
    options: Object.keys(PRIORITY_SLA),
  },
  description: {
    id: 'description',
    label: "Member's stated feedback",
    type: 'textarea',
    required: true,
  },
  desiredResolution: {
    id: 'desiredResolution',
    label: "Member's requested resolution",
    type: 'textarea',
  },
  incidentDateTime: {
    id: 'incidentDateTime',
    label: 'Approx. Incident Date / Time',
    type: 'datetime-local',
  },
  memberSentiment: {
    id: 'memberSentiment',
    label: 'Member Sentiment',
    type: 'select',
    options: MEMBER_SENTIMENT_OPTIONS,
  },
  freezeStartDate: {
    id: 'freezeStartDate',
    label: 'Requested Freeze Start Date',
    type: 'date',
    required: true,
  },
  freezeEndDate: {
    id: 'freezeEndDate',
    label: 'Requested Freeze End Date',
    type: 'date',
    required: true,
  },
  freezeReason: {
    id: 'freezeReason',
    label: 'Freeze Reason Stated by Member',
    type: 'select',
    required: true,
    options: FREEZE_REASONS,
  },
  classesRemaining: {
    id: 'classesRemaining',
    label: 'Classes / Credits Remaining',
    type: 'number',
  },
  packageExpiryDate: {
    id: 'packageExpiryDate',
    label: 'Current Package Expiry Date',
    type: 'date',
  },
  requestedRolloverDate: {
    id: 'requestedRolloverDate',
    label: 'Requested Roll Over / Extension Date',
    type: 'date',
    required: true,
  },
  rolloverReason: {
    id: 'rolloverReason',
    label: 'Roll Over Reason',
    type: 'select',
    required: true,
    options: ROLLOVER_REASONS,
  },
  partnerName: {
    id: 'partnerName',
    label: 'Hosted Class Partner / Influencer',
    type: 'text',
    required: true,
  },
  hostedFeedbackArea: {
    id: 'hostedFeedbackArea',
    label: 'Hosted Class Feedback Area',
    type: 'select',
    required: true,
    options: HOSTED_CLASS_FEEDBACK_AREAS,
  },
  attendeeCount: {
    id: 'attendeeCount',
    label: 'Approx. Attendee Count',
    type: 'number',
  },
  prospectQuality: {
    id: 'prospectQuality',
    label: 'Prospect Quality / Conversion Signal',
    type: 'select',
    options: ['High Fit', 'Moderate Fit', 'Low Fit', 'Existing Members Mostly', 'Unable to Determine'],
  },
  followUpPreference: {
    id: 'followUpPreference',
    label: 'Follow-up Preference Indicated',
    type: 'select',
    options: ['Phone Call', 'WhatsApp', 'Email', 'Instagram DM', 'In-Person Next Visit', 'No Follow-up Requested'],
  },
};

function getDetailField(id: string): DetailFormField | undefined {
  return DETAIL_FORM_FIELD_LIBRARY[id];
}

function normalizeDetailForm(input: unknown): DetailForm | null {
  if (!input || typeof input !== 'object') return null;
  const form = input as Partial<DetailForm> & { fields?: Array<Partial<DetailFormField> | string> };
  const seen = new Set<string>();
  const allowedTypes = new Set<DetailFieldType>(['select', 'text', 'textarea', 'date', 'datetime-local', 'number']);
  const fields = (form.fields || [])
    .map((field) => {
      if (typeof field === 'string') {
        const normalizedId = field === 'requestType' ? 'intakeRoute' : field;
        if (seen.has(normalizedId)) return null;
        seen.add(normalizedId);
        return getDetailField(normalizedId);
      }
      const id = field.id ? (String(field.id) === 'requestType' ? 'intakeRoute' : String(field.id)) : '';
      if (id === 'reportedBy') return null;
      const base = getDetailField(id);
      if (seen.has(id)) return null;
      seen.add(id);
      if (base) {
        return {
          ...base,
          ...field,
          id: base.id,
          label: base.label,
          options: base.options,
        } as DetailFormField;
      }

      const label = typeof field.label === 'string' && field.label.trim() ? field.label.trim() : '';
      const type = field.type && allowedTypes.has(field.type) ? field.type : 'text';
      if (!id || !label) return null;
      return {
        id: id.replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 80),
        label,
        type,
        required: field.required !== false,
        options: Array.isArray(field.options) ? field.options.map(String).filter(Boolean).slice(0, 30) : undefined,
        dependsOn: typeof field.dependsOn === 'string' ? field.dependsOn : undefined,
      } as DetailFormField;
    })
    .filter(Boolean) as DetailFormField[];

  if (fields.length === 0) return null;
  return {
    title: form.title || 'Add the missing ticket details',
    description: form.description,
    fields,
    submitLabel: form.submitLabel || 'Continue drafting',
  };
}

function chipsForSingleField(field: DetailFormField, ctx: DetailContext): SuggestedChip[] {
  if (ctx[field.id]) return [];
  if (field.type !== 'select') return [];
  const options = field.id === 'subCategory' && ctx.category ? CATEGORIES[ctx.category] || [] : field.options || [];
  if (field.id === 'membership' || options.length === 0) return [];
  return options.slice(0, 10).map((option) => ({
    label: option,
    value: option,
    field: field.id,
  }));
}

function applyDetailValue(ctx: DetailContext, field: string, value: string): DetailContext {
  const next = { ...ctx };
  if (field === 'studio') next.studio = value;
  else if (field === 'trainer') next.trainer = value;
  else if (field === 'classType') next.classType = value;
  else if (field === 'memberName') next.memberName = value;
  else if (field === 'memberContact') next.memberContact = value;
  else if (field === 'category') {
    next.category = value;
    next.subCategory = undefined;
  } else if (field === 'subCategory') next.subCategory = value;
  else if (field === 'reportedBy') next.reportedBy = value;
  else next[field] = value;
  return next;
}

function normalizeInferredContext(input: unknown): Partial<DetailContext> {
  if (!input || typeof input !== 'object') return {};
  const value = input as Record<string, unknown>;
  const next: Partial<DetailContext> = {};
  const assignString = (key: keyof DetailContext) => {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) next[key] = candidate.trim();
  };

  assignString('intakeRoute');
  assignString('requestType');
  assignString('category');
  assignString('subCategory');
  assignString('priority');
  assignString('memberSentiment');
  assignString('desiredResolution');
  assignString('urgencyReason');

  return next;
}

function mergeInferredContext(ctx: DetailContext, inferred: Partial<DetailContext>, fallbackUrgency?: string): DetailContext {
  const next: DetailContext = { ...ctx };
  for (const [key, value] of Object.entries(inferred)) {
    if (!value) continue;
    if (key === 'category' && next.category !== value) {
      next.category = value;
      next.subCategory = undefined;
      continue;
    }
    next[key] = value;
  }
  if (fallbackUrgency && !next.urgencyReason) next.urgencyReason = fallbackUrgency;
  return next;
}

function fieldHasContextValue(field: DetailFormField, ctx: DetailContext): boolean {
  const value = ctx[field.id];
  const hasAnyIntakeValue = (...values: unknown[]) => values.some((candidate) => !isMissingIntakeValue(candidate));
  if (field.id === 'memberName') return hasAnyIntakeValue(ctx.memberId, ctx.memberName);
  if (field.id === 'memberContact') return hasAnyIntakeValue(ctx.memberContact, ctx.memberId);
  if (field.id === 'classType') return hasAnyIntakeValue(ctx.sessionId, ctx.classType);
  if (field.id === 'membership') return hasAnyIntakeValue(ctx.membership);
  return !isMissingIntakeValue(value);
}

function pruneDetailForm(form: DetailForm | null, ctx: DetailContext): DetailForm | null {
  if (!form) return null;
  const fields = form.fields.filter((field) => !fieldHasContextValue(field, ctx));
  if (fields.length === 0) return null;
  return { ...form, fields };
}

function detailFormFromQuestionText(text: string, ctx: DetailContext): DetailForm | null {
  const questionLines = text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[).\s-]*/, '').replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.endsWith('?') || /which|what|when|where|issue|experience|report|happen|date|time|resolution|refund|apology|investigation|member|contact|studio|request|category|reported|priority|freeze|roll|hosted|partner/i.test(line));

  if (questionLines.length < 2) {
    return null;
  }

  const fieldIds = new Set<string>();
  const add = (id: string, present?: string) => {
    if (!present) fieldIds.add(id);
  };

  for (const line of questionLines) {
    const lower = line.toLowerCase();
    if (lower.includes('studio')) add('studio', ctx.studio);
    if (lower.includes('member') || lower.includes('name')) add('memberName', ctx.memberName);
    if (lower.includes('contact') || lower.includes('phone') || lower.includes('email')) add('memberContact', ctx.memberContact);
    if (lower.includes('issue') || lower.includes('experience') || lower.includes('report') || lower.includes('what happened') || lower.includes('what did')) add('description', ctx.description);
    if (lower.includes('when') || lower.includes('date') || lower.includes('time') || lower.includes('happen') || lower.includes('incident')) add('incidentDateTime', ctx.incidentDateTime);
    if (lower.includes('resolution') || lower.includes('looking for') || lower.includes('refund') || lower.includes('apology') || lower.includes('investigation') || lower.includes('something else')) add('desiredResolution', ctx.desiredResolution);
    if (lower.includes('specific') || lower.includes('type')) add('requestType', ctx.requestType);
    if (lower.includes('reported') || lower.includes('documented')) add('reportedBy', ctx.reportedBy);
    if (lower.includes('priority') || lower.includes('urgent')) add('priority', ctx.priority);
    if (lower.includes('freeze')) {
      add('membership', ctx.membership);
      add('freezeStartDate', ctx.freezeStartDate);
      add('freezeEndDate', ctx.freezeEndDate);
      add('freezeReason', ctx.freezeReason);
    }
    if (lower.includes('roll') || lower.includes('extension')) {
      add('membership', ctx.membership);
      add('classesRemaining', ctx.classesRemaining);
      add('packageExpiryDate', ctx.packageExpiryDate);
      add('requestedRolloverDate', ctx.requestedRolloverDate);
      add('rolloverReason', ctx.rolloverReason);
    }
    if (lower.includes('hosted') || lower.includes('partner') || lower.includes('influencer')) {
      add('partnerName', ctx.partnerName);
      add('hostedFeedbackArea', ctx.hostedFeedbackArea);
      add('prospectQuality', ctx.prospectQuality);
      add('followUpPreference', ctx.followUpPreference);
    }
  }

  return normalizeDetailForm({
    title: 'Complete the ticket details',
    description: 'Athena grouped the missing operational details into a structured intake form using the Physique 57 master data lists.',
    fields: Array.from(fieldIds),
    submitLabel: 'Continue drafting ticket',
  });
}

function mergeDraftWithContext(draft: DraftTicket, ctx: DetailContext): DraftTicket {
  return {
    ...draft,
    category: ctx.category || draft.category,
    subCategory: ctx.subCategory || draft.subCategory,
    priority: (ctx.priority as DraftTicket['priority']) || draft.priority,
    studio: ctx.studio || draft.studio,
    trainer: ctx.trainer || draft.trainer,
    classType: ctx.classType || draft.classType,
    classDateTime: ctx.classDateTime || draft.classDateTime,
    memberName: ctx.memberName || draft.memberName,
    memberContact: ctx.memberContact || draft.memberContact,
    reportedBy: ctx.reportedBy || draft.reportedBy,
    sentiment: ctx.memberSentiment || draft.sentiment,
    conversationSummary: ctx.description || draft.conversationSummary,
  };
}

function contextFromDraft(draft: DraftTicket, ctx: DetailContext): DetailContext {
  return {
    ...ctx,
    category: draft.category || ctx.category,
    subCategory: draft.subCategory || ctx.subCategory,
    priority: draft.priority || ctx.priority,
    studio: draft.studio || ctx.studio,
    trainer: draft.trainer || ctx.trainer,
    classType: draft.classType || ctx.classType,
    classDateTime: draft.classDateTime || ctx.classDateTime,
    memberName: draft.memberName || ctx.memberName,
    memberContact: draft.memberContact || ctx.memberContact,
    reportedBy: draft.reportedBy || ctx.reportedBy,
    memberSentiment: draft.sentiment || ctx.memberSentiment,
  };
}

function requiredFieldsForIssue(ctx: DetailContext, draft?: DraftTicket | null): string[] {
  const mergedContext: DetailContext = draft
    ? {
        ...ctx,
        category: ctx.category || draft.category,
        subCategory: ctx.subCategory || draft.subCategory,
      }
    : ctx;

  return getMissingIntakeFields(mergedContext);
}

function detailFormForContext(ctx: DetailContext): DetailForm | null {
  const fields = requiredFieldsForIssue(ctx);
  if (fields.length === 0) return null;
  return normalizeDetailForm({
    title: 'Complete the ticket details',
    description: 'Athena needs these required fields before a ticket draft can be reviewed.',
    fields,
    submitLabel: 'Continue drafting ticket',
  });
}

function detailFormForIncompleteDraft(draft: DraftTicket | null | undefined, ctx: DetailContext): DetailForm | null {
  if (!draft) return null;
  const fields = requiredFieldsForIssue(ctx, mergeDraftWithContext(draft, ctx));

  if (fields.length === 0) return null;
  return normalizeDetailForm({
    title: 'Complete the ticket details',
    description: 'Athena needs these required fields before the ticket can be published.',
    fields,
    submitLabel: 'Submit required details',
  });
}

function buildClientDraft(ctx: DetailContext, text: string): DraftTicket {
  const category = ctx.category || 'General Feedback';
  const subCategory = ctx.subCategory || 'Other';
  const description = [
    `Member voice summary: ${ctx.description || text}`,
    '',
    'Operational context:',
    ctx.intakeRoute ? `- Intake route: ${ctx.intakeRoute}` : null,
    `- Category: ${category} / ${subCategory}`,
    ctx.memberName ? `- Community member: ${ctx.memberName}` : null,
    ctx.studio ? `- Studio space: ${ctx.studio}` : null,
    ctx.classType ? `- Signature experience/session: ${ctx.classType}` : null,
    ctx.incidentDateTime ? `- Approx. incident date/time: ${ctx.incidentDateTime}` : null,
    ctx.desiredResolution ? `- Requested resolution: ${ctx.desiredResolution}` : null,
  ].filter(Boolean).join('\n');

  return {
    title: [ctx.intakeRoute || 'Ticket', subCategory, ctx.memberName].filter(Boolean).join(' · ').slice(0, 96),
    description,
    category,
    subCategory,
    priority: (ctx.priority as DraftTicket['priority']) || 'Medium',
    studio: ctx.studio || 'Unspecified Studio',
    trainer: ctx.trainer || null,
    classType: ctx.classType || null,
    classDateTime: ctx.classDateTime || null,
    memberName: ctx.memberName || null,
    memberContact: ctx.memberContact || null,
    reportedBy: ctx.reportedBy || null,
    tags: ['ai-draft', ctx.intakeRoute, category, subCategory].filter(Boolean).map((value) =>
      String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    ),
    sentiment: ctx.memberSentiment || 'Neutral',
    conversationSummary: ctx.description || text,
  };
}

export const ChatInterface: React.FC = () => {
  const { createApprovedTicket } = useTickets();
  const { user } = useBackendAuth();
  const reporterName = getReporterName(user);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<DetailContext>({});
  const [pendingSingleField, setPendingSingleField] = useState<DetailFormField | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const publishingRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContext((current) => {
      if (current.reportedBy === reporterName) return current;
      return { ...current, reportedBy: reporterName };
    });
  }, [reporterName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const buildContextPreamble = (ctx: DetailContext) => {
    const parts: string[] = [];
    if (ctx.memberName) parts.push(`Member: ${ctx.memberName}`);
    if (ctx.intakeRoute) parts.push(`Intake route: ${ctx.intakeRoute}`);
    if (ctx.requestType) parts.push(`Specific ticket type: ${ctx.requestType}`);
    if (ctx.memberId) parts.push(`Momence member ID: ${ctx.memberId}`);
    if (ctx.memberContact) parts.push(`Member contact: ${ctx.memberContact}`);
    if (ctx.sessionId) parts.push(`Momence session ID: ${ctx.sessionId}`);
    if (ctx.studio) parts.push(`Studio: ${ctx.studio}`);
    if (ctx.trainer) parts.push(`Trainer: ${ctx.trainer}`);
    if (ctx.classType) parts.push(`Class: ${ctx.classType}`);
    if (ctx.classDateTime) parts.push(`Class date/time: ${ctx.classDateTime}`);
    if (ctx.membership) parts.push(`Membership: ${ctx.membership}`);
    if (ctx.category) parts.push(`Category: ${ctx.category}`);
    if (ctx.subCategory) parts.push(`Sub-category: ${ctx.subCategory}`);
    if (ctx.reportedBy) parts.push(`Reported by: ${ctx.reportedBy}`);
    if (ctx.priority) parts.push(`Priority: ${ctx.priority}`);
    if (ctx.description) parts.push(`Member stated feedback: ${ctx.description}`);
    if (ctx.incidentDateTime) parts.push(`Incident date/time: ${ctx.incidentDateTime}`);
    if (ctx.desiredResolution) parts.push(`Requested resolution: ${ctx.desiredResolution}`);
    Object.entries(ctx).forEach(([key, value]) => {
      if (
        value &&
        !['memberName', 'intakeRoute', 'requestType', 'memberId', 'memberContact', 'sessionId', 'studio', 'trainer', 'classType', 'classDateTime', 'membership', 'category', 'subCategory', 'reportedBy', 'priority', 'description', 'incidentDateTime', 'desiredResolution'].includes(key)
      ) {
        parts.push(`${getDetailField(key)?.label || key}: ${value}`);
      }
    });
    return parts.length ? `[Context — ${parts.join(' | ')}]\n` : '';
  };

  const sendMessage = async (text: string, contextOverride?: DetailContext) => {
    if (!text.trim() || loading) return;
    let activeContext = contextOverride || context;
    if (!contextOverride && pendingSingleField && pendingSingleField.type !== 'select') {
      activeContext = applyDetailValue(context, pendingSingleField.id, text.trim());
      setContext(activeContext);
      setPendingSingleField(null);
    }
    const capturedVoice = !contextOverride && !pendingSingleField
      ? captureMemberVoiceFromText(text, activeContext)
      : null;

    if (capturedVoice) {
      activeContext = applyDetailValue(activeContext, 'description', capturedVoice);
      setContext(activeContext);
    }
    const localInference = inferIntakeContextFromText(capturedVoice || text, activeContext);
    if (Object.keys(localInference).length > 0) {
      activeContext = { ...activeContext, ...localInference, reportedBy: reporterName };
      setContext(activeContext);
    }
    const preamble = buildContextPreamble(activeContext);
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    try {
      setLoading(true);
      const userMessages = newMessages.filter((m) => m.id !== 'greet').slice(-8);
      const firstUserIdx = userMessages.findIndex((m) => m.role === 'user');
      const apiMessages = userMessages.map((m, idx) => ({
        role: m.role,
        content: idx === firstUserIdx && m.role === 'user' && preamble ? preamble + m.content : m.content,
      }));
      if (apiMessages.length > 0 && preamble) {
        apiMessages[apiMessages.length - 1] = {
          ...apiMessages[apiMessages.length - 1],
          content: preamble + apiMessages[apiMessages.length - 1].content,
        };
      }

      const { data, error } = await supabase.functions.invoke<AiIntakeResponse>('ticket-ai-chat', {
        body: {
          action: 'draftTicket',
          draftOnly: true,
          approved: false,
          instructions: ATHENA_SYSTEM_PROMPT,
          masterData: {
            routes: INTAKE_ROUTES,
            studios: STUDIOS,
            instructors: TRAINERS,
            classTypes: CLASS_TYPES,
            categories: CATEGORIES,
            associates: ASSOCIATES.map((associate) => associate.name),
            priorities: Object.keys(PRIORITY_SLA),
            sentiments: MEMBER_SENTIMENT_OPTIONS,
          },
          messages: apiMessages,
          conversationId,
          context: activeContext,
        },
      });

      if (error) throw error;

      if (data?.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      const inferredContext = normalizeInferredContext(data?.inferredContext);
      let responseContext = mergeInferredContext(activeContext, inferredContext, data?.urgencyReason);
      if (Object.keys(inferredContext).length > 0 || data?.urgencyReason) {
        responseContext = { ...responseContext, reportedBy: reporterName };
        activeContext = responseContext;
        setContext(responseContext);
      }

      const incompleteDraftForm = pruneDetailForm(detailFormForIncompleteDraft(data?.ticket, responseContext), responseContext);
      const normalizedForm = pruneDetailForm(normalizeDetailForm(data?.detailForm), responseContext);
      const localMissingForm = pruneDetailForm(detailFormForContext(responseContext), responseContext);
      const detailForm = normalizedForm || incompleteDraftForm || localMissingForm;
      const parsedQuestionForm = !detailForm && !data?.ticket
        ? pruneDetailForm(detailFormFromQuestionText(data?.reply || '', responseContext), responseContext)
        : null;
      const finalDetailForm = detailForm || parsedQuestionForm;
      const remainingMissingFields = getMissingIntakeFields(responseContext);
      const ticket = finalDetailForm || data?.needsMoreInfo || remainingMissingFields.length > 0
        ? null
        : data?.ticket || buildClientDraft(responseContext, text);
      if (ticket) {
        const syncedContext = contextFromDraft(ticket, responseContext);
        activeContext = syncedContext;
        setContext(syncedContext);
      }
      const singleField = finalDetailForm?.fields.length === 1 ? finalDetailForm.fields[0] : null;
      const singleFieldNeedsPicker = singleField
        ? ['memberName', 'memberContact', 'classType', 'sessionId', 'membership'].includes(singleField.id)
        : false;
      setPendingSingleField(singleField && !singleFieldNeedsPicker && singleField.type !== 'select' ? singleField : null);
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: singleField
          ? singleFieldNeedsPicker
            ? `Select ${singleField.label.toLowerCase()}:`
            : `Please submit ${singleField.label.toLowerCase()} below.`
          : finalDetailForm
            ? 'Please complete the required intake fields below.'
            : ticket
              ? 'I drafted the ticket below. Please review it before publishing.'
              : data?.reply || "Hmm, I didn't catch that. Could you rephrase?",
        ticket,
        suggestedChips: [],
        detailForm: finalDetailForm,
        published: false,
        ticketId: undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

    } catch (e: unknown) {
      const message = getDisplayError(e, 'Ticket AI chat failed');
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I hit an error: ${message}. Please try again.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (chip: SuggestedChip) => {
    if (context[chip.field]) return;
    const next = applyDetailValue(context, chip.field, chip.value);
    setPendingSingleField(null);
    setContext(next);
    sendMessage(`${getDetailField(chip.field)?.label || chip.field}: ${chip.value}`, next);
  };

  const resetChat = () => {
    setMessages([GREETING]);
    setContext({ reportedBy: reporterName });
    setPendingSingleField(null);
    setConversationId(null);
    setLoading(false);
  };

  const submitDetailForm = (values: Record<string, string>, form?: DetailForm) => {
    let nextContext: DetailContext = { ...context };
    for (const [key, value] of Object.entries(values)) {
      if (!value) continue;
      nextContext = applyDetailValue(nextContext, key, value);
    }
    setContext(nextContext);
    setPendingSingleField(null);

    const fieldLabels = new Map((form?.fields || []).map((field) => [field.id, field.label]));
    const detailLines = Object.entries(values)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => `${getDetailField(key)?.label || fieldLabels.get(key) || key}: ${value}`);
    sendMessage(`Here are the missing details:\n${detailLines.join('\n')}`, nextContext);
  };

  const publishDraft = async (messageId: string, draft: DraftTicket) => {
    if (loading || publishingRef.current.has(messageId)) return;
    const publishableDraft = mergeDraftWithContext(draft, context);
    const missingDetailsForm = detailFormForIncompleteDraft(publishableDraft, context);
    if (missingDetailsForm) {
      setPendingSingleField(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `publish-required-${Date.now()}`,
          role: 'assistant',
          content: 'This ticket is not ready to publish. Submit the required details below first.',
          detailForm: missingDetailsForm,
          published: false,
        },
      ]);
      return;
    }

    publishingRef.current.add(messageId);
    setLoading(true);
    try {
      const created = await createApprovedTicket(publishableDraft, conversationId, context as Record<string, unknown>);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? { ...message, published: true, ticketId: created.id }
            : message
        )
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `published-${Date.now()}`,
          role: 'assistant',
          content: `Approved. Ticket **${created.id}** has been published to Submitted Tickets.`,
          published: true,
          ticketId: created.id,
        },
      ]);
    } catch (e: unknown) {
      const message = getDisplayError(e, 'Ticket creation failed');
      setMessages((prev) => [
        ...prev,
        {
          id: `publish-error-${Date.now()}`,
          role: 'assistant',
          content: `I could not publish that ticket yet: ${message}. The draft is still available for approval.`,
        },
      ]);
    } finally {
      publishingRef.current.delete(messageId);
      setLoading(false);
    }
  };

  const refineDraft = () => {
    // TicketPreviewCard owns the edit UI; this callback keeps the existing prop contract.
  };

  const saveEditedDraft = (messageId: string, draft: DraftTicket) => {
    const syncedContext = contextFromDraft(draft, context);
    setContext(syncedContext);
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              ticket: {
                ...draft,
                conversationSummary: draft.conversationSummary || draft.description,
              },
              published: false,
              ticketId: undefined,
            }
          : message
      )
    );
  };

  return (
    <div className="flex h-full flex-col bg-[#f8fafc] text-stone-950 dark:bg-stone-950 dark:text-stone-50">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-950 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-600 text-white shadow-sm dark:border-blue-300/20">
              <Bot className="h-5 w-5" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 shadow-sm dark:border-stone-950" />
            </div>
            <div>
              <h2 className="flex items-center gap-1.5 text-base font-semibold text-stone-950 dark:text-stone-50">
                Athena <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Operations intelligence · Physique 57 India
              </p>
            </div>
          </div>
          <button
            onClick={resetChat}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-stone-950 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-blue-700 dark:hover:text-stone-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="mx-auto w-full max-w-5xl flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onChipClick={handleChipClick}
            onConfirm={publishDraft}
            onEdit={refineDraft}
            onSaveEdit={saveEditedDraft}
            onDetailFormSubmit={submitDetailForm}
            context={context}
          />
        ))}
        {loading && <TypingIndicator />}
      </div>

      <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 pb-1 pt-2 dark:border-stone-800 dark:bg-stone-950 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              Context
            </span>
            <div className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
          </div>
          <ContextPicker context={context} onChange={(next) => setContext((current) => ({ ...current, ...next }))} />
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-950 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Describe the incident, feedback or complaint…"
              className="max-h-32 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-3 text-sm text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-blue-700 dark:focus:ring-blue-900/40"
              style={{ minHeight: '48px' }}
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="mx-auto mt-1.5 w-full max-w-5xl px-1 text-[10px] text-stone-400">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{
  message: Message;
  onChipClick: (chip: SuggestedChip) => void;
  onConfirm: (messageId: string, draft: DraftTicket) => void;
  onEdit: (draft: DraftTicket) => void;
  onSaveEdit: (messageId: string, draft: DraftTicket) => void;
  onDetailFormSubmit: (values: Record<string, string>, form?: DetailForm) => void;
  context: DetailContext;
}> = ({ message, onChipClick, onConfirm, onEdit, onSaveEdit, onDetailFormSubmit, context }) => {
  const isUser = message.role === 'user';
  const visibleChips = (message.suggestedChips || []).filter((chip) => !context[chip.field]);

  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => (
      <React.Fragment key={i}>
        {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            <React.Fragment key={j}>{part}</React.Fragment>
          )
        )}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    ));
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg shadow-sm ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'border border-slate-200 bg-white text-blue-700 dark:border-blue-300/20 dark:bg-stone-900 dark:text-blue-200'
        }`}
      >
        {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`max-w-[86%] flex-1 ${message.detailForm || message.ticket ? 'sm:max-w-[92%]' : 'sm:max-w-[74%]'} ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div
          className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm transition duration-200 ${
            isUser
              ? 'rounded-tr-md bg-blue-600 text-white'
              : 'rounded-tl-md border border-slate-200 bg-white text-stone-800 dark:border-blue-300/15 dark:bg-stone-900 dark:text-stone-200'
          }`}
        >
          {renderContent(message.content)}
        </div>

        {visibleChips.length > 0 && !message.ticket && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {visibleChips.map((c, i) => (
              <button
                key={i}
                onClick={() => onChipClick(c)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 hover:text-stone-950 dark:border-blue-300/15 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-blue-600 dark:hover:bg-stone-800 dark:hover:text-white"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {message.detailForm && !message.ticket && (
          <DetailCaptureForm form={message.detailForm} initialContext={context} onSubmit={onDetailFormSubmit} />
        )}

        {message.ticket && (
          <div className="mt-2 w-full">
            <TicketPreviewCard
              draft={mergeDraftWithContext(message.ticket, context)}
              onConfirm={() => onConfirm(message.id, mergeDraftWithContext(message.ticket as DraftTicket, context))}
              onEdit={() => onEdit(mergeDraftWithContext(message.ticket as DraftTicket, context))}
              onSaveEdit={(draft) => onSaveEdit(message.id, draft)}
              confirmed={message.published}
              ticketId={message.ticketId}
            />
          </div>
        )}
        {message.published && !message.ticket && message.ticketId && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Published to dashboard
          </div>
        )}
      </div>
    </div>
  );
};

const TypingIndicator: React.FC = () => (
  <div className="flex gap-2.5">
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-950 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
      <Bot className="w-4 h-4" />
    </div>
    <div className="inline-flex items-center gap-1 rounded-2xl rounded-tl-sm border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-500" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-500" style={{ animationDelay: '150ms' }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-500" style={{ animationDelay: '300ms' }} />
    </div>
  </div>
);

const DetailCaptureForm: React.FC<{
  form: DetailForm;
  initialContext: DetailContext;
  onSubmit: (values: Record<string, string>, form?: DetailForm) => void;
}> = ({ form, initialContext, onSubmit }) => {
  const initialValues = form.fields.reduce<Record<string, string>>((acc, field) => {
    const id = String(field.id);
    acc[id] = initialContext[id] || '';
    return acc;
  }, {});
  for (const key of ['memberId', 'memberName', 'memberContact', 'sessionId', 'classType', 'classDateTime', 'trainer', 'studio', 'membership']) {
    if (initialContext[key]) initialValues[key] = initialContext[key] || '';
  }
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [membershipOptions, setMembershipOptions] = useState<string[]>([]);
  const hasMemberFields = form.fields.some((field) => field.id === 'memberName' || field.id === 'memberContact');
  const hasSessionFields = form.fields.some((field) => field.id === 'classType' || field.id === 'classDateTime' || field.id === 'sessionId');

  useEffect(() => {
    if (!values.memberId) {
      setMembershipOptions([]);
      return;
    }
    let cancelled = false;
    loadActiveMembershipOptions(values.memberId)
      .then((options) => {
        if (!cancelled) setMembershipOptions(options);
      })
      .catch(() => {
        if (!cancelled) setMembershipOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [values.memberId]);

  const setValue = (id: string, value: string) => {
    setValues((current) => {
      const next = { ...current, [id]: value };
      if (id === 'category' && current.category !== value) next.subCategory = '';
      return next;
    });
  };

  const canSubmit = form.fields.every((field) => !field.required || values[String(field.id)]?.trim());

  return (
    <form
      className="mt-3 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-blue-300/15 dark:bg-stone-900"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit(values, form);
      }}
    >
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-blue-300/10 dark:bg-white/[0.03]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-stone-950 dark:text-stone-50">{form.title}</h3>
            {form.description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-stone-500 dark:text-stone-400">{form.description}</p>}
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {hasMemberFields && (
          <MomenceMemberFormField
            values={values}
            onSelect={async (member) => {
              setValues((current) => ({
                ...current,
                memberId: member.id,
                memberName: member.name,
                memberContact: member.email || member.phoneNumber || member.description,
                membership: '',
              }));
            }}
          />
        )}
        {hasSessionFields && (
          <MomenceSessionFormField
            values={values}
            onSelect={(session) => {
              setValues((current) => ({
                ...current,
                sessionId: session.id,
                classType: session.classType,
                classDateTime: session.startsAt || '',
                trainer: session.trainer || current.trainer || '',
                studio: session.studio || current.studio || '',
              }));
            }}
          />
        )}
        {form.fields.map((field) => {
          const id = String(field.id);
          if (hasMemberFields && (id === 'memberName' || id === 'memberContact')) return null;
          if (hasSessionFields && (id === 'classType' || id === 'classDateTime' || id === 'sessionId')) return null;
          const category = values.category;
          const options =
            field.id === 'subCategory' && category
              ? CATEGORIES[category] || []
              : field.id === 'subCategory'
                ? []
              : field.id === 'membership' && values.memberId
                ? membershipOptions
                : field.id === 'membership'
                  ? []
                  : field.options || [];

          return (
            <label
              key={id}
              className={`group rounded-xl border border-slate-200 bg-white p-3 transition duration-200 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-50 dark:border-blue-300/10 dark:bg-white/[0.03] ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}
            >
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {field.label}
                {field.required ? <span className="text-blue-600"> *</span> : ''}
              </span>
              {field.type === 'select' ? (
                <select
                  value={values[id] || ''}
                  onChange={(event) => setValue(id, event.target.value)}
                  disabled={(field.id === 'membership' && !values.memberId) || (field.id === 'subCategory' && !values.category)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-blue-700 dark:focus:ring-blue-900/40 dark:disabled:bg-stone-900"
                >
                  <option value="">
                    {field.id === 'membership' && !values.memberId
                      ? 'Select a Momence member first'
                      : field.id === 'subCategory' && !values.category
                        ? 'Select category first'
                      : `Select ${field.label.toLowerCase()}`}
                  </option>
                  {options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={values[id] || ''}
                  onChange={(event) => setValue(id, event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-blue-700 dark:focus:ring-blue-900/40"
                  placeholder="Capture what the member stated..."
                />
              ) : (
                <input
                  type={field.type === 'date' || field.type === 'datetime-local' || field.type === 'number' ? field.type : 'text'}
                  value={values[id] || ''}
                  onChange={(event) => setValue(id, event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-blue-700 dark:focus:ring-blue-900/40"
                  placeholder={field.label}
                />
              )}
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-blue-300/10 dark:bg-white/[0.02]">
        <span className="text-[11px] text-stone-400">
          {form.fields.filter((field) => field.required).length} required fields
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {form.submitLabel || 'Continue'}
        </button>
      </div>
    </form>
  );
};

function formatMembershipOption(membership: MomenceMembership): string {
  const name = membership.membership?.name || membership.type || `Membership #${membership.id}`;
  const credits =
    membership.eventCreditsLeft != null
      ? `${membership.eventCreditsLeft} credits left`
      : membership.usedSessions != null && membership.usageLimitForSessions != null
        ? `${Math.max(membership.usageLimitForSessions - membership.usedSessions, 0)} sessions left`
        : '';
  const endDate = membership.endDate
    ? `ends ${new Date(membership.endDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`
    : '';
  return [name, credits, endDate].filter(Boolean).join(' · ');
}

async function loadActiveMembershipOptions(memberId: string): Promise<string[]> {
  const memberships = await getMomenceMemberMemberships(memberId);
  return memberships
    .filter((membership) => !membership.isFrozen)
    .map(formatMembershipOption);
}

const MomenceMemberFormField: React.FC<{
  values: Record<string, string>;
  onSelect: (member: MomenceMemberOption) => void | Promise<void>;
}> = ({ values, onSelect }) => {
  const [query, setQuery] = useState(values.memberName || values.memberContact || '');
  const [options, setOptions] = useState<MomenceMemberOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState(values.memberId || '');

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (selectedMemberId && query === values.memberName) {
        setOptions([]);
        return;
      }
      if (query.trim().length < 2) {
        setOptions([]);
        return;
      }
      try {
        setError(null);
        setOptions(await searchMomenceMembers(query));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Member search failed');
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, selectedMemberId, values.memberName]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-50 dark:border-blue-300/10 dark:bg-white/[0.03] md:col-span-2">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        Momence Member *
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-blue-700 dark:focus:ring-blue-900/40"
        placeholder="Search Momence by member name, email, or phone"
      />
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
      {values.memberName && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          Selected: {values.memberName}
          {values.memberContact ? ` · ${values.memberContact}` : ''}
        </div>
      )}
      {options.length > 0 && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70 dark:border-stone-800 dark:bg-stone-900 dark:shadow-black/30">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={async () => {
                setSelectedMemberId(option.id);
                setOptions([]);
                setQuery(option.label);
                await onSelect(option);
                setOptions([]);
              }}
              className="block w-full border-b border-stone-100 px-3 py-2 text-left text-xs last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800"
            >
              <div className="font-semibold text-stone-900 dark:text-stone-100">{option.label}</div>
              <div className="mt-0.5 text-[11px] text-stone-500">{option.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const MomenceSessionFormField: React.FC<{
  values: Record<string, string>;
  onSelect: (session: MomenceSessionOption) => void;
}> = ({ values, onSelect }) => {
  const [query, setQuery] = useState(values.classType || '');
  const [options, setOptions] = useState<MomenceSessionOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      try {
        setError(null);
        setOptions(await searchMomenceSessions(query));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Session search failed');
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-50 dark:border-blue-300/10 dark:bg-white/[0.03] md:col-span-2">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        Momence Class / Session *
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-blue-700 dark:focus:ring-blue-900/40"
        placeholder="Search Momence sessions by class, instructor, studio, or date"
      />
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
      {values.classType && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          Selected: {values.classType}
          {values.trainer ? ` · ${values.trainer}` : ''}
          {values.studio ? ` · ${values.studio}` : ''}
          {values.classDateTime ? ` · ${new Date(values.classDateTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
        </div>
      )}
      {options.length > 0 && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70 dark:border-stone-800 dark:bg-stone-900 dark:shadow-black/30">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onSelect(option);
                setQuery(option.label);
                setOptions([]);
              }}
              className="block w-full border-b border-stone-100 px-3 py-2 text-left text-xs last:border-0 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800"
            >
              <div className="font-semibold text-stone-900 dark:text-stone-100">{option.label}</div>
              <div className="mt-0.5 text-[11px] text-stone-500">{option.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
