import { backendSupabase } from '@/lib/backend-supabase';
import {
  ASSOCIATES,
  ASSIGNMENT_RULES,
  CATEGORIES,
  PRIORITY_SLA,
  STUDIOS,
  getEmployee,
  getEscalationTarget,
  resolveTicketAssignee,
  resolveTicketDepartment,
} from '@/lib/ticketing-data';

export interface DepartmentSetting {
  id: string;
  name: string;
  description?: string;
  active: boolean;
}

export interface EmployeeSetting {
  id: string;
  name: string;
  email?: string;
  department: string;
  role?: string;
  location?: string;
  manager?: string;
  active: boolean;
}

export interface LocationSetting {
  id: string;
  name: string;
  city?: string;
  color?: string;
  capacity?: number;
  avgFillRate?: number;
  sortOrder?: number;
  active: boolean;
}

export interface RoutingRuleSetting {
  id: string;
  category: string;
  subCategory?: string;
  location?: string;
  owner: string;
  owners?: string[];
  department: string;
  escalation: string;
  priority: keyof typeof PRIORITY_SLA;
  slaHours: number;
  active: boolean;
}

export interface RoutingSettings {
  departments: DepartmentSetting[];
  employees: EmployeeSetting[];
  locations: LocationSetting[];
  routingRules: RoutingRuleSetting[];
}

export interface ResolvedAssignment {
  assignedTo: string;
  ownerPool?: string[];
  team: string;
  nextEscalation: string;
  priority?: keyof typeof PRIORITY_SLA;
  slaHours?: number;
  source: 'admin_routing' | 'default_routing';
}

export interface AssignmentResolutionContext {
  reporterName?: string;
  reporterEmail?: string;
}

const STORAGE_KEY = 'athena-routing-settings-v1';
const DEFAULT_LOCATION_CAPACITY = 20;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizedOwners(rule: RoutingRuleSetting): string[] {
  return unique(rule.owners?.length ? rule.owners : rule.owner ? [rule.owner] : []);
}

function mergeRoutingRules(rules: RoutingRuleSetting[]): RoutingRuleSetting[] {
  const byId = new Map<string, RoutingRuleSetting>();

  for (const rule of rules) {
    const id = rule.id || routingRuleId(rule.category, rule.location || '', rule.subCategory || '');
    const owners = normalizedOwners(rule);
    const normalized = {
      ...rule,
      id,
      owners,
      owner: owners[0] || rule.owner,
    };
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, normalized);
      continue;
    }

    const mergedOwners = unique([...normalizedOwners(existing), ...owners]);
    byId.set(id, {
      ...existing,
      owners: mergedOwners,
      owner: mergedOwners[0] || existing.owner || normalized.owner,
      active: existing.active || normalized.active,
    });
  }

  return Array.from(byId.values());
}

export function routingRuleId(category: string, location = '', subCategory = ''): string {
  return slug(`${category}-${subCategory || 'all'}-${location || 'all'}`);
}

export function inferRoutingCity(location?: string): string {
  const normalized = String(location || '').toLowerCase();
  if (/bengaluru|bangalore|kenkere|copper/.test(normalized)) return 'Bengaluru';
  if (/mumbai|bandra|supreme|kwality|kemps|courtside/.test(normalized)) return 'Mumbai';
  return '';
}

function locationColor(id: string, name: string, city?: string): string {
  const value = `${id} ${name} ${city || ''}`.toLowerCase();
  if (/supreme|bandra/.test(value)) return '#7c3aed';
  if (/kenkere|bengaluru|bangalore/.test(value)) return '#059669';
  if (/copper|cloves/.test(value)) return '#dc2626';
  if (/courtside/.test(value)) return '#0891b2';
  return '#2563eb';
}

const SUPPLEMENTAL_EMPLOYEES: EmployeeSetting[] = [
  { id: 'reyna', name: 'Reyna', email: '', department: 'Marketing', role: 'Marketing Lead', location: 'Physique 57, Mumbai', manager: 'Mitali Kumar', active: true },
  { id: 'saachi-jr', name: 'Saachi Jr.', email: '', department: 'Marketing', role: 'Marketing Associate', location: 'Physique 57, Bengaluru', manager: 'Reyna', active: true },
  { id: 'jhanvi', name: 'Jhanvi', email: '', department: 'Marketing', role: 'Social Media', location: 'Physique 57, Mumbai', manager: 'Reyna', active: true },
];

