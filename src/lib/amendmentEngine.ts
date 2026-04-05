/**
 * amendmentEngine.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Form 1040-X amendment data model, eligibility rules, deadline calculator,
 * and amendment package builder.
 *
 * Supports tax years 2020–2024 (5-year window per user request).
 * Note: The IRS 3-year refund statute applies to REFUND claims. You may
 * still file 1040-X beyond 3 years to correct the record or pay additional
 * tax owed (no refund will be issued after the statute).
 *
 * Key statute: IRC §6511 (refund claims — 3 years from filing or 2 years
 * from payment, whichever is later). This module enforces the 5-year
 * window requested but flags years outside the 3-year refund window.
 */

export type AmendmentYear = 2020 | 2021 | 2022 | 2023 | 2024;

export type AmendmentStatus =
  | 'draft'
  | 'complete'
  | 'filed'
  | 'irs_processing'
  | 'accepted'
  | 'rejected';

export type AmendmentChangeType =
  | 'income_addition'       // Added income that was missed
  | 'income_removal'        // Removed income that was incorrectly included
  | 'income_correction'     // Changed amount of existing income line
  | 'deduction_addition'    // Claimed a new deduction
  | 'deduction_removal'     // Removed an erroneous deduction
  | 'deduction_correction'  // Changed deduction amount
  | 'credit_addition'       // Claimed a new credit
  | 'credit_removal'        // Removed an erroneous credit
  | 'credit_correction'     // Changed credit amount
  | 'filing_status_change'  // Changed from single → MFJ, etc.
  | 'exemption_change'      // Dependents added/removed
  | 'withholding_correction'// Corrected withholding amount
  | 'other';

export type FilingStatus =
  | 'single'
  | 'married_filing_jointly'
  | 'married_filing_separately'
  | 'head_of_household'
  | 'qualifying_surviving_spouse';

export interface AmendmentChange {
  id: string;
  changeType: AmendmentChangeType;
  formLine: string;          // e.g. "1040 Line 1z", "Schedule C Line 28"
  description: string;       // Human-readable description
  originalValue: number;
  amendedValue: number;
  difference: number;        // amendedValue - originalValue
  reason: string;            // Explanation for this specific change
  supportingDocs: string[];  // Document names / references
}

export interface AmendedReturn {
  id: string;
  taxYear: AmendmentYear;
  taxpayerName: string;
  taxpayerSSN: string;        // Last 4 only, stored as "XXX-XX-####"
  spouseName?: string;
  spouseSSN?: string;
  originalFilingDate: string; // ISO date string
  originalFilingStatus: FilingStatus;
  amendedFilingStatus?: FilingStatus;
  status: AmendmentStatus;
  createdAt: Date;
  lastModified: Date;
  changes: AmendmentChange[];
  // Computed from changes
  originalAGI: number;
  amendedAGI: number;
  originalTaxableIncome: number;
  amendedTaxableIncome: number;
  originalTaxLiability: number;
  amendedTaxLiability: number;
  originalWithholding: number;
  amendedWithholding: number;
  originalRefundOrOwed: number;   // positive = refund, negative = owed
  amendedRefundOrOwed: number;
  netChangeRefundOrOwed: number;  // amendedRefundOrOwed - originalRefundOrOwed
  stateAmendmentsRequired: string[]; // state codes
  explanationStatement: string;   // Preparer-authored narrative
  filingInstructions: string[];   // Step-by-step mailing instructions
}

// ===== ELIGIBILITY & DEADLINE LOGIC ======================================

const CURRENT_YEAR = new Date().getFullYear();
const ELIGIBLE_YEARS: AmendmentYear[] = [2020, 2021, 2022, 2023, 2024];

export interface AmendmentEligibility {
  year: number;
  eligible: boolean;
  refundStatuteOpen: boolean;      // Within 3 years of original due date
  refundDeadline: Date | null;     // Date by which refund claim must be filed
  additionalTaxDeadline: Date;     // Can always amend to pay more (no statute)
  notes: string[];
}

/**
 * Returns eligibility information for amending a given tax year.
 * Standard April 15 due dates; does not account for disaster extensions.
 */
