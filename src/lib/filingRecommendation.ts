/**
 * filingRecommendation.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Recommends the optimal e-filing path for each client based on AGI,
 * return complexity, state, and filing scenario.
 *
 * 2026 Filing Season Data (Tax Year 2025):
 *  • IRS Free File AGI limit: $89,000
 *  • Free File partners: 1040Now, Drake (1040.com), ezTaxReturn, FileYourTaxes,
 *    On-Line Taxes, TaxAct, TaxHawk (FreeTaxUSA), TaxSlayer
 *  • FreeTaxUSA: Always free federal regardless of AGI; $14.99 state
 *  • IRS Free File Fillable Forms: Available for ANY AGI but no interview guidance
 *
 * References:
 *  https://www.irs.gov/e-file-do-your-taxes-for-free
 *  https://www.freetaxusa.com
 *  https://freefilealliance.org
 */

// ===== TYPES =============================================================

export interface ClientFilingProfile {
  // Identity / basic
  taxYear: number;
  filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';
  age: number;
  spouseAge?: number;

  // Income
  agi: number;                    // Adjusted Gross Income
  hasW2: boolean;
  hasSelfEmployment: boolean;     // Schedule C / 1099-NEC
  hasDividendsOrInterest: boolean;
  hasCapitalGains: boolean;       // Schedule D / Form 8949
  hasRentalIncome: boolean;       // Schedule E
  hasRetirementIncome: boolean;   // 1099-R
  hasFarmIncome: boolean;
  hasForeignIncome: boolean;
  hasK1Income: boolean;           // Partnership / S-Corp / Trust K-1
  hasAlimonyReceived: boolean;
  hasGamblingIncome: boolean;

  // Deductions
  itemizes: boolean;              // Schedule A
  hasMortgageInterest: boolean;
  hasCharitableContributions: boolean;
  hasStudentLoanInterest: boolean;
  hasEducatorExpenses: boolean;
  hasHSAContribution: boolean;
  hasSEPOrIRADeduction: boolean;

  // Credits & special situations
  hasChildrenOrDependents: boolean;
  hasEIC: boolean;                // Earned Income Credit
  hasChildTaxCredit: boolean;
  hasEducationCredits: boolean;   // Form 8863 (AOTC / LLC)
  hasPremiumTaxCredit: boolean;   // Form 8962 (ACA marketplace)
  hasAMTExposure: boolean;        // Form 6251
  hasQBIDeduction: boolean;       // Form 8995 (Section 199A)
  hasCarryforwards: boolean;      // NOL, cap loss, credits from prior years

  // Special
  hasNonResidentSpouse: boolean;
  isMilitary: boolean;
  hasVirtualCurrency: boolean;
  hasFBARRequirement: boolean;    // FinCEN 114 (foreign accounts > $10K)
  stateCode: string;              // e.g. "IL", "CA", "TX"
  numberOfStates: number;         // returns needed in multiple states

  // Estimated amounts (optional — improves specificity)
  estimatedRefund?: number;
  estimatedOwed?: number;
}

export type FilingPathId =
  | 'irs_free_file_freetaxusa'
  | 'irs_free_file_taxact'
  | 'irs_free_file_taxslayer'
  | 'irs_free_file_1040com'
  | 'irs_free_file_olt'
  | 'irs_free_fillable_forms'
  | 'freetaxusa_paid_state'
  | 'taxact_deluxe'
  | 'taxact_premier'
  | 'taxslayer_classic'
  | 'mail_paper'
  | 'professional_preparer';

export type RecommendationTier = 'best' | 'good' | 'acceptable' | 'not_recommended';

export interface FilingPathCost {
  federal: number;       // 0 = free
  state: number;         // per state
  notes?: string;
}

export interface Limitation {
  severity: 'blocking' | 'warning' | 'minor';
  description: string;
}

export interface FilingPath {
  id: FilingPathId;
  name: string;
  provider: string;
  url: string;
  cost: FilingPathCost;
  federalFree: boolean;
  stateFree: boolean;
  irsPartnered: boolean;           // Official IRS Free File partner
  agiLimit?: number;               // null = no limit
  supportsScheduleC: boolean;
  supportsScheduleD: boolean;
  supportsScheduleE: boolean;
  supportsK1: boolean;
  supportsAMT: boolean;
  supportsForeignIncome: boolean;
  supportsMultipleStates: boolean;
  hasImportTxf: boolean;           // Accepts our TXF export
  hasAuditSupport: boolean;
  efilesImmediately: boolean;
  description: string;
  bestFor: string;
  limitations: string[];
}

