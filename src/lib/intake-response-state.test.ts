import { describe, expect, it } from 'vitest';
import { shouldHoldDraftForMoreInfo } from './intake-response-state';

describe('shouldHoldDraftForMoreInfo', () => {
  it('does not block drafting for an AI-only more-info flag when deterministic requirements are complete', () => {
    expect(shouldHoldDraftForMoreInfo({
      hasDetailForm: false,
      remainingMissingFieldCount: 0,
      aiNeedsMoreInfo: true,
    })).toBe(false);
  });

  it('blocks drafting when there are actionable missing fields', () => {
    expect(shouldHoldDraftForMoreInfo({
      hasDetailForm: false,
      remainingMissingFieldCount: 1,
      aiNeedsMoreInfo: false,
    })).toBe(true);
  });
});
