import React, { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Send, Sparkles, CheckCircle2, Paperclip, X, Mic, Square } from 'lucide-react';
import InteractiveRobotSpline from '@/components/InteractiveRobotSpline';
import { ROBOT_SPLINE_URL } from '@/lib/galleryImages';
import { TicketPreviewCard } from './TicketPreviewCard';
import { ContextPicker, Context } from './ContextPicker';
import { useTickets } from './TicketContext';
import { useBackendAuth } from '@/contexts/BackendAuthContext';
import { RoutingSettings, defaultRoutingSettings, loadRoutingSettings } from '@/lib/routing-settings';
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
  Ticket,
  resolveTicketAssignee,
  resolveTicketDepartment,
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
  assignedTo?: string | null;
  department?: string | null;
  tags: string[];
  sentiment?: string;
  conversationSummary?: string;
}

interface PendingAttachment {
  id: string;
  file: File;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type DetailContext = Context & IntakeContext;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  aiGenerated?: boolean;
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
    "Hi, I'm **Athena** 🤖, your ticket intake assistant.\n\nPlease describe the issue, request, feedback, or escalation in as much detail as possible.\n\nFor accurate routing and priority 🎯, please include the member name, location, booking details, staff involved, screenshots 📸, dates 📅, and any other relevant context.",
};

