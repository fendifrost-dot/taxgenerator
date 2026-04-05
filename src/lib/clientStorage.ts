/**
 * clientStorage.ts
 *
 * CRUD for Clients and ClientReturns.
 * Uses Supabase REST when configured; falls back to localStorage for local dev.
 *
 * localStorage keys: tf_clients, tf_returns
 */

import { Client, ClientReturn, OptimizationQuestion, OptimizationResponse } from '@/types/client';
import {
  isSupabaseConfigured,
  dbSelect,
  dbInsert,
  dbUpdate,
  getCurrentUserId,
} from './supabaseClient';

// ─── localStorage helpers ─────────────────────────────────────────────────────

function lsGet<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]; }
  catch { return []; }
}
function lsSet<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}
function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── DB column ↔ TS field normalisation ──────────────────────────────────────
// Supabase returns snake_case; we store camelCase locally.

function str(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) { if (row[k]) return String(row[k]); }
  return undefined;
}
function num(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) { if (row[k] != null) return Number(row[k]); }
  return undefined;
}

function rowToClient(row: Record<string, unknown>): Client {
  return {
    id:          String(row['id']),
    preparerId:  String(row['preparer_id'] ?? row['preparerId'] ?? ''),
    firstName:   String(row['first_name']  ?? row['firstName']  ?? ''),
    lastName:    String(row['last_name']   ?? row['lastName']   ?? ''),
    email:       str(row, 'email'),
    phone:       str(row, 'phone'),
    ssnLast4:    str(row, 'ssn_last4', 'ssnLast4'),
    // Extended fields
    dateOfBirth:      str(row, 'date_of_birth', 'dateOfBirth'),
    filingStatus:     str(row, 'filing_status', 'filingStatus') as Client['filingStatus'],
    numDependents:    num(row, 'num_dependents', 'numDependents'),
    occupation:       str(row, 'occupation'),
    streetAddress:    str(row, 'street_address', 'streetAddress'),
    city:             str(row, 'city'),
    state:            str(row, 'state'),
    zip:              str(row, 'zip'),
    spouseFirstName:  str(row, 'spouse_first_name', 'spouseFirstName'),
    spouseLastName:   str(row, 'spouse_last_name', 'spouseLastName'),
    spouseSsnLast4:   str(row, 'spouse_ssn_last4', 'spouseSsnLast4'),
    spouseDateOfBirth: str(row, 'spouse_date_of_birth', 'spouseDateOfBirth'),
    spouseOccupation: str(row, 'spouse_occupation', 'spouseOccupation'),
    engagementNotes:  str(row, 'engagement_notes', 'engagementNotes'),
    referralSource:   str(row, 'referral_source', 'referralSource'),
    createdAt:   String(row['created_at'] ?? row['createdAt'] ?? new Date().toISOString()),
    updatedAt:   String(row['updated_at'] ?? row['updatedAt'] ?? new Date().toISOString()),
  };
}

function rowToReturn(row: Record<string, unknown>): ClientReturn {
  const parseJSON = <T>(v: unknown, fallback: T): T => {
    if (v == null) return fallback;
    if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
    return v as T;
  };
  return {
    id:                     String(row['id']),
    clientId:               String(row['client_id']  ?? row['clientId']  ?? ''),
    taxYear:                Number(row['tax_year']   ?? row['taxYear']   ?? 0),
    status:                 (row['status'] as ClientReturn['status']) ?? 'draft',
    workflowState:          parseJSON<Record<string, unknown>>(row['workflow_state']         ?? row['workflowState'],         {}),
    optimizationQuestions:  parseJSON<OptimizationQuestion[]>(row['optimization_questions'] ?? row['optimizationQuestions'], []),
    optimizationResponses:  parseJSON<Record<string, OptimizationResponse>>(row['optimization_responses'] ?? row['optimizationResponses'], {}),
    createdAt:              String(row['created_at'] ?? row['createdAt'] ?? new Date().toISOString()),
    updatedAt:              String(row['updated_at'] ?? row['updatedAt'] ?? new Date().toISOString()),
  };
}

