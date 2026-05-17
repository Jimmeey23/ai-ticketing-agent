import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

type DraftTicket = {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  priority: Priority;
  studio: string;
  trainer?: string | null;
  classType?: string | null;
  classDateTime?: string | null;
  memberName?: string | null;
  memberContact?: string | null;
  reportedBy?: string | null;
  tags?: string[];
  sentiment?: string | null;
  conversationSummary?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type RequestBody = {
  action?: 'draftTicket' | 'createTicket';
  approved?: boolean;
  draftOnly?: boolean;
  instructions?: string;
  draft?: DraftTicket;
  ticket?: DraftTicket;
  messages?: ChatMessage[];
  conversationId?: string | null;
  context?: Record<string, unknown>;
  masterData?: Record<string, unknown>;
};

const ATHENA_SYSTEM_PROMPT = `
You are Athena, the Physique 57 India internal operations ticket intake assistant.

Behavior rules:
- Start from the internal team member's free-text documentation of member voice.
- Infer exactly one intake route: Request, Complaint, Feedback, or Internal Reporting.
- Infer the best category and subcategory from the approved master data. Do not require the user to manually select them before asking issue-specific details.
- Infer priority and include a short urgency reason based on member impact, safety risk, retention risk, billing urgency, and escalation language.
- Ask only for operational details that are missing after inference.
- Do not draft a ticket until all required fields are available.
- Do not ask multiple prose questions. Return a structured detailForm with full field definitions when multiple details are missing; ask only one concise question when exactly one detail is missing.
- Use date fields for dates and datetime-local fields for date/time fields.
- Use only approved master-data options for studios, instructors, class types, categories, subcategories, priorities, associates, and route buttons.
- Member and class/session details are selected through Momence-powered UI fields, not ordinary text boxes when a structured form is shown.
- For freeze, rollover, membership, and package-specific requests, require a selected member first and then use only that member's active memberships.
- Write ticket content in third-person internal documentation language, focused on what the community member stated.
- Ticket creation happens only after explicit approval of the displayed draft.
`.trim();

type AiDetailField = {
  id: string;
  label: string;
  type: 'select' | 'text' | 'textarea' | 'date' | 'datetime-local' | 'number';
  required?: boolean;
  options?: string[];
  dependsOn?: string;
};

type AiDetailForm = {
  title: string;
  description?: string;
  fields: AiDetailField[];
  submitLabel?: string;
};

type AiIntakeResponse = {
  needsMoreInfo: boolean;
  reply: string;
  detailForm?: AiDetailForm | null;
  ticket?: DraftTicket | null;
  suggestedChips?: Array<{ label: string; value: string; field: string }>;
  inferredContext?: Record<string, string>;
  missingFields?: string[];
  publishable?: boolean;
  urgencyReason?: string;
};

type DetailFieldId =
  | 'intakeRoute'
  | 'requestType'
  | 'studio'
  | 'category'
  | 'subCategory'
  | 'trainer'
  | 'classType'
  | 'membership'
  | 'memberName'
  | 'memberContact'
  | 'reportedBy'
  | 'priority'
  | 'description'
  | 'desiredResolution'
  | 'incidentDateTime'
  | 'memberSentiment'
  | 'freezeStartDate'
  | 'freezeEndDate'
  | 'freezeReason'
  | 'classesRemaining'
  | 'packageExpiryDate'
  | 'requestedRolloverDate'
  | 'rolloverReason'
  | 'partnerName'
  | 'hostedFeedbackArea'
  | 'attendeeCount'
  | 'prospectQuality'
  | 'followUpPreference';

const PRIORITY_SLA_HOURS: Record<Priority, number> = {
  Critical: 2,
  High: 8,
  Medium: 24,
  Low: 72,
};

const PLACEHOLDER_VALUE_PATTERN = /unspecified|not specified|member-reported issue|ai intake|authenticated user/i;

const ASSIGNMENT_RULES: Record<string, { assignedTo: string; team: string }> = {
  Scheduling: { assignedTo: 'Priya Sharma', team: 'Client Success' },
  'Class Experience': { assignedTo: 'Sanya Iyer', team: 'Instructor Experience' },
  'Trainer Feedback': { assignedTo: 'Sanya Iyer', team: 'Instructor Experience' },
  'Repair and Maintenance': { assignedTo: 'Rahul Mehta', team: 'Operations' },
  'Studio Amenities and Facilities': { assignedTo: 'Rahul Mehta', team: 'Operations' },
  'Operating Systems': { assignedTo: 'Arjun Nair', team: 'Digital Support' },
  'Tech Issues': { assignedTo: 'Arjun Nair', team: 'Digital Support' },
  'Pricing and Memberships': { assignedTo: 'Neha Kapoor', team: 'Revenue Operations' },
  'Customer Service and Communication': { assignedTo: 'Aditya Verma', team: 'Member Experience' },
  'Brand Feedback': { assignedTo: 'Aditya Verma', team: 'Brand' },
  'Safety and Security': { assignedTo: 'Vikram Singh', team: 'Safety & Compliance' },
  'Theft and Lost Items': { assignedTo: 'Vikram Singh', team: 'Safety & Compliance' },
  Miscellaneous: { assignedTo: 'Aditya Verma', team: 'Member Experience' },
  'Instructor & Class Quality': { assignedTo: 'Sanya Iyer', team: 'Instructor Experience' },
  'Booking & Schedule': { assignedTo: 'Priya Sharma', team: 'Client Success' },
  'Facility & Equipment': { assignedTo: 'Rahul Mehta', team: 'Operations' },
  'Billing & Membership': { assignedTo: 'Neha Kapoor', team: 'Revenue Operations' },
  'Safety & Medical': { assignedTo: 'Vikram Singh', team: 'Safety & Compliance' },
  'Front Desk & Service': { assignedTo: 'Aditya Verma', team: 'Member Experience' },
  'App & Digital': { assignedTo: 'Arjun Nair', team: 'Digital Support' },
  'Hosted Class & Partnerships': { assignedTo: 'Aditya Verma', team: 'Partnerships' },
  'Member Progress & Transformation': { assignedTo: 'Sanya Iyer', team: 'Instructor Experience' },
  'Sales & Consultation': { assignedTo: 'Neha Kapoor', team: 'Revenue Operations' },
  'General Feedback': { assignedTo: 'Aditya Verma', team: 'Member Experience' },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function cleanString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizePriority(value: unknown): Priority {
  if (value === 'Critical' || value === 'High' || value === 'Medium' || value === 'Low') return value;
  return 'Medium';
}

function computeSlaDueAt(priority: Priority): string {
  const dueAt = new Date();
  dueAt.setHours(dueAt.getHours() + PRIORITY_SLA_HOURS[priority]);
  return dueAt.toISOString();
}

function ticketSlug(value: unknown): string {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function professionalDescription(text: string, context: Record<string, unknown>, category: string, subCategory: string): string {
  const route = cleanString(context.intakeRoute, 'Unclassified');
  const member = cleanString(context.memberName);
  const studio = cleanString(context.studio);
  const trainer = cleanString(context.trainer);
  const classType = cleanString(context.classType);
  const membership = cleanString(context.membership);
  const resolution = cleanString(context.desiredResolution);
  const incidentDateTime = cleanString(context.incidentDateTime);

  return [
    `Member voice summary: ${text || 'Community member feedback requires internal follow-up.'}`,
    '',
    'Operational context:',
    `- Intake route: ${route}`,
    `- Category: ${category} / ${subCategory}`,
    member ? `- Community member: ${member}` : null,
    studio ? `- Studio space: ${studio}` : null,
    trainer ? `- Studio instructor: ${trainer}` : null,
    classType ? `- Signature experience/session: ${classType}` : null,
    incidentDateTime ? `- Approx. incident date/time: ${incidentDateTime}` : null,
    membership ? `- Active package/membership: ${membership}` : null,
    '',
    `Requested resolution: ${resolution || 'Resolution pathway to be confirmed by the assigned owner after review.'}`,
    '',
    'Athena review note: Ticket was drafted from internal documentation of member voice and should be validated before operational action.',
  ].filter((line) => line !== null).join('\n');
}

function fallbackDraft(messages: ChatMessage[] = [], context: Record<string, unknown> = {}): DraftTicket {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const text = cleanString(context.description) || latestUserMessage.replace(/\[Context[^\n]*\]\n?/i, '').trim();
  const lower = text.toLowerCase();
  let inferredCategory = 'General Feedback';
  if (lower.includes('billing') || lower.includes('refund') || lower.includes('payment') || lower.includes('freeze') || lower.includes('roll over') || lower.includes('rollover') || lower.includes('extension')) {
    inferredCategory = 'Pricing and Memberships';
  } else if (lower.includes('hosted') || lower.includes('partner') || lower.includes('influencer')) {
    inferredCategory = 'Hosted Class & Partnerships';
  } else if (lower.includes('equipment') || lower.includes('ac') || lower.includes('locker') || lower.includes('clean')) {
    inferredCategory = 'Studio Amenities and Facilities';
  } else if (lower.includes('injury') || lower.includes('safety') || lower.includes('medical')) {
    inferredCategory = 'Safety and Security';
  } else if (lower.includes('trainer') || lower.includes('instructor') || lower.includes('class')) {
    inferredCategory = 'Class Experience';
  }
  const category = cleanString(context.category, inferredCategory);

  const priority: Priority =
    normalizePriority(context.priority || (category === 'Safety and Security' || category === 'Safety & Medical' ? 'Critical' : lower.includes('angry') || lower.includes('urgent') ? 'High' : 'Medium'));

  const subCategory = cleanString(context.subCategory, category === 'General Feedback' ? 'Other' : 'Member-reported issue');
  const titleParts = [
    cleanString(context.intakeRoute, 'Ticket'),
    subCategory,
    cleanString(context.memberName),
  ].filter(Boolean);

  return {
    title: titleParts.join(' · ').slice(0, 96) || 'Member voice requiring follow-up',
    description: professionalDescription(text, context, category, subCategory),
    category,
    subCategory,
    priority,
    studio: cleanString(context.studio, 'Unspecified Studio'),
    trainer: cleanString(context.trainer) || null,
    classType: cleanString(context.classType) || null,
    classDateTime: cleanString(context.classDateTime) || null,
    memberName: cleanString(context.memberName) || null,
    memberContact: cleanString(context.memberContact) || null,
    reportedBy: cleanString(context.reportedBy, 'AI Intake') || null,
    tags: [
      'ai-draft',
      ticketSlug(context.intakeRoute),
      ticketSlug(category),
      ticketSlug(subCategory),
      ticketSlug(context.requestType),
    ].filter(Boolean),
    sentiment: lower.includes('angry') || lower.includes('frustrated') ? 'Negative' : 'Neutral',
    conversationSummary: text,
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

function normalizeAiDetailForm(value: unknown): AiDetailForm | null {
  if (!value || typeof value !== 'object') return null;
  const form = value as Partial<AiDetailForm> & { fields?: unknown[] };
  const allowedTypes = new Set(['select', 'text', 'textarea', 'date', 'datetime-local', 'number']);
  const fields = (Array.isArray(form.fields) ? form.fields : [])
    .map((field) => {
      if (!field || typeof field !== 'object') return null;
      const raw = field as Partial<AiDetailField>;
      const id = cleanString(raw.id).replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 80);
      const label = cleanString(raw.label);
      const type = allowedTypes.has(cleanString(raw.type)) ? raw.type as AiDetailField['type'] : 'text';
      if (!id || !label) return null;
      return {
        id,
        label,
        type,
        required: raw.required !== false,
        options: Array.isArray(raw.options) ? raw.options.map(String).filter(Boolean).slice(0, 30) : undefined,
        dependsOn: cleanString(raw.dependsOn) || undefined,
      };
    })
    .filter(Boolean) as AiDetailField[];

  if (!fields.length) return null;
  return {
    title: cleanString(form.title, 'Complete ticket intake details'),
    description: cleanString(form.description),
    fields,
    submitLabel: cleanString(form.submitLabel, 'Continue drafting ticket'),
  };
}

function normalizeAiIntakeResponse(value: Record<string, unknown> | null): AiIntakeResponse | null {
  if (!value) return null;
  const detailForm = normalizeAiDetailForm(value.detailForm);
  const ticket = value.ticket && typeof value.ticket === 'object' ? value.ticket as DraftTicket : null;
  return {
    needsMoreInfo: Boolean(value.needsMoreInfo || detailForm),
    reply: cleanString(value.reply, detailForm ? 'Please complete the structured intake form below.' : 'I drafted the ticket below. Please review it before publishing.'),
    detailForm,
    ticket,
    suggestedChips: Array.isArray(value.suggestedChips) ? value.suggestedChips as AiIntakeResponse['suggestedChips'] : [],
    inferredContext: value.inferredContext && typeof value.inferredContext === 'object'
      ? value.inferredContext as Record<string, string>
      : {},
    missingFields: Array.isArray(value.missingFields) ? value.missingFields.map(String) : [],
    publishable: typeof value.publishable === 'boolean' ? value.publishable : !Boolean(value.needsMoreInfo || detailForm),
    urgencyReason: cleanString(value.urgencyReason),
  };
}

async function askAiForIntake(body: RequestBody, instructions: string): Promise<AiIntakeResponse | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;

  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            instructions,
            '',
            'Return JSON only using this schema:',
            '{"needsMoreInfo": boolean, "reply": string, "inferredContext": {"intakeRoute": string, "category": string, "subCategory": string, "priority": string, "memberSentiment": string, "desiredResolution": string}, "urgencyReason": string, "missingFields": string[], "publishable": boolean, "detailForm": {"title": string, "description": string, "fields": [{"id": string, "label": string, "type": "select|text|textarea|date|datetime-local|number", "required": boolean, "options": string[]}], "submitLabel": string}, "ticket": DraftTicket|null, "suggestedChips": []}',
            '',
            'Master-data fields must use these exact IDs when needed: intakeRoute, category, subCategory, studio, trainer, classType, membership, memberName, memberContact, priority, description, desiredResolution, incidentDateTime, memberSentiment.',
            'Do not ask for reportedBy; the frontend supplies it from the signed-in user.',
            'For issue-specific fields, create clear snake_case IDs prefixed by the category or subcategory, and include options for select fields.',
            'Infer category and subCategory from member voice whenever possible. Ask for category or subCategory only when the text is genuinely ambiguous after using the approved master data.',
            'If memberName/memberContact is needed, use memberName so the frontend renders Momence member search.',
            'If class/session details are needed, use classType so the frontend renders Momence session search.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            context: body.context || {},
            masterData: body.masterData || {},
            messages: body.messages || [],
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error('OpenAI intake request failed', response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const content = cleanString(data?.choices?.[0]?.message?.content);
  return normalizeAiIntakeResponse(parseJsonObject(content));
}

function inferContextFromText(text: string, context: Record<string, unknown> = {}): Record<string, string> {
  const lower = `${text} ${cleanString(context.requestType)} ${cleanString(context.category)} ${cleanString(context.subCategory)}`.toLowerCase();
  const inferred: Record<string, string> = {};

  if (!cleanString(context.intakeRoute)) {
    if (/refund|freeze|roll\s?over|extension|reschedule|request|need|asked|wants|would like|approval|waiver|upgrade|remove her name|share details/.test(lower)) inferred.intakeRoute = 'Request';
    else if (/complain|angry|frustrated|unhappy|not resolved|delay|issue|problem|concern|denied|walked out|missing|stolen|harass|poach/.test(lower)) inferred.intakeRoute = 'Complaint';
    else if (/reported|feedback|suggested|said|shared|mentioned|compliment|liked|loved|lead|hosted class|post-class/.test(lower)) inferred.intakeRoute = 'Feedback';
    else inferred.intakeRoute = 'Internal Reporting';
  }

  if (!cleanString(context.category)) {
    if (/momence|crm|zoho|data accuracy|handover|sop|standard operating|process|workflow|payroll|performance review|finance|reconciliation|upi|marketing|campaign|collateral|partnership approval|internal operations|internal memo/.test(lower)) {
      inferred.category = 'Operating Systems';
      inferred.subCategory = /momence|crm|data/.test(lower) ? 'Momence Issues' : /payment|upi|reconciliation|finance/.test(lower) ? 'Payment Gateway Issue' : 'Technical Assistance';
    } else if (/hosted|host class|influencer|partner|lead tracking|lead feedback|guestlist|collaboration/.test(lower)) {
      inferred.category = 'Hosted Class & Partnerships';
      inferred.subCategory = /lead|sales|conversion|prospect|drop-in|share details|requested/.test(lower) ? 'Prospect Conversion Opportunity' : /swap|instructor/.test(lower) ? 'Partner Instructor Feedback' : 'Hosted Class Feedback';
    } else if (/billing|refund|payment|freeze|roll over|rollover|extension|membership|package|renewal|expiry|credit|late cancellation|waiver|upgrade/.test(lower)) {
      inferred.category = 'Pricing and Memberships';
      inferred.subCategory = /freeze|pause/.test(lower) ? 'Membership Pause and Freeze Policy' : /refund|waiver/.test(lower) ? 'Refund and Cancellation Policy Issue' : /upgrade|downgrade/.test(lower) ? 'Membership Upgrade/Downgrade' : 'Class Pack Expiry Confusion';
    } else if (/injury|safety|medical|harassment|security|theft|stolen|missing cash|cash envelope|unsafe|faint|cramp|conflict/.test(lower)) {
      inferred.category = 'Safety and Security';
      inferred.subCategory = /theft|stolen|missing cash|cash envelope/.test(lower) ? 'Theft Prevention Measures' : /harass|conflict/.test(lower) ? 'Harassment Reports' : 'Personal Safety Concerns';
    } else if (/equipment|ac|temperature|locker|clean|odour|audio|lighting|washroom|shower/.test(lower)) {
      inferred.category = 'Studio Amenities and Facilities';
      inferred.subCategory = /temperature|ac|cold|hot|ventilation|air quality/.test(lower) ? 'Air Quality Poor' : /clean|hygiene/.test(lower) ? 'Cleanliness and Hygiene' : /locker/.test(lower) ? 'Locker Availability' : /boutique|retail/.test(lower) ? 'Boutique Availability Issues' : 'Studio Odour and Aroma';
    } else if (/trainer|instructor|class|music|cue|correction|adjustment|overcrowded/.test(lower)) {
      inferred.category = /trainer|instructor|correction|adjustment|punctual|engagement|no-show/.test(lower) ? 'Trainer Feedback' : 'Class Experience';
      inferred.subCategory = /overcrowd|capacity/.test(lower) ? 'Overcrowding in Class' : /audio|music|loud/.test(lower) ? 'Audio Issues' : /punctual|late|no-show/.test(lower) ? 'Trainer Punctuality Issues' : /intensity/.test(lower) ? 'Class Intensity Too High/Low' : 'Class Flow and Pacing';
    } else if (/booking|schedule|class availability|late entry|waitlist|cancelled|reschedule|timing|variety/.test(lower)) {
      inferred.category = 'Scheduling';
      inferred.subCategory = /late entry/.test(lower) ? 'Late Arrival Policy' : /availability|variety/.test(lower) ? 'Additional Classes' : /cancel/.test(lower) ? 'Last-minute Cancellations' : 'Class Capacity Issues';
    } else if (/whatsapp|call|email|response|follow-up|front desk|communication/.test(lower)) {
      inferred.category = 'Customer Service and Communication';
      inferred.subCategory = 'Delay in Response';
    } else if (/sales|lead|trial|conversion|competitor|price|drop-in|location too far|prospect/.test(lower)) {
      inferred.category = 'Sales & Consultation';
      inferred.subCategory = /competitor/.test(lower) ? 'Competitor Mentioned' : /price|drop-in/.test(lower) ? 'Prospect Price Concern' : 'Lead Quality Note';
    } else {
      inferred.category = 'General Feedback';
      inferred.subCategory = 'Other';
    }
  }

  if (!cleanString(context.priority)) {
    if (/injury|medical|harassment|security|theft|stolen|unsafe|emergency|missing cash|40,000/.test(lower)) inferred.priority = 'Critical';
    else if (/angry|frustrated|urgent|refund|not resolved|escalat|renewal|cancel|walked out|denied|poach|high-value/.test(lower)) inferred.priority = 'High';
    else if (/complain|issue|concern|delay|request|follow-up|hosted|lead/.test(lower)) inferred.priority = 'Medium';
    else inferred.priority = 'Low';
  }

  if (!cleanString(context.studio)) {
    if (/bandra|supreme hq/.test(lower)) inferred.studio = 'Supreme HQ, Bandra';
    else if (/kemps|kwality/.test(lower)) inferred.studio = 'Kwality House, Kemps Corner';
    else if (/kenkere/.test(lower)) inferred.studio = 'Kenkere House, Bengaluru';
    else if (/copper|cloves/.test(lower)) inferred.studio = 'the Studio by Copper & Cloves, Bengaluru';
    else if (/courtside/.test(lower)) inferred.studio = 'Courtside, Mumbai';
  }

  return inferred;
}

function requiredFieldsForIssue(text: string, context: Record<string, unknown>): DetailFieldId[] {
  const lower = `${text} ${cleanString(context.requestType)} ${cleanString(context.category)} ${cleanString(context.subCategory)}`.toLowerCase();
  const intakeRoute = cleanString(context.intakeRoute);
  const route = intakeRoute.toLowerCase();
  const category = cleanString(context.category);
  const subCategory = cleanString(context.subCategory);
  const fields: DetailFieldId[] = [];
  const add = (field: DetailFieldId, value?: unknown) => {
    const cleaned = cleanString(value);
    if (!cleaned || PLACEHOLDER_VALUE_PATTERN.test(cleaned)) fields.push(field);
  };

  add('intakeRoute', context.intakeRoute);
  if (!intakeRoute) return Array.from(new Set(fields));

  add('category', context.category);
  add('subCategory', context.subCategory);
  if (!category || !subCategory) return Array.from(new Set(fields));

  const physicalStudioCategories = new Set([
    'Scheduling',
    'Class Experience',
    'Trainer Feedback',
    'Repair and Maintenance',
    'Studio Amenities and Facilities',
    'Safety and Security',
    'Theft and Lost Items',
    'Miscellaneous',
    'Instructor & Class Quality',
    'Booking & Schedule',
    'Facility & Equipment',
    'Front Desk & Service',
  ]);
  const memberFacingCategories = new Set([
    'Scheduling',
    'Class Experience',
    'Trainer Feedback',
    'Pricing and Memberships',
    'Customer Service and Communication',
    'Safety and Security',
    'Theft and Lost Items',
    'Hosted Class & Partnerships',
    'Member Progress & Transformation',
    'Sales & Consultation',
    'Booking & Schedule',
    'Billing & Membership',
    'Front Desk & Service',
  ]);
  const classContextCategories = new Set(['Scheduling', 'Class Experience', 'Trainer Feedback', 'Instructor & Class Quality', 'Booking & Schedule']);
  const membershipSpecific = /freeze|pause|roll|extension|membership|package|renewal|upgrade|downgrade|auto-renew|refund|expiry|credit|class pack|billing|payment/.test(lower);
  const hostedSpecific = /hosted|partner|influencer|partnership/.test(lower) || category === 'Hosted Class & Partnerships';
  const prioritySpecific = route !== 'feedback' || /safety|security|theft|repair|maintenance|tech|operating|pricing|membership|customer service|complaint|urgent|injury|hazard/.test(`${category} ${subCategory} ${lower}`.toLowerCase());

  if (physicalStudioCategories.has(category) && /select studio|which studio|studio record|exact studio/.test(lower)) add('studio', context.studio);
  const specificMemberRequired =
    /select member|momence member|member profile|which member|member record|link member/.test(lower) &&
    !/multiple|several|attendees|leads|prospects|team|staff|internal report|hosted class|post-class|regional operations|sales team/.test(lower) &&
    category !== 'Hosted Class & Partnerships' &&
    category !== 'Sales & Consultation';
  if (route !== 'internal reporting' && specificMemberRequired && (memberFacingCategories.has(category) || membershipSpecific)) add('memberName', context.memberId || context.memberName);
  if (membershipSpecific && /select active membership|which membership|membership record|package record/.test(lower)) {
    add('membership', context.membership);
    if (/freeze start date|freeze end date|exact freeze dates/.test(lower)) {
      add('freezeStartDate', context.freezeStartDate);
      add('freezeEndDate', context.freezeEndDate);
      add('freezeReason', context.freezeReason);
    }
    if (/classes remaining|package expiry date|requested rollover date|exact extension date/.test(lower)) {
      add('classesRemaining', context.classesRemaining);
      add('packageExpiryDate', context.packageExpiryDate);
      add('requestedRolloverDate', context.requestedRolloverDate);
      add('rolloverReason', context.rolloverReason);
    }
  }
  if ((classContextCategories.has(category) || hostedSpecific) && /specific session|which class|booking dispute|late cancellation|injury during class/.test(lower)) add('classType', context.sessionId || context.classType);
  if (category === 'Trainer Feedback' && /which trainer|specific trainer|trainer name/.test(lower)) add('trainer', context.trainer);
  if (hostedSpecific) {
    if (/which partner|partner name|influencer name|host name/.test(lower)) add('partnerName', context.partnerName);
    if (/feedback area|prospect quality|follow-up preference/.test(lower)) {
      add('hostedFeedbackArea', context.hostedFeedbackArea);
      add('prospectQuality', context.prospectQuality);
      add('followUpPreference', context.followUpPreference);
    }
  }
  if ((route === 'request' || route === 'complaint') && /desired resolution|requested resolution|what resolution|what does the member want/.test(lower)) add('desiredResolution', context.desiredResolution);
  if ((route === 'feedback' || route === 'complaint') && /sentiment unclear|member sentiment|how upset|frustration level/.test(lower)) add('memberSentiment', context.memberSentiment);

  add('reportedBy', context.reportedBy);
  if (prioritySpecific) add('priority', context.priority);
  add('description', context.description);

  return Array.from(new Set(fields));
}

function needsStructuredDetails(text: string, context: Record<string, unknown>): DetailFieldId[] {
  return requiredFieldsForIssue(text, context);
}

function buildSourceRef(draft: DraftTicket, context: Record<string, unknown> = {}, conversationId?: string | null): string {
  const explicitConversationId =
    conversationId ||
    (typeof context.conversationId === 'string' ? context.conversationId : null);
  if (explicitConversationId) return `approved-draft:${explicitConversationId}`;

  const seed = [
    draft.title,
    draft.category,
    draft.subCategory,
    draft.memberName || '',
    draft.memberContact || '',
    draft.studio || '',
    draft.description.slice(0, 180),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `approved-draft:${Math.abs(hash).toString(36)}`;
}

function toTicketRow(draft: DraftTicket, context: Record<string, unknown> = {}, conversationId?: string | null) {
  const priority = normalizePriority(draft.priority);
  const assignment = ASSIGNMENT_RULES[draft.category] || ASSIGNMENT_RULES['General Feedback'];

  return {
    source_ref: buildSourceRef(draft, context, conversationId),
    title: cleanString(draft.title, 'Member support ticket'),
    description: cleanString(draft.description, 'No description provided.'),
    category: cleanString(draft.category, 'General Feedback'),
    sub_category: cleanString(draft.subCategory, 'Other'),
    priority,
    status: 'New',
    studio: cleanString(draft.studio, 'Unspecified Studio'),
    trainer: draft.trainer || null,
    class_type: draft.classType || null,
    class_date_time: draft.classDateTime || null,
    member_name: draft.memberName || null,
    member_contact: draft.memberContact || null,
    reported_by: draft.reportedBy || 'AI Intake',
    assigned_to: assignment.assignedTo,
    team: assignment.team,
    tags: Array.from(new Set([...(draft.tags || []), 'ai-approved'])),
    sentiment: draft.sentiment || null,
    conversation_summary: draft.conversationSummary || draft.description,
    metadata: draft.metadata || {},
    sla_due_at: computeSlaDueAt(priority),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json() as RequestBody;

    if (body.action === 'createTicket' || body.approved === true) {
      const draft = body.draft || body.ticket;
      if (!draft) return json({ error: 'Approved ticket creation requires a draft' }, 400);

      const supabaseUrl = Deno.env.get('TICKETING_SUPABASE_URL') || Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('TICKETING_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: 'Missing Supabase service role configuration' }, 500);
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const sourceRef = buildSourceRef(draft, body.context || {}, body.conversationId);
      const { data: existing } = await supabase
        .from('tickets')
        .select('*')
        .eq('source_ref', sourceRef)
        .maybeSingle();

      if (existing) {
        return json({
          reply: `Ticket ${existing.id} was already created from this approved draft.`,
          createdTicket: existing,
        });
      }

      const { data, error } = await supabase
        .from('tickets')
        .insert(toTicketRow(draft, body.context || {}, body.conversationId))
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          const { data: duplicated } = await supabase
            .from('tickets')
            .select('*')
            .eq('source_ref', sourceRef)
            .maybeSingle();
          if (duplicated) {
            return json({
              reply: `Ticket ${duplicated.id} was already created from this approved draft.`,
              createdTicket: duplicated,
            });
          }
        }
        return json({ error: error.message }, 500);
      }
      return json({
        reply: `Ticket ${data.id} has been created from the approved draft.`,
        createdTicket: data,
      });
    }

    const messages = body.messages || [];
    const instructions = cleanString(body.instructions, ATHENA_SYSTEM_PROMPT);
    const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
    const aiResponse = await askAiForIntake(body, instructions);

    if (aiResponse) {
      const aiContext = { ...(body.context || {}), ...(aiResponse.inferredContext || {}) };
      const guardedMissingFields = needsStructuredDetails(latestUserMessage, aiContext);
      const needsMoreInfo = aiResponse.needsMoreInfo || guardedMissingFields.length > 0;
      const aiTicket = needsMoreInfo ? null : aiResponse.ticket || fallbackDraft(messages, aiContext);
      return json({
        conversationId: body.conversationId || crypto.randomUUID(),
        promptProfile: instructions.includes('Athena') ? 'athena-ai-dynamic' : 'custom-ai-dynamic',
        needsMoreInfo,
        reply: needsMoreInfo && !aiResponse.detailForm
          ? 'I need a few details before drafting this ticket. Please complete the form below.'
          : aiResponse.reply,
        detailForm: aiResponse.detailForm || (guardedMissingFields.length > 0
          ? {
              title: 'Complete ticket intake details',
              description: 'Athena inferred the classification and needs these details before drafting.',
              fields: Array.from(new Set(guardedMissingFields)),
              submitLabel: 'Continue drafting ticket',
            }
          : null),
        ticket: aiTicket,
        suggestedChips: aiResponse.suggestedChips || [],
        inferredContext: aiResponse.inferredContext || {},
        missingFields: guardedMissingFields.length > 0 ? guardedMissingFields : aiResponse.missingFields || [],
        publishable: !needsMoreInfo && aiResponse.publishable === true,
        urgencyReason: aiResponse.urgencyReason || '',
      });
    }

    const inferredContext = inferContextFromText(latestUserMessage, body.context || {});
    const effectiveContext = { ...(body.context || {}), ...inferredContext };
    const missingFields = needsStructuredDetails(latestUserMessage, effectiveContext);
    if (missingFields.length > 0) {
      return json({
        conversationId: body.conversationId || crypto.randomUUID(),
        promptProfile: instructions.includes('Athena') ? 'athena-fallback' : 'custom-fallback',
        needsMoreInfo: true,
        reply: 'I need a few details before drafting this ticket. Please complete the form below.',
        detailForm: {
          title: 'Complete ticket intake details',
          description: 'The options use the Physique 57 master data lists so the ticket routes correctly.',
          fields: Array.from(new Set(missingFields)),
          submitLabel: 'Continue drafting ticket',
        },
        suggestedChips: [],
        inferredContext,
        missingFields,
        publishable: false,
        urgencyReason: inferredContext.priority
          ? `Fallback priority inferred as ${inferredContext.priority} from the documented member voice.`
          : '',
      });
    }

    const draft = fallbackDraft(messages, effectiveContext);
    return json({
      conversationId: body.conversationId || crypto.randomUUID(),
      promptProfile: instructions.includes('Athena') ? 'athena-v2' : 'custom',
      needsMoreInfo: false,
      reply: 'I drafted the ticket below. Please review it before publishing.',
      ticket: draft,
      suggestedChips: [],
      inferredContext,
      missingFields: [],
      publishable: true,
      urgencyReason: inferredContext.priority
        ? `Fallback priority inferred as ${inferredContext.priority} from the documented member voice.`
        : '',
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Ticket AI chat failed' }, 500);
  }
});