export function getAmendmentEligibility(year: number): AmendmentEligibility {
  if (!ELIGIBLE_YEARS.includes(year as AmendmentYear)) {
    return {
      year,
      eligible: false,
      refundStatuteOpen: false,
      refundDeadline: null,
      additionalTaxDeadline: new Date(),
      notes: [`Tax year ${year} is outside the supported amendment window (${ELIGIBLE_YEARS[0]}–${ELIGIBLE_YEARS[ELIGIBLE_YEARS.length - 1]})`],
    };
  }

  const originalDueDate = new Date(`${year + 1}-04-15`);
  const refundDeadline = new Date(originalDueDate);
  refundDeadline.setFullYear(refundDeadline.getFullYear() + 3);

  const today = new Date();
  const refundStatuteOpen = today <= refundDeadline;

  const notes: string[] = [];

  if (!refundStatuteOpen) {
    notes.push(
      `⚠️ The 3-year refund statute closed on ${refundDeadline.toLocaleDateString()}. ` +
      `You may still amend to correct the record or report additional income owed, but no refund will be issued.`
    );
  } else {
    const daysLeft = Math.ceil((refundDeadline.getTime() - today.getTime()) / 86_400_000);
    notes.push(`Refund claim deadline: ${refundDeadline.toLocaleDateString()} (${daysLeft} days remaining)`);
  }

  if (year === 2020) {
    notes.push('Note: COVID-19 relief extended 2020 filing deadlines. Confirm your actual filing date for statute calculation.');
  }

  if (year >= CURRENT_YEAR - 1) {
    notes.push(`E-filing of 1040-X for tax year ${year} may be available through authorized e-file providers.`);
  } else {
    notes.push(`1040-X for tax year ${year} must be paper-filed (e-file is only available for the 2 most recent years).`);
  }

  return {
    year,
    eligible: true,
    refundStatuteOpen,
    refundDeadline,
    additionalTaxDeadline: new Date(9999, 0, 1), // No sunset for paying more tax
    notes,
  };
}

// ===== AMENDMENT CHANGE TEMPLATES ========================================

/**
 * Pre-built change templates for the most common amendment reasons.
 * The UI renders these as quick-start options.
 */
export interface ChangeTemplate {
  id: string;
  label: string;
  description: string;
  changeType: AmendmentChangeType;
  suggestedFormLine: string;
  commonReasons: string[];
}

export const CHANGE_TEMPLATES: ChangeTemplate[] = [
  {
    id: 'missed-w2',
    label: 'Forgot W-2 / Additional W-2 received',
    description: 'A W-2 was not included on the original return.',
    changeType: 'income_addition',
    suggestedFormLine: '1040 Line 1z (Total Wages)',
    commonReasons: ['Received a late W-2 after filing', 'Had a second job overlooked', 'Prior employer issued corrected W-2'],
  },
  {
    id: 'missed-1099',
    label: 'Forgot 1099 (freelance/interest/dividends)',
    description: 'A 1099-NEC, 1099-INT, or 1099-DIV was omitted from the original return.',
    changeType: 'income_addition',
    suggestedFormLine: '1040 Line 8 (Other Income) or Schedule C',
    commonReasons: ['IRS CP2000 notice received', '1099 arrived late', 'Overlooked brokerage account'],
  },
  {
    id: 'missed-deduction',
    label: 'Missed deduction (medical, charitable, mortgage)',
    description: 'A deductible expense was not claimed on the original return.',
    changeType: 'deduction_addition',
    suggestedFormLine: 'Schedule A (Itemized Deductions)',
    commonReasons: ['Found receipts after filing', 'Did not know the deduction was available', 'Accountant oversight'],
  },
  {
    id: 'missed-credit',
    label: 'Missed credit (AOTC, Child Tax, EIC)',
    description: 'An eligible tax credit was not claimed.',
    changeType: 'credit_addition',
    suggestedFormLine: '1040 Line 27–30 (Credits)',
    commonReasons: ['Did not know eligibility requirements', 'Child or dependent status overlooked', 'Education credit not claimed'],
  },
  {
    id: 'home-office',
    label: 'Home office deduction not taken',
    description: 'Form 8829 / simplified home office deduction was omitted.',
    changeType: 'deduction_addition',
    suggestedFormLine: 'Schedule C Line 30 / Form 8829',
    commonReasons: ['Started working from home and didn\'t realize deductibility', 'Exclusive use test met but not claimed'],
  },
  {
    id: 'retirement-contribution',
    label: 'IRA or SEP-IRA contribution not deducted',
    description: 'Traditional IRA or self-employed retirement contribution not claimed.',
    changeType: 'deduction_addition',
    suggestedFormLine: '1040 Schedule 1 Line 20',
    commonReasons: ['Contribution made but deduction not taken', 'Realized eligibility after filing'],
  },
  {
    id: 'incorrect-filing-status',
    label: 'Incorrect filing status',
    description: 'Changed from Single to Head of Household, or MFS to MFJ, etc.',
    changeType: 'filing_status_change',
    suggestedFormLine: '1040-X Line 31 (Explanation)',
    commonReasons: ['Separated or divorced', 'Marriage occurred but filed incorrectly', 'HOH qualification discovered'],
  },
  {
    id: 'dependent-added',
    label: 'Dependent not claimed (child, parent)',
    description: 'An eligible dependent was not listed on the original return.',
    changeType: 'exemption_change',
    suggestedFormLine: '1040-X Part I and Dependents section',
    commonReasons: ['Custody agreement changed', 'Parent became a dependent mid-year', 'Child credit missed'],
  },
  {
    id: 'withholding-error',
    label: 'Withholding amount was incorrect',
    description: 'The W-2 or 1099 withholding entered on the original return was wrong.',
    changeType: 'withholding_correction',
    suggestedFormLine: '1040 Line 25 / Schedule 3 Line 12',
    commonReasons: ['Transcription error', 'Received corrected W-2 (W-2c)', 'Backup withholding omitted'],
  },
  {
    id: 'schedule-c-expense',
    label: 'Additional Schedule C expenses',
    description: 'Business expenses were understated on the original return.',
    changeType: 'deduction_addition',
    suggestedFormLine: 'Schedule C Lines 8–48',
    commonReasons: ['Found additional receipts', 'Vehicle mileage log discovered', 'Home office or equipment overlooked'],
  },
  {
    id: 'excess-income',
    label: 'Income was overstated (remove)',
    description: 'Income was reported that should not have been (duplicate, non-taxable, etc.).',
    changeType: 'income_removal',
    suggestedFormLine: 'Applicable income line',
    commonReasons: ['Non-taxable reimbursement included', 'Duplicate entry', 'Loan proceeds incorrectly treated as income'],
  },
];

