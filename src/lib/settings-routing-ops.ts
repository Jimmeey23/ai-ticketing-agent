import { PRIORITY_SLA } from './ticketing-data';
import type { EmployeeSetting, RoutingRuleSetting } from './routing-settings';

export type RoutingStateFilter = 'Active' | 'Paused';

export interface RoutingFilterState {
  query: string;
  categories: string[];
  departments: string[];
  owners: string[];
  locations: string[];
  priorities: string[];
  states: RoutingStateFilter[];
}

export type BulkRoutingOperation =
  | { type: 'setOwners'; owners: string[] }
  | { type: 'addOwners'; owners: string[] }
  | { type: 'removeOwners'; owners: string[] }
  | { type: 'setDepartment'; department: string }
  | { type: 'setEscalation'; escalation: string }
  | { type: 'setPriority'; priority: RoutingRuleSetting['priority'] }
  | { type: 'setSlaHours'; slaHours: number }
  | { type: 'setActive'; active: boolean };

export const EMPTY_ROUTING_FILTERS: RoutingFilterState = {
  query: '',
  categories: [],
  departments: [],
  owners: [],
  locations: [],
  priorities: [],
  states: [],
};

export type RoutingScopeKey = 'overall' | 'mumbai' | 'bengaluru';

export interface RoutingScopeSummary {
  key: RoutingScopeKey | 'summary';
  label: string;
  ruleIds: string[];
  locations: string[];
  owners: string[];
  department: string;
  escalation: string;
  priority: RoutingRuleSetting['priority'];
  slaHours: number;
  active: boolean;
  mixed: {
    owners: boolean;
    department: boolean;
    escalation: boolean;
    priority: boolean;
    slaHours: boolean;
    active: boolean;
  };
}

export interface CategoryRoutingRow {
  category: string;
  ruleIds: string[];
  overall: RoutingScopeSummary;
  mumbai: RoutingScopeSummary;
  bengaluru: RoutingScopeSummary;
  summary: RoutingScopeSummary;
  otherLocations: string[];
}

export function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function routingOpsRuleId(category: string, location = ''): string {
  return slug(`${category}-all-${location || 'all'}`);
}

function ownersForRule(rule: RoutingRuleSetting): string[] {
  return uniqueText(rule.owners?.length ? rule.owners : rule.owner ? [rule.owner] : []);
}

function inferCity(value?: string): string {
  const normalized = String(value || '').toLowerCase();
  if (/bengaluru|bangalore|kenkere|copper/.test(normalized)) return 'Bengaluru';
  if (/mumbai|bandra|supreme|kwality|kemps|courtside/.test(normalized)) return 'Mumbai';
  return '';
}

function selectedIncludes(selected: string[], value: string): boolean {
  return selected.length === 0 || selected.includes(value);
}

function locationMatches(ruleLocation: string | undefined, selectedLocations: string[]): boolean {
  if (selectedLocations.length === 0) return true;

  const location = ruleLocation || '';
  const city = inferCity(location);
  return selectedLocations.some((selected) => {
    if (selected === 'Mumbai' || selected === 'Bengaluru') return city === selected;
    const selectedCity = inferCity(selected);
    if (selectedCity) return city === selectedCity;
    return location === selected;
  });
}

function stateMatches(active: boolean, states: RoutingStateFilter[]): boolean {
  if (states.length === 0 || states.length === 2) return true;
  if (states.includes('Active')) return active;
  if (states.includes('Paused')) return !active;
  return true;
}

export function routingScopeKey(rule: Pick<RoutingRuleSetting, 'location'>): RoutingScopeKey | 'other' {
  if (!rule.location) return 'overall';
  const city = inferCity(rule.location);
  if (city === 'Mumbai') return 'mumbai';
  if (city === 'Bengaluru') return 'bengaluru';
  return 'other';
}

export function isCityRoutingRule(rule: Pick<RoutingRuleSetting, 'location' | 'subCategory'>): boolean {
  if (rule.subCategory) return false;
  const scope = routingScopeKey(rule);
  return scope === 'mumbai' || scope === 'bengaluru';
}

