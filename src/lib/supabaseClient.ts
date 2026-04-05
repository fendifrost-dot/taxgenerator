/**
 * supabaseClient.ts
 *
 * Direct Supabase REST API client using native fetch.
 * NO @supabase/supabase-js package required — calls the REST API directly,
 * the same way documentParser.ts calls the Anthropic API.
 *
 * Required .env variables:
 *   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key
 *   VITE_APP_URL=https://your-deployed-app.com  (for portal links)
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// ─── Auth session ─────────────────────────────────────────────────────────────

let _accessToken: string | null = sessionStorage.getItem('sb_access_token');
let _refreshToken: string | null = sessionStorage.getItem('sb_refresh_token');

export interface SupabaseUser {
  id: string;
  email: string;
}

export interface AuthSession {
  user: SupabaseUser;
  accessToken: string;
}

export function getSession(): AuthSession | null {
  if (!_accessToken) return null;
  const userId = _decodeUserId(_accessToken);
  if (!userId) return null;
  return { user: { id: userId, email: '' }, accessToken: _accessToken };
}

export function setSession(accessToken: string, refreshToken: string): void {
  _accessToken = accessToken;
  _refreshToken = refreshToken;
  sessionStorage.setItem('sb_access_token', accessToken);
  sessionStorage.setItem('sb_refresh_token', refreshToken);
}

export function clearSession(): void {
  _accessToken = null;
  _refreshToken = null;
  sessionStorage.removeItem('sb_access_token');
  sessionStorage.removeItem('sb_refresh_token');
}

export function getCurrentUserId(): string | null {
  return _accessToken ? _decodeUserId(_accessToken) : null;
}

function _decodeUserId(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1])) as { sub?: string; exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearSession();
      return null;
    }
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<SupabaseUser> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error_description?: string; msg?: string };
    throw new Error(err.error_description ?? err.msg ?? 'Sign-in failed.');
  }
  const data = await res.json() as { access_token: string; refresh_token: string; user: SupabaseUser };
  setSession(data.access_token, data.refresh_token);
  return data.user;
}

export async function signOut(): Promise<void> {
  if (_accessToken) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${_accessToken}` },
    }).catch(() => {});
  }
  clearSession();
}

// ─── REST helpers ─────────────────────────────────────────────────────────────

function _authHeaders(useAnon = false): Record<string, string> {
  const bearer = useAnon ? SUPABASE_ANON_KEY : (_accessToken ?? SUPABASE_ANON_KEY);
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function _restUrl(table: string, query?: string): string {
  return `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`;
}

/** SELECT rows */
export async function dbSelect<T>(table: string, query = 'select=*'): Promise<T[]> {
  const res = await fetch(_restUrl(table, query), { headers: _authHeaders() });
  if (!res.ok) throw new Error(`DB select [${table}]: HTTP ${res.status}`);
  return res.json() as Promise<T[]>;
}

/** SELECT using anon key only — for portal pages that don't require auth */
export async function dbSelectPublic<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(_restUrl(table, query), { headers: _authHeaders(true) });
  if (!res.ok) throw new Error(`DB public select [${table}]: HTTP ${res.status}`);
  return res.json() as Promise<T[]>;
}

/** INSERT a single row, returns the created record */
export async function dbInsert<T>(table: string, data: Record<string, unknown>): Promise<T> {
  const res = await fetch(_restUrl(table), {
    method: 'POST',
    headers: _authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB insert [${table}]: HTTP ${res.status}`);
  const rows = await res.json() as T[];
  return rows[0];
}

/** UPDATE rows matching filter, returns updated records */
export async function dbUpdate<T>(
  table: string,
  filter: string,
  data: Record<string, unknown>,
): Promise<T[]> {
  const res = await fetch(_restUrl(table, filter), {
    method: 'PATCH',
    headers: _authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB update [${table}]: HTTP ${res.status}`);
  return res.json() as Promise<T[]>;
}

/** Upload a file to Supabase Storage */
export async function storageUpload(bucket: string, path: string, file: File): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${_accessToken ?? SUPABASE_ANON_KEY}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) throw new Error(`Storage upload [${bucket}/${path}]: HTTP ${res.status}`);
  return path;
}
