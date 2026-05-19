import { backendSupabase } from './backend-supabase';

const MOMENCE_BASE_URL = 'https://api.momence.com/api/v2';
const DEFAULT_PAGE_SIZE = 20;
const SESSION_RESULT_LIMIT = 120;
const SESSION_LOOKAHEAD_DAYS = 45;
const SESSION_LOOKBACK_DAYS = 180;
const SESSION_SEARCH_TYPE = 'private';

interface PaginatedMomenceResponse<T> {
  payload?: T[];
  data?: T[];
  items?: T[];
}

interface MomenceMember {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string | null;
  firstSeen?: string;
  lastSeen?: string;
}

interface MomenceSession {
  id: number;
  name?: string;
  startsAt?: string;
  endsAt?: string;
  type?: string;
  teacher?: {
    id?: number;
    firstName?: string;
    lastName?: string;
  } | null;
  inPersonLocation?: {
    id?: number;
    name?: string;
  } | null;
  isCancelled?: boolean;
  bookingCount?: number;
  capacity?: number | null;
}

export interface MomenceMemberDetail extends MomenceMember {
  customerTags?: MomenceTag[];
}

export interface MomenceMembership {
  id: number;
  type?: string;
  startDate?: string | null;
  endDate?: string | null;
  isFrozen?: boolean;
  eventCreditsLeft?: number | null;
  eventCreditsTotal?: number | null;
  usedSessions?: number | null;
  usageLimitForSessions?: number | null;
  membership?: {
    id?: number;
    name?: string;
  } | null;
}

export interface MomenceMemberBooking {
  id: number;
  createdAt?: string;
  checkedIn?: boolean;
  cancelledAt?: string | null;
  session?: MomenceSession;
}

export interface MomenceMemberNote {
  id: number;
  createdAt?: string;
  modifiedAt?: string;
  type?: string;
  note?: string;
}

export interface MomenceSessionDetail extends MomenceSession {
  waitlistCapacity?: number | null;
  waitlistBookingCount?: number | null;
}

export interface MomenceSessionBooking {
  id: number;
  member?: {
    id?: number;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string | null;
  };
  checkedIn?: boolean;
  createdAt?: string;
  isRecurring?: boolean;
  recurringBookingId?: number | null;
  cancelledAt?: string | null;
}

export interface MomenceTag {
  id: number;
  name: string;
  isCustomerBadge?: boolean;
  badgeLabel?: string | null;
  badgeColor?: string | null;
}

export interface MomenceMemberOption {
  id: string;
  label: string;
  description: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  firstSeen?: string;
  lastSeen?: string;
}

export interface MomenceSessionOption {
  id: string;
  label: string;
  description: string;
  classType: string;
  trainer?: string;
  studio?: string;
  startsAt?: string;
  endsAt?: string;
}

interface MomenceRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

function compact(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(' ');
}

function normalizeSearchValue(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sessionMatchesSearch(haystack: string, query: string): boolean {
  if (!query) return true;
  if (haystack.includes(query)) return true;
  const compactHaystack = haystack.replace(/\s+/g, '');
  const compactQuery = query.replace(/\s+/g, '');
  if (compactHaystack.includes(compactQuery)) return true;
  const tokens = query.split(' ').filter((token) => token.length > 1 && token !== '57');
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token) || compactHaystack.includes(token));
}

function payloadFrom<T>(response: PaginatedMomenceResponse<T> | T[]): T[] {
  if (Array.isArray(response)) return response;
  return response.payload || response.data || response.items || [];
}

function resolveSessionFunctionUrl(): string | undefined {
  const explicitUrl = import.meta.env.VITE_MOMENCE_SESSION_FUNCTION_URL as string | undefined;
  if (explicitUrl) return explicitUrl;

  const genericUrl = import.meta.env.VITE_MOMENCE_FUNCTION_URL as string | undefined;
  if (!genericUrl) return undefined;
  return genericUrl
    .replace(/\/momence-search-js(?:\/)?$/, '/momence-session-search')
    .replace(/\/momence-search(?:\/)?$/, '/momence-session-search');
}

function resolveSessionFunctionAnonKey(): string | undefined {
  return (
    import.meta.env.VITE_MOMENCE_SESSION_FUNCTION_ANON_KEY ||
    import.meta.env.VITE_MOMENCE_FUNCTION_ANON_KEY
  ) as string | undefined;
}

function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

