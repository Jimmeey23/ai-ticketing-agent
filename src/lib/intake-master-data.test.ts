import { describe, expect, it } from 'vitest';
import { STUDIOS } from './ticketing-data';
import { buildMasterDataLocationNames } from './intake-master-data';

describe('buildMasterDataLocationNames', () => {
  it('keeps canonical studio dropdown values even when routing locations are stale', () => {
    const locations = buildMasterDataLocationNames([
      { name: 'Physique 57, Bandra', active: true },
      { name: 'Physique 57, Mumbai', active: true },
    ]);

    expect(locations).toEqual(expect.arrayContaining(STUDIOS));
    expect(locations).toContain('Supreme HQ, Bandra');
  });
});