const ROUTING_PRESET_GROUPS = {
  // CST grouping by studio for default routing ownership pools.
  kwalitySales: ['Akshay Rane', 'Sheetal Kataria', 'Vahishta Fitter', 'Zaheer Agarbattiwala', 'Taahira Sayyed'],
  bandraSales: ['Imran Shaikh', 'Shipra Pinge', 'Nadiya Shaikh', 'Deesha Changwani'],
  bengaluruSales: ['Yashas K', 'Sashi Singh', 'Api Serou', 'Prathap K P'],
  mumbaiOps: ['Zahur Shaikh'],
  bengaluruOps: ['Shifa Ali'],
  mumbaiTraining: ['Mrigakshi Jaiswal', 'Vivaran Dhasmana'],
  bengaluruTraining: ['Pushyank Nahar'],
  mumbaiMarketing: ['Reyna'],
  bengaluruMarketing: ['Saachi Jr.'],
  brand: ['Jimmeey Gondaa', 'Saachi Shetty'],
  social: ['Jhanvi'],
};

const SALES_CATEGORIES = ['Scheduling', 'Booking & Schedule', 'Front Desk & Service', 'Customer Service and Communication', 'Sales & Consultation'];
const CLIENT_SERVICING_CATEGORIES = ['Billing & Membership', 'Pricing and Memberships'];
const OPS_CATEGORIES = ['Facility & Equipment', 'Repair and Maintenance', 'Studio Amenities and Facilities', 'Safety and Security', 'Safety & Medical', 'Theft and Lost Items', 'Operating Systems', 'Tech Issues', 'App & Digital'];
const TRAINING_CATEGORIES = ['Class Experience', 'Trainer Feedback', 'Instructor & Class Quality', 'Member Progress & Transformation'];
const MARKETING_CATEGORIES = ['Hosted Class & Partnerships'];
const BRAND_CATEGORIES = ['Brand Feedback'];

function createRule(
  category: string,
  subCategory: string,
  location: string,
  owners: string[],
  department: string,
  escalation: string,
  priority: keyof typeof PRIORITY_SLA = 'Medium'
): RoutingRuleSetting {
  return {
    id: routingRuleId(category, location, subCategory),
    category,
    subCategory: subCategory || '',
    location,
    owner: owners[0],
    owners,
    department,
    escalation,
    priority,
    slaHours: PRIORITY_SLA[priority].hours,
    active: true,
  };
}

function isClientServicingRouting(category: string): boolean {
  return CLIENT_SERVICING_CATEGORIES.includes(category);
}

function salesOwnersForStudio(studio?: string): { owners: string[]; escalation: string } {
  const normalizedStudio = String(studio || '').toLowerCase();
  if (inferRoutingCity(studio) === 'Bengaluru') {
    return { owners: ROUTING_PRESET_GROUPS.bengaluruSales, escalation: 'Shifa Ali' };
  }
  if (/bandra|supreme/.test(normalizedStudio)) {
    return { owners: ROUTING_PRESET_GROUPS.bandraSales, escalation: 'Jimmeey Gondaa' };
  }
  return { owners: ROUTING_PRESET_GROUPS.kwalitySales, escalation: 'Jimmeey Gondaa' };
}

function resolveClientServicingAssignment(studio?: string): ResolvedAssignment {
  const { owners, escalation } = salesOwnersForStudio(studio);
  const assignedTo = owners[0];
  return {
    assignedTo,
    ownerPool: owners,
    team: 'Sales & Client Servicing',
    nextEscalation: escalation,
    priority: 'High',
    slaHours: PRIORITY_SLA.High.hours,
    source: 'default_routing',
  };
}

