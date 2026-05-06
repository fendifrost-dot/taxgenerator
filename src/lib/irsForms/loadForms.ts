import type { FormDefinition } from '@/lib/irsForms/types';
import { access, readFile } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';

export const SUPPORTED_FORMS = [
  '1120s',
  '1125a',
  '1125e',
  '1120ssk',
  '2553',
  '1065',
  '1065sk1',
  '1120',
  '1040',
  '1040s1',
  '1040s2',
  '1040sc',
  '1040sse',
  '8959',
] as const;

export type SupportedFormId = (typeof SUPPORTED_FORMS)[number];

export type TaxYear = 2024 | 2025;

const BASE_PATH = '/irs-forms';

function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

function formsDir(): string {
  return path.join(process.cwd(), 'public', 'irs-forms');
}

async function fileReadable(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a form ID + year to the actual filename. Tries year-specific
 *  first ({formId}_{year}.pdf), falls back to legacy {formId}.pdf. */
async function resolveFilename(
  formId: SupportedFormId,
  year: TaxYear,
  ext: 'pdf' | 'fields.json',
): Promise<string> {
  const yearSpecific = `${formId}_${year}.${ext}`;
  const legacy = `${formId}.${ext}`;

  if (isNodeRuntime()) {
    const dir = formsDir();
    const ys = path.join(dir, yearSpecific);
    if (await fileReadable(ys)) return yearSpecific;
    return legacy;
  }

  const probe = await fetch(`${BASE_PATH}/${yearSpecific}`, { method: 'HEAD' });
  if (probe.ok) return yearSpecific;
  return legacy;
}

export async function loadFormDefinition(formId: SupportedFormId, year: TaxYear): Promise<FormDefinition> {
  const filename = await resolveFilename(formId, year, 'fields.json');

  if (isNodeRuntime()) {
    const full = path.join(formsDir(), filename);
    const raw = await readFile(full, 'utf8');
    return JSON.parse(raw) as FormDefinition;
  }

  const res = await fetch(`${BASE_PATH}/${filename}`);
  if (!res.ok) throw new Error(`Failed to load field definitions for ${formId} ${year}: ${res.status}`);
  return (await res.json()) as FormDefinition;
}

export async function loadFormPdfBytes(formId: SupportedFormId, year: TaxYear): Promise<Uint8Array> {
  const filename = await resolveFilename(formId, year, 'pdf');

  if (isNodeRuntime()) {
    const full = path.join(formsDir(), filename);
    return new Uint8Array(await readFile(full));
  }

  const res = await fetch(`${BASE_PATH}/${filename}`);
  if (!res.ok) throw new Error(`Failed to load PDF for ${formId} ${year}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadForm(formId: SupportedFormId, year: TaxYear) {
  const [definition, pdfBytes] = await Promise.all([
    loadFormDefinition(formId, year),
    loadFormPdfBytes(formId, year),
  ]);
  return { definition, pdfBytes };
}