export interface FilingRecommendation {
  path: FilingPath;
  tier: RecommendationTier;
  score: number;                   // 0–100; higher = better fit
  reasons: string[];               // Why this is recommended
  warnings: string[];              // Issues to be aware of
  blockers: string[];              // Hard blockers that make this path unsuitable
  costSummary: string;             // Human-readable cost estimate
}

export interface RecommendationResult {
  primaryRecommendation: FilingRecommendation;
  alternativeRecommendations: FilingRecommendation[];
  ineligiblePaths: { path: FilingPath; reason: string }[];
  complexityScore: number;         // 0–100; surfaced to user
  complexityLabel: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex';
  freeFileEligible: boolean;
  freeFileSavings?: number;        // Estimated $ saved vs paid software
  keyInsights: string[];           // Top 3 contextual insights for this client
}

// ===== FILING PATH CATALOG ===============================================

export const FILING_PATHS: Record<FilingPathId, FilingPath> = {

  irs_free_file_freetaxusa: {
    id: 'irs_free_file_freetaxusa',
    name: 'FreeTaxUSA (via IRS Free File)',
    provider: 'TaxHawk / FreeTaxUSA',
    url: 'https://www.irs.gov/efile-providers/freetaxusa',
    cost: { federal: 0, state: 0, notes: 'Via Free File program; state free if AGI ≤ $89K through IRS portal' },
    federalFree: true,
    stateFree: true,
    irsPartnered: true,
    agiLimit: 89000,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: true,
    supportsK1: true,
    supportsAMT: false,
    supportsForeignIncome: false,
    supportsMultipleStates: false,
    hasImportTxf: true,
    hasAuditSupport: false,
    efilesImmediately: true,
    description: 'FreeTaxUSA is the Free File partner with the broadest form support and the most generous AGI limit. It handles Schedule C, D, E, and basic K-1s completely free through the IRS Free File program.',
    bestFor: 'Self-employed filers, investors, and retirees with AGI ≤ $89K who want a truly free federal return with broad form support.',
    limitations: ['K-1 with passive activity / at-risk limitations may not be fully supported', 'AMT not supported in Free File tier', 'Multiple states require separate state returns'],
  },

  freetaxusa_paid_state: {
    id: 'freetaxusa_paid_state',
    name: 'FreeTaxUSA (Direct — Any AGI)',
    provider: 'TaxHawk / FreeTaxUSA',
    url: 'https://www.freetaxusa.com',
    cost: { federal: 0, state: 14.99, notes: '$14.99 per state return; federal always free regardless of AGI' },
    federalFree: true,
    stateFree: false,
    irsPartnered: false,
    agiLimit: undefined,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: true,
    supportsK1: true,
    supportsAMT: false,
    supportsForeignIncome: false,
    supportsMultipleStates: true,
    hasImportTxf: true,
    hasAuditSupport: true,
    efilesImmediately: true,
    description: 'When accessed directly (not through the IRS Free File portal), FreeTaxUSA has no AGI limit. Federal is always free; state is $14.99. Supports over 350 federal forms and schedules.',
    bestFor: 'Anyone with AGI above the Free File limit ($89K) who still wants a near-free return with solid form coverage.',
    limitations: ['AMT (Form 6251) not supported — triggers recommendation to upgrade', 'Foreign income (Form 2555 / FBAR) not supported', 'State costs $14.99'],
  },

  irs_free_file_taxact: {
    id: 'irs_free_file_taxact',
    name: 'TaxAct Free File',
    provider: 'TaxAct',
    url: 'https://www.irs.gov/efile-providers/taxact',
    cost: { federal: 0, state: 0, notes: 'State free via IRS Free File portal' },
    federalFree: true,
    stateFree: true,
    irsPartnered: true,
    agiLimit: 89000,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: false,
    supportsK1: false,
    supportsAMT: false,
    supportsForeignIncome: false,
    supportsMultipleStates: false,
    hasImportTxf: true,
    hasAuditSupport: false,
    efilesImmediately: true,
    description: 'TaxAct participates in the IRS Free File program. Strong interview flow and good form coverage for Schedule C and D. No K-1 or Schedule E in the free tier.',
    bestFor: 'W-2 + self-employment + investment sales, AGI ≤ $89K, no rentals or K-1s.',
    limitations: ['K-1 income not supported in free tier', 'Rental income (Schedule E) not in free tier', 'AMT not supported'],
  },

  irs_free_file_taxslayer: {
    id: 'irs_free_file_taxslayer',
    name: 'TaxSlayer Free File',
    provider: 'TaxSlayer',
    url: 'https://www.irs.gov/efile-providers/taxslayer',
    cost: { federal: 0, state: 0, notes: 'State free via IRS Free File portal' },
    federalFree: true,
    stateFree: true,
    irsPartnered: true,
    agiLimit: 89000,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: false,
    supportsK1: false,
    supportsAMT: false,
    supportsForeignIncome: false,
    supportsMultipleStates: false,
    hasImportTxf: true,
    hasAuditSupport: false,
    efilesImmediately: true,
    description: 'TaxSlayer Classic is included in the Free File program. Clean interface, good for standard returns with self-employment or investment income.',
    bestFor: 'Standard returns with W-2 and/or self-employment, AGI ≤ $89K.',
    limitations: ['No K-1, Schedule E, or AMT support in free tier', 'Military-specific optimizations limited'],
  },

  irs_free_file_1040com: {
    id: 'irs_free_file_1040com',
    name: '1040.com (Drake) Free File',
    provider: 'Drake Software',
    url: 'https://www.irs.gov/efile-providers/drake',
    cost: { federal: 0, state: 0, notes: 'State free via IRS Free File portal' },
    federalFree: true,
    stateFree: true,
    irsPartnered: true,
    agiLimit: 89000,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: false,
    supportsK1: false,
    supportsAMT: false,
    supportsForeignIncome: false,
    supportsMultipleStates: false,
    hasImportTxf: false,
    hasAuditSupport: false,
    efilesImmediately: true,
    description: '1040.com is powered by Drake Software — the same engine used by professional tax preparers. Clean, reliable, and trusted by professionals. No frills, no upsells.',
    bestFor: 'Simple to moderate returns where you want the same underlying engine professionals use, AGI ≤ $89K.',
    limitations: ['Limited complex form support in consumer version', 'No TXF import'],
  },

  irs_free_file_olt: {
    id: 'irs_free_file_olt',
    name: 'On-Line Taxes (OLT) Free File',
    provider: 'On-Line Taxes',
    url: 'https://www.irs.gov/efile-providers/online-taxes',
    cost: { federal: 0, state: 0, notes: 'State free via IRS Free File portal' },
    federalFree: true,
    stateFree: true,
    irsPartnered: true,
    agiLimit: 89000,
    supportsScheduleC: true,
    supportsScheduleD: false,
    supportsScheduleE: false,
    supportsK1: false,
    supportsAMT: false,
    supportsForeignIncome: false,
    supportsMultipleStates: false,
    hasImportTxf: false,
    hasAuditSupport: false,
    efilesImmediately: true,
    description: 'Straightforward Free File option. Best for simple W-2 and basic Schedule C returns.',
    bestFor: 'Simple returns only — W-2 filers or very basic self-employment, AGI ≤ $89K.',
    limitations: ['Limited investment and rental form support', 'No Schedule D, K-1, or AMT'],
  },

  irs_free_fillable_forms: {
    id: 'irs_free_fillable_forms',
    name: 'IRS Free File Fillable Forms',
    provider: 'Internal Revenue Service',
    url: 'https://www.irs.gov/e-file-providers/before-starting-free-file-fillable-forms',
    cost: { federal: 0, state: 0, notes: 'Completely free; no AGI limit; federal only' },
    federalFree: true,
    stateFree: false,
    irsPartnered: true,
    agiLimit: undefined,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: true,
    supportsK1: true,
    supportsAMT: true,
    supportsForeignIncome: true,
    supportsMultipleStates: false,
    hasImportTxf: false,
    hasAuditSupport: false,
    efilesImmediately: true,
    description: 'The IRS\'s own electronic version of paper forms. No income limit, supports all federal forms, completely free. No interview — you fill in each line yourself exactly as you would on paper.',
    bestFor: 'Experienced filers who know exactly what they\'re doing and have our preparer audit trail document to fill from. No income limit.',
    limitations: ['No interview guidance — you must know which lines to complete', 'Basic math checking only; no error-catch interview', 'No state return — file state separately', 'No TXF import'],
  },

  taxact_deluxe: {
    id: 'taxact_deluxe',
    name: 'TaxAct Deluxe',
    provider: 'TaxAct',
    url: 'https://www.taxact.com/individual-taxes/online/deluxe',
    cost: { federal: 49.99, state: 59.99, notes: 'Paid tier; supports itemized deductions, Schedule D' },
    federalFree: false,
    stateFree: false,
    irsPartnered: false,
    agiLimit: undefined,
    supportsScheduleC: false,
    supportsScheduleD: true,
    supportsScheduleE: false,
    supportsK1: false,
    supportsAMT: false,
    supportsForeignIncome: false,
    supportsMultipleStates: false,
    hasImportTxf: true,
    hasAuditSupport: true,
    efilesImmediately: true,
    description: 'TaxAct\'s mid-tier paid option. Adds itemized deductions and investment income. Not useful if you have Schedule C or K-1 — use Premier for that.',
    bestFor: 'W-2 + investments + itemized deductions, AGI above $89K. No self-employment.',
    limitations: ['No Schedule C (requires Premier at $79.99)', 'No K-1, no rental income in this tier'],
  },

  taxact_premier: {
    id: 'taxact_premier',
    name: 'TaxAct Premier',
    provider: 'TaxAct',
    url: 'https://www.taxact.com/individual-taxes/online/premier',
    cost: { federal: 79.99, state: 59.99, notes: 'Includes Schedule C, D, E, K-1' },
    federalFree: false,
    stateFree: false,
    irsPartnered: false,
    agiLimit: undefined,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: true,
    supportsK1: true,
    supportsAMT: true,
    supportsForeignIncome: false,
    supportsMultipleStates: true,
    hasImportTxf: true,
    hasAuditSupport: true,
    efilesImmediately: true,
    description: 'TaxAct\'s most comprehensive consumer tier. Covers Schedule C, D, E, K-1, AMT, and most complex individual scenarios. Good audit support and TXF import.',
    bestFor: 'Complex returns above the Free File AGI limit with rental income, K-1s, or AMT exposure.',
    limitations: ['No foreign income (Form 2555) support', 'State costs extra ($59.99 per state)', 'Paid — use Free File if AGI ≤ $89K'],
  },

  taxslayer_classic: {
    id: 'taxslayer_classic',
    name: 'TaxSlayer Classic',
    provider: 'TaxSlayer',
    url: 'https://www.taxslayer.com/products/classic/',
    cost: { federal: 37.95, state: 44.95, notes: 'Paid classic tier; all federal forms included' },
    federalFree: false,
    stateFree: false,
    irsPartnered: false,
    agiLimit: undefined,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: true,
    supportsK1: true,
    supportsAMT: true,
    supportsForeignIncome: false,
    supportsMultipleStates: true,
    hasImportTxf: true,
    hasAuditSupport: false,
    efilesImmediately: true,
    description: 'TaxSlayer\'s paid Classic tier is the lowest-cost option that covers all federal forms including Schedule C, D, E, K-1, and AMT.',
    bestFor: 'Complex returns above $89K AGI where you want full form support at the lowest paid price.',
    limitations: ['No audit defense in Classic (requires Premium add-on)', 'Foreign income not supported', 'State is additional'],
  },

  mail_paper: {
    id: 'mail_paper',
    name: 'Paper Mail Filing',
    provider: 'Internal Revenue Service',
    url: 'https://www.irs.gov/filing/where-to-file-tax-returns-addresses-for-taxpayers-and-tax-professionals-filing-form-1040',
    cost: { federal: 0, state: 0, notes: 'Free except postage; state filed separately' },
    federalFree: true,
    stateFree: false,
    irsPartnered: true,
    agiLimit: undefined,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: true,
    supportsK1: true,
    supportsAMT: true,
    supportsForeignIncome: true,
    supportsMultipleStates: true,
    hasImportTxf: false,
    hasAuditSupport: false,
    efilesImmediately: false,
    description: 'Paper filing with IRS fillable forms (from the Filing Center). Supports every form that exists. Our preparer audit trail document maps directly to each form line.',
    bestFor: 'Very complex returns, prior-year returns older than 2 years, FBAR/foreign requirements, or when e-file is unavailable.',
    limitations: ['No refund tracking until 4–6 weeks after mailing', 'Slow processing (8–12 weeks vs 3 weeks e-file)', 'Certified mail required to establish filing date'],
  },

  professional_preparer: {
    id: 'professional_preparer',
    name: 'Professional Tax Preparer (CPA/EA)',
    provider: 'Licensed Professional',
    url: 'https://www.irs.gov/tax-professionals/choosing-a-tax-professional',
    cost: { federal: 300, state: 150, notes: 'Average cost; varies widely by complexity and location' },
    federalFree: false,
    stateFree: false,
    irsPartnered: false,
    agiLimit: undefined,
    supportsScheduleC: true,
    supportsScheduleD: true,
    supportsScheduleE: true,
    supportsK1: true,
    supportsAMT: true,
    supportsForeignIncome: true,
    supportsMultipleStates: true,
    hasImportTxf: true,
    hasAuditSupport: true,
    efilesImmediately: true,
    description: 'A licensed CPA or EA can handle any complexity level and provides representation rights in an IRS examination. Our audit trail document makes the handoff fast and efficient.',
    bestFor: 'FBAR requirements, foreign income, complex estate/trust K-1s, business owners with audit risk, or anyone who simply wants a professional to sign the return.',
    limitations: ['Cost ($300–$1,000+ depending on complexity)', 'Requires scheduling and turnaround time'],
  },
};

