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

function isSpecificMemberRequired(context: IntakeContext, issueText: string, category: string): boolean {
  if (/select member|momence member|member profile|which member|member record|link member/.test(issueText)) return true;
  if (/multiple|several|attendees|leads|prospects|team|staff|internal report|hosted class|post-class|regional operations|sales team/i.test(issueText)) {
    return false;
  }
  if (category === 'Hosted Class & Partnerships' || category === 'Sales & Consultation') return false;
  return /refund|freeze|roll|extension|membership|package|renewal|payment|billing|theft|stolen|injury|harassment|medical|missing cash/.test(issueText);
}

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

export function inferIntakeContextFromText(text: string, context: IntakeContext = {}): Partial<IntakeContext> {
  const lower = [
    text,
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
    } else if (/equipment|ac|temperature|cold|hot|locker|clean|odour|odor|audio|lighting|washroom|shower|ventilation|air quality|boutique|retail/.test(lower)) {
      inferred.category = 'Studio Amenities and Facilities';
      inferred.subCategory = /temperature|ac|cold|hot|ventilation|air quality/.test(lower) ? 'Air Quality Poor' : /clean|hygiene/.test(lower) ? 'Cleanliness and Hygiene' : /locker/.test(lower) ? 'Locker Availability' : /boutique|retail/.test(lower) ? 'Boutique Availability Issues' : 'Studio Odour and Aroma';
    } else if (/trainer|instructor|class|music|cue|correction|adjustment|intensity|overcrowded|capacity|late start|no-show|substitute|punctual|engagement/.test(lower)) {
      inferred.category = /trainer|instructor|correction|adjustment|punctual|engagement|no-show/.test(lower) ? 'Trainer Feedback' : 'Class Experience';
      inferred.subCategory = /overcrowd|capacity/.test(lower) ? 'Overcrowding in Class' : /audio|music|loud/.test(lower) ? 'Audio Issues' : /punctual|late|no-show/.test(lower) ? 'Trainer Punctuality Issues' : /intensity/.test(lower) ? 'Class Intensity Too High/Low' : 'Class Flow and Pacing';
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

  if (PHYSICAL_STUDIO_CATEGORIES.has(category) && /select studio|which studio|studio record|exact studio/.test(issueText)) {
    add('studio', context.studio);
  }

  if (routeLower !== 'internal reporting' && isSpecificMemberRequired(context, issueText, category) && (MEMBER_FACING_CATEGORIES.has(category) || membershipSpecific)) {
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
  add('description', context.description);

  return fields;
}

export function isIntakePublishable(context: IntakeContext): boolean {
  return getMissingIntakeFields(context).length === 0;
}
