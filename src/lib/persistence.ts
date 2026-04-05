/**
 * persistence.ts
 *
 * localStorage helpers for WorkflowContext and TaxYearContext.
 * Handles JSON serialization with automatic Date revival so stored
 * ISO strings are transparently converted back to Date objects.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function reviveDates(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    return new Date(value);
  }
  return value;
}

export const STORAGE_KEYS = {
  TAX_YEAR:  'taxgen_year_v1',
  WORKFLOW:  'taxgen_workflow_v1',
} as const;

export function saveToStorage(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[taxgen] Failed to save to localStorage:', e);
  }
}

export function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw, reviveDates) as T;
  } catch (e) {
    console.warn('[taxgen] Failed to load from localStorage:', e);
    return null;
  }
}

export function clearStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (_e) {
    // ignore
  }
}
