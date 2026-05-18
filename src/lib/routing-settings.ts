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

const STORAGE_KEY = 'athena-routing-settings-v1';

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

const SUPPLEMENTAL_EMPLOYEES: EmployeeSetting[] = [
  { id: 'reyna', name: 'Reyna', email: '', department: 'Marketing', role: 'Marketing Lead', location: 'Physique 57, Mumbai', manager: 'Mitali Kumar', active: true },
  { id: 'saachi-jr', name: 'Saachi Jr.', email: '', department: 'Marketing', role: 'Marketing Associate', location: 'Physique 57, Bengaluru', manager: 'Reyna', active: true },
  { id: 'jhanvi', name: 'Jhanvi', email: '', department: 'Marketing', role: 'Social Media', location: 'Physique 57, Mumbai', manager: 'Reyna', active: true },
];

const ROUTING_PRESET_GROUPS = {
  kwalitySales: ['Akshay Rane', 'Sheetal Kataria', 'Vahishta Fitter', 'Zaheer Agarbattiwala', 'Taahira Sayyed'],
  bandraSales: ['Deesha Changwani', 'Shipra Pinge', 'Imran Shaikh', 'Nadiya Shaikh'],
  mumbaiOps: ['Zahur Shaikh'],
  bengaluruOps: ['Shifa Ali'],
  mumbaiTraining: ['Mrigakshi Jaiswal', 'Vivaran Dhasmana'],
  bengaluruTraining: ['Pushyank Nahar'],
  mumbaiMarketing: ['Reyna'],
  bengaluruMarketing: ['Saachi Jr.'],
  mumbaiAccounts: ['Gaurav Sogam'],
  bengaluruAccounts: ['Rasika Kalambe'],
  brand: ['Jimmeey Gondaa', 'Saachi Shetty'],
  social: ['Jhanvi'],
  bengaluruDefault: ['Shifa Ali'],
};

const SALES_CATEGORIES = ['Scheduling', 'Booking & Schedule', 'Front Desk & Service', 'Customer Service and Communication', 'Sales & Consultation'];
const OPS_CATEGORIES = ['Facility & Equipment', 'Repair and Maintenance', 'Studio Amenities and Facilities', 'Safety and Security', 'Safety & Medical', 'Theft and Lost Items', 'Operating Systems', 'Tech Issues', 'App & Digital'];
const TRAINING_CATEGORIES = ['Class Experience', 'Trainer Feedback', 'Instructor & Class Quality', 'Member Progress & Transformation'];
const ACCOUNTS_CATEGORIES = ['Billing & Membership', 'Pricing and Memberships'];
const MARKETING_CATEGORIES = ['Hosted Class & Partnerships'];
const BRAND_CATEGORIES = ['Brand Feedback'];

function categorySubcategories(category: string): string[] {
  return CATEGORIES[category]?.length ? CATEGORIES[category] : [''];
}

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
    id: slug(`${category}-${subCategory || 'all'}-${location || 'all'}-${owners.join('-')}`),
    category,
    subCategory,
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

