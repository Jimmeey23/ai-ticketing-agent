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

export function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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

function selectedIncludes<T extends string>(selected: T[] | string[], value: string): boolean {
  return selected.length === 0 || selected.includes(value);
}

function locationMatches(ruleLocation: string | undefined, selectedLocations: string[]): boolean {
  if (selectedLocations.length === 0) return true;

  const location = ruleLocation || '';
  const city = inferCity(location);
  return selectedLocations.some((selected) => {
    if (selected === 'All locations') return !location;
    if (selected === 'Mumbai' || selected === 'Bengaluru') return city === selected;
    return location === selected;
  });
}

function stateMatches(active: boolean, states: RoutingStateFilter[]): boolean {
  if (states.length === 0 || states.length === 2) return true;
  if (states.includes('Active')) return active;
  if (states.includes('Paused')) return !active;
  return true;
}

export function filterRoutingRules(
  rules: RoutingRuleSetting[],
  filters: RoutingFilterState,
): RoutingRuleSetting[] {
  const query = filters.query.trim().toLowerCase();

  return rules.filter((rule) => {
    if (rule.subCategory) return false;
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