export function physique57RoutingPresets(): RoutingRuleSetting[] {
  const rules: RoutingRuleSetting[] = [];
  const add = (
    categories: string[],
    location: string,
    owners: string[],
    department: string,
    escalation: string,
    priority: keyof typeof PRIORITY_SLA = 'Medium',
  ) => {
    for (const category of categories) {
      rules.push(createRule(category, '', location, owners, department, escalation, priority));
    }
  };

  add(SALES_CATEGORIES, 'Kwality House, Kemps Corner', ROUTING_PRESET_GROUPS.kwalitySales, 'Sales & Client Servicing', 'Jimmeey Gondaa');
  add(SALES_CATEGORIES, 'Supreme HQ, Bandra', ROUTING_PRESET_GROUPS.bandraSales, 'Sales & Client Servicing', 'Jimmeey Gondaa');
  add(SALES_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruSales, 'Sales & Client Servicing', 'Shifa Ali');
  add(CLIENT_SERVICING_CATEGORIES, 'Kwality House, Kemps Corner', ROUTING_PRESET_GROUPS.kwalitySales, 'Sales & Client Servicing', 'Jimmeey Gondaa', 'High');
  add(CLIENT_SERVICING_CATEGORIES, 'Supreme HQ, Bandra', ROUTING_PRESET_GROUPS.bandraSales, 'Sales & Client Servicing', 'Jimmeey Gondaa', 'High');
  add(CLIENT_SERVICING_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruSales, 'Sales & Client Servicing', 'Shifa Ali', 'High');
  add(OPS_CATEGORIES, 'Mumbai', ROUTING_PRESET_GROUPS.mumbaiOps, 'Operations', 'Saachi Shetty - Operations', 'High');
  add(OPS_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruOps, 'Management', 'Saachi Shetty - Operations', 'High');
  add(TRAINING_CATEGORIES, 'Mumbai', ROUTING_PRESET_GROUPS.mumbaiTraining, 'Training', 'Anisha Shah');
  add(TRAINING_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruTraining, 'Training', 'Anisha Shah');
  add(MARKETING_CATEGORIES, 'Mumbai', ROUTING_PRESET_GROUPS.mumbaiMarketing, 'Marketing', 'Reyna');
  add(MARKETING_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruMarketing, 'Marketing', 'Reyna');
  add(BRAND_CATEGORIES, '', ROUTING_PRESET_GROUPS.brand, 'Management', 'Mitali Kumar');
  add(['Hosted Class & Partnerships'], '', ROUTING_PRESET_GROUPS.social, 'Marketing', 'Reyna');
  return mergeRoutingRules(rules);
}

export function defaultRoutingSettings(): RoutingSettings {
  const departments = unique(ASSOCIATES.map((associate) => associate.team)).map((name) => ({
    id: slug(name),
    name,
    description: `${name} routing queue`,
    active: true,
  }));

  const employees = [
    ...ASSOCIATES.map((associate) => ({
      id: slug(associate.email || associate.name),
      name: associate.name,
      email: associate.email,
      department: associate.team,
      role: associate.role,
      location: associate.location,
      manager: associate.manager,
      active: true,
    })),
    ...SUPPLEMENTAL_EMPLOYEES,
  ];

  const locations = STUDIOS.map((name) => ({
    id: slug(name),
    name,
    city: /bengaluru|bangalore|copper/i.test(name) ? 'Bengaluru' : 'Mumbai',
    color: locationColor(slug(name), name),
    capacity: DEFAULT_LOCATION_CAPACITY,
    avgFillRate: 0,
    sortOrder: 0,
    active: true,
  }));

  const routingRules = [
    ...physique57RoutingPresets(),
    ...Object.keys(CATEGORIES).flatMap((category) => {
      const owner = ASSIGNMENT_RULES[category] || resolveTicketAssignee(category);
      const employee = getEmployee(owner);
      const department = employee?.team || resolveTicketDepartment(category, owner);
      const escalation = getEscalationTarget(owner);
      const priority = category.includes('Safety') || category.includes('Billing') ? 'High' : 'Medium';
      return [{
        id: routingRuleId(category),
        category,
        subCategory: '',
        location: '',
        owner,
        owners: [owner],
        department,
        escalation,
        priority: priority as keyof typeof PRIORITY_SLA,
        slaHours: PRIORITY_SLA[priority].hours,
        active: true,
      }];
    })];

  return { departments, employees, locations, routingRules: mergeRoutingRules(routingRules) };
}