function emptyScope(key: RoutingScopeSummary['key'], label: string): RoutingScopeSummary {
  return {
    key,
    label,
    ruleIds: [],
    locations: [],
    owners: [],
    department: '',
    escalation: '',
    priority: 'Medium',
    slaHours: PRIORITY_SLA.Medium.hours,
    active: false,
    mixed: {
      owners: false,
      department: false,
      escalation: false,
      priority: false,
      slaHours: false,
      active: false,
    },
  };
}

function combineScope(
  key: RoutingScopeSummary['key'],
  label: string,
  rules: RoutingRuleSetting[],
): RoutingScopeSummary {
  if (!rules.length) return emptyScope(key, label);

  const ownersByRule = rules.map(ownersForRule);
  const ownerPoolSignatures = uniqueText(ownersByRule.map((items) => items.join('|')));
  const owners = uniqueText(ownersByRule.flat());
  const departments = uniqueText(rules.map((rule) => rule.department));
  const escalations = uniqueText(rules.map((rule) => rule.escalation));
  const priorities = uniqueText(rules.map((rule) => rule.priority));
  const slaValues = uniqueText(rules.map((rule) => String(rule.slaHours)));
  const activeValues = uniqueText(rules.map((rule) => String(rule.active)));

  return {
    key,
    label,
    ruleIds: rules.map((rule) => rule.id),
    locations: uniqueText(rules.map((rule) => rule.location || '')),
    owners,
    department: departments[0] || '',
    escalation: escalations[0] || '',
    priority: (priorities[0] || 'Medium') as RoutingRuleSetting['priority'],
    slaHours: Number(slaValues[0] || PRIORITY_SLA.Medium.hours),
    active: rules.some((rule) => rule.active),
    mixed: {
      owners: ownerPoolSignatures.length > 1,
      department: departments.length > 1,
      escalation: escalations.length > 1,
      priority: priorities.length > 1,
      slaHours: slaValues.length > 1,
      active: activeValues.length > 1,
    },
  };
}

export function buildCategoryRoutingRows(
  rules: RoutingRuleSetting[],
  filters: RoutingFilterState,
): CategoryRoutingRow[] {
  const categoryRules = filterRoutingRules(rules, filters);
  const byCategory = new Map<string, RoutingRuleSetting[]>();

  for (const rule of categoryRules) {
    const existing = byCategory.get(rule.category) || [];
    existing.push(rule);
    byCategory.set(rule.category, existing);
  }

  return Array.from(byCategory.entries()).map(([category, groupedRules]) => {
    const overallRules: RoutingRuleSetting[] = [];
    const mumbaiRules: RoutingRuleSetting[] = [];
    const bengaluruRules: RoutingRuleSetting[] = [];
    const otherRules: RoutingRuleSetting[] = [];

    for (const rule of groupedRules) {
      const scope = routingScopeKey(rule);
      if (scope === 'overall') overallRules.push(rule);
      else if (scope === 'mumbai') mumbaiRules.push(rule);
      else if (scope === 'bengaluru') bengaluruRules.push(rule);
      else otherRules.push(rule);
    }

    return {
      category,
      ruleIds: groupedRules.map((rule) => rule.id),
      overall: combineScope('overall', 'Overall', overallRules),
      mumbai: combineScope('mumbai', 'Mumbai', mumbaiRules),
      bengaluru: combineScope('bengaluru', 'Bengaluru', bengaluruRules),
      summary: combineScope('summary', 'Category', groupedRules),
      otherLocations: uniqueText(otherRules.map((rule) => rule.location || 'Other')),
    };
  });
}

