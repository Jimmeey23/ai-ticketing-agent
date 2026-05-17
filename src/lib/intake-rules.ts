export type IntakePriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface IntakeContext {
  intakeRoute?: string;
  requestType?: string;
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
  [key: string]: string | undefined;
}

const PLACEHOLDER_VALUE_PATTERN = /unspecified|not specified|member-reported issue|ai intake|authenticated user/i;

const INTAKE_ROUTES = ['Request', 'Complaint', 'Feedback', 'Internal Reporting'];

const PHYSICAL_STUDIO_CATEGORIES = new Set([
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

const MEMBER_FACING_CATEGORIES = new Set([
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

const CLASS_CONTEXT_CATEGORIES = new Set([
  'Scheduling',
  'Class Experience',
  'Trainer Feedback',
  'Instructor & Class Quality',
  'Booking & Schedule',
]);

export function isMissingIntakeValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;

  const normalized = value.trim();
  return !normalized || PLACEHOLDER_VALUE_PATTERN.test(normalized);
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

  const looksLikeMemberVoice =
    value.length > 35 ||
    /member|client|community|reported|said|stated|requested|complain|feedback|concern|issue|class|studio|refund|freeze|roll|trainer|instructor|billing|payment|booking|temperature|ac/i.test(value);

  return looksLikeMemberVoice ? value : null;
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
  const issueText = [
    context.requestType,
    category,
    subCategory,
    context.description,
  ].filter(Boolean).join(' ').toLowerCase();
  const categoryPathText = `${category} ${subCategory} ${issueText}`.toLowerCase();
  const membershipSpecific =
    /freeze|pause|roll|extension|membership|package|renewal|upgrade|downgrade|auto-renew|refund|expiry|credit|class pack|billing|payment/.test(issueText);
  const hostedSpecific = /hosted|partner|influencer|partnership/.test(issueText) || category === 'Hosted Class & Partnerships';
  const prioritySpecific =
    routeLower !== 'feedback' ||
    /safety|security|theft|repair|maintenance|tech|operating|pricing|membership|customer service|complaint|urgent|injury|hazard/.test(categoryPathText);

  if (PHYSICAL_STUDIO_CATEGORIES.has(category)) add('studio', context.studio);

  if (routeLower !== 'internal reporting' && (MEMBER_FACING_CATEGORIES.has(category) || membershipSpecific)) {
    add('memberName', context.memberId || context.memberName);
  }

  if (membershipSpecific) {
    add('membership', context.membership);

    if (/freeze|pause/.test(issueText)) {
      add('freezeStartDate', context.freezeStartDate);
      add('freezeEndDate', context.freezeEndDate);
      add('freezeReason', context.freezeReason);
    }

    if (/roll|extension|expiry|credit/.test(issueText)) {
      add('classesRemaining', context.classesRemaining);
      add('packageExpiryDate', context.packageExpiryDate);
      add('requestedRolloverDate', context.requestedRolloverDate);
      add('rolloverReason', context.rolloverReason);
    }
  }

  if (CLASS_CONTEXT_CATEGORIES.has(category) || hostedSpecific) add('classType', context.sessionId || context.classType);
  if (category === 'Trainer Feedback') add('trainer', context.trainer);

  if (hostedSpecific) {
    add('partnerName', context.partnerName);
    add('hostedFeedbackArea', context.hostedFeedbackArea);
    add('prospectQuality', context.prospectQuality);
    add('followUpPreference', context.followUpPreference);
  }

  if (routeLower === 'request' || routeLower === 'complaint') add('desiredResolution', context.desiredResolution);
  if (routeLower === 'feedback' || routeLower === 'complaint') add('memberSentiment', context.memberSentiment);

  add('reportedBy', context.reportedBy);
  if (prioritySpecific) add('priority', context.priority);
  add('description', context.description);

  return fields;
}

export function isIntakePublishable(context: IntakeContext): boolean {
  return getMissingIntakeFields(context).length === 0;
}