// ===== COMPLEXITY SCORER =================================================

export function scoreComplexity(p: ClientFilingProfile): { score: number; label: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex'; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  if (p.hasSelfEmployment)    { score += 20; factors.push('Self-employment income (Schedule C)'); }
  if (p.hasCapitalGains)      { score += 15; factors.push('Investment sales (Schedule D / Form 8949)'); }
  if (p.hasRentalIncome)      { score += 20; factors.push('Rental income (Schedule E)'); }
  if (p.hasK1Income)          { score += 25; factors.push('Pass-through K-1 income (partnership / S-Corp)'); }
  if (p.hasForeignIncome)     { score += 30; factors.push('Foreign income / FBAR requirement'); }
  if (p.hasFBARRequirement)   { score += 15; factors.push('FinCEN 114 (foreign accounts > $10K)'); }
  if (p.hasAMTExposure)       { score += 20; factors.push('Alternative Minimum Tax (Form 6251)'); }
  if (p.hasCarryforwards)     { score += 10; factors.push('Carryforward items (NOL / cap loss / credits)'); }
  if (p.numberOfStates > 1)   { score += 15 * (p.numberOfStates - 1); factors.push(`${p.numberOfStates} state returns required`); }
  if (p.hasVirtualCurrency)   { score += 10; factors.push('Virtual currency / cryptocurrency'); }
  if (p.hasFarmIncome)        { score += 15; factors.push('Farm income (Schedule F)'); }
  if (p.hasPremiumTaxCredit)  { score += 10; factors.push('ACA Premium Tax Credit reconciliation (Form 8962)'); }
  if (p.hasNonResidentSpouse) { score += 20; factors.push('Non-resident spouse election'); }
  if (p.itemizes)             { score += 5;  factors.push('Itemized deductions (Schedule A)'); }
  if (p.hasEducationCredits)  { score += 5;  factors.push('Education credits (Form 8863)'); }
  if (p.hasQBIDeduction)      { score += 8;  factors.push('QBI deduction (Form 8995)'); }

  score = Math.min(score, 100);

  let label: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex';
  if (score <= 15)       label = 'Simple';
  else if (score <= 35)  label = 'Moderate';
  else if (score <= 60)  label = 'Complex';
  else                   label = 'Very Complex';

  return { score, label, factors };
}

