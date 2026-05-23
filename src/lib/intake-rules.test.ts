import { describe, expect, it } from 'vitest';
import {
  captureMemberVoiceFromText,
  getIntakeFieldDefinitions,
  getMissingIntakeFields,
  inferIntakeContextFromText,
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
      'clientsAffected',
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
    expect(getMissingIntakeFields(context)).toEqual(['studio', 'incidentDateTime', 'clientsAffected', 'reportedBy']);

    expect(getMissingIntakeFields({ ...context, studio: 'Bandra' })).toEqual(['incidentDateTime', 'clientsAffected', 'reportedBy']);
  });

  it('marks a complete member-facing complaint context publishable', () => {
    const context: IntakeContext = {
      intakeRoute: 'Complaint',
      category: 'Customer Service and Communication',
      subCategory: 'Delay in Response',
      memberId: 'mom_123',
      clientsAffected: 'Yes - directly affected',
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
      clientsAffected: 'Yes - directly affected',
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

  it('infers real historical ticket patterns without manual route selection', () => {
    expect(
      inferIntakeContextFromText(
        'Trial client walked out mid-class because the music was too loud and the session felt more intense than expected.'
      )
    ).toMatchObject({
      intakeRoute: 'Complaint',
      category: 'Class Experience',
      subCategory: 'Audio Issues',
      priority: 'High',
    });

    expect(
      inferIntakeContextFromText(
        'Regional operations reported Momence CRM data is inaccurate for lapsed clients and follow-ups are falling through.'
      )
    ).toMatchObject({
      intakeRoute: 'Feedback',
      category: 'Operating Systems',
      subCategory: 'Momence Issues',
      priority: 'Medium',
    });

    expect(
      inferIntakeContextFromText(
        'Client reported a missing cash envelope from the locker after a cycle trial class.'
      )
    ).toMatchObject({
      intakeRoute: 'Complaint',
      category: 'Safety and Security',
      subCategory: 'Theft Prevention Measures',
      priority: 'Critical',
    });

    expect(
      inferIntakeContextFromText(
        'Hosted class feedback: attendees said the studio was too far and several prospects requested drop-in pricing details.'
      )
    ).toMatchObject({
      intakeRoute: 'Feedback',
      category: 'Hosted Class & Partnerships',
      subCategory: 'Prospect Conversion Opportunity',
      priority: 'Medium',
    });

    expect(
      inferIntakeContextFromText(
        [
          "Host Class Name: Ahana's Powercycle Hosted Class.",
          'Date: 17th May',
          'Start Time: 11:30 AM',
          'Trainer Name: Rohan',
          'Location: Kwality House, Kemps Corner.',
          'Attendees: 10',
          'Comments/Feedback:',
          'Client Taneeya Rele requested details regarding our classes, which have been shared via WhatsApp.',
          'Several attendees may opt for drop-in classes or Single Classes.',
        ].join('\n')
      )
    ).toMatchObject({
      intakeRoute: 'Feedback',
      category: 'Hosted Class & Partnerships',
      subCategory: 'Prospect Conversion Opportunity',
      priority: 'Medium',
      studio: 'Kwality House, Kemps Corner',
    });
  });

  it('requires Momence class search for class-related feedback before drafting', () => {
    const context = {
      ...inferIntakeContextFromText('Member said Rohan class was too intense and the music was too loud.'),
      description: 'Member said Rohan class was too intense and the music was too loud.',
      reportedBy: 'ops@physique57india.com',
    };

    expect(getMissingIntakeFields(context)).toContain('classType');
    expect(getMissingIntakeFields({ ...context, sessionId: 'session_123', classType: 'Studio Barre 57' })).not.toContain('classType');
  });

  it('requires Momence member search for singular member-related feedback before drafting', () => {
    const context = {
      ...inferIntakeContextFromText('Member Asha reported a refund issue and wants a follow-up.'),
      description: 'Member Asha reported a refund issue and wants a follow-up.',
      reportedBy: 'ops@physique57india.com',
    };

    expect(getMissingIntakeFields(context)).toContain('clientsAffected');
    expect(getMissingIntakeFields({ ...context, clientsAffected: 'Yes - directly affected' })).toContain('memberName');
    expect(getMissingIntakeFields({
      ...context,
      clientsAffected: 'Yes - directly affected',
      memberId: 'mom_123',
      memberName: 'Asha Mehta',
    })).not.toContain('memberName');
  });

  it('requires client impact confirmation before drafting operational issues', () => {
    const text = 'AC not cooling in Bandra studio';
    const context: IntakeContext = {
      ...inferIntakeContextFromText(text),
      initialReport: text,
      reportedBy: 'ops@physique57india.com',
      incidentDateTime: '2026-05-23T09:30',
      hvacSymptom: 'Not cooling',
      affectedArea: 'Reception and studio one',
      operationalImpact: 'Front desk moved check-in away from the warm area.',
      currentWorkaround: 'Fans are running until the technician arrives.',
      resolutionRequirement: 'Vendor inspection and repair needed today.',
    };

    expect(getMissingIntakeFields(context)).toEqual(['clientsAffected']);
    expect(getMissingIntakeFields({ ...context, clientsAffected: 'No clients affected' })).toEqual([]);
  });

  it('requires Momence member search when affected clients are confirmed', () => {
    const text = 'AC not cooling in Bandra studio';
    const context: IntakeContext = {
      ...inferIntakeContextFromText(text),
      initialReport: text,
      reportedBy: 'ops@physique57india.com',
      incidentDateTime: '2026-05-23T09:30',
      hvacSymptom: 'Not cooling',
      affectedArea: 'Reception and studio one',
      operationalImpact: 'Two members said they felt uncomfortable after class.',
      currentWorkaround: 'Fans are running until the technician arrives.',
      resolutionRequirement: 'Vendor inspection and repair needed today.',
      clientsAffected: 'Yes - indirectly affected',
    };

    expect(getMissingIntakeFields(context)).toEqual(['memberName']);
    expect(getMissingIntakeFields({
      ...context,
      memberId: 'mom_456 | mom_789',
      memberName: 'Asha Mehta | Tara Rao',
    })).toEqual([]);
  });

  it('asks washing machine operational questions without member or class fields', () => {
    const text = 'washing machine not working';
    const context: IntakeContext = {
      ...inferIntakeContextFromText(text),
      initialReport: text,
      reportedBy: 'ops@physique57india.com',
    };

    expect(context).toMatchObject({
      intakeRoute: 'Internal Reporting',
      category: 'Repair and Maintenance',
      subCategory: 'Broken Equipment Not Repaired',
    });

    expect(getMissingIntakeFields(context)).toEqual([
      'studio',
      'incidentDateTime',
      'machineSymptom',
      'operationalImpact',
      'currentWorkaround',
      'resolutionRequirement',
      'clientsAffected',
    ]);
    expect(getMissingIntakeFields(context)).not.toContain('memberName');
    expect(getMissingIntakeFields(context)).not.toContain('classType');
    expect(getIntakeFieldDefinitions(context).map((field) => field.id)).toContain('machineSymptom');
  });

  it('asks door lock operational questions and infers Kwality without entity fields', () => {
    const text = 'door lock not closing at Kwality';
    const context: IntakeContext = {
      ...inferIntakeContextFromText(text),
      initialReport: text,
      reportedBy: 'ops@physique57india.com',
    };

    expect(context).toMatchObject({
      category: 'Repair and Maintenance',
      subCategory: 'Door Lock Issues',
      studio: 'Kwality House, Kemps Corner',
    });

    expect(getMissingIntakeFields(context)).toEqual([
      'incidentDateTime',
      'lockFaultType',
      'accessStatus',
      'securityRisk',
      'resolutionRequirement',
      'clientsAffected',
    ]);
    expect(getMissingIntakeFields(context)).not.toContain('memberName');
    expect(getMissingIntakeFields(context)).not.toContain('classType');
  });

  it('uses HVAC-specific repair fields for AC breakdown reports', () => {
    const text = 'AC not cooling in Bandra studio';
    const context: IntakeContext = {
      ...inferIntakeContextFromText(text),
      initialReport: text,
      reportedBy: 'ops@physique57india.com',
    };

    expect(context).toMatchObject({
      category: 'Repair and Maintenance',
      subCategory: 'AC and HVAC Issues',
      studio: 'Supreme HQ, Bandra',
    });

    expect(getMissingIntakeFields(context)).toEqual([
      'incidentDateTime',
      'hvacSymptom',
      'affectedArea',
      'operationalImpact',
      'currentWorkaround',
      'resolutionRequirement',
      'clientsAffected',
    ]);
  });
});
