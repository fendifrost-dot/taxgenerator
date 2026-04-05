/**
 * preparerSettings.ts
 *
 * Persistent preparer profile: PTIN, firm info, signature block.
 * Stored in localStorage under key 'tf_preparer_settings'.
 * Used by audit trail documents, Form 8879 blocks, and cover pages.
 *
 * IRS requirements for paid preparers (IRC §6109, Rev. Proc. 2010-1):
 *   - PTIN required on all federal returns prepared for compensation since 2011
 *   - PTIN format: P followed by 8 digits (e.g. P12345678)
 *   - Firm EIN required when preparing as part of a firm
 *   - Signature required on paper returns; PIN allowed for e-file
 */

const STORAGE_KEY = 'tf_preparer_settings';

export interface PreparerSettings {
  preparerName: string;       // Full legal name
  ptin: string;               // IRS PTIN: P########
  firmName: string;           // Firm / company name (blank if sole proprietor)
  firmEIN: string;            // Firm EIN: XX-XXXXXXX (blank if sole proprietor)
  firmAddress: string;        // Street address
  firmCity: string;
  firmState: string;          // 2-letter state code
  firmZip: string;
  firmPhone: string;
  firmEmail: string;
  efin: string;               // Electronic Filing ID Number (optional — for MeF)
  cpaLicenseNumber: string;   // State CPA license (optional)
  cpaLicenseState: string;
  eaEnrollmentNumber: string; // Enrolled Agent number (optional)
  signatureBlock: string;     // Custom text for signature block on docs
  updatedAt: string;          // ISO string
}

export const DEFAULT_PREPARER_SETTINGS: PreparerSettings = {
  preparerName: '',
  ptin: '',
  firmName: '',
  firmEIN: '',
  firmAddress: '',
  firmCity: '',
  firmState: '',
  firmZip: '',
  firmPhone: '',
  firmEmail: '',
  efin: '',
  cpaLicenseNumber: '',
  cpaLicenseState: '',
  eaEnrollmentNumber: '',
  signatureBlock: '',
  updatedAt: new Date().toISOString(),
};

export function loadPreparerSettings(): PreparerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREPARER_SETTINGS };
    return { ...DEFAULT_PREPARER_SETTINGS, ...JSON.parse(raw) as Partial<PreparerSettings> };
  } catch {
    return { ...DEFAULT_PREPARER_SETTINGS };
  }
}

export function savePreparerSettings(settings: PreparerSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...settings,
    updatedAt: new Date().toISOString(),
  }));
}

/** Returns a formatted signature block string for documents */
export function buildSignatureBlock(s: PreparerSettings): string {
  if (!s.preparerName) return '';
  const lines: string[] = [];
  lines.push(s.preparerName);
  if (s.ptin) lines.push(`PTIN: ${s.ptin}`);
  if (s.firmName) lines.push(s.firmName);
  if (s.firmAddress) {
    lines.push(s.firmAddress);
    lines.push(`${s.firmCity}, ${s.firmState} ${s.firmZip}`.trim());
  }
  if (s.firmPhone) lines.push(`Tel: ${s.firmPhone}`);
  if (s.firmEmail) lines.push(s.firmEmail);
  if (s.cpaLicenseNumber) lines.push(`CPA License: ${s.cpaLicenseState} #${s.cpaLicenseNumber}`);
  if (s.eaEnrollmentNumber) lines.push(`EA Enrollment: ${s.eaEnrollmentNumber}`);
  return lines.join('\n');
}

/** Validates a PTIN — must be P followed by 8 digits */
export function validatePTIN(ptin: string): { valid: boolean; message: string } {
  if (!ptin) return { valid: false, message: 'PTIN is required for paid preparers' };
  if (!/^P\d{8}$/i.test(ptin.trim())) {
    return { valid: false, message: 'PTIN must be P followed by 8 digits (e.g., P12345678)' };
  }
  return { valid: true, message: '' };
}
