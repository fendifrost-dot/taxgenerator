/**
 * supabaseClient.ts
 *
 * Auth + REST helpers for the preparer app.
 *
 * Auth is delegated to the official @supabase/supabase-js client
 * (see src/integrations/supabase/client.ts) — this gives us
 * persistent sessions in localStorage, automatic token refresh,
 * and onAuthStateChange events.
 *
 * REST helpers below remain raw fetch (used by ingestion / portal pages
 * that prefer no SDK overhead). They read the current access token from
 * the official client.
 */

import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// ─── Auth types ───────────────────────────────────────────────────────────────

export interface SupabaseUser {
  id: string;
  email: string;
}

export interface AuthSession {
  user: SupabaseUser;
  accessToken: string;
}

let _accessToken: string | null = null;

// Keep the cached access token in sync with the official client so that the
// REST helpers below send the correct bearer.
supabase.auth.getSession().then(({ data }) => {
  _accessToken = data.session?.access_token ?? null;
});
supabase.auth.onAuthStateChange((_event, session) => {
  _accessToken = session?.access_token ?? null;
});

export function getCurrentUserId(): string | null {
  // Synchronous best-effort: derived from the cached access token.
  if (!_accessToken) return null;
  try {
    const payload = JSON.parse(atob(_accessToken.split('.')[1])) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// ─── Auth API (thin wrapper around the official client) ──────────────────────

export async function signIn(email: string, password: string): Promise<SupabaseUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Sign-in failed.');
  return { id: data.user.id, email: data.user.email ?? email };
}

export async function signUp(email: string, password: string): Promise<SupabaseUser> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Sign-up failed.');
  return { id: data.user.id, email: data.user.email ?? email };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// Legacy synchronous getter kept for AuthContext bootstrap.
// Prefer supabase.auth.getSession() / onAuthStateChange in new code.
export function getSession(): AuthSession | null {
  if (!_accessToken) return null;
  const userId = getCurrentUserId();
  if (!userId) return null;
  return { user: { id: userId, email: '' }, accessToken: _accessToken };
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
