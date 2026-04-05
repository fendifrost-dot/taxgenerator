/**
 * cureOptions.ts
 * ──────────────────────────────────────────────────────────────────────────
 * For every discrepancy type, this module generates a set of CureOptions —
 * concrete steps the preparer or taxpayer can take to resolve the anomaly,
 * ranked by risk and with IRS authority citations where applicable.
 */

import { Discrepancy } from '@/types/tax';

// ===== TYPES =============================================================

export type CureRisk = 'low' | 'medium' | 'high' | 'critical';

export interface CureStep {
  order: number;
  action: string;
  detail?: string;
}

export interface CureOption {
  id: string;
  title: string;
  summary: string;
  risk: CureRisk;
  recommended: boolean;
  steps: CureStep[];
  irsAuthority?: string;      // Pub, Rev. Proc., Reg., or Code section
  estimatedTime?: string;     // e.g. "1–2 days"
  caveats?: string[];
}

// ===== HELPERS ===========================================================

function option(
  id: string,
  title: string,
  summary: string,
  risk: CureRisk,
  recommended: boolean,
  steps: CureStep[],
  opts?: { irsAuthority?: string; estimatedTime?: string; caveats?: string[] }
): CureOption {
  return { id, title, summary, risk, recommended, steps, ...opts };
}

function fmt(dollar: string | undefined): string {
  if (!dollar) return 'the stated amount';
  return dollar.startsWith('$') ? dollar : `$${dollar}`;
}

// ===== GENERATORS BY DISCREPANCY TYPE ===================================

function curesForAmountMismatch(disc: Discrepancy): CureOption[] {
  const s1 = fmt(disc.source1Value);
  const s2 = disc.source2Value ? fmt(disc.source2Value) : null;

  return [
    option(
      'amount-obtain-corrected',
      'Obtain a Corrected Information Return',
      `Request a corrected 1099 or W-2 from the issuer if ${s1} vs ${s2 ?? 'your records'} reflects their error.`,
      'low',
      true,
      [
        { order: 1, action: 'Contact the payer/employer in writing', detail: 'Request a corrected Form 1099 (or W-2 if applicable). Issuers must furnish corrections within 30 days of the request per Reg. §1.6041-7.' },
        { order: 2, action: 'Obtain corrected form and upload to Documents tab' },
        { order: 3, action: 'Re-run the document parse to update income reconciliation' },
      ],
      { irsAuthority: 'Treas. Reg. §1.6041-7; IRS Pub. 1220', estimatedTime: '1–4 weeks' }
    ),
    option(
      'amount-accept-higher',
      `Accept the Higher Amount (${s1})`,
      'Use the larger figure on the return. Conservative — eliminates underreporting risk, may increase tax.',
      'low',
      false,
      [
        { order: 1, action: 'Select "Use Source 1" in the Resolve dropdown above' },
        { order: 2, action: 'Confirm income reconciliation matches the accepted figure' },
        { order: 3, action: 'Document the rationale in the preparer workpapers' },
      ],
      { irsAuthority: 'IRC §61 (all income from whatever source derived)', estimatedTime: 'Immediate' }
    ),
    ...(s2 ? [option(
      'amount-accept-lower',
      `Accept the Lower Amount (${s2})`,
      'Use the smaller figure if you have documentation proving it is correct. Requires written substantiation.',
      'medium',
      false,
      [
        { order: 1, action: 'Assemble substantiating documentation (bank statements, contracts, receipts)' },
        { order: 2, action: 'Attach a brief reconciliation note to the workpapers explaining the difference' },
        { order: 3, action: 'Select "Use Source 2" in the Resolve dropdown' },
      ],
      {
        irsAuthority: 'IRC §6001; IRS Pub. 17 (Recordkeeping)',
        estimatedTime: '1–2 days',
        caveats: ['A CP2000 notice is likely if the IRS receives a 1099 for the higher figure; be prepared to respond with the substantiation.'],
      }
    )] : []),
    option(
      'amount-manual-reconcile',
      'Split / Partial Reconciliation (Manual Entry)',
      'If only part of the discrepancy is explainable (returns, refunds, timing), enter a reconciled figure manually.',
      'medium',
      false,
      [
        { order: 1, action: 'Identify the source of the difference (timing, refunds, currency conversion, fees)' },
        { order: 2, action: 'Prepare a reconciliation schedule showing gross → net calculation' },
        { order: 3, action: 'Select "Manual Entry" in the Resolve dropdown and enter the reconciled value' },
        { order: 4, action: 'Attach the reconciliation schedule to the workpapers' },
      ],
      { irsAuthority: 'IRS Pub. 334 (Tax Guide for Small Business)', estimatedTime: '2–4 hours' }
    ),
  ];
}

