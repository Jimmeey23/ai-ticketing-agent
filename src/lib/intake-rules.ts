export type IntakePriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface IntakeContext {
  intakeRoute?: string;
  requestType?: string;
  clientsAffected?: string;
  memberId?: string;
  memberName?: string;
  memberContact?: string;
  sessionId?: string;
  studio?: string;
  trainer?: string;
  classType?: string;
  classDateTime?: string;
  membership?: string;
  category?: string;
  subCategory?: string;
  reportedBy?: string;
  priority?: IntakePriority | string;
  description?: string;
  incidentDateTime?: string;
  desiredResolution?: string;
  urgencyReason?: string;
  memberSentiment?: string;
  freezeStartDate?: string;
  freezeEndDate?: string;
  freezeReason?: string;
  classesRemaining?: string;
  packageExpiryDate?: string;
  requestedRolloverDate?: string;
  rolloverReason?: string;
  partnerName?: string;
  hostedFeedbackArea?: string;
  attendeeCount?: string;
  prospectQuality?: string;
  followUpPreference?: string;
  initialReport?: string;
  [key: string]: string | undefined;
}

const PLACEHOLDER_VALUE_PATTERN = /unspecified|not specified|member-reported issue|ai intake|authenticated user/i;

const INTAKE_ROUTES = ['Request', 'Complaint', 'Feedback', 'Internal Reporting'];
export const CLIENTS_AFFECTED_OPTIONS = [
  'Yes - directly affected',
  'Yes - indirectly affected',
  'Yes - directly and indirectly affected',
  'No clients affected',
  'Not confirmed yet',
] as const;