async function callMomence<T>(path: string, options: MomenceRequestOptions = {}) {
  const method = options.method || 'GET';
  const params = options.params || {};
  const functionUrl = import.meta.env.VITE_MOMENCE_FUNCTION_URL as string | undefined;
  const functionAnonKey = import.meta.env.VITE_MOMENCE_FUNCTION_ANON_KEY as string | undefined;
  const proxyUrl = import.meta.env.VITE_MOMENCE_PROXY_URL as string | undefined;
  const accessToken = import.meta.env.VITE_MOMENCE_ACCESS_TOKEN as string | undefined;

  if (functionUrl) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (functionAnonKey) {
      headers.apikey = functionAnonKey;
      headers.Authorization = `Bearer ${functionAnonKey}`;
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path, method, params, body: options.body }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Momence function returned ${response.status}: ${detail}`);
    }
    return parseResponse<T>(response);
  }

  if (proxyUrl) {
    const url = new URL(path.replace(/^\/api\/v2\//, ''), proxyUrl.endsWith('/') ? proxyUrl : `${proxyUrl}/`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Momence proxy returned ${response.status}`);
    return parseResponse<T>(response);
  }

  if (accessToken) {
    const url = new URL(`${MOMENCE_BASE_URL}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) throw new Error(`Momence API returned ${response.status}`);
    return parseResponse<T>(response);
  }

  const { data, error } = await backendSupabase.functions.invoke('momence-search', {
    body: { path, method, params, body: options.body },
  });
  if (error) throw error;
  return data as T;
}

export async function searchMomenceMembers(query: string): Promise<MomenceMemberOption[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const response = await callMomence<PaginatedMomenceResponse<MomenceMember>>('/host/members', {
    params: {
      page: 0,
      pageSize: DEFAULT_PAGE_SIZE,
      sortBy: 'lastSeenAt',
      sortOrder: 'DESC',
      query: normalizedQuery,
    },
  });

  return payloadFrom(response).map((member) => {
    const name = compact([member.firstName, member.lastName]) || `Momence member #${member.id}`;
    const contact = compact([member.email, member.phoneNumber && `+${member.phoneNumber.replace(/^\+/, '')}`]);
    return {
      id: String(member.id),
      label: name,
      description: contact || 'No contact details returned by Momence',
      name,
      email: member.email,
      phoneNumber: member.phoneNumber || undefined,
      firstSeen: member.firstSeen,
      lastSeen: member.lastSeen,
    };
  });
}

export async function searchMomenceSessions(query: string): Promise<MomenceSessionOption[]> {
  const now = new Date();
  const lookback = new Date(now);
  lookback.setDate(lookback.getDate() - SESSION_LOOKBACK_DAYS);
  const lookahead = new Date(now);
  lookahead.setDate(lookahead.getDate() + SESSION_LOOKAHEAD_DAYS);
  const sessionFunctionUrl = resolveSessionFunctionUrl();
  const sessionFunctionAnonKey = resolveSessionFunctionAnonKey();
  const normalizedQuery = normalizeSearchValue(query);

  let response: PaginatedMomenceResponse<MomenceSession>;
  if (sessionFunctionUrl) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionFunctionAnonKey) {
      headers.apikey = sessionFunctionAnonKey;
      headers.Authorization = `Bearer ${sessionFunctionAnonKey}`;
    }
    const raw = await fetch(sessionFunctionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        pastDays: SESSION_LOOKBACK_DAYS,
        futureDays: SESSION_LOOKAHEAD_DAYS,
        pageSize: 200,
        includeCancelled: false,
        types: SESSION_SEARCH_TYPE,
      }),
    });
    if (!raw.ok) {
      const detail = await raw.text();
      throw new Error(`Momence session function returned ${raw.status}: ${detail}`);
    }
    response = await parseResponse<PaginatedMomenceResponse<MomenceSession>>(raw);
  } else {
    response = await callMomence<PaginatedMomenceResponse<MomenceSession>>('/host/sessions', {
      params: {
        page: 0,
        pageSize: 200,
        sortBy: 'startsAt',
        sortOrder: 'DESC',
        includeCancelled: false,
        types: SESSION_SEARCH_TYPE,
        startAfter: lookback.toISOString(),
        startBefore: lookahead.toISOString(),
      },
    });
  }

  return payloadFrom(response)
    .filter((session) => {
      if (!normalizedQuery) return true;
      const teacher = compact([session.teacher?.firstName, session.teacher?.lastName]);
      const haystack = normalizeSearchValue(compact([
        session.name,
        teacher,
        session.inPersonLocation?.name,
        session.startsAt,
        session.type,
      ]));
      return sessionMatchesSearch(haystack, normalizedQuery);
    })
    .slice(0, SESSION_RESULT_LIMIT)
    .map((session) => {
      const trainer = compact([session.teacher?.firstName, session.teacher?.lastName]) || undefined;
      const studio = session.inPersonLocation?.name;
      const dateLabel = formatDateTime(session.startsAt);
      const classType = session.name || session.type || `Momence session #${session.id}`;
      return {
        id: String(session.id),
        label: compact([classType, dateLabel && `- ${dateLabel}`]),
        description: compact([trainer, studio, session.capacity != null ? `${session.bookingCount || 0}/${session.capacity} booked` : null]),
        classType,
        trainer,
        studio,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      };
    });
}