export interface CategoryCityRoutingInput {
  category: string;
  department: string;
  escalation: string;
  priority?: keyof typeof PRIORITY_SLA;
  slaHours?: number;
  cityRouting: Array<{
    city: string;
    owners: string[];
  }>;
}

function cityLocations(settings: RoutingSettings, city: string): string[] {
  const normalizedCity = inferRoutingCity(city) || city;
  const fromSettings = settings.locations
    .filter((location) => location.active !== false)
    .filter((location) => (
      inferRoutingCity(location.city) === normalizedCity ||
      inferRoutingCity(location.name) === normalizedCity
    ))
    .map((location) => location.name);

  const fromMaster = STUDIOS.filter((studio) => inferRoutingCity(studio) === normalizedCity);
  return unique([...fromSettings, ...fromMaster]);
}

export function applyCategoryCityRouting(
  settings: RoutingSettings,
  input: CategoryCityRoutingInput
): RoutingSettings {
  const priority = input.priority || 'Medium';
  const slaHours = input.slaHours || PRIORITY_SLA[priority].hours;
  const replacements: RoutingRuleSetting[] = input.cityRouting.flatMap((item) => {
    const owners = unique(item.owners);
    if (!owners.length) return [];
    const locations = cityLocations(settings, item.city);
    const targetLocations = locations.length ? locations : [item.city];
    return targetLocations.map((location) => ({
      id: routingRuleId(input.category, location),
      category: input.category,
      subCategory: '',
      location,
      owner: owners[0],
      owners,
      department: input.department,
      escalation: input.escalation,
      priority,
      slaHours,
      active: true,
    }));
  });

  const replacementLocations = new Set(replacements.map((rule) => rule.location || ''));
  const routingRules = [
    ...settings.routingRules.filter((rule) => (
      rule.category !== input.category ||
      !replacementLocations.has(rule.location || '')
    )),
    ...replacements,
  ];

  return { ...settings, routingRules };
}

function normalizeSettings(input: Partial<RoutingSettings> | null | undefined): RoutingSettings {
  const defaults = defaultRoutingSettings();
  const employees = input?.employees?.length ? input.employees : defaults.employees;
  const withSupplementalEmployees = [
    ...employees,
    ...SUPPLEMENTAL_EMPLOYEES.filter((item) => !employees.some((employee) => employee.name === item.name)),
  ];
  return {
    departments: input?.departments?.length ? input.departments : defaults.departments,
    employees: withSupplementalEmployees,
    locations: input?.locations?.length ? input.locations : defaults.locations,
    routingRules: mergeRoutingRules((input?.routingRules?.length ? input.routingRules : defaults.routingRules).map((rule) => ({
      ...rule,
      owners: rule.owners?.length ? rule.owners : rule.owner ? [rule.owner] : [],
    }))),
  };
}

export function loadLocalRoutingSettings(): RoutingSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRoutingSettings();
    return normalizeSettings(JSON.parse(raw) as Partial<RoutingSettings>);
  } catch {
    return defaultRoutingSettings();
  }
}