// ─── Client CRUD ──────────────────────────────────────────────────────────────

export async function listClients(): Promise<Client[]> {
  if (isSupabaseConfigured()) {
    const rows = await dbSelect<Record<string, unknown>>(
      'clients', 'select=*&order=last_name.asc,first_name.asc',
    );
    return rows.map(rowToClient);
  }
  return lsGet<Client>('tf_clients');
}

export async function getClient(id: string): Promise<Client | null> {
  if (isSupabaseConfigured()) {
    const rows = await dbSelect<Record<string, unknown>>('clients', `select=*&id=eq.${id}`);
    return rows[0] ? rowToClient(rows[0]) : null;
  }
  return lsGet<Client>('tf_clients').find(c => c.id === id) ?? null;
}

export async function createClient(
  input: Omit<Client, 'id' | 'preparerId' | 'createdAt' | 'updatedAt'>,
): Promise<Client> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const preparerId = getCurrentUserId();
    if (!preparerId) throw new Error('Not authenticated.');
    const row = await dbInsert<Record<string, unknown>>('clients', {
      preparer_id: preparerId,
      first_name:  input.firstName,
      last_name:   input.lastName,
      email:       input.email ?? null,
      phone:       input.phone ?? null,
      ssn_last4:   input.ssnLast4 ?? null,
    });
    return rowToClient(row);
  }
  const client: Client = {
    ...input,
    id: `c_${uid()}`,
    preparerId: 'local',
    createdAt: now,
    updatedAt: now,
  };
  lsSet('tf_clients', [...lsGet<Client>('tf_clients'), client]);
  return client;
}

export async function updateClient(id: string, input: Partial<Client>): Promise<void> {
  if (isSupabaseConfigured()) {
    const update: Record<string, unknown> = {};
    if (input.firstName       !== undefined) update['first_name']          = input.firstName;
    if (input.lastName        !== undefined) update['last_name']           = input.lastName;
    if (input.email           !== undefined) update['email']               = input.email;
    if (input.phone           !== undefined) update['phone']               = input.phone;
    if (input.ssnLast4        !== undefined) update['ssn_last4']           = input.ssnLast4;
    if (input.dateOfBirth     !== undefined) update['date_of_birth']       = input.dateOfBirth;
    if (input.filingStatus    !== undefined) update['filing_status']       = input.filingStatus;
    if (input.numDependents   !== undefined) update['num_dependents']      = input.numDependents;
    if (input.occupation      !== undefined) update['occupation']          = input.occupation;
    if (input.streetAddress   !== undefined) update['street_address']      = input.streetAddress;
    if (input.city            !== undefined) update['city']                = input.city;
    if (input.state           !== undefined) update['state']               = input.state;
    if (input.zip             !== undefined) update['zip']                 = input.zip;
    if (input.spouseFirstName !== undefined) update['spouse_first_name']   = input.spouseFirstName;
    if (input.spouseLastName  !== undefined) update['spouse_last_name']    = input.spouseLastName;
    if (input.spouseSsnLast4  !== undefined) update['spouse_ssn_last4']    = input.spouseSsnLast4;
    if (input.spouseDateOfBirth !== undefined) update['spouse_date_of_birth'] = input.spouseDateOfBirth;
    if (input.spouseOccupation  !== undefined) update['spouse_occupation']  = input.spouseOccupation;
    if (input.engagementNotes   !== undefined) update['engagement_notes']   = input.engagementNotes;
    if (input.referralSource    !== undefined) update['referral_source']    = input.referralSource;
    await dbUpdate('clients', `id=eq.${id}`, update);
    return;
  }
  lsSet('tf_clients', lsGet<Client>('tf_clients').map(c =>
    c.id === id ? { ...c, ...input, updatedAt: new Date().toISOString() } : c,
  ));
}

// ─── Return CRUD ──────────────────────────────────────────────────────────────