// ===== BUILDER ===========================================================

let _idCounter = 1;
function nextId(): string {
  return `amd_${Date.now()}_${_idCounter++}`;
}

export function createAmendedReturn(
  taxYear: AmendmentYear,
  taxpayerName: string,
  taxpayerSSNLast4: string,
  originalFilingDate: string,
  originalFilingStatus: FilingStatus,
): AmendedReturn {
  return {
    id: nextId(),
    taxYear,
    taxpayerName,
    taxpayerSSN: `XXX-XX-${taxpayerSSNLast4}`,
    originalFilingDate,
    originalFilingStatus,
    status: 'draft',
    createdAt: new Date(),
    lastModified: new Date(),
    changes: [],
    originalAGI: 0,
    amendedAGI: 0,
    originalTaxableIncome: 0,
    amendedTaxableIncome: 0,
    originalTaxLiability: 0,
    amendedTaxLiability: 0,
    originalWithholding: 0,
    amendedWithholding: 0,
    originalRefundOrOwed: 0,
    amendedRefundOrOwed: 0,
    netChangeRefundOrOwed: 0,
    stateAmendmentsRequired: [],
    explanationStatement: '',
    filingInstructions: [],
  };
}

export function addChange(
  amendment: AmendedReturn,
  change: Omit<AmendmentChange, 'id' | 'difference'>
): AmendedReturn {
  const fullChange: AmendmentChange = {
    ...change,
    id: nextId(),
    difference: change.amendedValue - change.originalValue,
  };
  return {
    ...amendment,
    changes: [...amendment.changes, fullChange],
    lastModified: new Date(),
  };
}

/**
 * Recalculates all computed totals from the amendment's change list.
 * Caller must supply the original return numbers (read from original PDF
 * or prior-year builder data).
 */
export function recalcTotals(
  amendment: AmendedReturn,
  originals: {
    agi: number;
    taxableIncome: number;
    taxLiability: number;
    withholding: number;
    refundOrOwed: number;
  }
): AmendedReturn {
  const agiDelta = amendment.changes
    .filter(c => c.changeType.startsWith('income'))
    .reduce((sum, c) => sum + c.difference, 0);

  const deductionDelta = amendment.changes
    .filter(c => c.changeType.startsWith('deduction'))
    .reduce((sum, c) => sum + c.difference, 0);

  const creditDelta = amendment.changes
    .filter(c => c.changeType.startsWith('credit'))
    .reduce((sum, c) => sum + c.difference, 0);

  const withholdingDelta = amendment.changes
    .filter(c => c.changeType === 'withholding_correction')
    .reduce((sum, c) => sum + c.difference, 0);

  const amendedAGI = originals.agi + agiDelta;
  const amendedTaxableIncome = Math.max(0, originals.taxableIncome + agiDelta - deductionDelta);
  // Tax liability approximation: actual engine would compute from brackets
  // Here we carry original liability + user-defined changes to it
  const taxLiabilityDelta = amendment.changes
    .filter(c => !c.changeType.startsWith('credit') && !c.changeType.startsWith('deduction') && !c.changeType.startsWith('withholding'))
    .reduce((sum, c) => sum + (c.difference * 0.22), 0); // marginal approx — real UI sets this directly
  const amendedTaxLiability = Math.max(0, originals.taxLiability + taxLiabilityDelta - creditDelta);
  const amendedWithholding = originals.withholding + withholdingDelta;
  const amendedRefundOrOwed = amendedWithholding - amendedTaxLiability;

  return {
    ...amendment,
    originalAGI: originals.agi,
    amendedAGI,
    originalTaxableIncome: originals.taxableIncome,
    amendedTaxableIncome,
    originalTaxLiability: originals.taxLiability,
    amendedTaxLiability,
    originalWithholding: originals.withholding,
    amendedWithholding,
    originalRefundOrOwed: originals.refundOrOwed,
    amendedRefundOrOwed,
    netChangeRefundOrOwed: amendedRefundOrOwed - originals.refundOrOwed,
    lastModified: new Date(),
  };
}

