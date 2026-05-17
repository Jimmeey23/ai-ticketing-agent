import { describe, expect, it } from 'vitest';
import {
  captureMemberVoiceFromText,
  getMissingIntakeFields,
  isIntakePublishable,
  isMissingIntakeValue,
  type IntakeContext,
} from './intake-rules';

describe('intake publishability rules', () => {
  it('requires route, category, and subcategory for an empty context', () => {
    expect(getMissingIntakeFields({})).toEqual(['intakeRoute', 'category', 'subCategory']);
    expect(isIntakePublishable({})).toBe(false);
  });

  it('requires complaint details after route, category, and subcategory are present', () => {
    const context: IntakeContext = {
      intakeRoute: 'Complaint',
      category: 'Customer Service and Communication',
      subCategory: 'Delay in Response',
    };

    expect(getMissingIntakeFields(context)).toEqual([
      'memberName',
      'desiredResolution',
      'memberSentiment',
      'reportedBy',
      'priority',
      'description',
    ]);
    expect(isIntakePublishable(context)).toBe(false);
  });

  it('treats placeholder values as missing while accepting a real studio', () => {
    const context: IntakeContext = {
      intakeRoute: 'Complaint',
      category: 'Studio Amenities and Facilities',
      subCategory: 'Cleanliness',
      studio: 'Unspecified Studio',
      memberName: 'Aarohi Mehta',
      desiredResolution: 'Member requested a manager follow-up.',
      memberSentiment: 'Member Expressed Dissatisfaction',
      reportedBy: 'AI Intake',
      priority: 'Medium',
      description: 'Member-reported issue',
    };

    expect(isMissingIntakeValue('Unspecified Studio')).toBe(true);
    expect(isMissingIntakeValue('Member-reported issue')).toBe(true);
    expect(isMissingIntakeValue('AI Intake')).toBe(true);
    expect(isMissingIntakeValue('Bandra')).toBe(false);
    expect(getMissingIntakeFields(context)).toEqual(['studio', 'reportedBy', 'description']);

    expect(getMissingIntakeFields({ ...context, studio: 'Bandra' })).toEqual(['reportedBy', 'description']);
  });

  it('marks a complete member-facing complaint context publishable', () => {
    const context: IntakeContext = {
      intakeRoute: 'Complaint',
      category: 'Customer Service and Communication',
      subCategory: 'Delay in Response',
      memberId: 'mom_123',
      desiredResolution: 'Member requested a WhatsApp update and timeline for resolution.',
      memberSentiment: 'Member Expressed Frustration/Anger',
      reportedBy: 'Priya Shah',
      priority: 'High',
      description: 'Member reported that her WhatsApp query was not answered for two days.',
    };

    expect(getMissingIntakeFields(context)).toEqual([]);
    expect(isIntakePublishable(context)).toBe(true);
  });

  it('does not ask for reportedBy when auth has supplied a real user', () => {
    const context: IntakeContext = {
      intakeRoute: 'Complaint',
      category: 'Customer Service and Communication',
      subCategory: 'Delay in Response',
      memberId: 'mom_123',
      desiredResolution: 'Member requested a written update.',
      memberSentiment: 'Member Expressed Dissatisfaction',
      reportedBy: 'frontdesk@physique57india.com',
      priority: 'High',
      urgencyReason: 'Member described an unresolved delay affecting renewal confidence.',
      description: 'Member reported that her WhatsApp query was not answered for two days.',
    };

    expect(getMissingIntakeFields(context)).toEqual([]);
    expect(isIntakePublishable(context)).toBe(true);
  });

  it('still treats AI Intake and empty auth fallbacks as missing reportedBy values', () => {
    const base: IntakeContext = {
      intakeRoute: 'Feedback',
      category: 'General Feedback',
      subCategory: 'Suggestion',
      priority: 'Low',
      description: 'Member suggested adding more weekend recovery sessions.',
    };

    expect(getMissingIntakeFields({ ...base, reportedBy: 'AI Intake' })).toContain('reportedBy');
    expect(getMissingIntakeFields({ ...base, reportedBy: 'Authenticated user' })).toContain('reportedBy');
    expect(getMissingIntakeFields({ ...base, reportedBy: 'ops@physique57india.com' })).not.toContain('reportedBy');
  });

  it('captures only pasted member statements as member voice', () => {
    const context: IntakeContext = {};

    expect(captureMemberVoiceFromText('Complaint', context)).toBeNull();
    expect(captureMemberVoiceFromText('Route this as Complaint', context)).toBeNull();
    expect(
      captureMemberVoiceFromText(
        'Here are the missing details:\nPriority: High\nDocumented By: Priya Shah',
        context
      )
    ).toBeNull();

    expect(
      captureMemberVoiceFromText(
        'Member said she has called twice about a refund and still has not received a clear response.',
        context
      )
    ).toBe('Member said she has called twice about a refund and still has not received a clear response.');
  });

  it('captures member voice phrasing even when it contains a colon', () => {
    expect(
      captureMemberVoiceFromText(
        'Member said: she has called twice about a refund and still has not received a clear response.',
        {}
      )
    ).toBe('Member said: she has called twice about a refund and still has not received a clear response.');

    expect(
      captureMemberVoiceFromText(
        'Client stated: the studio space felt too warm during the full session.',
        {}
      )
    ).toBe('Client stated: the studio space felt too warm during the full session.');
  });
});