function curesForMissingDoc(disc: Discrepancy): CureOption[] {
  const docName = disc.source1Value || 'the missing document';
  return [
    option(
      'missing-request-issuer',
      'Request Document from Issuer',
      `Contact the payer to obtain ${docName}. All payers must furnish copies by January 31.`,
      'low',
      true,
      [
        { order: 1, action: 'Contact the issuer by phone or in writing', detail: 'Employers and payers must furnish Form W-2 or 1099 to the recipient by January 31. If not received by February 15, you may contact the IRS.' },
        { order: 2, action: 'If unresponsive by mid-February, call IRS at 1-800-829-1040 for a Wage & Income transcript' },
        { order: 3, action: 'Upload the document once received and re-parse' },
      ],
      { irsAuthority: 'IRC §6041(d); IRS Pub. 505', estimatedTime: '1–3 weeks' }
    ),
    option(
      'missing-irs-transcript',
      'Obtain IRS Wage & Income Transcript',
      'Download the transcript directly from IRS.gov — shows all 1099/W-2 data reported to the IRS.',
      'low',
      false,
      [
        { order: 1, action: 'Go to IRS.gov → Tools → Get Your Tax Records → Get Transcript Online' },
        { order: 2, action: 'Request a "Wage and Income Transcript" for the applicable tax year' },
        { order: 3, action: 'Cross-reference each line item with uploaded documents' },
        { order: 4, action: 'Upload transcript to Documents tab as supporting evidence' },
      ],
      { irsAuthority: 'IRS.gov; IRC §6103(e)', estimatedTime: 'Immediate (online) or 5–10 days (mail)' }
    ),
    option(
      'missing-reconstruct',
      'Reconstruct from Bank / Brokerage Records',
      'If the document is unavailable, reconstruct the income using bank statements, brokerage confirmations, or contracts.',
      'medium',
      false,
      [
        { order: 1, action: 'Pull bank statements or brokerage records for the period' },
        { order: 2, action: 'Identify all deposits or transactions attributable to the missing source' },
        { order: 3, action: 'Prepare a reconstruction schedule (date, description, amount)' },
        { order: 4, action: 'Enter as a Direct Entry reconciliation item with note referencing the reconstruction method' },
      ],
      {
        irsAuthority: 'Rev. Proc. 2001-10; IRS Pub. 583 (Starting a Business and Keeping Records)',
        estimatedTime: '4–8 hours',
        caveats: ['Reconstruction is defensible but increases audit scrutiny. Retain all source records used.'],
      }
    ),
    option(
      'missing-file-extension',
      'File Extension to Allow Time to Gather',
      `If the filing deadline is approaching and ${docName} cannot be obtained, file Form 4868 for a 6-month extension.`,
      'low',
      false,
      [
        { order: 1, action: 'Estimate tax liability using available documents' },
        { order: 2, action: 'Pay estimated balance due with the extension request to avoid penalties' },
        { order: 3, action: 'File Form 4868 by the original due date (typically April 15)' },
        { order: 4, action: 'Obtain the missing document and complete the return before October 15' },
      ],
      { irsAuthority: 'IRC §6081; IRS Form 4868', estimatedTime: '30 minutes to file', caveats: ['Extension of time to FILE, not to PAY. Unpaid tax accrues interest and failure-to-pay penalty.'] }
    ),
  ];
}

function curesForUnmatchedDeposit(disc: Discrepancy): CureOption[] {
  return [
    option(
      'deposit-match-existing',
      'Match to an Existing Income Source',
      'Identify which 1099 or invoice the deposit belongs to and link it in the Reconciliation tab.',
      'low',
      true,
      [
        { order: 1, action: 'Open the Reconciliation tab and search for payers with close amounts or dates' },
        { order: 2, action: 'Check for timing differences — payment may have landed in a different period' },
        { order: 3, action: 'Select the matching income source and mark as reconciled' },
      ],
      { estimatedTime: '15–30 minutes' }
    ),
    option(
      'deposit-new-income-source',
      'Create a New Income Entry',
      'If this deposit has no corresponding 1099, it may be unreported income. Create a direct-entry income record.',
      'medium',
      false,
      [
        { order: 1, action: 'Identify the source of the deposit (client, platform, personal transfer, loan repayment, etc.)' },
        { order: 2, action: 'If income: create a Direct Entry reconciliation record in the Reconciliation tab' },
        { order: 3, action: 'If non-taxable (gift, reimbursement, loan): document with written explanation and retain proof' },
      ],
      {
        irsAuthority: 'IRC §61; IRS Pub. 525 (Taxable and Nontaxable Income)',
        estimatedTime: '30–60 minutes',
        caveats: ['The IRS "bank deposit method" is a recognized indirect proof of income method. Unexplained deposits are presumed taxable income.'],
      }
    ),
    option(
      'deposit-non-taxable',
      'Document as Non-Taxable Transfer',
      'If the deposit is a loan, gift, insurance proceeds, or inter-account transfer, document and exclude from income.',
      'low',
      false,
      [
        { order: 1, action: 'Obtain the transfer confirmation, loan agreement, or gift letter' },
        { order: 2, action: 'Attach to the workpapers with a memo explaining non-taxable status' },
        { order: 3, action: 'Mark the reconciliation entry as excluded with the non-taxable reason noted' },
      ],
      { irsAuthority: 'IRC §§102 (gifts), 108 (debt exclusions), 104 (damages)', estimatedTime: '1–2 hours' }
    ),
  ];
}