export function physique57RoutingPresets(): RoutingRuleSetting[] {
  const rules: RoutingRuleSetting[] = [];
  const add = (
    categories: string[],
    location: string,
    owners: string[],
    department: string,
    escalation: string,
    priority: keyof typeof PRIORITY_SLA = 'Medium',
    subCategoryFilter?: (subCategory: string) => boolean
  ) => {
    for (const category of categories) {
      for (const subCategory of categorySubcategories(category)) {
        if (subCategoryFilter && !subCategoryFilter(subCategory)) continue;
        rules.push(createRule(category, subCategory, location, owners, department, escalation, priority));
      }
    }
  };

  add(SALES_CATEGORIES, 'Kwality House, Kemps Corner', ROUTING_PRESET_GROUPS.kwalitySales, 'Sales & Client Servicing', 'Jimmeey Gondaa');
  add(SALES_CATEGORIES, 'Supreme HQ, Bandra', ROUTING_PRESET_GROUPS.bandraSales, 'Sales & Client Servicing', 'Jimmeey Gondaa');
  add(SALES_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruDefault, 'Management', 'Jimmeey Gondaa');
  add(OPS_CATEGORIES, 'Mumbai', ROUTING_PRESET_GROUPS.mumbaiOps, 'Operations', 'Saachi Shetty - Operations', 'High');
  add(OPS_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruOps, 'Management', 'Saachi Shetty - Operations', 'High');
  add(TRAINING_CATEGORIES, 'Mumbai', ROUTING_PRESET_GROUPS.mumbaiTraining, 'Training', 'Anisha Shah');
  add(TRAINING_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruTraining, 'Training', 'Anisha Shah');
  add(MARKETING_CATEGORIES, 'Mumbai', ROUTING_PRESET_GROUPS.mumbaiMarketing, 'Marketing', 'Reyna');
  add(MARKETING_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruMarketing, 'Marketing', 'Reyna');
  add(ACCOUNTS_CATEGORIES, 'Mumbai', ROUTING_PRESET_GROUPS.mumbaiAccounts, 'Accounts', 'Sachin Nalawade', 'High');
  add(ACCOUNTS_CATEGORIES, 'Bengaluru', ROUTING_PRESET_GROUPS.bengaluruAccounts, 'Accounts', 'Sachin Nalawade', 'High');
  add(BRAND_CATEGORIES, '', ROUTING_PRESET_GROUPS.brand, 'Management', 'Mitali Kumar');
  add(['Brand Feedback', 'Hosted Class & Partnerships'], '', ROUTING_PRESET_GROUPS.social, 'Marketing', 'Reyna', 'Medium', (subCategory) => /social|content|instagram|amplification/i.test(subCategory));
  return rules;
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
    active: true,
  }));

  const routingRules = [
    ...physique57RoutingPresets(),
    ...Object.entries(CATEGORIES).flatMap(([category, subCategories]) => {
    const owner = ASSIGNMENT_RULES[category] || resolveTicketAssignee(category);
    const employee = getEmployee(owner);
    const department = employee?.team || resolveTicketDepartment(category, owner);
    const escalation = getEscalationTarget(owner);
    const priority = category.includes('Safety') || category.includes('Billing') ? 'High' : 'Medium';
    return (subCategories.length ? subCategories : ['Other']).map((subCategory) => ({
      id: slug(`${category}-${subCategory}`),
      category,
      subCategory,
      location: '',
      owner,
      owners: [owner],
      department,
      escalation,
      priority: priority as keyof typeof PRIORITY_SLA,
      slaHours: PRIORITY_SLA[priority].hours,
      active: true,
    }));
  })];

  return { departments, employees, locations, routingRules };
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
    routingRules: (input?.routingRules?.length ? input.routingRules : defaults.routingRules).map((rule) => ({
      ...rule,
      owners: rule.owners?.length ? rule.owners : rule.owner ? [rule.owner] : [],
    })),
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
  return {
    id: String(row.id || slug(String(row.name || 'location'))),
    name: String(row.name || ''),
    city: typeof row.city === 'string' ? row.city : '',
    active: row.active !== false,
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

export async function saveRoutingSettings(settings: RoutingSettings): Promise<void> {
  saveLocalRoutingSettings(settings);
  await Promise.all([
    upsertRows('departments', settings.departments.map((item) => ({
      id: item.id || slug(item.name),
      name: item.name,
      description: item.description || null,
      active: item.active,
    }))),
    upsertRows('employees', settings.employees.map((item) => ({
      id: item.id || slug(item.email || item.name),
      name: item.name,
      email: item.email || null,
      department: item.department,
      role: item.role || null,
      location: item.location || null,
      manager: item.manager || null,
      active: item.active,
    }))),
    upsertRows('locations', settings.locations.map((item) => ({
      id: item.id || slug(item.name),
      name: item.name,
      city: item.city || null,
      active: item.active,
    }))),
    upsertRows('issue_routing_rules', settings.routingRules.map((item) => ({
      id: item.id || slug(`${item.category}-${item.subCategory || 'any'}-${item.location || 'all'}`),
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
    }))),
  ]);
}

function specificity(rule: RoutingRuleSetting, category: string, subCategory?: string, studio?: string): number {
  if (!rule.active || rule.category !== category) return -1;
  let score = 10;
  if (rule.subCategory) {
    if (rule.subCategory !== subCategory) return -1;
    score += 8;
  }
  if (rule.location) {
    if (!studio || !studio.toLowerCase().includes(rule.location.toLowerCase())) return -1;
    score += 4;
  }
  return score;
}

export function resolveAssignmentFromSettings(
  settings: RoutingSettings,
  category: string,
  subCategory?: string,
  studio?: string
): ResolvedAssignment {
  const best = settings.routingRules
    .map((rule) => ({ rule, score: specificity(rule, category, subCategory, studio) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.rule;

  if (best) {
    const ownerPool = best.owners?.length ? best.owners : [best.owner];
    const assignedTo = ownerPool[0] || best.owner;
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
  studio?: string
): Promise<ResolvedAssignment> {
  const settings = await loadRoutingSettings();
  return resolveAssignmentFromSettings(settings, category, subCategory, studio);
}