// ===== EXPLANATION STATEMENT GENERATOR ==================================

/**
 * Generates the Part III explanation that goes on Form 1040-X.
 * The IRS requires a clear explanation of each change.
 */
export function generateExplanationStatement(amendment: AmendedReturn): string {
  const { taxYear, taxpayerName, changes } = amendment;
  const lines: string[] = [
    `EXPLANATION OF CHANGES — Form 1040-X — Tax Year ${taxYear}`,
    `Taxpayer: ${taxpayerName}`,
    '',
    `The following changes are being made to the original ${taxYear} Form 1040:`,
    '',
  ];

  changes.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.description}`);
    lines.push(`   Form/Line: ${c.formLine}`);
    lines.push(`   Original Amount: $${c.originalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    lines.push(`   Corrected Amount: $${c.amendedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    lines.push(`   Change: ${c.difference >= 0 ? '+' : ''}$${c.difference.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    lines.push(`   Reason: ${c.reason}`);
    if (c.supportingDocs.length > 0) {
      lines.push(`   Supporting Documents: ${c.supportingDocs.join(', ')}`);
    }
    lines.push('');
  });

  if (amendment.netChangeRefundOrOwed > 0) {
    lines.push(`Net result: Taxpayer is owed an additional refund of $${amendment.netChangeRefundOrOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`);
  } else if (amendment.netChangeRefundOrOwed < 0) {
    lines.push(`Net result: Additional tax of $${Math.abs(amendment.netChangeRefundOrOwed).toLocaleString('en-US', { minimumFractionDigits: 2 })} is owed. Payment enclosed.`);
  } else {
    lines.push('Net result: No change in refund or balance due — filing for informational correction only.');
  }

  return lines.join('\n');
}

// ===== FILING INSTRUCTIONS GENERATOR ====================================

/**
 * Returns step-by-step mailing instructions for Form 1040-X, including
 * which IRS address to use based on state of residence and year.
 */
export function generateFilingInstructions(
  amendment: AmendedReturn,
  stateOfResidence: string
): string[] {
  const { taxYear, netChangeRefundOrOwed, stateAmendmentsRequired } = amendment;
  const mailsElectronically = taxYear >= CURRENT_YEAR - 2;

  const instructions: string[] = [
    `FILING INSTRUCTIONS — Form 1040-X for Tax Year ${taxYear}`,
    '',
  ];

  if (mailsElectronically) {
    instructions.push(
      `E-Filing Option: Tax year ${taxYear} 1040-X may be e-filed through authorized IRS e-file providers ` +
      `(TurboTax, H&R Block, FreeTaxUSA, etc.). E-filing is faster and provides tracking.`
    );
    instructions.push('');
  }

  instructions.push('PAPER FILING STEPS:');
  instructions.push(`1. Print Form 1040-X (download from IRS.gov/forms — use the ${taxYear} version specifically).`);
  instructions.push('2. Complete Part I (Income & Deductions), Part II (Tax Liability), and Part III (Explanation of Changes).');
  instructions.push('3. Attach all supporting documents: corrected W-2/1099, schedules that changed, and any new forms.');
  instructions.push('4. Do NOT attach a copy of the original return unless specifically instructed in the 1040-X instructions.');

  if (netChangeRefundOrOwed < 0) {
    instructions.push(`5. PAYMENT DUE: Include a check or money order for $${Math.abs(netChangeRefundOrOwed).toLocaleString('en-US', { minimumFractionDigits: 2 })}, payable to "United States Treasury". Write the tax year and SSN on the check.`);
    instructions.push('6. Include Form 1040-V (Payment Voucher) with your payment.');
  } else if (netChangeRefundOrOwed > 0) {
    instructions.push(`5. REFUND EXPECTED: $${netChangeRefundOrOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })} additional refund. Expect 8–12 weeks for processing (IRS processes 1040-X manually).`);
  }

  instructions.push('');
  instructions.push('MAILING ADDRESS (consult IRS Form 1040-X instructions for your state):');
  instructions.push('  → IRS.gov/filing/where-to-file-1040-x');
  instructions.push('  → Use CERTIFIED MAIL with return receipt — this creates a postmark record for statute purposes.');
  instructions.push('');

  if (stateAmendmentsRequired.length > 0) {
    instructions.push('STATE AMENDMENT(S) ALSO REQUIRED:');
    stateAmendmentsRequired.forEach(state => {
      instructions.push(`  • ${state}: File the state-specific amendment form (typically named "Amended [State] Return" or "[Form] X")`);
    });
    instructions.push('  → File state amendments after the federal 1040-X is submitted.');
    instructions.push('');
  }

  instructions.push('TRACKING:');
  instructions.push('  → Check IRS 1040-X status: IRS.gov/wheres-my-amended-return (available 3 weeks after mailing)');
  instructions.push('  → Processing typically takes 8–16 weeks; may be longer during peak periods.');

  return instructions;
}