function curesForYearMismatch(disc: Discrepancy): CureOption[] {
  return [
    option(
      'year-confirm-correct',
      'Confirm Document Belongs to This Tax Year',
      'If the document is dated in a different year but the income was earned in the current year, confirm and proceed.',
      'low',
      true,
      [
        { order: 1, action: 'Verify that the taxable event (compensation earned, interest accrued, etc.) occurred in the current tax year' },
        { order: 2, action: 'Check the "Year Mismatch Confirmed" checkbox on the document record' },
        { order: 3, action: 'Add a preparer note explaining the confirmation rationale' },
      ],
      { irsAuthority: 'IRC §451 (year of inclusion — cash method); Treas. Reg. §1.451-1', estimatedTime: '10 minutes' }
    ),
    option(
      'year-move-to-correct-year',
      'Assign Document to Correct Tax Year',
      'If the document belongs to a different tax year, remove it from this return and assign it to the correct year.',
      'low',
      false,
      [
        { order: 1, action: 'Remove the document from the current year workflow via the Documents tab' },
        { order: 2, action: 'Open the correct tax year workflow (or create it in Year Configuration)' },
        { order: 3, action: 'Re-upload or reassign the document to the correct year' },
      ],
      { estimatedTime: '15 minutes' }
    ),
    option(
      'year-amend-prior',
      'File an Amended Prior-Year Return',
      'If income or deductions were omitted from a prior year, file Form 1040-X for that year rather than including it here.',
      'medium',
      false,
      [
        { order: 1, action: 'Determine which year the item correctly belongs to' },
        { order: 2, action: 'Navigate to the Amendments section and start a new amendment for that year' },
        { order: 3, action: 'Complete the Form 1040-X using the amendment wizard' },
      ],
      {
        irsAuthority: 'IRC §6511 (3-year statute of limitations for refund claims); Form 1040-X instructions',
        estimatedTime: '2–4 hours',
        caveats: ['Refund claims must be filed within 3 years of the original due date or 2 years from payment, whichever is later.'],
      }
    ),
  ];
}

function curesForSSN(disc: Discrepancy): CureOption[] {
  return [
    option(
      'ssn-verify-typo',
      'Correct a Payer Transcription Error',
      'If the SSN discrepancy is a payer typo, request a corrected information return immediately — the IRS matches by SSN.',
      'high',
      true,
      [
        { order: 1, action: 'Contact the payer in writing immediately with the correct SSN' },
        { order: 2, action: 'Request a corrected Form 1099 or W-2 (with the correct SSN shown)' },
        { order: 3, action: 'File the return with the correct SSN; retain the corrected form' },
      ],
      {
        irsAuthority: 'Treas. Reg. §301.6109-1; IRC §6109',
        estimatedTime: '2–4 weeks',
        caveats: ['An SSN mismatch causes automatic IRS matching failure. Do NOT file with a mismatched SSN.'],
      }
    ),
    option(
      'ssn-itin-check',
      'Confirm ITIN vs SSN Usage',
      'If the taxpayer has both an ITIN and an SSN, the SSN always takes precedence once issued. Correct all documents.',
      'high',
      false,
      [
        { order: 1, action: 'Confirm current Social Security card number vs ITIN' },
        { order: 2, action: 'Notify all payers to use the SSN going forward' },
        { order: 3, action: 'File Form 8822 to update address records if needed' },
        { order: 4, action: 'Request revocation of ITIN per IRS instructions (ITINs expire when SSN is issued)' },
      ],
      { irsAuthority: 'IRS Pub. 1915; IRC §6109(d)', estimatedTime: '1–2 weeks' }
    ),
  ];
}