const STUDIO_REQUIRED_CATEGORIES = new Set([
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

export const PROTECTED_ENTITY_FIELD_IDS = [
  'memberName',
  'memberContact',
  'memberId',
  'classType',
  'classDateTime',
  'trainer',
  'sessionId',
  'membership',
] as const;

export type ProtectedEntityFieldId = typeof PROTECTED_ENTITY_FIELD_IDS[number];

export const PROTECTED_ENTITY_FIELD_SET = new Set<string>(PROTECTED_ENTITY_FIELD_IDS);

// Categories that are strictly facility/ops. A specific member/class is only relevant
// when explicitly requested by a non-physical profile.
const PHYSICAL_ONLY_CATEGORIES = new Set([
  'Repair and Maintenance',
  'Studio Amenities and Facilities',
  'Facility & Equipment',
  'Operating Systems',
  'Tech Issues',
  'App & Digital',
]);

type IntakeFieldType = 'select' | 'text' | 'textarea' | 'date' | 'datetime-local' | 'number';

export interface IntakeFieldDefinition {
  id: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: string[];
  dependsOn?: string;
}

const FIELD_DEFINITIONS: Record<string, IntakeFieldDefinition> = {
  intakeRoute: { id: 'intakeRoute', label: 'Intake Route', type: 'select', required: true, options: INTAKE_ROUTES },
  clientsAffected: {
    id: 'clientsAffected',
    label: 'Were any clients directly or indirectly affected?',
    type: 'select',
    required: true,
    options: [...CLIENTS_AFFECTED_OPTIONS],
  },
  category: { id: 'category', label: 'Member Voice Category', type: 'select', required: true },
  subCategory: { id: 'subCategory', label: 'Specific Touchpoint', type: 'select', required: true, dependsOn: 'category' },
  studio: { id: 'studio', label: 'Studio Space', type: 'select', required: true },
  incidentDateTime: { id: 'incidentDateTime', label: 'When was this first noticed?', type: 'datetime-local', required: true },
  reportedBy: { id: 'reportedBy', label: 'Documented By', type: 'text', required: true },
  priority: { id: 'priority', label: 'Priority', type: 'select', required: true, options: ['Critical', 'High', 'Medium', 'Low'] },
  description: { id: 'description', label: 'Member stated feedback or operational summary', type: 'textarea', required: true },
  memberName: { id: 'memberName', label: 'Community Member', type: 'text', required: true },
  memberContact: { id: 'memberContact', label: 'Member Contact', type: 'text' },
  classType: { id: 'classType', label: 'Momence Class / Session', type: 'select', required: true },
  trainer: { id: 'trainer', label: 'Studio Instructor', type: 'select' },
  membership: { id: 'membership', label: 'Active Package / Membership', type: 'select', required: true },
  desiredResolution: { id: 'desiredResolution', label: "Member's requested resolution", type: 'textarea' },
  memberSentiment: { id: 'memberSentiment', label: 'Member Sentiment', type: 'select' },
  freezeStartDate: { id: 'freezeStartDate', label: 'Requested Freeze Start Date', type: 'date', required: true },
  freezeEndDate: { id: 'freezeEndDate', label: 'Requested Freeze End Date', type: 'date', required: true },
  freezeReason: { id: 'freezeReason', label: 'Freeze Reason Stated by Member', type: 'select', required: true },
  classesRemaining: { id: 'classesRemaining', label: 'Classes / Credits Remaining', type: 'number' },
  packageExpiryDate: { id: 'packageExpiryDate', label: 'Current Package Expiry Date', type: 'date' },
  requestedRolloverDate: { id: 'requestedRolloverDate', label: 'Requested Roll Over / Extension Date', type: 'date', required: true },
  rolloverReason: { id: 'rolloverReason', label: 'Roll Over Reason', type: 'select', required: true },
  partnerName: { id: 'partnerName', label: 'Hosted Class Partner / Influencer', type: 'text', required: true },
  hostedFeedbackArea: { id: 'hostedFeedbackArea', label: 'Hosted Class Feedback Area', type: 'select', required: true },
  prospectQuality: { id: 'prospectQuality', label: 'Prospect Quality / Conversion Signal', type: 'select' },
  followUpPreference: { id: 'followUpPreference', label: 'Follow-up Preference Indicated', type: 'select' },
  machineSymptom: {
    id: 'machineSymptom',
    label: 'Machine symptom observed',
    type: 'select',
    required: true,
    options: ['Will not turn on', 'Not draining', 'Not spinning', 'Leaking water', 'Electrical issue', 'Excess noise or vibration', 'Other / unsure'],
  },
  hvacSymptom: {
    id: 'hvacSymptom',
    label: 'HVAC issue observed',
    type: 'select',
    required: true,
    options: ['Not cooling', 'Not heating', 'No airflow', 'Water leakage', 'Noise / vibration', 'Remote or control issue', 'Other / unsure'],
  },
  lockFaultType: {
    id: 'lockFaultType',
    label: 'Door or lock fault type',
    type: 'select',
    required: true,
    options: ['Will not close', 'Will not open', 'Latch not catching', 'Key/card access failing', 'Handle loose or broken', 'Hinge issue', 'Other / unsure'],
  },
  accessStatus: {
    id: 'accessStatus',
    label: 'Current access status',
    type: 'select',
    required: true,
    options: ['Access open and usable', 'Access restricted but workaround available', 'Area cannot be secured', 'Area cannot be accessed', 'Unknown'],
  },
  securityRisk: {
    id: 'securityRisk',
    label: 'Security or safety risk',
    type: 'select',
    required: true,
    options: ['No immediate risk', 'Member/staff safety risk', 'Area cannot be secured overnight', 'Fire/access compliance risk', 'Unknown'],
  },
  plumbingSymptom: {
    id: 'plumbingSymptom',
    label: 'Plumbing symptom observed',
    type: 'select',
    required: true,
    options: ['Leak', 'Drain clogged', 'Overflow', 'No water', 'Low pressure', 'Flush issue', 'Odour/sewage concern', 'Other / unsure'],
  },
  electricalSymptom: {
    id: 'electricalSymptom',
    label: 'Electrical or lighting symptom',
    type: 'select',
    required: true,
    options: ['Light not working', 'Flickering light', 'Socket not working', 'Exposed/loose wiring', 'Trip or power loss', 'Other / unsure'],
  },
  affectedArea: { id: 'affectedArea', label: 'Affected area inside the studio space', type: 'text', required: true },
  operationalImpact: {
    id: 'operationalImpact',
    label: 'Operational impact right now',
    type: 'textarea',
    required: true,
  },
  currentWorkaround: {
    id: 'currentWorkaround',
    label: 'Temporary workaround currently in place',
    type: 'textarea',
    required: true,
  },
  resolutionRequirement: {
    id: 'resolutionRequirement',
    label: 'Expected resolution or vendor action needed',
    type: 'textarea',
    required: true,
  },
  appIssueSurface: {
    id: 'appIssueSurface',
    label: 'Digital surface affected',
    type: 'select',
    required: true,
    options: ['Momence app', 'Website', 'Payment gateway', 'iPad / check-in device', 'Wi-Fi / router', 'Other digital system'],
  },
  appErrorObserved: { id: 'appErrorObserved', label: 'Error message or behavior observed', type: 'textarea', required: true },
  deviceContext: { id: 'deviceContext', label: 'Device, browser, app version, or account context', type: 'text' },
};

export function getIntakeFieldDefinition(id: string): IntakeFieldDefinition | undefined {
  return FIELD_DEFINITIONS[id];
}

export function isProtectedEntityField(id: string): boolean {
  return PROTECTED_ENTITY_FIELD_SET.has(id);
}

const CLASS_CONTEXT_CATEGORIES = new Set([
  'Scheduling',
  'Class Experience',
  'Trainer Feedback',
  'Instructor & Class Quality',
  'Booking & Schedule',
]);

function hasConfirmedAffectedClients(value?: string): boolean {
  return /^yes\b/i.test(value?.trim() || '');
}

export function isMissingIntakeValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;

  const normalized = value.trim();
  return !normalized || PLACEHOLDER_VALUE_PATTERN.test(normalized);
}

// Physical/facility issues that require detailed operational context before the description
// is considered complete. Short initial reports for these are captured as preliminary only.
const HVAC_TEXT_PATTERN = /\b(?:ac|hvac)\b|air\s?con|air conditioning|not cooling|not heating|no airflow/i;
const PHYSICAL_ISSUE_TEXT_PATTERN = /repair|maintenance|broken|not working|not closing|not opening|stopped working|won't close|won't open|not cooling|not heating|too hot|too cold|very hot|very cold|temperature|malfunction|faulty|damaged|leak|leaking|plumbing|drain|clog|flush|sewage|socket|electrical|bulb|fused|flickering|machine|washing|dryer|pump|pest|mold|damp|\bdoor\b|\block\b|\bhandle\b|hinge|ceiling|crack|odour|odor|smell|stench|ventilation|locker|shower|washroom|toilet|steam|\bac\b|hvac|air\s?con|app crash|login issue|website down/i;

function buildIssueText(context: IntakeContext, extraText = ''): string {
  return [
    extraText,
    context.initialReport,
    context.requestType,
    context.category,
    context.subCategory,
    context.description,
  ].filter(Boolean).join(' ').toLowerCase();
}

function getIssueProfileFieldIds(context: IntakeContext): string[] {
  const issueText = buildIssueText(context);
  const category = context.category || '';
  const subCategory = context.subCategory || '';

  if (!PHYSICAL_ONLY_CATEGORIES.has(category)) return [];

  if (/washing|washer|laundry|dryer|machine/.test(issueText) || subCategory === 'Broken Equipment Not Repaired') {
    return ['machineSymptom', 'operationalImpact', 'currentWorkaround', 'resolutionRequirement'];
  }

  if (/door|lock|latch|handle|hinge|access|closing|opening/.test(issueText) || subCategory === 'Door Lock Issues') {
    return ['lockFaultType', 'accessStatus', 'securityRisk', 'resolutionRequirement'];
  }

  if (HVAC_TEXT_PATTERN.test(issueText) || subCategory === 'AC and HVAC Issues') {
    return ['hvacSymptom', 'affectedArea', 'operationalImpact', 'currentWorkaround', 'resolutionRequirement'];
  }

  if (/plumbing|leak|drain|clog|flush|sewage|overflow|pipe|water/.test(issueText) || subCategory === 'Plumbing Leaks') {
    return ['plumbingSymptom', 'affectedArea', 'operationalImpact', 'currentWorkaround', 'resolutionRequirement'];
  }

  if (/light|lighting|bulb|fused|flickering|electrical|socket|wiring|power|trip/.test(issueText) || subCategory === 'Lighting Issues') {
    return ['electricalSymptom', 'affectedArea', 'operationalImpact', 'currentWorkaround', 'resolutionRequirement'];
  }

  if (/app|website|login|password|payment gateway|momence|sync|qr|ipad|wi-?fi|wifi|router/.test(issueText) || category === 'App & Digital' || category === 'Tech Issues') {
    return ['appIssueSurface', 'appErrorObserved', 'deviceContext', 'operationalImpact', 'currentWorkaround'];
  }

  return [];
}

export function captureMemberVoiceFromText(text: string, context: IntakeContext): string | null {
  const value = text.trim();

  if (!isMissingIntakeValue(context.description)) return null;
  if (!value || value.length < 12) return null;
  if (INTAKE_ROUTES.some((route) => route.toLowerCase() === value.toLowerCase())) return null;
  if (/^(here are the missing details|route this as|please refine the current ticket draft|title:|priority:)/i.test(value)) {
    return null;
  }
  if (/^(member|client|community member|studio member|guest|prospect)\s+(said|stated|reported|shared|mentioned|requested|expressed|complained|noted|asked)\s*:/i.test(value)) {
    return value;
  }

  const detailLines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (detailLines.length > 0 && detailLines.every((line) => /^[a-z][a-z\s/'&-]{1,40}:/i.test(line))) {
    return null;
  }

  // For physical/maintenance/facility issues, a brief one-liner is a STARTING POINT, not a
  // complete description. Require substantially more detail (multi-sentence or >100 chars)
  // before treating it as the captured description so the AI is prompted to collect operational detail.
  const isPhysicalIssueText = PHYSICAL_ISSUE_TEXT_PATTERN.test(value);
  if (isPhysicalIssueText) {
    const isDetailed = value.length > 100 || (/[.!?]\s/.test(value) && value.length > 60) || value.includes('\n');
    if (!isDetailed) return null; // leave description empty — AI will collect proper operational detail
  }

  const looksLikeMemberVoice =
    value.length > 15 ||
    /member|client|community|reported|said|stated|requested|complain|feedback|concern|issue|class|studio|refund|freeze|roll|trainer|instructor|billing|payment|booking|temperature|\bac\b|hvac|air\s?con|broken|repair|maintenance|not working|malfunction|leak|clean|smell|odour|locker|washroom|shower/i.test(value);

  return looksLikeMemberVoice ? value : null;
}

export function inferIntakeContextFromText(text: string, context: IntakeContext = {}): Partial<IntakeContext> {
  const lower = [
    text,
    context.initialReport,
    context.requestType,
    context.category,
    context.subCategory,
    context.description,
  ].filter(Boolean).join(' ').toLowerCase();
  const inferred: Partial<IntakeContext> = {};

  if (isMissingIntakeValue(context.intakeRoute)) {
    if (/hosted class|host class|post-class feedback|attendees|lead tracking|lead feedback/.test(lower)) {
      inferred.intakeRoute = 'Feedback';
    } else if (/refund|freeze|roll\s?over|extension|reschedule|request|asked|wants|would like|approval|waiver|upgrade|remove her name|share details/.test(lower)) {
      inferred.intakeRoute = 'Request';
    } else if (/complain|angry|frustrated|unhappy|not resolved|delay|issue|problem|concern|denied|walked out|missing|stolen|harass|poach/.test(lower)) {
      inferred.intakeRoute = 'Complaint';
    } else if (/reported|feedback|suggested|said|shared|mentioned|compliment|liked|loved|lead|hosted class|post-class/.test(lower)) {
      inferred.intakeRoute = 'Feedback';
    } else {
      inferred.intakeRoute = 'Internal Reporting';
    }
  }

  if (isMissingIntakeValue(context.category)) {
    if (/momence|crm|zoho|data accuracy|handover|sop|standard operating|process|workflow|payroll|performance review|finance|reconciliation|upi|marketing|campaign|collateral|partnership approval|internal operations|internal memo/.test(lower)) {
      inferred.category = 'Operating Systems';
      inferred.subCategory = /momence|crm|data/.test(lower) ? 'Momence Issues' : /payment|upi|reconciliation|finance/.test(lower) ? 'Payment Gateway Issue' : 'Technical Assistance';
    } else if (/hosted|host class|influencer|partner|lead tracking|lead feedback|guestlist|collaboration/.test(lower)) {
      inferred.category = 'Hosted Class & Partnerships';
      inferred.subCategory = /lead|sales|conversion|prospect|drop-in|share details|requested/.test(lower) ? 'Prospect Conversion Opportunity' : /swap|instructor/.test(lower) ? 'Partner Instructor Feedback' : 'Hosted Class Feedback';
    } else if (/billing|refund|payment|freeze|roll\s?over|extension|membership|package|renewal|expiry|credit|late cancellation|waiver|upgrade/.test(lower)) {
      inferred.category = 'Pricing and Memberships';
      inferred.subCategory = /freeze|pause/.test(lower) ? 'Membership Pause and Freeze Policy' : /refund|waiver/.test(lower) ? 'Refund and Cancellation Policy Issue' : /upgrade|downgrade/.test(lower) ? 'Membership Upgrade/Downgrade' : 'Class Pack Expiry Confusion';
    } else if (/injury|safety|medical|harassment|security|theft|stolen|missing cash|cash envelope|unsafe|faint|cramp|conflict/.test(lower)) {
      inferred.category = 'Safety and Security';
      inferred.subCategory = /theft|stolen|missing cash|cash envelope/.test(lower) ? 'Theft Prevention Measures' : /harass|conflict/.test(lower) ? 'Harassment Reports' : 'Personal Safety Concerns';
    } else if (
      /repair|maintenance|broken|not working|not closing|not opening|stopped working|isn't working|isnt working|won't close|won't open|malfunction|faulty|damaged|damage|crack|cracked|leak|leaking|overflow|plumbing|drain|clog|clogged|flush|sewage|socket|electrical|wiring|bulb|fused|flickering|lights not|light not|machine|washing machine|dryer|washing|pump|generator|pest|pest control|mold|mould|damp|seepage|\bdoor\b|\block\b|latch|handle|hinge/.test(lower) ||
      HVAC_TEXT_PATTERN.test(lower)
    ) {
      inferred.category = 'Repair and Maintenance';
      inferred.subCategory = HVAC_TEXT_PATTERN.test(lower) ? 'AC and HVAC Issues'
        : /light|bulb|fused|flickering/.test(lower) ? 'Lighting Issues'
        : /audio|speaker|mic|sound/.test(lower) ? 'Audio System Malfunction'
        : /leak|plumbing|drain|flush|sewage|overflow|clog|pipe/.test(lower) ? 'Plumbing Leaks'
        : /pest|cockroach|rat|rodent|insect|ant/.test(lower) ? 'Pest Control Needed'
        : /door|lock|handle|hinge/.test(lower) ? 'Door Lock Issues'
        : /machine|washing|dryer|equipment|broken|not working|malfunction|faulty/.test(lower) ? 'Broken Equipment Not Repaired'
        : 'General Maintenance Delays';
    } else if (/odour|odor|smell|stench|ventilation|air quality|locker|shower|washroom|toilet|steam room|valet|parking|wi-fi|wifi|boutique|retail|amenity|amenities|cleanliness|hygiene|clean|dirty/.test(lower)) {
      inferred.category = 'Studio Amenities and Facilities';
      inferred.subCategory = /temperature|too hot|too cold|cold|hot/.test(lower) ? 'Air Quality Poor'
        : /ventilation|air quality/.test(lower) ? 'Ventilation Poor'
        : /clean|hygiene|dirty/.test(lower) ? 'Cleanliness and Hygiene'
        : /locker/.test(lower) ? 'Locker Availability'
        : /boutique|retail/.test(lower) ? 'Boutique Availability Issues'
        : /steam/.test(lower) ? 'Steam Room Not Working'
        : 'Studio Odour and Aroma';
    } else if (/temperature|too hot|too cold|air\s?con|air quality/.test(lower)) {
      // Temperature/AC comfort complaint (not a breakdown) — map to amenities, not maintenance
      inferred.category = 'Studio Amenities and Facilities';
      inferred.subCategory = 'Air Quality Poor';
    } else if (/trainer|instructor|class|music|cue|correction|adjustment|intensity|overcrowded|capacity|late start|no-show|substitute|punctual|engagement/.test(lower)) {
      inferred.category = /trainer|instructor|correction|adjustment|punctual|engagement|no-show/.test(lower) ? 'Trainer Feedback' : 'Class Experience';
      inferred.subCategory = /overcrowd|capacity/.test(lower) ? 'Overcrowding in Class' : /audio|music|loud/.test(lower) ? 'Audio Issues' : /punctual|late|no-show/.test(lower) ? 'Trainer Punctuality Issues' : /intensity/.test(lower) ? 'Class Intensity Too High/Low' : 'Class Flow and Pacing';
    } else if (/app crash|app not|app freezing|login issue|login error|password reset|push notification|booking confirmation missing|payment gateway|momence account|sync issue|profile issue|website glitch|website not|website down|qr code|ipad not|ipad issue/.test(lower)) {
      inferred.category = 'App & Digital';
      inferred.subCategory = /crash|freeze|not responding/.test(lower) ? 'App Crash'
        : /login|password/.test(lower) ? 'Login Issue'
        : /notification/.test(lower) ? 'Push Notifications'
        : /payment|gateway/.test(lower) ? 'Payment Gateway Issue'
        : /momence|sync/.test(lower) ? 'Momence Account Sync'
        : /booking confirm/.test(lower) ? 'Booking Confirmation Missing'
        : /website/.test(lower) ? 'Website Chat / Lead Form Issue'
        : 'App Crash';
    } else if (/booking|schedule|class availability|late entry|waitlist|cancelled|reschedule|timing|variety/.test(lower)) {
      inferred.category = 'Scheduling';
      inferred.subCategory = /late entry/.test(lower) ? 'Late Arrival Policy' : /availability|variety/.test(lower) ? 'Additional Classes' : /cancel/.test(lower) ? 'Last-minute Cancellations' : 'Class Capacity Issues';
    } else if (/whatsapp|call|email|response|follow-up|front desk|communication|miscommunication|details/.test(lower)) {
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

  if (isMissingIntakeValue(context.priority)) {
    if (/injury|medical|harassment|security|theft|stolen|unsafe|emergency|missing cash|40,000/.test(lower)) inferred.priority = 'Critical';
    else if (/angry|frustrated|urgent|refund|not resolved|escalat|renewal|cancel|walked out|denied|poach|high-value/.test(lower)) inferred.priority = 'High';
    else if (/complain|issue|concern|delay|request|follow-up|hosted|lead/.test(lower)) inferred.priority = 'Medium';
    else inferred.priority = 'Low';
  }

  if (!context.urgencyReason && inferred.priority) {
    inferred.urgencyReason = `Priority inferred as ${inferred.priority} from the documented member voice.`;
  }

  if (isMissingIntakeValue(context.studio)) {
    if (/bandra|supreme hq/.test(lower)) inferred.studio = 'Supreme HQ, Bandra';
    else if (/kemps|kwality/.test(lower)) inferred.studio = 'Kwality House, Kemps Corner';
    else if (/kenkere/.test(lower)) inferred.studio = 'Kenkere House, Bengaluru';
    else if (/copper|cloves/.test(lower)) inferred.studio = 'the Studio by Copper & Cloves, Bengaluru';
    else if (/courtside/.test(lower)) inferred.studio = 'Courtside, Mumbai';
  }

  return inferred;
}

export function getMissingIntakeFields(context: IntakeContext): string[] {
  const fields: string[] = [];
  const add = (field: string, value?: string | null) => {
    if (isMissingIntakeValue(value) && !fields.includes(field)) fields.push(field);
  };

  const route = context.intakeRoute || '';
  const category = context.category || '';
  const subCategory = context.subCategory || '';

  add('intakeRoute', route);
  add('category', category);
  add('subCategory', subCategory);

  if (fields.some((field) => field === 'intakeRoute' || field === 'category' || field === 'subCategory')) {
    return fields;
  }

  const routeLower = route.toLowerCase();
  const issueText = buildIssueText(context);
  const categoryPathText = `${category} ${subCategory} ${issueText}`.toLowerCase();
  const membershipSpecific =
    /freeze|pause|roll|extension|membership|package|renewal|upgrade|downgrade|auto-renew|refund|expiry|credit|class pack|billing|payment/.test(issueText);
  const hostedSpecific = /hosted|partner|influencer|partnership/.test(issueText) || category === 'Hosted Class & Partnerships';
  const prioritySpecific =
    routeLower !== 'feedback' ||
    /safety|security|theft|repair|maintenance|tech|operating|pricing|membership|customer service|complaint|urgent|injury|hazard/.test(categoryPathText);

  // Always require studio for any physical in-studio category — no keyword guard
  if (STUDIO_REQUIRED_CATEGORIES.has(category)) {
    add('studio', context.studio);
  }

  // For physical/maintenance/amenity issues: always require when it was first noticed.
  // The AI determines all other contextual fields dynamically from the incident description.
  const isPhysicalCategory = PHYSICAL_ONLY_CATEGORIES.has(category);
  if (isPhysicalCategory) {
    add('incidentDateTime', context.incidentDateTime);
    getIssueProfileFieldIds(context).forEach((field) => add(field, context[field]));
  }

  add('clientsAffected', context.clientsAffected);
  const requireAffectedClientSelection = hasConfirmedAffectedClients(context.clientsAffected);

  if (requireAffectedClientSelection) {
    add('memberName', context.memberId || context.memberName);
  }

  if (membershipSpecific && /select active membership|which membership|membership record|package record/.test(issueText)) {
    add('membership', context.membership);

    if (/freeze start date|freeze end date|exact freeze dates/.test(issueText)) {
      add('freezeStartDate', context.freezeStartDate);
      add('freezeEndDate', context.freezeEndDate);
      add('freezeReason', context.freezeReason);
    }

    if (/classes remaining|package expiry date|requested rollover date|exact extension date/.test(issueText)) {
      add('classesRemaining', context.classesRemaining);
      add('packageExpiryDate', context.packageExpiryDate);
      add('requestedRolloverDate', context.requestedRolloverDate);
      add('rolloverReason', context.rolloverReason);
    }
  }

  if ((CLASS_CONTEXT_CATEGORIES.has(category) || hostedSpecific) && /class|session|hosted|barre|cycle|strength|trainer|instructor|late cancellation|injury during class/.test(issueText)) {
    add('classType', context.sessionId || context.classType);
  }
  if (category === 'Trainer Feedback' && /which trainer|specific trainer|trainer name/.test(issueText)) add('trainer', context.trainer);

  if (hostedSpecific) {
    if (/which partner|partner name|influencer name|host name/.test(issueText)) add('partnerName', context.partnerName);
    if (/feedback area|prospect quality|follow-up preference/.test(issueText)) {
      add('hostedFeedbackArea', context.hostedFeedbackArea);
      add('prospectQuality', context.prospectQuality);
      add('followUpPreference', context.followUpPreference);
    }
  }

  if ((routeLower === 'request' || routeLower === 'complaint') && /desired resolution|requested resolution|what resolution|what does the member want/.test(issueText)) {
    add('desiredResolution', context.desiredResolution);
  }
  if ((routeLower === 'feedback' || routeLower === 'complaint') && /sentiment unclear|member sentiment|how upset|frustration level/.test(issueText)) {
    add('memberSentiment', context.memberSentiment);
  }

  add('reportedBy', context.reportedBy);
  if (prioritySpecific) add('priority', context.priority);
  // For physical/maintenance/facility categories the AI uses custom field IDs to capture
  // operational detail — not the generic 'description' field. Don't require description
  // for those categories; let the AI reason about what specific questions to ask.
  if (!isPhysicalCategory) {
    add('description', context.description);
  }

  return fields;
}

export function isIntakePublishable(context: IntakeContext): boolean {
  return getMissingIntakeFields(context).length === 0;
}

export function getIntakeFieldDefinitions(context: IntakeContext): IntakeFieldDefinition[] {
  return getMissingIntakeFields(context).map((id) => (
    FIELD_DEFINITIONS[id] || {
      id,
      label: id.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (value) => value.toUpperCase()),
      type: 'text',
      required: true,
    }
  ));
}