// ===== STATE AMENDMENT HELPERS ==========================================

export interface StateAmendmentInfo {
  stateCode: string;
  stateName: string;
  formName: string;
  notes: string;
  deadline: string;
}

const STATE_AMENDMENT_FORMS: Record<string, StateAmendmentInfo> = {
  IL: { stateCode: 'IL', stateName: 'Illinois', formName: 'IL-1040-X', notes: 'File within 2 years of original due date for refund.', deadline: '3 years from original due date' },
  CA: { stateCode: 'CA', stateName: 'California', formName: '540X', notes: 'CA generally conforms to federal changes; file within 4 years.', deadline: '4 years from original due date' },
  NY: { stateCode: 'NY', stateName: 'New York', formName: 'IT-201-X', notes: 'NY has a 3-year refund statute.', deadline: '3 years from original due date' },
  TX: { stateCode: 'TX', stateName: 'Texas', formName: 'No state income tax', notes: 'Texas has no individual income tax — no state amendment required.', deadline: 'N/A' },
  FL: { stateCode: 'FL', stateName: 'Florida', formName: 'No state income tax', notes: 'Florida has no individual income tax — no state amendment required.', deadline: 'N/A' },
  WA: { stateCode: 'WA', stateName: 'Washington', formName: 'No state income tax', notes: 'Washington has no individual income tax — no state amendment required.', deadline: 'N/A' },
  OH: { stateCode: 'OH', stateName: 'Ohio', formName: 'IT 1040X', notes: 'File within 4 years of original due date.', deadline: '4 years from original due date' },
  PA: { stateCode: 'PA', stateName: 'Pennsylvania', formName: 'PA-40X', notes: 'File within 3 years.', deadline: '3 years from original due date' },
  MI: { stateCode: 'MI', stateName: 'Michigan', formName: 'MI-1040X-12', notes: 'File within 4 years.', deadline: '4 years from original due date' },
  GA: { stateCode: 'GA', stateName: 'Georgia', formName: 'IT-511 (amended)', notes: 'File within 3 years.', deadline: '3 years from original due date' },
  NC: { stateCode: 'NC', stateName: 'North Carolina', formName: 'D-400X', notes: 'File within 3 years.', deadline: '3 years from original due date' },
  AZ: { stateCode: 'AZ', stateName: 'Arizona', formName: '140X', notes: 'File within 3 years.', deadline: '3 years from original due date' },
  CO: { stateCode: 'CO', stateName: 'Colorado', formName: '104X', notes: 'Conforms to federal changes.', deadline: '3 years from original due date' },
  VA: { stateCode: 'VA', stateName: 'Virginia', formName: '760IP or 760CG amended', notes: 'File within 3 years.', deadline: '3 years from original due date' },
  NJ: { stateCode: 'NJ', stateName: 'New Jersey', formName: 'NJ-1040X', notes: 'File within 3 years.', deadline: '3 years from original due date' },
};

export function getStateAmendmentInfo(stateCode: string): StateAmendmentInfo | null {
  return STATE_AMENDMENT_FORMS[stateCode.toUpperCase()] ?? null;
}

export function getEligibleYears(): AmendmentYear[] {
  return ELIGIBLE_YEARS;
}