// ===== RECOMMENDATION ENGINE =============================================

function scorePath(path: FilingPath, profile: ClientFilingProfile, complexity: number): { score: number; reasons: string[]; warnings: string[]; blockers: string[] } {
  let score = 50;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  // Hard blockers
  if (path.agiLimit && profile.agi > path.agiLimit) {
    blockers.push(`AGI $${profile.agi.toLocaleString()} exceeds Free File limit of $${path.agiLimit.toLocaleString()}`);
    score = 0;
    return { score, reasons, warnings, blockers };
  }
  if (!path.supportsScheduleC && profile.hasSelfEmployment) {
    blockers.push('Does not support Schedule C (self-employment income)');
    score = 0;
    return { score, reasons, warnings, blockers };
  }
  if (!path.supportsScheduleD && profile.hasCapitalGains) {
    blockers.push('Does not support Schedule D (capital gains/losses)');
    score = 0;
    return { score, reasons, warnings, blockers };
  }
  if (!path.supportsScheduleE && profile.hasRentalIncome) {
    blockers.push('Does not support Schedule E (rental income)');
    score = 0;
    return { score, reasons, warnings, blockers };
  }
  if (!path.supportsK1 && profile.hasK1Income) {
    blockers.push('Does not support Schedule K-1 pass-through income');
    score = 0;
    return { score, reasons, warnings, blockers };
  }
  if (!path.supportsAMT && profile.hasAMTExposure) {
    blockers.push('Does not support Form 6251 (Alternative Minimum Tax)');
    score = 0;
    return { score, reasons, warnings, blockers };
  }
  if (!path.supportsForeignIncome && (profile.hasForeignIncome || profile.hasFBARRequirement)) {
    blockers.push('Does not support foreign income (Form 2555) or FBAR requirements');
    score = 0;
    return { score, reasons, warnings, blockers };
  }
  if (!path.supportsMultipleStates && profile.numberOfStates > 1) {
    blockers.push(`Does not support multiple state returns (${profile.numberOfStates} states needed)`);
    score = 0;
    return { score, reasons, warnings, blockers };
  }

  // Positive scoring
  if (path.federalFree) { score += 20; reasons.push('Federal return is completely free'); }
  if (path.stateFree)   { score += 10; reasons.push('State return is also free through this path'); }
  if (path.irsPartnered){ score += 5;  reasons.push('Official IRS Free File partner — IRS-vetted security'); }
  if (path.hasImportTxf){ score += 8;  reasons.push('Accepts TXF import — your data populates automatically'); }
  if (path.efilesImmediately) { score += 5; reasons.push('E-files immediately — faster refund (typically 21 days)'); }
  if (path.hasAuditSupport) { score += 5; reasons.push('Includes audit support / representation option'); }

  // Form-specific bonuses for supported forms the client actually needs
  if (path.supportsScheduleC && profile.hasSelfEmployment) {
    score += 12; reasons.push('Supports Schedule C for your self-employment income');
  }
  if (path.supportsScheduleD && profile.hasCapitalGains) {
    score += 10; reasons.push('Supports Schedule D for your investment transactions');
  }
  if (path.supportsScheduleE && profile.hasRentalIncome) {
    score += 12; reasons.push('Supports Schedule E for your rental income');
  }
  if (path.supportsK1 && profile.hasK1Income) {
    score += 12; reasons.push('Supports K-1 pass-through income reporting');
  }
  if (path.supportsAMT && profile.hasAMTExposure) {
    score += 10; reasons.push('Supports AMT calculation (Form 6251)');
  }

  // Complexity penalty for simple paths on complex returns
  if (complexity > 50 && path.id === 'irs_free_file_olt') {
    score -= 20;
    warnings.push('This provider is best for simple returns — your return complexity may exceed its capabilities');
  }

  // Penalties / warnings
  if (!path.federalFree) {
    score -= (path.cost.federal / 10);
    warnings.push(`Federal costs $${path.cost.federal} — consider Free File if AGI ≤ $89K`);
  }
  if (!path.stateFree && path.cost.state > 0) {
    warnings.push(`State return costs $${path.cost.state} — check if your state offers a free option`);
  }
  if (path.id === 'mail_paper') {
    score -= 10; // Always prefer e-file for speed
    warnings.push('Refund takes 8–12 weeks vs 21 days for e-file');
  }

  // Military bonus
  if (profile.isMilitary && path.irsPartnered) {
    score += 5; reasons.push('Military filers qualify for IRS Free File regardless of AGI with qualifying W-2');
  }

  // Age-based IRS Free File — seniors 65+ get special notes
  if (profile.age >= 65 && path.irsPartnered) {
    reasons.push('IRS Free File is available for all ages including seniors');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons, warnings, blockers };
}

