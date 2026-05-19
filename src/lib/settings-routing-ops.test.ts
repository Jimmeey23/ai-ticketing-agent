import { describe, expect, it } from 'vitest';
import { PRIORITY_SLA } from './ticketing-data';
import type { EmployeeSetting, RoutingRuleSetting } from './routing-settings';
import {
  EMPTY_ROUTING_FILTERS,
  applyBulkRoutingOperation,
  applyRoutingRulePatch,
  filterRoutingRules,
} from './settings-routing-ops';

const employees: EmployeeSetting[] = [
  {
    id: 'mrigakshi',
    name: 'Mrigakshi Jaiswal',
    email: 'mrigakshi@physique57mumbai.com',
    department: 'Training',
    role: 'Trainer',
    location: 'Physique 57, Mumbai',
    manager: 'Anisha Shah',
    active: true,
  },
  {
    id: 'vivaran',
    name: 'Vivaran Dhasmana',
    email: 'vivaran@physique57mumbai.com',
    department: 'Training',
    role: 'Trainer',
    location: 'Physique 57, Mumbai',
    manager: 'Anisha Shah',
    active: true,
  },
  {
    id: 'pushyank',
    name: 'Pushyank Nahar',
    email: 'pushyank@physique57bengaluru.com',
    department: 'Training',
    role: 'Trainer',
    location: 'Physique 57, Bengaluru',
    manager: 'Anisha Shah',
    active: true,
  },
  {
    id: 'akshay',
    name: 'Akshay Rane',
    email: 'akshay@physique57mumbai.com',
    department: 'Sales & Client Servicing',
    role: 'Sales',
    location: 'Physique 57, Mumbai',
    manager: 'Jimmeey Gondaa',
    active: true,
  },
];

const rules: RoutingRuleSetting[] = [
  {
    id: 'scheduling-mumbai',
    category: 'Scheduling',
    subCategory: '',
    location: 'Kwality House, Kemps Corner',
    owner: 'Mrigakshi Jaiswal',
    owners: ['Mrigakshi Jaiswal', 'Vivaran Dhasmana'],
    department: 'Training',
    escalation: 'Anisha Shah',
    priority: 'Medium',
    slaHours: PRIORITY_SLA.Medium.hours,
    active: true,
  },
  {
    id: 'scheduling-bengaluru',
    category: 'Scheduling',
    subCategory: '',
    location: 'Kenkere House, Bengaluru',
    owner: 'Pushyank Nahar',
    owners: ['Pushyank Nahar'],
    department: 'Training',
    escalation: 'Anisha Shah',
    priority: 'Medium',
    slaHours: PRIORITY_SLA.Medium.hours,
    active: true,
  },
  {
    id: 'billing-mumbai',
    category: 'Billing & Membership',
    subCategory: '',
    location: 'Supreme HQ, Bandra',
    owner: 'Akshay Rane',
    owners: ['Akshay Rane'],
    department: 'Sales & Client Servicing',
    escalation: 'Jimmeey Gondaa',
    priority: 'High',
    slaHours: PRIORITY_SLA.High.hours,
    active: false,
  },
  {
    id: 'legacy-scheduling-subcategory',
    category: 'Scheduling',
    subCategory: 'Trainer Preferences',
    location: 'Kwality House, Kemps Corner',
    owner: 'Akshay Rane',
    owners: ['Akshay Rane'],
    department: 'Sales & Client Servicing',
    escalation: 'Jimmeey Gondaa',
    priority: 'Low',
    slaHours: PRIORITY_SLA.Low.hours,
    active: true,
  },
];

describe('settings routing operations', () => {
  it('filters category-level rules with multi-select criteria', () => {
    const result = filterRoutingRules(rules, {
      ...EMPTY_ROUTING_FILTERS,
      categories: ['Scheduling'],
      departments: ['Training'],
      owners: ['Vivaran Dhasmana'],
      locations: ['Mumbai'],
      priorities: ['Medium'],
      states: ['Active'],
    });

    expect(result.map((rule) => rule.id)).toEqual(['scheduling-mumbai']);
  });

  it('treats empty multi-select filters as all and excludes legacy subcategory rules', () => {
    const result = filterRoutingRules(rules, EMPTY_ROUTING_FILTERS);

    expect(result.map((rule) => rule.id)).toEqual([
      'scheduling-mumbai',
      'scheduling-bengaluru',
      'billing-mumbai',
    ]);
  });

  it('supports selecting both active states as all states', () => {
    const result = filterRoutingRules(rules, {
      ...EMPTY_ROUTING_FILTERS,
      states: ['Active', 'Paused'],
    });

    expect(result.map((rule) => rule.id)).toEqual([
      'scheduling-mumbai',
      'scheduling-bengaluru',
      'billing-mumbai',
    ]);
  });

  it('derives department and escalation from the primary owner when setting owners', () => {
    const result = applyRoutingRulePatch(rules[2], {
      owners: ['Pushyank Nahar', 'Vivaran Dhasmana'],
      owner: 'Pushyank Nahar',
    }, employees);

    expect(result).toMatchObject({
      owner: 'Pushyank Nahar',
      owners: ['Pushyank Nahar', 'Vivaran Dhasmana'],
      department: 'Training',
      escalation: 'Anisha Shah',
    });
  });

  it('adds and removes owners in bulk while preserving a valid primary owner', () => {
    const afterAdd = applyBulkRoutingOperation(rules, new Set(['scheduling-bengaluru']), {
      type: 'addOwners',
      owners: ['Vivaran Dhasmana', 'Pushyank Nahar'],
    }, employees);

    expect(afterAdd.find((rule) => rule.id === 'scheduling-bengaluru')).toMatchObject({
      owner: 'Pushyank Nahar',
      owners: ['Pushyank Nahar', 'Vivaran Dhasmana'],
    });

    const afterRemove = applyBulkRoutingOperation(afterAdd, new Set(['scheduling-bengaluru']), {
      type: 'removeOwners',
      owners: ['Pushyank Nahar', 'Vivaran Dhasmana'],
    }, employees);

    expect(afterRemove.find((rule) => rule.id === 'scheduling-bengaluru')).toMatchObject({
      owner: 'Pushyank Nahar',
      owners: ['Pushyank Nahar'],
    });
  });

  it('updates priority and SLA together in bulk', () => {
    const result = applyBulkRoutingOperation(rules, new Set(['scheduling-mumbai', 'scheduling-bengaluru']), {
      type: 'setPriority',
      priority: 'Critical',
    }, employees);

    expect(result.filter((rule) => rule.category === 'Scheduling').map((rule) => ({
      priority: rule.priority,
      slaHours: rule.slaHours,
    }))).toEqual([
      { priority: 'Critical', slaHours: PRIORITY_SLA.Critical.hours },
      { priority: 'Critical', slaHours: PRIORITY_SLA.Critical.hours },
      { priority: 'Low', slaHours: PRIORITY_SLA.Low.hours },
    ]);
  });
});
