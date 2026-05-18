const MOMENCE_BASE_URL = 'https://api.momence.com/api/v2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SearchBody = {
  path?: string;
  method?: string;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

type TokenResponse = {
  accessToken?: string;
  access_token?: string;
};

const ALLOWED_REQUESTS: Array<{ method: string; pattern: RegExp }> = [
  { method: 'GET', pattern: /^\/host\/members$/ },
  { method: 'GET', pattern: /^\/host\/members\/\d+$/ },
  { method: 'GET', pattern: /^\/host\/members\/\d+\/bought-memberships\/active$/ },
  { method: 'GET', pattern: /^\/host\/members\/\d+\/notes$/ },
  { method: 'GET', pattern: /^\/host\/members\/\d+\/sessions$/ },
  { method: 'GET', pattern: /^\/host\/memberships$/ },
  { method: 'GET', pattern: /^\/host\/sales$/ },
  { method: 'GET', pattern: /^\/host\/sessions$/ },
  { method: 'GET', pattern: /^\/host\/sessions\/\d+$/ },
  { method: 'GET', pattern: /^\/host\/sessions\/\d+\/bookings$/ },
  { method: 'GET', pattern: /^\/host\/tags$/ },
  { method: 'POST', pattern: /^\/host\/members\/\d+\/tags\/\d+$/ },
  { method: 'DELETE', pattern: /^\/host\/members\/\d+\/tags\/\d+$/ },
  { method: 'POST', pattern: /^\/host\/session-bookings\/\d+\/check-in$/ },
  { method: 'DELETE', pattern: /^\/host\/session-bookings\/\d+\/check-in$/ },
  { method: 'DELETE', pattern: /^\/host\/session-bookings\/\d+$/ },
  { method: 'DELETE', pattern: /^\/host\/session-recurring-bookings\/\d+$/ },
  { method: 'POST', pattern: /^\/host\/sessions\/\d+\/bookings\/free$/ },
  { method: 'POST', pattern: /^\/host\/sessions\/\d+\/waitlist\/bookings$/ },
];

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await request.json() as SearchBody;
    const path = body.path?.startsWith('/') ? body.path : `/${body.path || ''}`;
    const method = (body.method || 'GET').toUpperCase();

    if (!ALLOWED_REQUESTS.some((request) => request.method === method && request.pattern.test(path))) {
      return json({ error: 'Unsupported Momence request' }, 400);
    }

    const url = new URL(`${MOMENCE_BASE_URL}${path}`);
    Object.entries(body.params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    });

    const token = await getAccessToken();
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body.body ? JSON.stringify(body.body) : undefined,
    });

    const text = await response.text();
    if (!response.ok) {
      return json({ error: `Momence request failed (${response.status})`, detail: text }, response.status);
    }

    return new Response(text, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Momence search failed' }, 500);
  }
});