const USER_TONES = [
  {
    avatar: 'border-rose-200 bg-white text-rose-600 shadow-[0_12px_28px_rgba(190,24,93,0.16)]',
    bubble: 'rounded-tr-md border border-l-4 border-rose-200 border-l-rose-500 bg-white text-slate-800 shadow-[0_18px_44px_rgba(190,24,93,0.14)]',
    more: 'text-rose-700 hover:text-rose-900',
  },
  {
    avatar: 'border-red-200 bg-white text-red-600 shadow-[0_12px_28px_rgba(220,38,38,0.14)]',
    bubble: 'rounded-tr-md border border-l-4 border-red-200 border-l-red-500 bg-white text-slate-800 shadow-[0_18px_44px_rgba(220,38,38,0.13)]',
    more: 'text-red-700 hover:text-red-900',
  },
  {
    avatar: 'border-emerald-200 bg-white text-emerald-600 shadow-[0_12px_28px_rgba(16,185,129,0.14)]',
    bubble: 'rounded-tr-md border border-l-4 border-emerald-200 border-l-emerald-500 bg-white text-slate-800 shadow-[0_18px_44px_rgba(16,185,129,0.13)]',
    more: 'text-emerald-700 hover:text-emerald-900',
  },
  {
    avatar: 'border-violet-200 bg-white text-violet-600 shadow-[0_12px_28px_rgba(124,58,237,0.15)]',
    bubble: 'rounded-tr-md border border-l-4 border-violet-200 border-l-violet-500 bg-white text-slate-800 shadow-[0_18px_44px_rgba(124,58,237,0.14)]',
    more: 'text-violet-700 hover:text-violet-900',
  },
];

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
- Ask only for operational details that are missing after inference and are relevant to the described incident.
- Wherever possible, ask using a direct question plus selectable button options instead of open text.
- Never create or return a ticket draft with partial information. Gather missing required fields first.
- Never ask multiple questions as prose. If more than one field is missing, return a structured detailForm with complete field objects.
- The AI must dynamically decide issue-specific fields from the described incident, inferred route, category, subcategory, and current context. Do not rely on fixed subcategory templates or static incident question sets.
- For issue-specific fields, return full field definitions: id, label, type, required, and incident-specific options when useful.
- Always populate inferredContext with category, subCategory, intakeRoute, and priority once inferred, even when asking for more details.
- Before returning any detailForm, decide which context fields are actually required for this specific incident; omit unrelated Momence member, session, class, and trainer fields.
- Ask for member, session, class, or trainer details only when the described incident actually requires them. Do not include selected/stale member, session, class, or trainer context in the draft unless it is relevant to the ticket.
- Use only the application-provided constants for routes, studios, instructors, class types, categories, subcategories, associates, priorities, and option buttons.
- Use admin-provided routing settings when present. Do not invent owners, departments, SLAs, escalation paths, locations, or employee names.
- Ticket titles should include the most specific issue plus member/session/studio context when known, for example "AC malfunction in Studio 1 - Kwality House" or "Hosted class feedback - Ahana Power Cycle".
- Member name/contact and class/session context must come from Momence search fields in the UI; do not ask users to type those as ordinary text when a form is used.
- For freeze, rollover, membership, and package-specific requests, require the selected Momence member before requesting membership, and use only that member's currently active memberships.
- Always write in third-person internal documentation language: "Member reported...", "Client requested...", "Community member stated...".
- Use a few relevant emojis where appropriate (for example: ✅ 📌 📅 ⚠️), but keep responses professional and avoid overuse.
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
  else if (field === 'assignedTo' || field === 'owner') next.assignedTo = value;
  else if (field === 'department' || field === 'team') next.department = value;
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
    if (
      (key === 'category' || key === 'subCategory') &&
      next.category === 'Hosted Class & Partnerships' &&
      (value === 'General Feedback' || value === 'Other')
    ) {
      continue;
    }
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
  const resolvedOwner = ctx.assignedTo || ctx.owner || draft.assignedTo || resolveTicketAssignee(ctx.category || draft.category, ctx.studio || draft.studio);
  const resolvedDepartment = ctx.department || ctx.team || draft.department || resolveTicketDepartment(ctx.category || draft.category, resolvedOwner);
  return {
    ...draft,
    category: ctx.category || draft.category,
    subCategory: ctx.subCategory || draft.subCategory,
    priority: (ctx.priority as DraftTicket['priority']) || draft.priority,
    studio: ctx.studio || draft.studio,
    trainer: draft.trainer || null,
    classType: draft.classType || null,
    classDateTime: draft.classDateTime || null,
    memberName: draft.memberName || null,
    memberContact: draft.memberContact || null,
    reportedBy: ctx.reportedBy || draft.reportedBy,
    assignedTo: resolvedOwner,
    department: resolvedDepartment,
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
    trainer: draft.trainer || undefined,
    classType: draft.classType || undefined,
    classDateTime: draft.classDateTime || undefined,
    memberName: draft.memberName || undefined,
    memberContact: draft.memberContact || undefined,
    reportedBy: ctx.reportedBy || draft.reportedBy,
    assignedTo: draft.assignedTo || ctx.assignedTo || ctx.owner,
    department: draft.department || ctx.department || ctx.team,
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

const MEMBER_ENTITY_KEYS = ['memberId', 'memberName', 'memberContact', 'membership'] as const;
const SESSION_ENTITY_KEYS = ['sessionId', 'classType', 'classDateTime', 'trainer'] as const;

function shouldCarryMemberContext(issueText: string, ctx: DetailContext): boolean {
  const value = [
    issueText,
    ctx.category,
    ctx.subCategory,
    ctx.requestType,
  ].filter(Boolean).join(' ').toLowerCase();

  return /member|client|customer|guest|prospect|profile|contact|phone|email|membership|package|billing|payment|refund|freeze|roll\s?over|extension|renewal|follow-up/.test(value);
}

function shouldCarrySessionContext(issueText: string, ctx: DetailContext): boolean {
  const value = [
    issueText,
    ctx.category,
    ctx.subCategory,
    ctx.requestType,
  ].filter(Boolean).join(' ').toLowerCase();

  return /class|session|booking|schedul|waitlist|attendance|attendee|trainer|instructor|barre|cycle|powercycle|strength|late cancellation|no-show/.test(value);
}

function pruneEntityContextForIssue(
  ctx: DetailContext,
  issueText: string,
  explicitlyRequestedFields = new Set<string>()
): DetailContext {
  const next: DetailContext = { ...ctx };
  const keepMemberContext = shouldCarryMemberContext(issueText, ctx)
    || MEMBER_ENTITY_KEYS.some((key) => explicitlyRequestedFields.has(key));
  const keepSessionContext = shouldCarrySessionContext(issueText, ctx)
    || SESSION_ENTITY_KEYS.some((key) => explicitlyRequestedFields.has(key));

  if (!keepMemberContext) {
    MEMBER_ENTITY_KEYS.forEach((key) => {
      delete (next as Record<string, unknown>)[key];
    });
  }

  if (!keepSessionContext) {
    SESSION_ENTITY_KEYS.forEach((key) => {
      delete (next as Record<string, unknown>)[key];
    });
  }

  return next;
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
  const includeMemberContext = shouldCarryMemberContext(text, ctx);
  const includeSessionContext = shouldCarrySessionContext(text, ctx);
  const description = [
    `Member voice summary: ${ctx.description || text}`,
    '',
    'Operational context:',
    ctx.intakeRoute ? `- Intake route: ${ctx.intakeRoute}` : null,
    `- Category: ${category} / ${subCategory}`,
    includeMemberContext && ctx.memberName ? `- Community member: ${ctx.memberName}` : null,
    ctx.studio ? `- Studio space: ${ctx.studio}` : null,
    includeSessionContext && ctx.trainer ? `- Studio instructor: ${ctx.trainer}` : null,
    includeSessionContext && ctx.classType ? `- Signature experience/session: ${ctx.classType}` : null,
    ctx.incidentDateTime ? `- Approx. incident date/time: ${ctx.incidentDateTime}` : null,
    ctx.desiredResolution ? `- Requested resolution: ${ctx.desiredResolution}` : null,
    ...Object.entries(ctx)
      .filter(([key, value]) => (
        value &&
        ![
          'intakeRoute',
          'requestType',
          'memberId',
          'memberName',
          'memberContact',
          'sessionId',
          'studio',
          'trainer',
          'classType',
          'classDateTime',
          'membership',
          'category',
          'subCategory',
          'reportedBy',
          'priority',
          'description',
          'incidentDateTime',
          'desiredResolution',
          'memberSentiment',
          'urgencyReason',
        ].includes(key)
      ))
      .map(([key, value]) => `- ${getDetailField(key)?.label || key}: ${value}`),
  ].filter(Boolean).join('\n');

  return {
    title: [ctx.intakeRoute || 'Ticket', subCategory, includeMemberContext ? ctx.memberName : null].filter(Boolean).join(' · ').slice(0, 96),
    description,
    category,
    subCategory,
    priority: (ctx.priority as DraftTicket['priority']) || 'Medium',
    studio: ctx.studio || 'Unspecified Studio',
    trainer: includeSessionContext ? ctx.trainer || null : null,
    classType: includeSessionContext ? ctx.classType || null : null,
    classDateTime: includeSessionContext ? ctx.classDateTime || null : null,
    memberName: includeMemberContext ? ctx.memberName || null : null,
    memberContact: includeMemberContext ? ctx.memberContact || null : null,
    reportedBy: ctx.reportedBy || null,
    assignedTo: ctx.assignedTo || ctx.owner || null,
    department: ctx.department || ctx.team || null,
    tags: ['ai-draft', ctx.intakeRoute, category, subCategory].filter(Boolean).map((value) =>
      String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    ),
    sentiment: ctx.memberSentiment || 'Neutral',
    conversationSummary: ctx.description || text,
  };
}

function normalizeTicketSearchText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2 && ![
          'the',
          'and',
          'for',
          'with',
          'from',
          'this',
          'that',
          'member',
          'client',
          'class',
          'studio',
          'house',
          'kwality',
          'kemps',
          'corner',
          'bandra',
          'mumbai',
          'bengaluru',
          'bangalore',
        ].includes(token))
    )
  );
}