function curesForName(disc: Discrepancy): CureOption[] {
  return [
    option(
      'name-legal-name',
      'Use Legal Name Matching SSA Records',
      'The IRS matches W-2/1099 data to SSA records. The name on the return must match the Social Security card exactly.',
      'low',
      true,
      [
        { order: 1, action: 'Confirm the exact legal name as it appears on the Social Security card' },
        { order: 2, action: 'Update the return to use the SSA name (hyphenations, middle name initials matter)' },
        { order: 3, action: 'Request corrected 1099/W-2 from payer if their name field is wrong' },
      ],
      { irsAuthority: 'IRS Form 1040 Instructions (Name and Address section)', estimatedTime: 'Immediate' }
    ),
    option(
      'name-name-change',
      'File Form SS-5 for Name Change Update',
      'If name changed due to marriage/divorce and SSA records are not updated, file SS-5 before filing the return.',
      'medium',
      false,
      [
        { order: 1, action: 'File Form SS-5 (Application for Social Security Card) with SSA to update legal name' },
        { order: 2, action: 'Wait for SSA to update records (typically 2 weeks before IRS receives update)' },
        { order: 3, action: 'File the return with the new legal name after SSA update confirmed' },
      ],
      { irsAuthority: 'IRS Pub. 4012; SSA Form SS-5', estimatedTime: '2–6 weeks', caveats: ['Filing before SSA updates can cause e-file rejection. Consider paper filing with an explanation if deadline is imminent.'] }
    ),
  ];
}

function curesForAddress(disc: Discrepancy): CureOption[] {
  return [
    option(
      'address-current',
      'Use Current Mailing Address',
      'The return address is for IRS correspondence only — use whatever address the taxpayer currently receives mail at.',
      'low',
      true,
      [
        { order: 1, action: 'Confirm the taxpayer\'s current mailing address' },
        { order: 2, action: 'Use current address on the return regardless of what appeared on prior documents' },
        { order: 3, action: 'File Form 8822 to officially notify the IRS of the address change' },
      ],
      { irsAuthority: 'IRS Form 8822 (Change of Address)', estimatedTime: 'Immediate' }
    ),
  ];
}

function curesForDate(disc: Discrepancy): CureOption[] {
  return [
    option(
      'date-accrual-vs-cash',
      'Confirm Accounting Method (Cash vs Accrual)',
      'Date discrepancies often reflect timing differences between when income was earned vs received.',
      'low',
      true,
      [
        { order: 1, action: 'Confirm the taxpayer\'s accounting method (most individuals use cash method)' },
        { order: 2, action: 'Under cash method: include income in the year actually or constructively received' },
        { order: 3, action: 'Document the correct year of inclusion and resolve the discrepancy accordingly' },
      ],
      { irsAuthority: 'IRC §446; Treas. Reg. §1.446-1; IRS Pub. 538', estimatedTime: '1–2 hours' }
    ),
    option(
      'date-constructive-receipt',
      'Apply Constructive Receipt Rules',
      'Income available without substantial restriction is taxable when made available, not when cashed.',
      'medium',
      false,
      [
        { order: 1, action: 'Determine when the income was "made available" to the taxpayer (check date, wire date, etc.)' },
        { order: 2, action: 'If available in prior year but received in current year, it belongs in the prior year' },
        { order: 3, action: 'Amend the prior year return if needed (see Amendments section)' },
      ],
      { irsAuthority: 'Treas. Reg. §1.451-2 (constructive receipt)', estimatedTime: '2–4 hours' }
    ),
  ];
}

// ===== MAIN EXPORT =======================================================

/**
 * Given a discrepancy, returns an ordered list of cure options from safest
 * to riskiest. The first option marked `recommended: true` is the default
 * suggestion surfaced in the UI.
 */
export function generateCureOptions(disc: Discrepancy): CureOption[] {
  switch (disc.type) {
    case 'amount':
      return curesForAmountMismatch(disc);
    case 'missing_doc':
      return curesForMissingDoc(disc);
    case 'unmatched_deposit':
      return curesForUnmatchedDeposit(disc);
    case 'year_mismatch':
      return curesForYearMismatch(disc);
    case 'ssn':
      return curesForSSN(disc);
    case 'name':
      return curesForName(disc);
    case 'address':
      return curesForAddress(disc);
    case 'date':
      return curesForDate(disc);
    default:
      return [
        option(
          'generic-review',
          'Review and Confirm',
          'Manually review both data sources and select the correct value.',
          'medium',
          true,
          [
            { order: 1, action: 'Compare both source values carefully' },
            { order: 2, action: 'Obtain additional documentation if needed' },
            { order: 3, action: 'Select the appropriate resolution in the Resolve dropdown' },
          ]
        ),
      ];
  }
}

export const RISK_CONFIG: Record<CureRisk, { label: string; color: string; bg: string; border: string }> = {
  low:      { label: 'Low Risk',      color: 'text-status-success',  bg: 'bg-status-success/10',  border: 'border-status-success/30' },
  medium:   { label: 'Medium Risk',   color: 'text-status-warning',  bg: 'bg-status-warning/10',  border: 'border-status-warning/30' },
  high:     { label: 'High Risk',     color: 'text-status-error',    bg: 'bg-status-error/10',    border: 'border-status-error/30'   },
  critical: { label: 'Critical Risk', color: 'text-status-error',    bg: 'bg-status-error/20',    border: 'border-status-error/50'   },
};