export function saveLocalRoutingSettings(settings: RoutingSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function mapDepartment(row: Record<string, unknown>): DepartmentSetting {
  return {
    id: String(row.id || slug(String(row.name || 'department'))),
    name: String(row.name || ''),
    description: typeof row.description === 'string' ? row.description : '',
    active: row.active !== false,
  };
}

function mapEmployee(row: Record<string, unknown>): EmployeeSetting {
  return {
    id: String(row.id || slug(String(row.email || row.name || 'employee'))),
    name: String(row.name || ''),
    email: typeof row.email === 'string' ? row.email : '',
    department: String(row.department || row.team || ''),
    role: typeof row.role === 'string' ? row.role : '',
    location: typeof row.location === 'string' ? row.location : '',
    manager: typeof row.manager === 'string' ? row.manager : '',
    active: row.active !== false,
  };
}

function mapLocation(row: Record<string, unknown>): LocationSetting {
  const id = String(row.id || slug(String(row.name || 'location')));
  const name = String(row.name || row.short_name || '');
  const city = typeof row.city === 'string' ? row.city : '';
  return {
    id,
    name,
    city,
    color: typeof row.color === 'string' ? row.color : locationColor(id, name, city),
    capacity: Math.max(DEFAULT_LOCATION_CAPACITY, typeof row.capacity === 'number' ? row.capacity : Number(row.capacity || DEFAULT_LOCATION_CAPACITY)),
    avgFillRate: typeof row.avg_fill_rate === 'number' ? row.avg_fill_rate : Number(row.avg_fill_rate || 0),
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : Number(row.sort_order || 0),
    active: row.active !== false && row.is_active !== false,
  };
}

function mapRoutingRule(row: Record<string, unknown>): RoutingRuleSetting {
  const priority = String(row.priority || 'Medium') as keyof typeof PRIORITY_SLA;
  const owners = Array.isArray(row.owners)
    ? row.owners.map(String).filter(Boolean)
    : String(row.owner || row.assigned_to || '').split(',').map((item) => item.trim()).filter(Boolean);
  return {
    id: String(row.id || slug(`${row.category || 'category'}-${row.sub_category || row.subCategory || 'any'}`)),
    category: String(row.category || ''),
    subCategory: String(row.sub_category || row.subCategory || ''),
    location: String(row.location || ''),
    owner: String(row.owner || row.assigned_to || owners[0] || ''),
    owners,
    department: String(row.department || row.team || ''),
    escalation: String(row.escalation || row.next_escalation || ''),
    priority: PRIORITY_SLA[priority] ? priority : 'Medium',
    slaHours: Number(row.sla_hours || row.slaHours || PRIORITY_SLA[PRIORITY_SLA[priority] ? priority : 'Medium'].hours),
    active: row.active !== false,
  };
}

async function tableRows(table: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await backendSupabase.from(table).select('*').order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as Record<string, unknown>[];
}

export async function loadRoutingSettings(): Promise<RoutingSettings> {
  try {
    const [departments, employees, locations, routingRules] = await Promise.all([
      tableRows('departments').then((rows) => rows.map(mapDepartment)),
      tableRows('employees').then((rows) => rows.map(mapEmployee)),
      tableRows('locations').then((rows) => rows.map(mapLocation)),
      backendSupabase.from('issue_routing_rules').select('*').order('category', { ascending: true }).then(({ data, error }) => {
        if (error) throw error;
        return ((data || []) as Record<string, unknown>[]).map(mapRoutingRule);
      }),
    ]);
    const settings = normalizeSettings({ departments, employees, locations, routingRules });
    saveLocalRoutingSettings(settings);
    return settings;
  } catch {
    return loadLocalRoutingSettings();
  }
}

async function upsertRows(table: string, rows: Record<string, unknown>[]) {
  const { error } = await backendSupabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

async function syncRows(table: string, rows: Record<string, unknown>[], deleteStale = false) {
  await upsertRows(table, rows);
  if (!deleteStale) return;

  const keepIds = new Set(rows.map((row) => String(row.id)));
  const { data, error } = await backendSupabase.from(table).select('id');
  if (error) throw error;

  const staleIds = ((data || []) as Array<{ id?: string }>)
    .map((row) => row.id)
    .filter((id): id is string => Boolean(id && !keepIds.has(id)));

  if (staleIds.length) {
    const { error: deleteError } = await backendSupabase.from(table).delete().in('id', staleIds);
    if (deleteError) throw deleteError;
  }
}

export async function saveRoutingSettings(settings: RoutingSettings): Promise<void> {
  await Promise.all([
    syncRows('departments', settings.departments.map((item) => ({
      id: item.id || slug(item.name),
      name: item.name,
      description: item.description || null,
      active: item.active,
    }))),
    syncRows('employees', settings.employees.map((item) => ({
      id: item.id || slug(item.email || item.name),
      name: item.name,
      email: item.email || null,
      department: item.department,
      role: item.role || null,
      location: item.location || null,
      manager: item.manager || null,
      active: item.active,
    }))),
    syncRows('locations', settings.locations.map((item) => ({
      id: item.id || slug(item.name),
      name: item.name,
      short_name: item.name,
      city: item.city || null,
      color: item.color || locationColor(item.id || slug(item.name), item.name, item.city),
      capacity: Math.max(DEFAULT_LOCATION_CAPACITY, item.capacity ?? DEFAULT_LOCATION_CAPACITY),
      avg_fill_rate: item.avgFillRate ?? 0,
      active: item.active,
      is_active: item.active,
    }))),
    syncRows('issue_routing_rules', settings.routingRules.map((item) => ({
      id: item.id || routingRuleId(item.category, item.location || '', item.subCategory || ''),
      category: item.category,
      sub_category: item.subCategory || null,
      location: item.location || null,
      owner: item.owner,
      owners: item.owners?.length ? item.owners : [item.owner],
      department: item.department,
      escalation: item.escalation,
      priority: item.priority,
      sla_hours: item.slaHours,
      active: item.active,
    })), true),
  ]);
  saveLocalRoutingSettings(settings);
}

function specificity(rule: RoutingRuleSetting, category: string, subCategory?: string, studio?: string): number {
  if (!rule.active || rule.category !== category) return -1;
  let score = 10;
  if (rule.subCategory) {
    if (rule.subCategory !== subCategory) return -1;
    score += 8;
  }
  if (rule.location) {
    const ruleLocation = rule.location.toLowerCase();
    const studioLocation = String(studio || '').toLowerCase();
    const ruleCity = inferRoutingCity(rule.location);
    const exactLocationMatch = Boolean(studioLocation && studioLocation.includes(ruleLocation));
    const cityLocationMatch = Boolean(
      studioLocation &&
      ruleCity &&
      ruleCity === inferRoutingCity(studio)
    );
    if (!exactLocationMatch && !cityLocationMatch) return -1;
    const cityOnlyRule = Boolean(ruleCity && ruleLocation === ruleCity.toLowerCase());
    score += exactLocationMatch && !cityOnlyRule ? 6 : 4;
  }
  return score;
}

export function resolveAssignmentFromSettings(
  settings: RoutingSettings,
  category: string,
  subCategory?: string,
  studio?: string,
  context?: AssignmentResolutionContext
): ResolvedAssignment {
  if (isClientServicingRouting(category)) {
    return resolveClientServicingAssignment(studio);
  }

  const best = settings.routingRules
    .map((rule) => ({ rule, score: specificity(rule, category, subCategory, studio) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.rule;

  if (best) {
    const ownerPool = best.owners?.length ? best.owners : [best.owner];
    const normalizedReporterName = String(context?.reporterName || '').trim().toLowerCase();
    const normalizedReporterEmail = String(context?.reporterEmail || '').trim().toLowerCase();
    const qualifiedReporterOwner = ownerPool.find((owner) => {
      const normalizedOwner = owner.trim().toLowerCase();
      if (normalizedReporterName && normalizedOwner === normalizedReporterName) return true;
      if (normalizedReporterEmail) {
        const employee = getEmployee(owner);
        if (employee?.email?.trim().toLowerCase() === normalizedReporterEmail) return true;
      }
      return false;
    });
    const assignedTo = qualifiedReporterOwner || ownerPool[0] || best.owner;
    return {
      assignedTo,
      ownerPool,
      team: best.department || resolveTicketDepartment(category, assignedTo),
      nextEscalation: best.escalation || getEscalationTarget(assignedTo),
      priority: best.priority,
      slaHours: best.slaHours,
      source: 'admin_routing',
    };
  }

  const assignedTo = resolveTicketAssignee(category, studio);
  return {
    assignedTo,
    team: resolveTicketDepartment(category, assignedTo),
    nextEscalation: getEscalationTarget(assignedTo),
    source: 'default_routing',
  };
}

export async function resolveConfiguredAssignment(
  category: string,
  subCategory?: string,
  studio?: string,
  context?: AssignmentResolutionContext
): Promise<ResolvedAssignment> {
  const settings = await loadRoutingSettings();
  return resolveAssignmentFromSettings(settings, category, subCategory, studio, context);
}
