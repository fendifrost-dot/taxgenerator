/**
 * portalLinks.ts
 *
 * Generates, stores, and validates 7-day portal tokens for client-facing
 * upload and questionnaire links.
 *
 * Token validation is intentionally unauthenticated (public anon policy in
 * Supabase RLS) so clients can access the portal without a login.
 */

import { PortalToken, PortalTokenType, PortalTokenWithReturn, OptimizationQuestion } from '@/types/client';
import { isSupabaseConfigured, dbSelect, dbInsert, dbUpdate, dbSelectPublic } from './supabaseClient';

const APP_URL =
  (import.meta.env.VITE_APP_URL as string | undefined) ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173');

const TOKEN_EXPIRY_DAYS = 7;

// ─── localStorage helpers ─────────────────────────────────────────────────────

function lsGet<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]; }
  catch { return []; }
}
function lsSet<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Token generation ─────────────────────────────────────────────────────────

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function expiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + TOKEN_EXPIRY_DAYS);
  return d.toISOString();
}

// ─── DB column normalisation ──────────────────────────────────────────────────

function rowToToken(row: Record<string, unknown>): PortalToken {
  return {
    id:         String(row['id']),
    returnId:   String(row['return_id'] ?? row['returnId']   ?? ''),
    token:      String(row['token']),
    tokenType:  (row['token_type'] ?? row['tokenType']) as PortalTokenType,
    expiresAt:  String(row['expires_at'] ?? row['expiresAt'] ?? ''),
    usedAt:     row['used_at']    ? String(row['used_at'])    : undefined,
    revokedAt:  row['revoked_at'] ? String(row['revoked_at']) : undefined,
    createdAt:  String(row['created_at'] ?? row['createdAt'] ?? new Date().toISOString()),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Build the shareable URL for a portal token */
export function getPortalUrl(token: string, tokenType: PortalTokenType): string {
  const slug = tokenType === 'upload' ? 'upload' : 'questionnaire';
  return `${APP_URL}/portal/${slug}/${token}`;
}

/** Create a new portal token for a return */
export async function createPortalToken(
  returnId: string,
  tokenType: PortalTokenType,
): Promise<PortalToken> {
  const token  = generateToken();
  const expires = expiresAt();
  const now    = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const row = await dbInsert<Record<string, unknown>>('portal_tokens', {
      return_id:  returnId,
      token,
      token_type: tokenType,
      expires_at: expires,
    });
    return rowToToken(row);
  }

  const pt: PortalToken = {
    id:        `pt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    returnId,
    token,
    tokenType,
    expiresAt: expires,
    createdAt: now,
  };
  lsSet('tf_portal_tokens', [...lsGet<PortalToken>('tf_portal_tokens'), pt]);
  return pt;
}

/** List all active (non-expired, non-revoked) tokens for a return */
export async function listActiveTokens(returnId: string): Promise<PortalToken[]> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const rows = await dbSelect<Record<string, unknown>>(
      'portal_tokens',
      `return_id=eq.${returnId}&expires_at=gt.${now}&revoked_at=is.null&order=created_at.desc`,
    );
    return rows.map(rowToToken);
  }
  return lsGet<PortalToken>('tf_portal_tokens').filter(
    t => t.returnId === returnId && !t.revokedAt && new Date(t.expiresAt) > new Date(),
  );
}

/** Revoke a token (preparer-side) */
export async function revokePortalToken(tokenId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    await dbUpdate('portal_tokens', `id=eq.${tokenId}`, { revoked_at: now });
    return;
  }
  lsSet('tf_portal_tokens', lsGet<PortalToken>('tf_portal_tokens').map(t =>
    t.id === tokenId ? { ...t, revokedAt: now } : t,
  ));
}

/**
 * Validate a portal token (no auth required — used by portal pages).
 * Returns enriched token with client name + tax year, or null if invalid.
 */
export async function validatePortalToken(
  token: string,
  expectedType: PortalTokenType,
): Promise<PortalTokenWithReturn | null> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    // Read token (public RLS allows reads of non-expired tokens)
    const tokenRows = await dbSelectPublic<Record<string, unknown>>(
      'portal_tokens',
      `token=eq.${token}&token_type=eq.${expectedType}&expires_at=gt.${now}&revoked_at=is.null&select=*`,
    ).catch(() => []);
    if (!tokenRows[0]) return null;
    const pt = rowToToken(tokenRows[0]);

    // Get return info
    const retRows = await dbSelectPublic<Record<string, unknown>>(
      'tax_returns',
      `id=eq.${pt.returnId}&select=tax_year,client_id,optimization_questions`,
    ).catch(() => []);
    if (!retRows[0]) return null;
    const ret = retRows[0];

    // Get client name
    const clientRows = await dbSelectPublic<Record<string, unknown>>(
      'clients',
      `id=eq.${String(ret['client_id'])}&select=first_name,last_name`,
    ).catch(() => []);
    const client = clientRows[0] ?? {};

    return {
      ...pt,
      clientFirstName:       String(client['first_name'] ?? ''),
      clientLastName:        String(client['last_name']  ?? ''),
      taxYear:               Number(ret['tax_year']),
      optimizationQuestions: (ret['optimization_questions'] as OptimizationQuestion[]) ?? [],
    };
  }

  // ── localStorage fallback ──────────────────────────────────────────────────
  const pt = lsGet<PortalToken>('tf_portal_tokens').find(
    t => t.token === token &&
         t.tokenType === expectedType &&
         !t.revokedAt &&
         new Date(t.expiresAt) > new Date(),
  );
  if (!pt) return null;

  type LsReturn = { id: string; clientId: string; taxYear: number; optimizationQuestions?: OptimizationQuestion[] };
  type LsClient = { id: string; firstName: string; lastName: string };

  const ret  = (JSON.parse(localStorage.getItem('tf_returns')  ?? '[]') as LsReturn[]).find(r => r.id === pt.returnId);
  const cli  = (JSON.parse(localStorage.getItem('tf_clients')  ?? '[]') as LsClient[]).find(c => c.id === ret?.clientId);

  return {
    ...pt,
    clientFirstName:       cli?.firstName ?? '',
    clientLastName:        cli?.lastName  ?? '',
    taxYear:               ret?.taxYear   ?? 0,
    optimizationQuestions: ret?.optimizationQuestions ?? [],
  };
}

/** Mark a token as used (called after first successful portal load) */
export async function markTokenUsed(tokenId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    await dbUpdate('portal_tokens', `id=eq.${tokenId}&used_at=is.null`, { used_at: now });
    return;
  }
  lsSet('tf_portal_tokens', lsGet<PortalToken>('tf_portal_tokens').map(t =>
    t.id === tokenId && !t.usedAt ? { ...t, usedAt: now } : t,
  ));
}