export async function listReturns(clientId: string): Promise<ClientReturn[]> {
  if (isSupabaseConfigured()) {
    const rows = await dbSelect<Record<string, unknown>>(
      'tax_returns', `select=*&client_id=eq.${clientId}&order=tax_year.desc`,
    );
    return rows.map(rowToReturn);
  }
  return lsGet<ClientReturn>('tf_returns').filter(r => r.clientId === clientId);
}

export async function getReturn(returnId: string): Promise<ClientReturn | null> {
  if (isSupabaseConfigured()) {
    const rows = await dbSelect<Record<string, unknown>>('tax_returns', `select=*&id=eq.${returnId}`);
    return rows[0] ? rowToReturn(rows[0]) : null;
  }
  return lsGet<ClientReturn>('tf_returns').find(r => r.id === returnId) ?? null;
}

export async function getOrCreateReturn(clientId: string, taxYear: number): Promise<ClientReturn> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const rows = await dbSelect<Record<string, unknown>>(
      'tax_returns', `select=*&client_id=eq.${clientId}&tax_year=eq.${taxYear}`,
    );
    if (rows[0]) return rowToReturn(rows[0]);
    const row = await dbInsert<Record<string, unknown>>('tax_returns', {
      client_id:              clientId,
      tax_year:               taxYear,
      status:                 'draft',
      workflow_state:         {},
      optimization_questions: [],
      optimization_responses: {},
    });
    return rowToReturn(row);
  }
  const existing = lsGet<ClientReturn>('tf_returns')
    .find(r => r.clientId === clientId && r.taxYear === taxYear);
  if (existing) return existing;
  const newReturn: ClientReturn = {
    id: `r_${uid()}`,
    clientId,
    taxYear,
    status: 'draft',
    workflowState: {},
    optimizationQuestions: [],
    optimizationResponses: {},
    createdAt: now,
    updatedAt: now,
  };
  lsSet('tf_returns', [...lsGet<ClientReturn>('tf_returns'), newReturn]);
  return newReturn;
}

export async function saveWorkflowState(
  returnId: string,
  state: Record<string, unknown>,
): Promise<void> {
  if (isSupabaseConfigured()) {
    await dbUpdate('tax_returns', `id=eq.${returnId}`, { workflow_state: state });
    return;
  }
  lsSet('tf_returns', lsGet<ClientReturn>('tf_returns').map(r =>
    r.id === returnId
      ? { ...r, workflowState: state, updatedAt: new Date().toISOString() }
      : r,
  ));
}

export async function saveOptimizationQuestions(
  returnId: string,
  questions: OptimizationQuestion[],
): Promise<void> {
  if (isSupabaseConfigured()) {
    await dbUpdate('tax_returns', `id=eq.${returnId}`, {
      optimization_questions: questions,
      status: 'questionnaire_sent',
    });
    return;
  }
  lsSet('tf_returns', lsGet<ClientReturn>('tf_returns').map(r =>
    r.id === returnId
      ? { ...r, optimizationQuestions: questions, status: 'questionnaire_sent' as const, updatedAt: new Date().toISOString() }
      : r,
  ));
}

export async function saveOptimizationResponses(
  returnId: string,
  responses: Record<string, OptimizationResponse>,
): Promise<void> {
  if (isSupabaseConfigured()) {
    await dbUpdate('tax_returns', `id=eq.${returnId}`, { optimization_responses: responses });
    return;
  }
  lsSet('tf_returns', lsGet<ClientReturn>('tf_returns').map(r =>
    r.id === returnId
      ? { ...r, optimizationResponses: responses, updatedAt: new Date().toISOString() }
      : r,
  ));
}

export async function updateReturnStatus(
  returnId: string,
  status: ClientReturn['status'],
): Promise<void> {
  if (isSupabaseConfigured()) {
    await dbUpdate('tax_returns', `id=eq.${returnId}`, { status });
    return;
  }
  lsSet('tf_returns', lsGet<ClientReturn>('tf_returns').map(r =>
    r.id === returnId ? { ...r, status, updatedAt: new Date().toISOString() } : r,
  ));
}