function ticketCategoryFamily(category?: string | null): string {
  const value = (category || '').toLowerCase();
  if (/(billing|membership|pricing|refund|payment|charge)/.test(value)) return 'billing';
  if (/(facility|equipment|repair|amenit|safety|medical|theft|operating|tech|app)/.test(value)) return 'operations';
  if (/(trainer|instructor|class experience|progress|transformation)/.test(value)) return 'class';
  if (/(hosted|partnership|brand)/.test(value)) return 'partnership';
  if (/(booking|schedule|front desk|service|sales|consultation)/.test(value)) return 'service';
  return value || 'general';
}

function hasExactIdentityMatch(ctx: DetailContext, ticket: Ticket): boolean {
  const memberName = ctx.memberName?.trim().toLowerCase();
  const memberContact = ctx.memberContact?.trim().toLowerCase();
  return Boolean(
    (memberName && ticket.memberName?.toLowerCase() === memberName) ||
    (memberContact && ticket.memberContact?.toLowerCase() === memberContact)
  );
}

function hasCompatibleDuplicateCategory(ctx: DetailContext, ticket: Ticket): boolean {
  if (!ctx.category) return true;
  return ticketCategoryFamily(ctx.category) === ticketCategoryFamily(ticket.category);
}

function findExistingSubmittedTicket(text: string, ctx: DetailContext, tickets: Ticket[]): Ticket | null {
  const explicitId = text.match(/\b(?:P57|TKT|TK)-?[A-Z0-9-]{3,}\b/i)?.[0]?.toLowerCase();
  if (explicitId) {
    const byId = tickets.find((ticket) => ticket.id.toLowerCase() === explicitId);
    if (byId) return byId;
  }

  const inputTokens = normalizeTicketSearchText([
    text,
    ctx.memberName,
    ctx.memberContact,
    ctx.studio,
    ctx.trainer,
    ctx.classType,
    ctx.category,
    ctx.subCategory,
  ].filter(Boolean).join(' '));
  if (inputTokens.length < 4) return null;

  let best: { ticket: Ticket; score: number } | null = null;
  for (const ticket of tickets) {
    const exactIdentityMatch = hasExactIdentityMatch(ctx, ticket);
    if (!exactIdentityMatch && !hasCompatibleDuplicateCategory(ctx, ticket)) continue;

    const haystackTokens = normalizeTicketSearchText([
      ticket.id,
      ticket.title,
      ticket.description,
      ticket.conversationSummary,
      ticket.category,
      ticket.subCategory,
      ticket.memberName,
      ticket.memberContact,
      ticket.studio,
      ticket.trainer,
      ticket.classType,
    ].filter(Boolean).join(' '));
    const haystack = new Set(haystackTokens);
    const overlap = inputTokens.filter((token) => haystack.has(token)).length;
    const hasIssueOverlap = overlap >= 3;
    const contextBoost =
      (exactIdentityMatch ? 0.24 : 0) +
      (ctx.studio && ticket.studio === ctx.studio ? 0.08 : 0) +
      (ctx.trainer && ticket.trainer === ctx.trainer ? 0.08 : 0) +
      (ctx.sessionId && ticket.sourceRef?.includes(ctx.sessionId) ? 0.18 : 0);
    const score = overlap / Math.max(8, Math.min(inputTokens.length, haystackTokens.length)) + contextBoost;
    const threshold = exactIdentityMatch ? 0.58 : 0.66;
    if (hasIssueOverlap && score >= threshold && (!best || score > best.score)) best = { ticket, score };
  }

  return best?.ticket || null;
}