export async function getMomenceMember(memberId: string | number) {
  return callMomence<MomenceMemberDetail>(`/host/members/${memberId}`);
}

export async function getMomenceMemberMemberships(memberId: string | number) {
  const response = await callMomence<PaginatedMomenceResponse<MomenceMembership>>(
    `/host/members/${memberId}/bought-memberships/active`,
    { params: { page: 0, pageSize: 20 } }
  );
  return payloadFrom(response);
}

export async function getMomenceMemberBookings(memberId: string | number) {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 90);
  const future = new Date(now);
  future.setDate(future.getDate() + 45);

  const response = await callMomence<PaginatedMomenceResponse<MomenceMemberBooking>>(
    `/host/members/${memberId}/sessions`,
    {
      params: {
        page: 0,
        pageSize: 20,
        sortBy: 'startsAt',
        sortOrder: 'DESC',
        includeCancelled: true,
        startAfter: past.toISOString(),
        startBefore: future.toISOString(),
      },
    }
  );
  return payloadFrom(response);
}

export async function getMomenceMemberNotes(memberId: string | number) {
  const response = await callMomence<PaginatedMomenceResponse<MomenceMemberNote>>(
    `/host/members/${memberId}/notes`,
    { params: { page: 0, pageSize: 5, sortBy: 'modifiedAt', sortOrder: 'DESC' } }
  );
  return payloadFrom(response);
}

export async function getMomenceSession(sessionId: string | number) {
  return callMomence<MomenceSessionDetail>(`/host/sessions/${sessionId}`);
}

export async function getMomenceSessionBookings(sessionId: string | number) {
  const response = await callMomence<PaginatedMomenceResponse<MomenceSessionBooking>>(
    `/host/sessions/${sessionId}/bookings`,
    { params: { page: 0, pageSize: 50, sortBy: 'createdAt', sortOrder: 'DESC', includeCancelled: true } }
  );
  return payloadFrom(response);
}

export async function listMomenceTags() {
  const response = await callMomence<PaginatedMomenceResponse<MomenceTag>>('/host/tags', {
    params: { page: 0, pageSize: 100, sortBy: 'name', sortOrder: 'ASC' },
  });
  return payloadFrom(response);
}

export async function addMomenceMemberToSessionForFree(memberId: string | number, sessionId: string | number) {
  return callMomence<{ sessionBookingId?: number; sessionRecurringBookingId?: number }>(
    `/host/sessions/${sessionId}/bookings/free`,
    { method: 'POST', body: { memberId: Number(memberId), createRecurringBooking: false } }
  );
}

export async function addMomenceMemberToWaitlist(memberId: string | number, sessionId: string | number) {
  return callMomence<{ waitlistBookingId?: number }>(`/host/sessions/${sessionId}/waitlist/bookings`, {
    method: 'POST',
    body: { memberId: Number(memberId) },
  });
}

export async function checkInMomenceBooking(bookingId: string | number) {
  return callMomence(`/host/session-bookings/${bookingId}/check-in`, { method: 'POST' });
}

export async function removeMomenceBookingCheckIn(bookingId: string | number) {
  return callMomence(`/host/session-bookings/${bookingId}/check-in`, { method: 'DELETE' });
}

export async function cancelMomenceBooking(
  bookingId: string | number,
  options: { refund?: boolean; disableNotifications?: boolean; isLateCancellation?: boolean } = {}
) {
  return callMomence(`/host/session-bookings/${bookingId}`, {
    method: 'DELETE',
    body: {
      refund: options.refund ?? false,
      disableNotifications: options.disableNotifications ?? false,
      isLateCancellation: options.isLateCancellation ?? false,
    },
  });
}

export async function assignMomenceTag(memberId: string | number, tagId: string | number) {
  return callMomence(`/host/members/${memberId}/tags/${tagId}`, { method: 'POST' });
}

export async function unassignMomenceTag(memberId: string | number, tagId: string | number) {
  return callMomence(`/host/members/${memberId}/tags/${tagId}`, { method: 'DELETE' });
}