export function filterRoutingRules(
  rules: RoutingRuleSetting[],
  filters: RoutingFilterState,
): RoutingRuleSetting[] {
  const query = filters.query.trim().toLowerCase();

  return rules.filter((rule) => {
    if (!isCityRoutingRule(rule)) return false;
    if (!selectedIncludes(filters.categories, rule.category)) return false;
    if (!selectedIncludes(filters.departments, rule.department)) return false;
    if (filters.owners.length > 0 && !ownersForRule(rule).some((owner) => filters.owners.includes(owner))) return false;
    if (!locationMatches(rule.location, filters.locations)) return false;
    if (!selectedIncludes(filters.priorities, rule.priority)) return false;
    if (!stateMatches(rule.active, filters.states)) return false;

    if (query) {
      const haystack = [
        rule.category,
        rule.location,
        rule.department,
        rule.escalation,
        rule.owner,
        ...ownersForRule(rule),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

export interface CreateCityRoutingRulesInput {
  category: string;
  owner?: string;
  owners?: string[];
  department?: string;
  escalation?: string;
  priority?: RoutingRuleSetting['priority'];
  slaHours?: number;
  active?: boolean;
}

export function createCityRoutingRules(input: CreateCityRoutingRulesInput): RoutingRuleSetting[] {
  const category = input.category.trim() || 'New Routing Row';
  const owners = uniqueText(input.owners?.length ? input.owners : input.owner ? [input.owner] : []);
  const owner = owners[0] || input.owner || '';
  const priority = input.priority || 'Medium';
  const slaHours = input.slaHours || PRIORITY_SLA[priority].hours;

  return ['Mumbai', 'Bengaluru'].map((location) => ({
    id: routingOpsRuleId(category, location),
    category,
    subCategory: '',
    location,
    owner,
    owners,
    department: input.department || '',
    escalation: input.escalation || '',
    priority,
    slaHours,
    active: input.active ?? true,
  }));
}

export function deleteCategoryRoutingRules(
  rules: RoutingRuleSetting[],
  category: string,
): RoutingRuleSetting[] {
  return rules.filter((rule) => rule.category !== category);
}

export function applyRoutingRulePatch(
  rule: RoutingRuleSetting,
  patch: Partial<RoutingRuleSetting>,
  employees: EmployeeSetting[],
): RoutingRuleSetting {
  const next: RoutingRuleSetting = { ...rule, ...patch, subCategory: '' };

  if (patch.owner || patch.owners) {
    const existingOwners = ownersForRule(rule);
    const requestedOwners = uniqueText(patch.owners?.length ? patch.owners : patch.owner ? [patch.owner] : existingOwners);
    const owners = requestedOwners.length ? requestedOwners : existingOwners;
    next.owners = owners;
    next.owner = owners[0] || next.owner;

    const primaryOwner = employees.find((employee) => employee.name === next.owner);
    next.department = primaryOwner?.department || next.department;
    next.escalation = primaryOwner?.manager || next.escalation;
  }

  if (patch.priority) {
    next.slaHours = PRIORITY_SLA[patch.priority]?.hours || next.slaHours;
  }

  return next;
}

export function applyBulkRoutingOperation(
  rules: RoutingRuleSetting[],
  targetIds: Set<string>,
  operation: BulkRoutingOperation,
  employees: EmployeeSetting[],
): RoutingRuleSetting[] {
  return rules.map((rule) => {
    if (!targetIds.has(rule.id)) return rule;

    switch (operation.type) {
      case 'setOwners': {
        const owners = uniqueText(operation.owners);
        if (!owners.length) return rule;
        return applyRoutingRulePatch(rule, { owner: owners[0], owners }, employees);
      }
      case 'addOwners': {
        const owners = uniqueText([...ownersForRule(rule), ...operation.owners]);
        if (!owners.length) return rule;
        return applyRoutingRulePatch(rule, { owner: owners[0], owners }, employees);
      }
      case 'removeOwners': {
        const removeSet = new Set(uniqueText(operation.owners));
        const currentOwners = ownersForRule(rule);
        const remainingOwners = currentOwners.filter((owner) => !removeSet.has(owner));
        const owners = remainingOwners.length ? remainingOwners : currentOwners.slice(0, 1);
        return applyRoutingRulePatch(rule, { owner: owners[0] || rule.owner, owners }, employees);
      }
      case 'setDepartment':
        if (!operation.department.trim()) return rule;
        return applyRoutingRulePatch(rule, { department: operation.department }, employees);
      case 'setEscalation':
        if (!operation.escalation.trim()) return rule;
        return applyRoutingRulePatch(rule, { escalation: operation.escalation }, employees);
      case 'setPriority':
        return applyRoutingRulePatch(rule, { priority: operation.priority }, employees);
      case 'setSlaHours':
        return applyRoutingRulePatch(rule, { slaHours: Math.max(1, Math.round(operation.slaHours)) }, employees);
      case 'setActive':
        return applyRoutingRulePatch(rule, { active: operation.active }, employees);
      default:
        return rule;
    }
  });
}
