import { describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  upsert: vi.fn(async (_table: string, _rows: Record<string, unknown>[], _options?: Record<string, unknown>) => ({ error: null })),
  selectOrder: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock('@/lib/backend-supabase', () => ({
  backendSupabase: {
    from: (table: string) => ({
      select: () => ({
        order: backendMocks.selectOrder,
      }),
      upsert: (rows: Record<string, unknown>[], options?: Record<string, unknown>) => backendMocks.upsert(table, rows, options),
      delete: () => ({
        in: vi.fn(async () => ({ error: null })),
      }),
    }),
  },
}));

import {
  applyCategoryCityRouting,
  defaultRoutingSettings,
  physique57RoutingPresets,
  resolveAssignmentFromSettings,
  saveRoutingSettings,
  type RoutingSettings,
} from './routing-settings';

describe('routing settings', () => {
  it('generates default routing rules at category level instead of per subcategory', () => {
    const settings = defaultRoutingSettings();

    expect(settings.routingRules.length).toBeGreaterThan(0);
    expect(settings.routingRules.every((rule) => !rule.subCategory)).toBe(true);
  });

  it('generates unique routing rule ids for presets and defaults', () => {
    const presetIds = physique57RoutingPresets().map((rule) => rule.id);
    const defaultIds = defaultRoutingSettings().routingRules.map((rule) => rule.id);

    expect(new Set(presetIds).size).toBe(presetIds.length);
    expect(new Set(defaultIds).size).toBe(defaultIds.length);
  });

  it('uses the Bengaluru sales team for Bengaluru sales category presets', () => {
    const schedulingBengaluru = physique57RoutingPresets().find((rule) => (
      rule.category === 'Scheduling' && rule.location === 'Bengaluru'
    ));

    expect(schedulingBengaluru).toMatchObject({
      owner: 'Yashas K',
      owners: ['Yashas K', 'Sashi Singh', 'Api Serou', 'Prathap K P'],
      department: 'Sales & Client Servicing',
      escalation: 'Shifa Ali',
    });
  });

  it('routes refund issues to Sales & Client Servicing', () => {
    const settings = defaultRoutingSettings();

    expect(
      resolveAssignmentFromSettings(
        settings,
        'Pricing and Memberships',
        'Refund and Cancellation Policy Issue',
        'Supreme HQ, Bandra'
      )
    ).toMatchObject({
      assignedTo: 'Imran Shaikh',
      ownerPool: ['Imran Shaikh', 'Shipra Pinge', 'Nadiya Shaikh', 'Deesha Changwani'],
      team: 'Sales & Client Servicing',
      nextEscalation: 'Jimmeey Gondaa',
      priority: 'High',
      slaHours: 8,
    });

    expect(
      resolveAssignmentFromSettings(
        settings,
        'Billing & Membership',
        'Refund Request',
        'Kenkere House, Bengaluru'
      )
    ).toMatchObject({
      assignedTo: 'Yashas K',
      ownerPool: ['Yashas K', 'Sashi Singh', 'Api Serou', 'Prathap K P'],
      team: 'Sales & Client Servicing',
      nextEscalation: 'Shifa Ali',
      priority: 'High',
      slaHours: 8,
    });
  });

  it('routes billing and pricing categories to Sales & Client Servicing by studio', () => {
    const settings = defaultRoutingSettings();

    expect(
      resolveAssignmentFromSettings(
        settings,
        'Billing & Membership',
        'Invoice / Receipt Request',
        'Supreme HQ, Bandra'
      )
    ).toMatchObject({
      assignedTo: 'Imran Shaikh',
      ownerPool: ['Imran Shaikh', 'Shipra Pinge', 'Nadiya Shaikh', 'Deesha Changwani'],
      team: 'Sales & Client Servicing',
      nextEscalation: 'Jimmeey Gondaa',
      priority: 'High',
      slaHours: 8,
    });

    expect(
      resolveAssignmentFromSettings(
        settings,
        'Pricing and Memberships',
        'Membership Pause and Freeze Policy',
        'Kenkere House, Bengaluru'
      )
    ).toMatchObject({
      assignedTo: 'Yashas K',
      ownerPool: ['Yashas K', 'Sashi Singh', 'Api Serou', 'Prathap K P'],
      team: 'Sales & Client Servicing',
      nextEscalation: 'Shifa Ali',
      priority: 'High',
      slaHours: 8,
    });
  });

  it('overrides stale finance routing rows for billing and pricing categories', () => {
    const settings: RoutingSettings = {
      departments: [],
      employees: [],
      locations: [],
      routingRules: [
        {
          id: 'legacy-billing-route',
          category: 'Billing & Membership',
          subCategory: '',
          location: 'Mumbai',
          owner: 'Pujal Jathar',
          owners: ['Pujal Jathar'],
          department: 'Legacy Finance',
          escalation: 'Sachin Nalawade',
          priority: 'Medium',
          slaHours: 24,
          active: true,
        },
      ],
    };

    expect(
      resolveAssignmentFromSettings(settings, 'Billing & Membership', 'Invoice / Receipt Request', 'Supreme HQ, Bandra')
    ).toMatchObject({
      assignedTo: 'Imran Shaikh',
      team: 'Sales & Client Servicing',
      priority: 'High',
      slaHours: 8,
    });
  });

  it('uses a category-level rule for any subcategory in that category', () => {
    const settings: RoutingSettings = {
      departments: [],
      employees: [],
      locations: [],
      routingRules: [
        {
          id: 'facility-category',
          category: 'Facility & Equipment',
          subCategory: '',
          location: '',
          owner: 'Zahur Shaikh',
          owners: ['Zahur Shaikh'],
          department: 'Operations',
          escalation: 'Saachi Shetty - Operations',
          priority: 'High',
          slaHours: 8,
          active: true,
        },
      ],
    };

    expect(
      resolveAssignmentFromSettings(settings, 'Facility & Equipment', 'Locker Room / Changing Area', 'Kwality House, Kemps Corner')
    ).toMatchObject({
      assignedTo: 'Zahur Shaikh',
      team: 'Operations',
      nextEscalation: 'Saachi Shetty - Operations',
      priority: 'High',
      slaHours: 8,
      source: 'admin_routing',
    });
  });

  it('keeps active legacy subcategory-specific rules more specific than category rules', () => {
    const settings: RoutingSettings = {
      departments: [],
      employees: [],
      locations: [],
      routingRules: [
        {
          id: 'facility-category',
          category: 'Facility & Equipment',
          subCategory: '',
          location: '',
          owner: 'Zahur Shaikh',
          owners: ['Zahur Shaikh'],
          department: 'Operations',
          escalation: 'Saachi Shetty - Operations',
          priority: 'Medium',
          slaHours: 24,
          active: true,
        },
        {
          id: 'facility-machine',
          category: 'Facility & Equipment',
          subCategory: 'Machine / Equipment Issue',
          location: '',
          owner: 'Sagar Ingole',
          owners: ['Sagar Ingole'],
          department: 'Operations',
          escalation: 'Zahur Shaikh',
          priority: 'High',
          slaHours: 8,
          active: true,
        },
      ],
    };

    expect(
      resolveAssignmentFromSettings(settings, 'Facility & Equipment', 'Machine / Equipment Issue', 'Physique 57, Mumbai')
    ).toMatchObject({
      assignedTo: 'Sagar Ingole',
      priority: 'High',
      slaHours: 8,
    });
  });

  it('applies city-level Scheduling routing for all subcategories in Mumbai and Bengaluru', () => {
    const settings = applyCategoryCityRouting(defaultRoutingSettings(), {
      category: 'Scheduling',
      department: 'Training',
      escalation: 'Anisha Shah',
      priority: 'Medium',
      cityRouting: [
        {
          city: 'Mumbai',
          owners: ['Mrigakshi Jaiswal', 'Vivaran Dhasmana'],
        },
        {
          city: 'Bengaluru',
          owners: ['Pushyank Nahar'],
        },
      ],
    });

    expect(
      resolveAssignmentFromSettings(settings, 'Scheduling', 'Trainer Preferences', 'Kwality House, Kemps Corner')
    ).toMatchObject({
      assignedTo: 'Mrigakshi Jaiswal',
      ownerPool: ['Mrigakshi Jaiswal', 'Vivaran Dhasmana'],
      team: 'Training',
      nextEscalation: 'Anisha Shah',
    });
    expect(
      resolveAssignmentFromSettings(settings, 'Scheduling', 'Booking Confirmation Issues', 'Supreme HQ, Bandra')
    ).toMatchObject({
      assignedTo: 'Mrigakshi Jaiswal',
      ownerPool: ['Mrigakshi Jaiswal', 'Vivaran Dhasmana'],
      team: 'Training',
      nextEscalation: 'Anisha Shah',
    });
    expect(
      resolveAssignmentFromSettings(settings, 'Scheduling', 'Weekend vs. Weekday Class Balance', 'Kenkere House, Bengaluru')
    ).toMatchObject({
      assignedTo: 'Pushyank Nahar',
      ownerPool: ['Pushyank Nahar'],
      team: 'Training',
      nextEscalation: 'Anisha Shah',
    });
  });

  it('does not save settings locally when Supabase persistence fails', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', {
      localStorage: {
        setItem,
      },
    });
    backendMocks.upsert.mockResolvedValueOnce({ error: new Error('remote write failed') });

    await expect(saveRoutingSettings(defaultRoutingSettings())).rejects.toThrow('remote write failed');
    expect(setItem).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    backendMocks.upsert.mockResolvedValue({ error: null });
  });

  it('saves location short names for existing Supabase location schemas', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: vi.fn(),
      },
    });

    await saveRoutingSettings(defaultRoutingSettings());

    const locationsUpsert = backendMocks.upsert.mock.calls.find(([table]) => table === 'locations');
    expect(locationsUpsert).toBeTruthy();
    expect(locationsUpsert?.[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'kwality-house-kemps-corner',
          short_name: 'Kwality House, Kemps Corner',
          color: expect.any(String),
          capacity: expect.any(Number),
          avg_fill_rate: expect.any(Number),
        }),
      ])
    );
    expect((locationsUpsert?.[1] as Array<{ capacity?: number }>)[0].capacity).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });
});