export const ChatInterface: React.FC<{ onOpenExistingTicket?: (ticket: Ticket) => void; resetVersion?: number }> = ({ onOpenExistingTicket, resetVersion = 0 }) => {
  const { createApprovedTicket, tickets, setSelectedTicket } = useTickets();
  const { user } = useBackendAuth();
  const reporterName = getReporterName(user);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [context, setContext] = useState<DetailContext>({});
  const [pendingSingleField, setPendingSingleField] = useState<DetailFormField | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLiveText, setVoiceLiveText] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [routingSettings, setRoutingSettings] = useState<RoutingSettings>(() => defaultRoutingSettings());
  const [now, setNow] = useState<Date>(new Date());
  const publishingRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalVoiceTranscriptRef = useRef('');
  const voiceSessionActiveRef = useRef(false);
  const voiceManualStopRef = useRef(false);
  const voiceSilenceTimerRef = useRef<number | null>(null);
  const requestNonceRef = useRef(0);
  const activeChatEpochRef = useRef(0);
  const lastResetVersionRef = useRef(resetVersion);
  const recentTickets = useMemo(
    () => [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 2),
    [tickets]
  );

  useEffect(() => {
    setContext((current) => {
      if (current.reportedBy === reporterName) return current;
      return { ...current, reportedBy: reporterName };
    });
  }, [reporterName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    let mounted = true;
    loadRoutingSettings().then((settings) => {
      if (mounted) setRoutingSettings(settings);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    const maybeCtor = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    setVoiceSupported(Boolean(maybeCtor));
  }, []);

  useEffect(() => () => {
    voiceSessionActiveRef.current = false;
    speechRecognitionRef.current?.stop();
    if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
  }, []);

  const addAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    setPendingAttachments((current) => {
      const next = [...current];
      Array.from(files).forEach((file) => {
        const exists = next.some((entry) => (
          entry.file.name === file.name &&
          entry.file.size === file.size &&
          entry.file.lastModified === file.lastModified
        ));
        if (!exists) next.push({ id: `${file.name}-${file.size}-${file.lastModified}`, file });
      });
      return next.slice(0, 8);
    });
  };

  const normalizeVoiceText = (value: string) =>
    value
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim();

  const armVoiceSilenceTimer = () => {
    if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
    voiceSilenceTimerRef.current = window.setTimeout(() => {
      if (voiceSessionActiveRef.current && speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
    }, 2500);
  };

  const startVoiceCapture = () => {
    if (loading || listening) return;
    const maybeCtor = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
      || (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!maybeCtor) return;

    finalVoiceTranscriptRef.current = '';
    voiceManualStopRef.current = false;
    voiceSessionActiveRef.current = true;
    setVoiceLiveText('');
    setVoiceHint('Listening… speak naturally.');
    const recognition = new maybeCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 3;
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const fragment = event.results[i][0]?.transcript || '';
        const cleanedFragment = normalizeVoiceText(fragment);
        if (!cleanedFragment || cleanedFragment.length < 2) continue;
        if (event.results[i].isFinal) {
          finalVoiceTranscriptRef.current = normalizeVoiceText(`${finalVoiceTranscriptRef.current} ${cleanedFragment}`);
        } else {
          interim += ` ${cleanedFragment}`;
        }
      }
      const composed = normalizeVoiceText(`${finalVoiceTranscriptRef.current} ${interim}`);
      setVoiceLiveText(composed);
      setInput(composed);
      armVoiceSilenceTimer();
    };
    recognition.onerror = (event) => {
      const reason = event?.error ? `Microphone issue: ${event.error}` : 'Microphone issue detected.';
      setVoiceHint(reason);
      setListening(false);
      voiceSessionActiveRef.current = false;
      speechRecognitionRef.current = null;
      if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
    };
    recognition.onend = () => {
      if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
      const finalTranscript = normalizeVoiceText(finalVoiceTranscriptRef.current);
      if (voiceSessionActiveRef.current && !voiceManualStopRef.current) {
        try {
          recognition.start();
          setVoiceHint('Listening…');
          return;
        } catch {
          // fall through to finalize
        }
      }
      setListening(false);
      voiceSessionActiveRef.current = false;
      speechRecognitionRef.current = null;
      setVoiceLiveText('');
      setVoiceHint('');
      if (finalTranscript && !loading) {
        sendMessage(finalTranscript);
      }
    };
    speechRecognitionRef.current = recognition;
    setListening(true);
    armVoiceSilenceTimer();
    recognition.start();
  };

  const stopVoiceCapture = () => {
    voiceManualStopRef.current = true;
    voiceSessionActiveRef.current = false;
    if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
    setVoiceHint('Finalizing transcript…');
    speechRecognitionRef.current?.stop();
  };

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
    let activeContext = { ...(contextOverride || context), reportedBy: reporterName };
    if (!contextOverride && pendingSingleField && pendingSingleField.type !== 'select') {
      activeContext = applyDetailValue(context, pendingSingleField.id, text.trim());
      activeContext.reportedBy = reporterName;
      setContext(activeContext);
      setPendingSingleField(null);
    }
    const capturedVoice = !contextOverride && !pendingSingleField
      ? captureMemberVoiceFromText(text, activeContext)
      : null;

    if (capturedVoice) {
      activeContext = applyDetailValue(activeContext, 'description', capturedVoice);
      activeContext.reportedBy = reporterName;
      setContext(activeContext);
    }
    const issueText = capturedVoice || text;
    const localInference = inferIntakeContextFromText(issueText, activeContext);
    if (Object.keys(localInference).length > 0) {
      activeContext = { ...activeContext, ...localInference, reportedBy: reporterName };
      setContext(activeContext);
    }
    activeContext.reportedBy = reporterName;
    activeContext = pruneEntityContextForIssue(activeContext, issueText);
    activeContext.reportedBy = reporterName;
    setContext(activeContext);
    const preamble = buildContextPreamble(activeContext);
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    const requestNonce = ++requestNonceRef.current;
    const requestEpoch = activeChatEpochRef.current;
    try {
      setLoading(true);
      const existingTicket = findExistingSubmittedTicket(capturedVoice || text, activeContext, tickets);
      if (existingTicket) {
        setSelectedTicket(existingTicket);
        onOpenExistingTicket?.(existingTicket);
        setMessages((prev) => [
          ...prev,
          {
            id: `duplicate-${Date.now()}`,
            role: 'assistant',
            content: `Possible existing ticket: **${existingTicket.id}** — ${existingTicket.title}. I opened it for reference, but I will still draft a new ticket below so you can proceed if this is a separate issue.`,
          },
        ]);
      }

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
            routingRules: routingSettings.routingRules.filter((rule) => rule.active).slice(0, 260),
            departments: routingSettings.departments.filter((department) => department.active).map((department) => department.name),
            locations: routingSettings.locations.filter((location) => location.active).map((location) => location.name),
            associates: ASSOCIATES.map((associate) => associate.name),
            employees: routingSettings.employees.filter((employee) => employee.active).map((employee) => ({
              name: employee.name,
              department: employee.department,
              location: employee.location,
              manager: employee.manager,
            })),
            priorities: Object.keys(PRIORITY_SLA),
            sentiments: MEMBER_SENTIMENT_OPTIONS,
          },
          messages: apiMessages,
          conversationId,
          context: activeContext,
        },
      });

      if (error) throw error;
      if (requestEpoch !== activeChatEpochRef.current || requestNonce !== requestNonceRef.current) return;

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
      const remainingMissingFields = requiredFieldsForIssue(responseContext, data?.ticket || undefined);
      let ticket = finalDetailForm || data?.needsMoreInfo || remainingMissingFields.length > 0
        ? null
        : data?.ticket || buildClientDraft(responseContext, text);
      if (
        ticket &&
        responseContext.category === 'Hosted Class & Partnerships' &&
        (ticket.category === 'General Feedback' || ticket.subCategory === 'Other')
      ) {
        ticket = {
          ...ticket,
          category: 'Hosted Class & Partnerships',
          subCategory: responseContext.subCategory || 'Hosted Class Feedback',
          tags: Array.from(new Set([...(ticket.tags || []), 'hosted-class', 'partnership-feedback'])),
        };
      }
      if (ticket) {
        const syncedContext = contextFromDraft(ticket, responseContext);
        activeContext = { ...syncedContext, reportedBy: reporterName };
        setContext(activeContext);
      }
      const singleField = finalDetailForm?.fields.length === 1 ? finalDetailForm.fields[0] : null;
      const singleFieldNeedsPicker = singleField
        ? ['memberName', 'memberContact', 'classType', 'sessionId', 'membership'].includes(singleField.id)
        : false;
      setPendingSingleField(singleField && !singleFieldNeedsPicker && singleField.type !== 'select' ? singleField : null);
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        aiGenerated: true,
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
      setMessages((prev) => [
        ...prev,
        assistantMsg,
      ]);

    } catch (e: unknown) {
      if (requestEpoch !== activeChatEpochRef.current || requestNonce !== requestNonceRef.current) return;
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
    activeChatEpochRef.current += 1;
    requestNonceRef.current += 1;
    voiceSessionActiveRef.current = false;
    voiceManualStopRef.current = true;
    speechRecognitionRef.current?.stop();
    if (voiceSilenceTimerRef.current) window.clearTimeout(voiceSilenceTimerRef.current);
    setListening(false);
    setVoiceLiveText('');
    setVoiceHint('');
    setMessages([GREETING]);
    setContext({ reportedBy: reporterName });
    setPendingSingleField(null);
    setPendingAttachments([]);
    setConversationId(null);
    setLoading(false);
  };

  useEffect(() => {
    if (resetVersion === lastResetVersionRef.current) return;
    lastResetVersionRef.current = resetVersion;
    resetChat();
  }, [resetVersion, reporterName]);

  const submitDetailForm = (values: Record<string, string>, form?: DetailForm) => {
    const formFieldIds = new Set((form?.fields || []).map((field) => String(field.id)));
    const formIncludesMember = ['memberId', 'memberName', 'memberContact', 'membership']
      .some((field) => formFieldIds.has(field));
    const formIncludesSession = ['sessionId', 'classType', 'classDateTime', 'trainer']
      .some((field) => formFieldIds.has(field));
    const allowedValueKeys = new Set(formFieldIds);
    if (formIncludesMember) MEMBER_ENTITY_KEYS.forEach((field) => allowedValueKeys.add(field));
    if (formIncludesSession) {
      SESSION_ENTITY_KEYS.forEach((field) => allowedValueKeys.add(field));
      allowedValueKeys.add('studio');
    }

    let nextContext: DetailContext = { ...context, reportedBy: reporterName };
    for (const [key, value] of Object.entries(values)) {
      if (form && !allowedValueKeys.has(key)) continue;
      if (!value) continue;
      nextContext = applyDetailValue(nextContext, key, value);
    }

    const fieldLabels = new Map((form?.fields || []).map((field) => [field.id, field.label]));
    const detailLines = Object.entries(values)
      .filter(([key, value]) => (!form || allowedValueKeys.has(key)) && value.trim())
      .map(([key, value]) => `${getDetailField(key)?.label || fieldLabels.get(key) || key}: ${value}`);
    nextContext = pruneEntityContextForIssue(nextContext, detailLines.join('\n'), allowedValueKeys);
    nextContext.reportedBy = reporterName;
    setContext(nextContext);
    setPendingSingleField(null);
    sendMessage(`Here are the missing details:\n${detailLines.join('\n')}`, nextContext);
  };

  const publishDraft = async (messageId: string, draft: DraftTicket) => {
    if (loading || publishingRef.current.has(messageId)) return;
    const publishableDraft = mergeDraftWithContext(draft, context);
    const explicitlyUsedFields = new Set<string>();
    if (publishableDraft.memberName || publishableDraft.memberContact) MEMBER_ENTITY_KEYS.forEach((field) => explicitlyUsedFields.add(field));
    if (publishableDraft.classType || publishableDraft.classDateTime || publishableDraft.trainer) SESSION_ENTITY_KEYS.forEach((field) => explicitlyUsedFields.add(field));
    const publishContext = pruneEntityContextForIssue(
      contextFromDraft(publishableDraft, context),
      `${publishableDraft.title}\n${publishableDraft.description}`,
      explicitlyUsedFields
    );
    const missingDetailsForm = detailFormForIncompleteDraft(publishableDraft, publishContext);
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
      const created = await createApprovedTicket(
        publishableDraft,
        conversationId,
        publishContext as Record<string, unknown>,
        pendingAttachments.map((entry) => entry.file)
      );
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
      setPendingAttachments([]);
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
    const syncedContext = { ...contextFromDraft(draft, context), reportedBy: reporterName };
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

  const discardDraft = (messageId: string) => {
    setMessages((prev) =>
      prev.map((message) => (
        message.id === messageId
          ? { ...message, ticket: null, detailForm: null, published: false, ticketId: undefined, content: 'Draft discarded.' }
          : message
      ))
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-200/60 font-['Plus_Jakarta_Sans',Inter,sans-serif]">
      <div className="relative hidden h-full w-[32%] overflow-hidden border-r border-slate-200 bg-gradient-to-br from-slate-100 via-white to-violet-50 lg:block">
        <div className="absolute -left-12 top-16 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="absolute -right-12 bottom-10 h-64 w-64 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(100,116,139,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(100,116,139,0.08)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_78%_56%_at_50%_50%,#000_68%,transparent_110%)]" />
        <InteractiveRobotSpline scene={ROBOT_SPLINE_URL} className="athena-bot-tint absolute inset-0 h-full w-full" smile />
        <div className="absolute bottom-2 left-2 right-2">
          <div className="rounded-2xl border border-white/55 bg-white/30 p-2 shadow-[0_24px_80px_-30px_rgba(15,23,42,0.35)] backdrop-blur-2xl">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black">
              Recent tickets
            </div>
            <div className="flex flex-wrap gap-2">
              {recentTickets.length > 0 ? recentTickets.map((ticket, index) => {
                const compactLabel = ticket.title.length > 36
                  ? `${ticket.title.slice(0, 33).replace(/\s+\S*$/, '').trimEnd()}...`
                  : ticket.title;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      setSelectedTicket(ticket);
                      onOpenExistingTicket?.(ticket);
                    }}
                    className="animate-ticket-chip-in max-w-[220px] rounded-full border border-slate-200/80 bg-white/85 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50 hover:text-slate-900"
                    style={{ animationDelay: `${index * 90}ms` }}
                    title={`${ticket.id} - ${ticket.title}`}
                  >
                    <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{compactLabel}</span>
                  </button>
                );
              }) : (
                <span className="rounded-full border border-slate-200/80 bg-white/85 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm">
                  No recent tickets
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex h-full w-full flex-col bg-background lg:w-[68%]">
        <div className="animate-chat-header-in flex items-center justify-between border-b border-border bg-[#f0f2f5] px-4 py-2.5 shadow-sm">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-300/70 bg-gradient-to-br from-emerald-100 to-rose-100 shadow-sm">
              <img src="/download-1.png" alt="Athena" className="-scale-x-100 h-10 w-10 rounded-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold text-slate-950">Athena</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-700 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Online
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">Support, Smarter.</p>
            </div>
          </div>
          <div />
        </div>

        <div
          ref={scrollRef}
          className="chat-scrollbar mx-auto w-full max-w-7xl flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 lg:py-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='180' height='180' viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Ctext x='24' y='42' font-size='11' font-family='Inter,Arial,sans-serif' fill='%231e293b' fill-opacity='0.05'%3EP57%3C/text%3E%3Ccircle cx='124' cy='54' r='9' stroke='%231e293b' stroke-opacity='0.045' stroke-width='1.2'/%3E%3Cpath d='M35 122h22M46 111v22' stroke='%231e293b' stroke-opacity='0.045' stroke-width='1.8' stroke-linecap='round'/%3E%3C/g%3E%3C/svg%3E")`,
            backgroundColor: '#fbfaf7',
          }}
        >
          {messages.map((m, index) => (
            <MessageBubble
              key={m.id}
              message={m}
              index={index}
              onChipClick={handleChipClick}
              onConfirm={publishDraft}
              onEdit={refineDraft}
              onDiscard={discardDraft}
              onSaveEdit={saveEditedDraft}
              onDetailFormSubmit={submitDetailForm}
              publishing={publishingRef.current.has(m.id)}
              context={context}
            />
          ))}
          {loading && <TypingIndicator />}
        </div>

        <div className="z-10 flex-shrink-0 border-t border-border/50 bg-[#f0f2f5] px-4 py-2 shadow-[0_-12px_30px_rgba(15,23,42,0.04)] sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-700">
                Context
              </span>
              <div className="hidden h-5 w-px bg-slate-200 sm:block" />
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto pb-0.5">
              <ContextPicker
                context={context}
                attachmentCount={pendingAttachments.length}
                onChange={(next) => setContext((current) => ({ ...current, ...next }))}
              />
            </div>
          </div>
        </div>

        <div className="z-10 flex-shrink-0 border-t border-border/50 bg-[#f0f2f5] px-4 py-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-7xl items-end gap-3">
            <div className="flex-1 relative">
              {pendingAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {pendingAttachments.map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-700"
                      title={`${entry.file.name} (${Math.max(1, Math.round(entry.file.size / 1024))} KB)`}
                    >
                      <Paperclip className="h-3 w-3 shrink-0 text-rose-600" />
                      <span className="truncate">{entry.file.name}</span>
                      <button
                        type="button"
                        onClick={() => setPendingAttachments((current) => current.filter((item) => item.id !== entry.id))}
                        className="rounded-full p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label={`Remove ${entry.file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
              className="max-h-28 w-full resize-none rounded-full border border-slate-200 bg-white px-4 py-3 pr-4 text-sm text-slate-950 shadow-[0_12px_34px_rgba(15,23,42,0.07)] outline-none transition duration-200 placeholder:text-slate-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/15"
                style={{ minHeight: '48px' }}
              />
              {listening && (
                <div className="mt-1 text-[10px] font-medium text-rose-700">
                  {voiceHint || (voiceLiveText ? 'Listening… capturing your description' : 'Listening… start speaking')}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx"
              onChange={(event) => {
                addAttachments(event.target.files);
                event.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:text-rose-700"
              title="Attach files"
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {voiceSupported && (
              <button
                type="button"
                onClick={listening ? stopVoiceCapture : startVoiceCapture}
                disabled={loading}
                className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition ${
                  listening
                    ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-rose-200 hover:text-rose-700'
                } disabled:cursor-not-allowed disabled:opacity-45`}
                title={listening ? 'Stop voice input' : 'Start voice input'}
                aria-label={listening ? 'Stop voice input' : 'Start voice input'}
              >
                {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="gradient-primary flex h-11 w-11 items-center justify-center rounded-full text-primary-foreground shadow-lg shadow-primary/20 transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="mx-auto mt-1 w-full max-w-7xl px-1 text-[10px] font-medium text-stone-400">
            Enter to send · Shift+Enter for new line · Attachments are optional and can help with faster resolution
          </p>
        </div>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{
  message: Message;
  index: number;
  onChipClick: (chip: SuggestedChip) => void;
  onConfirm: (messageId: string, draft: DraftTicket) => void;
  onEdit: (draft: DraftTicket) => void;
  onDiscard: (messageId: string) => void;
  onSaveEdit: (messageId: string, draft: DraftTicket) => void;
  onDetailFormSubmit: (values: Record<string, string>, form?: DetailForm) => void;
  publishing: boolean;
  context: DetailContext;
}> = ({ message, index, onChipClick, onConfirm, onEdit, onDiscard, onSaveEdit, onDetailFormSubmit, publishing, context }) => {
  const isUser = message.role === 'user';
  const userTone = USER_TONES[index % USER_TONES.length];
  const visibleChips = (message.suggestedChips || []).filter((chip) => !context[chip.field]);
  const [expanded, setExpanded] = useState(false);

  const renderContent = (text: string) => {
    const renderInline = (value: string) =>
      value.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={j}>{part.slice(2, -2)}</strong>
        ) : (
          <React.Fragment key={j}>{part}</React.Fragment>
        )
      );

    const blocks = text.split('\n\n').map((block) => block.trim()).filter(Boolean);
    return blocks.map((block, index) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const isList = lines.every((line) => /^-\s+/.test(line));
      if (isList) {
        return (
          <ul key={`b-${index}`} className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
            {lines.map((line, itemIndex) => (
              <li key={`li-${itemIndex}`}>{renderInline(line.replace(/^-\s+/, ''))}</li>
            ))}
          </ul>
        );
      }
      return (
        <p key={`b-${index}`} className={index === 0 ? '' : 'mt-2'}>
          {lines.map((line, lineIndex) => (
            <React.Fragment key={`l-${lineIndex}`}>
              {renderInline(line)}
              {lineIndex < lines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      );
    });
  };
  const contentLines = message.content.split('\n');
  const shouldCollapse =
    isUser &&
    !message.ticket &&
    !message.detailForm &&
    (contentLines.length > 3 || message.content.length > 260);
  const previewContent = (() => {
    if (!shouldCollapse || expanded) return message.content;
    const firstLines = contentLines.slice(0, 3).join('\n');
    return firstLines.length > 260 ? `${firstLines.slice(0, 260).trimEnd()}...` : `${firstLines.trimEnd()}...`;
  })();

  return (
    <div
      className={`animate-chat-message-in flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
      style={{ animationDelay: `${Math.min(index * 28, 240)}ms` }}
    >
      {!isUser && message.aiGenerated && (
        <div
          className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700"
          title="AI generated"
          aria-label="AI generated"
        >
          <Sparkles className="h-2.5 w-2.5" />
        </div>
      )}
      <div className={`flex w-full items-end gap-2 ${isUser ? 'flex-row-reverse justify-end' : ''}`}>
        {!isUser && (
          <div className="h-6 w-6 rounded-full overflow-hidden bg-card border border-border/30 flex-shrink-0 p-0.5 mb-0.5">
            <img src="/download-1.png" alt="Athena" className="-scale-x-100 w-full h-full rounded-full object-cover" />
          </div>
        )}
        <div className={`${isUser ? 'ml-auto w-[52%] pl-12' : 'w-full pr-6'}`}>
          <div
            className={`relative inline-block w-full rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
              isUser
                ? 'rounded-br-sm border border-gray-200 bg-gray-100 text-slate-900'
                : 'rounded-bl-sm border border-[#e6e6e6] bg-white text-slate-900'
            }`}
          >
            {renderContent(previewContent)}
            <span
              className={`absolute bottom-0 h-3 w-3 rotate-45 ${
                isUser
                  ? '-right-1.5 bg-gray-100 border-r border-b border-gray-200'
                  : '-left-1.5 bg-white border-l border-b border-[#e6e6e6]'
              }`}
            />
            {shouldCollapse && (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className={`mt-2 block text-xs font-semibold underline-offset-4 hover:underline ${
                  isUser ? userTone.more : 'text-rose-700 hover:text-rose-900'
                }`}
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      </div>

      {visibleChips.length > 0 && !message.ticket && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleChips.map((c, i) => (
            <button
              key={i}
              onClick={() => onChipClick(c)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50 hover:text-slate-950"
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
            onDiscard={() => onDiscard(message.id)}
            onSaveEdit={(draft) => onSaveEdit(message.id, draft)}
            confirmed={message.published}
            ticketId={message.ticketId}
            publishing={publishing}
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
  );
};

const TypingIndicator: React.FC = () => (
  <div className="animate-p57-fade-up flex items-end gap-2">
    <div className="h-7 w-7 rounded-full overflow-hidden bg-card border border-border/30 flex-shrink-0 p-0.5">
      <img src="/download-1.png" alt="Athena" className="-scale-x-100 w-full h-full rounded-full object-cover" />
    </div>
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-[#e6e6e6] bg-white px-3.5 py-2.5 shadow-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/30 animate-typing" style={{ animationDelay: '0s' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/30 animate-typing" style={{ animationDelay: '0.2s' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/30 animate-typing" style={{ animationDelay: '0.4s' }} />
    </div>
  </div>
);

const DetailCaptureForm: React.FC<{
  form: DetailForm;
  initialContext: DetailContext;
  onSubmit: (values: Record<string, string>, form?: DetailForm) => void;
}> = ({ form, initialContext, onSubmit }) => {
  const toCsvList = (value?: string) =>
    (value || '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
  const appendCsvUnique = (current: string | undefined, next: string) => {
    const existing = toCsvList(current);
    if (existing.some((item) => item.toLowerCase() === next.trim().toLowerCase())) return current || '';
    return [...existing, next.trim()].join(' | ');
  };
  const removeCsvItem = (current: string | undefined, target: string) =>
    toCsvList(current)
      .filter((item) => item.toLowerCase() !== target.toLowerCase())
      .join(' | ');

  const initialValues = form.fields.reduce<Record<string, string>>((acc, field) => {
    const id = String(field.id);
    acc[id] = initialContext[id] || '';
    return acc;
  }, {});
  const fieldIds = new Set(form.fields.map((field) => String(field.id)));
  const shouldSeedMemberValues = MEMBER_ENTITY_KEYS.some((field) => fieldIds.has(field));
  const shouldSeedSessionValues = SESSION_ENTITY_KEYS.some((field) => fieldIds.has(field));
  const hiddenSeedKeys = [
    ...(shouldSeedMemberValues ? MEMBER_ENTITY_KEYS : []),
    ...(shouldSeedSessionValues ? [...SESSION_ENTITY_KEYS, 'studio'] : []),
  ];
  for (const key of hiddenSeedKeys) {
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
      className="mt-3 w-full overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-[0_22px_70px_rgba(15,23,42,0.1)] backdrop-blur"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit(values, form);
      }}
    >
      <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-700 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-stone-950">{form.title}</h3>
            {form.description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-stone-500">{form.description}</p>}
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2">
        {hasMemberFields && (
          <MomenceMemberFormField
            values={values}
            onSelect={async (member) => {
              setValues((current) => ({
                ...current,
                memberId: appendCsvUnique(current.memberId, member.id),
                memberName: appendCsvUnique(current.memberName, member.name),
                memberContact: appendCsvUnique(current.memberContact, member.email || member.phoneNumber || member.description || ''),
                membership: '',
              }));
            }}
            onRemove={(memberName) => {
              setValues((current) => ({
                ...current,
                memberName: removeCsvItem(current.memberName, memberName),
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
                sessionId: appendCsvUnique(current.sessionId, session.id),
                classType: appendCsvUnique(current.classType, session.classType),
                classDateTime: appendCsvUnique(current.classDateTime, session.startsAt || ''),
                trainer: appendCsvUnique(current.trainer, session.trainer || current.trainer || ''),
                studio: appendCsvUnique(current.studio, session.studio || current.studio || ''),
              }));
            }}
            onRemove={(sessionName) => {
              setValues((current) => ({
                ...current,
                classType: removeCsvItem(current.classType, sessionName),
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
              className={`group rounded-2xl border border-slate-200 bg-white p-3 transition duration-200 focus-within:border-rose-500 focus-within:ring-4 focus-within:ring-rose-500/10 ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}
            >
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                {field.label}
                {field.required ? <span className="text-rose-600"> *</span> : ''}
              </span>
              {field.type === 'select' ? (
                (() => {
                  const forceSingle = new Set(['intakeRoute', 'category', 'subCategory', 'priority', 'studio', 'memberSentiment']);
                  const isMulti = !forceSingle.has(field.id);
                  const selectedValues = isMulti ? toCsvList(values[id]) : [];
                  return (
                <select
                  value={isMulti ? selectedValues : (values[id] || '')}
                  multiple={isMulti}
                  onChange={(event) => {
                    if (isMulti) {
                      const picked = Array.from(event.currentTarget.selectedOptions).map((option) => option.value).filter(Boolean);
                      setValue(id, picked.join(' | '));
                    } else {
                      setValue(id, event.target.value);
                    }
                  }}
                  disabled={(field.id === 'membership' && !values.memberId) || (field.id === 'subCategory' && !values.category)}
                  className={`${isMulti ? 'min-h-[120px] py-2' : 'h-11'} w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400`}
                >
                  {!isMulti && (
                    <option value="">
                      {field.id === 'membership' && !values.memberId
                        ? 'Select a Momence member first'
                        : field.id === 'subCategory' && !values.category
                          ? 'Select category first'
                        : `Select ${field.label.toLowerCase()}`}
                    </option>
                  )}
                  {options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                  );
                })()
              ) : field.type === 'textarea' ? (
                <textarea
                  value={values[id] || ''}
                  onChange={(event) => setValue(id, event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
                  placeholder="Capture what the member stated..."
                />
              ) : (
                <input
                  type={field.type === 'date' || field.type === 'datetime-local' || field.type === 'number' ? field.type : 'text'}
                  value={values[id] || ''}
                  onChange={(event) => setValue(id, event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
                  placeholder={field.label}
                />
              )}
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/90 px-5 py-4">
        <span className="text-[11px] text-stone-400">
          {form.fields.filter((field) => field.required).length} required fields
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-rose-700 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-rose-800 focus:outline-none focus:ring-4 focus:ring-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
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
  onRemove: (memberName: string) => void;
}> = ({ values, onSelect, onRemove }) => {
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
    <div className="rounded-2xl border border-slate-200 bg-white p-3 transition focus-within:border-rose-500 focus-within:ring-4 focus-within:ring-rose-500/10 md:col-span-2">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        Momence Member *
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
        placeholder="Search Momence by member name, email, or phone"
      />
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
      {values.memberName && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.memberName.split('|').map((member) => member.trim()).filter(Boolean).map((member) => (
            <button
              key={member}
              type="button"
              onClick={() => onRemove(member)}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-800"
              title="Remove member"
            >
              {member}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.1)]">
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
              className="block w-full border-b border-stone-100 px-3 py-2 text-left text-xs last:border-0 hover:bg-slate-50"
            >
              <div className="font-semibold text-stone-900">{option.label}</div>
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
  onRemove: (sessionName: string) => void;
}> = ({ values, onSelect, onRemove }) => {
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
    <div className="rounded-2xl border border-slate-200 bg-white p-3 transition focus-within:border-rose-500 focus-within:ring-4 focus-within:ring-rose-500/10 md:col-span-2">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        Momence Class / Session *
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
        placeholder="Search Momence sessions by class, instructor, studio, or date"
      />
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
      {values.classType && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.classType.split('|').map((sessionName) => sessionName.trim()).filter(Boolean).map((sessionName) => (
            <button
              key={sessionName}
              type="button"
              onClick={() => onRemove(sessionName)}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-800"
              title="Remove session"
            >
              {sessionName}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.1)]">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onSelect(option);
                setQuery(option.label);
                setOptions([]);
              }}
              className="block w-full border-b border-stone-100 px-3 py-2 text-left text-xs last:border-0 hover:bg-slate-50"
            >
              <div className="font-semibold text-stone-900">{option.label}</div>
              <div className="mt-0.5 text-[11px] text-stone-500">{option.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