function formatCost(path: FilingPath, profile: ClientFilingProfile): string {
  if (path.federalFree && path.stateFree) return 'Completely free';
  if (path.federalFree && !path.stateFree) {
    const stateCost = path.cost.state * profile.numberOfStates;
    return `Free federal + $${stateCost.toFixed(2)} state`;
  }
  const total = path.cost.federal + (path.cost.state * profile.numberOfStates);
  return `$${path.cost.federal.toFixed(2)} federal + $${(path.cost.state * profile.numberOfStates).toFixed(2)} state = ~$${total.toFixed(2)} total`;
}

/**
 * Main recommendation function.
 * Returns a ranked list of filing paths tailored to the client's profile.
 */
export function recommendFilingPath(profile: ClientFilingProfile): RecommendationResult {
  const { score: complexityScore, label: complexityLabel, factors: complexityFactors } = scoreComplexity(profile);
  const freeFileEligible = profile.agi <= 89000;

  const paths = Object.values(FILING_PATHS);
  const scored: FilingRecommendation[] = [];
  const ineligible: { path: FilingPath; reason: string }[] = [];

  for (const path of paths) {
    const { score, reasons, warnings, blockers } = scorePath(path, profile, complexityScore);

    if (blockers.length > 0) {
      ineligible.push({ path, reason: blockers[0] });
      continue;
    }

    let tier: RecommendationTier;
    if (score >= 75) tier = 'best';
    else if (score >= 55) tier = 'good';
    else if (score >= 35) tier = 'acceptable';
    else tier = 'not_recommended';

    scored.push({
      path,
      tier,
      score,
      reasons,
      warnings,
      blockers,
      costSummary: formatCost(path, profile),
    });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const eligible = scored.filter(r => r.tier !== 'not_recommended');
  const [primary, ...alts] = eligible;
  const alternatives = alts.slice(0, 3);

  // Fallback: if somehow every eligible path was exhausted (should not happen in practice since
  // professional_preparer has no hard blockers), use the top scored result or a safe sentinel.
  const fallbackRec: FilingRecommendation = scored[0] ?? {
    path: FILING_PATHS.professional_preparer,
    tier: 'acceptable' as RecommendationTier,
    score: 30,
    reasons: ['Professional preparer can handle any return complexity'],
    warnings: ['All self-filing paths are blocked by the return profile'],
    blockers: [],
    costSummary: 'Professional fees vary by complexity ($300–$1,000+)',
  };

  // Key insights
  const insights: string[] = [];

  if (freeFileEligible) {
    const savings = 130; // avg cost of TurboTax Deluxe + state
    insights.push(`AGI of $${profile.agi.toLocaleString()} qualifies for IRS Free File — estimated savings of ~$${savings}+ vs paid software.`);
  } else {
    insights.push(`AGI of $${profile.agi.toLocaleString()} is above the $89,000 Free File limit. FreeTaxUSA (direct) is the most cost-effective option at $0 federal + $14.99 state.`);
  }

  if (profile.hasSelfEmployment && freeFileEligible) {
    insights.push('Schedule C is fully supported at no cost through FreeTaxUSA Free File — no need to pay TurboTax Self-Employed rates.');
  }

  if (profile.hasK1Income) {
    insights.push('K-1 income is the most common reason people pay for tax software unnecessarily — FreeTaxUSA supports basic K-1s for free.');
  }

  if (profile.hasForeignIncome || profile.hasFBARRequirement) {
    insights.push('Foreign income and FBAR requirements are not supported by any free e-file option. Professional preparer or paper filing is required.');
  }

  if (complexityScore > 60) {
    insights.push(`This return is ${complexityLabel} (score: ${complexityScore}/100) due to: ${complexityFactors.slice(0, 2).join(', ')}. Review the recommended path carefully.`);
  }

  if (profile.numberOfStates > 2) {
    insights.push(`${profile.numberOfStates} state returns are needed — state costs add up quickly. Consider FreeTaxUSA at $14.99/state vs TurboTax at $59+/state.`);
  }

  return {
    primaryRecommendation: primary ?? fallbackRec,
    alternativeRecommendations: alternatives,
    ineligiblePaths: ineligible,
    complexityScore,
    complexityLabel,
    freeFileEligible,
    freeFileSavings: freeFileEligible ? 130 : undefined,
    keyInsights: insights.slice(0, 3),
  };
}

// ===== NO-STATE STATES (for UI hints) ====================================

export const NO_INCOME_TAX_STATES = new Set(['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY']);

export function stateHasIncomeTax(stateCode: string): boolean {
  return !NO_INCOME_TAX_STATES.has(stateCode.toUpperCase());
}
