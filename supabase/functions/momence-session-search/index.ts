const MOMENCE_BASE_URL = 'https://api.momence.com/api/v2';
const DEFAULT_PAST_DAYS = 180;
const DEFAULT_FUTURE_DAYS = 45;
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_SESSION_TYPE = 'private';
const MAX_PAGES = 12;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SearchBody = {
  query?: string;
  pastDays?: number;
  futureDays?: number;
  pageSize?: number;
  includeCancelled?: boolean;
  type?: string;
  types?: string[];
};

type TokenResponse = {
  accessToken?: string;
  access_token?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

async function getAccessToken(): Promise<string> {
  const staticToken = Deno.env.get('MOMENCE_ACCESS_TOKEN');
  if (staticToken) return staticToken;

  const clientId = env('MOMENCE_CLIENT_ID');
  const clientSecret = env('MOMENCE_CLIENT_SECRET');
  const username = env('MOMENCE_USERNAME');
  const password = env('MOMENCE_PASSWORD');

  const form = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
  });

  const response = await fetch(`${MOMENCE_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Momence token request failed (${response.status}): ${detail}`);
  }

  const data = await response.json() as TokenResponse;
  const token = data.access_token || data.accessToken;
  if (!token) throw new Error('Momence token response did not include an access token');
  return token;
}

function clampDays(value: unknown, fallback: number, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(max, Math.round(number)));
}

function clampPageSize(value: unknown): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_PAGE_SIZE;
  return Math.max(10, Math.min(200, Math.round(number)));
}

function extractItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  const value = data as Record<string, unknown>;
  for (const key of ['payload', 'data', 'items', 'content', 'results', 'sessions']) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = extractItems(candidate);
      if (nested.length) return nested;
    }
  }

  return [];
}

function normalizeSearchValue(value: unknown): string {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]s\b/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactSearchValue(value: string): string {
  return value.replace(/\s+/g, '');
}

function getPathValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function searchableSessionText(session: unknown): string {
  return normalizeSearchValue([
    getPathValue(session, ['name']),
    getPathValue(session, ['type']),
    getPathValue(session, ['startsAt']),
    getPathValue(session, ['teacher', 'firstName']),
    getPathValue(session, ['teacher', 'lastName']),
    getPathValue(session, ['inPersonLocation', 'name']),
  ].filter(Boolean).join(' '));
}

function matchesQuery(session: unknown, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystack = searchableSessionText(session);
  if (haystack.includes(normalizedQuery)) return true;
  const compactHaystack = compactSearchValue(haystack);
  const compactQuery = compactSearchValue(normalizedQuery);
  if (compactHaystack.includes(compactQuery)) return true;
  const tokens = normalizedQuery
    .split(' ')
    .filter((token) => token.length > 1 && token !== '57');
  return tokens.length > 0 && tokens.every((token) => (
    haystack.includes(token) || compactHaystack.includes(token)
  ));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await request.json().catch(() => ({})) as SearchBody;
    const now = new Date();
    const startAfter = new Date(now);
    const startBefore = new Date(now);
    const pastDays = clampDays(body.pastDays, DEFAULT_PAST_DAYS, 730);
    const futureDays = clampDays(body.futureDays, DEFAULT_FUTURE_DAYS, 365);
    const pageSize = clampPageSize(body.pageSize);
    const sessionTypes = Array.isArray(body.types) && body.types.some((type) => typeof type === 'string' && type.trim())
      ? body.types.filter((type): type is string => typeof type === 'string' && Boolean(type.trim())).map((type) => type.trim())
      : [typeof body.type === 'string' && body.type.trim() ? body.type.trim() : DEFAULT_SESSION_TYPE];

    startAfter.setDate(now.getDate() - pastDays);
    startBefore.setDate(now.getDate() + futureDays);

    const token = await getAccessToken();
    const pages: unknown[] = [];
    let responseContentType = 'application/json';

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`${MOMENCE_BASE_URL}/host/sessions`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('pageSize', String(pageSize));
      url.searchParams.set('sortBy', 'startsAt');
      url.searchParams.set('sortOrder', 'DESC');
      url.searchParams.set('includeCancelled', String(body.includeCancelled ?? false));
      url.searchParams.set('startAfter', startAfter.toISOString());
      url.searchParams.set('startBefore', startBefore.toISOString());
      for (const sessionType of sessionTypes) {
        url.searchParams.append('types', sessionType);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const text = await response.text();
      if (!response.ok) {
        return json({ error: `Momence session request failed (${response.status})`, detail: text }, response.status);
      }

      responseContentType = response.headers.get('Content-Type') || responseContentType;
      const data = JSON.parse(text);
      const items = extractItems(data);
      pages.push(...items);
      if (!Array.isArray(items) || items.length < pageSize) break;
    }

    const normalizedQuery = normalizeSearchValue(body.query);
    const filteredPages = normalizedQuery
      ? pages.filter((session) => matchesQuery(session, normalizedQuery))
      : pages;

    return new Response(JSON.stringify({ payload: filteredPages }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': responseContentType,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Momence session search failed' }, 500);
  }
});
