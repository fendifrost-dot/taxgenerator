/**
 * form1040.ts
 *
 * Complete type definitions for Form 1040 computation:
 *  - Input data needed beyond what's already in WorkflowContext
 *  - Structured output with line-by-line amounts and calculation paths
 *  - Intermediate computation steps for full traceability
 */

// ─── Filing status ─────────────────────────────────────────────────────────────

export type FilingStatus =
  | 'single'
  | 'married_filing_jointly'
  | 'married_filing_separately'
  | 'head_of_household'
  | 'qualifying_surviving_spouse';

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single:                        'Single',
  married_filing_jointly:        'Married Filing Jointly',
  married_filing_separately:     'Married Filing Separately',
  head_of_household:             'Head of Household',
  qualifying_surviving_spouse:   'Qualifying Surviving Spouse',
};

// ─── Qualifying persons ───────────────────────────────────────────────────────

export interface QualifyingChild {
  id: string;
  name: string;
  age: number;            // age at year-end
  isUnder6: boolean;      // $3,600 CTC in 2021 for ARPA
  monthsInHome: number;   // 1–12, for HOH / EIC tests
}

export interface QualifyingDependent {
  id: string;
  name: string;
  relationship: string;
  isQualifyingChild: boolean;
  creditForOtherDependents: boolean;  // $500 ODC
}

// ─── Capital gain / loss entries ──────────────────────────────────────────────

export type HoldingPeriod = 'short' | 'long';

export interface CapitalTransaction {
  id: string;
  description: string;
  dateSold: string;       // ISO date string
  dateAcquired: string;
  proceeds: number;
  costBasis: number;
  gainLoss: number;       // proceeds - costBasis
  holdingPeriod: HoldingPeriod;
  isReported1099B: boolean;
  taxYear: number;
}

// ─── Schedule E rental/royalty income ─────────────────────────────────────────

export interface RentalProperty {
  id: string;
  address: string;
  grossRents: number;
  expenses: {
    advertising: number;
    autoAndTravel: number;
    cleaningAndMaintenance: number;
    commissions: number;
    insurance: number;
    legalAndProfessional: number;
    managementFees: number;
    mortgageInterest: number;
    otherInterest: number;
    repairs: number;
    supplies: number;
    taxes: number;
    utilities: number;
    depreciation: number;
    other: number;
  };
  netIncomeLoss: number;
  isPassive: boolean;
  taxYear: number;
}

// ─── Itemized deduction inputs ────────────────────────────────────────────────

export interface ItemizedDeductionInputs {
  mortgageInterest: number;         // Form 1098 box 1
  pointsPaid: number;               // Form 1098 box 6
  mortgageInsurancePremiums: number;
  propertyTax_real: number;         // real estate taxes
  propertyTax_personal: number;     // personal property tax (vehicle)
  stateIncomeTaxPaid: number;       // state/local income taxes (or sales tax)
  foreignTaxesPaid: number;
  cashCharitable: number;           // cash donations
  nonCashCharitable: number;        // FMV of non-cash donations
  carryoverCharitable: number;      // from prior years
  medicalExpenses: number;          // before 7.5% AGI floor
  investmentInterestExpense: number;
  miscellaneous: number;            // subject to 2% AGI floor (mostly gone post-TCJA)
}

// ─── 1040 input ───────────────────────────────────────────────────────────────

export interface Form1040Input {
  taxYear: number;
  filingStatus: FilingStatus;

  // Taxpayer details
  taxpayerAge: number;
  taxpayerBlind: boolean;
  spouseAge?: number;
  spouseBlind?: boolean;

  // Dependents
  qualifyingChildren: QualifyingChild[];
  otherDependents: QualifyingDependent[];

  // Income — auto-populated from parsed documents
  w2WagesTotal: number;             // sum of box1 from all W-2s
  w2WithholdingTotal: number;       // sum of box2 from all W-2s (federal)
  w2StateWithholdingTotal: number;  // sum of box17 from all W-2s
  w2RetirementPlanContrib: number;  // box12 code D/E/F/G 401k contributions

  taxableInterest: number;          // 1099-INT box 1 (minus tax-exempt)
  taxExemptInterest: number;        // 1099-INT box 8
  ordinaryDividends: number;        // 1099-DIV box 1a
  qualifiedDividends: number;       // 1099-DIV box 1b

  // Pass-through K-1 income
  k1OrdinaryIncome: number;         // Partnership/S-Corp ordinary business income
  k1GuaranteedPayments: number;     // Partnership guaranteed payments
  k1RentalIncome: number;           // K-1 rental real estate income
  k1OtherIncome: number;            // K-1 other income items

  // Schedule C (computed from workflow, passed in)
  scheduleCNetProfit: number;

  // Capital gains (Schedule D)
  capitalTransactions: CapitalTransaction[];
  priorYearCapLossCarryover: number;

  // Other income
  rentalProperties: RentalProperty[];
  iRADistributions: number;         // Form 1099-R taxable amount
  pensionAnnuity: number;           // Form 1099-R taxable amount
  socialSecurityBenefits: number;   // Box 5 from Form SSA-1099
  alimonyReceived: number;          // Only deductible/taxable for pre-2019 agreements
  gamblingWinnings: number;
  otherIncome: number;

  // Unemployment compensation
  unemploymentCompensation: number;

  // Schedule 1 Above-the-line adjustments
  educatorExpenses: number;         // up to $300 (2022+); $250 prior years
  studentLoanInterest: number;      // up to $2,500, phases out with AGI
  alimonyPaid: number;              // pre-2019 agreement only
  iraDeduction: number;             // Traditional IRA contribution (subject to income limits)
  sepSimpleContribution: number;    // SEP-IRA or SIMPLE IRA contribution
  selfEmployedHealthInsurance: number;  // premiums paid, limited to net SE profit
  halfSETax: number;                // auto-computed from Schedule SE
  hsaDeduction: number;             // Form 8889 above-the-line HSA contribution deduction
  armedForcesMovingExpenses: number;
  charitableContribForStdDeduction: number;  // 2020/2021 above-the-line $300/$600

  // Home office (Form 8829)
  homeOfficeSqFt: number;
  totalHomeSqFt: number;
  homeOfficeMortgageInterest: number;
  homeOfficeRent: number;
  homeOfficeUtilities: number;
  homeOfficeInsurance: number;
  homeOfficeRepairs: number;
  useSimplifiedHomeOffice: boolean; // $5/sqft up to 300 sqft

  // Itemized deductions (Form 1040 Schedule A)
  useItemizedDeductions: boolean;
  itemizedDeductions: ItemizedDeductionInputs;

  // QBI (Section 199A) inputs
  qbiIncome: number;                // Same as scheduleCNetProfit for sole proprietors

  // Estimated tax payments
  estimatedTaxPayments: number;

  // Prior year overpayment applied
  priorYearOverpaymentApplied: number;

  // NOL carryforward (from prior year)
  nolCarryforward: number;
}

// ─── Intermediate computation results ─────────────────────────────────────────

export interface ScheduleCResult {
  grossReceipts: number;
  costOfGoodsSold: number;
  grossProfit: number;
  totalExpenses: number;
  homeOfficeDeduction: number;
  netProfit: number;
  lines: Array<{ lineNumber: string; description: string; amount: number; path: string }>;
}

export interface ScheduleSEResult {
  netEarningsFromSE: number;        // net SE income before 92.35% factor
  scheduleSeIncome: number;         // × 0.9235
  socialSecurityTaxable: number;    // up to SS wage base
  selfEmploymentTax: number;        // socialSecurity portion (12.4%) + Medicare (2.9%)
  halfSETax: number;                // deductible on Schedule 1
  additionalMedicareTax: number;    // 0.9% on wages + SE income > $200k (single) / $250k (MFJ)
}

export interface ScheduleDResult {
  shortTermGains: number;
  shortTermLosses: number;
  netShortTerm: number;
  longTermGains: number;
  longTermLosses: number;
  priorYearCarryover: number;
  netLongTerm: number;
  combinedNetGainLoss: number;
  capitalLossDeduction: number;     // max -$3,000 per year
  capitalLossCarryover: number;     // excess carried to next year
}

export interface Form8829Result {
  method: 'simplified' | 'actual';
  businessPercentage: number;       // sqft ratio
  allowableDeduction: number;
  carryoverToNextYear: number;
}

export interface AGIResult {
  totalIncome: number;
  schedule1Additions: number;       // K-1, rental, other
  totalBeforeAdjustments: number;
  adjustments: number;              // Schedule 1 adjustments
  agi: number;
}

export interface DeductionResult {
  standardDeduction: number;
  itemizedTotal: number;
  saltApplied: number;              // after $10k cap
  medicalExcess: number;            // after 7.5% AGI floor
  chosenDeduction: number;
  deductionType: 'standard' | 'itemized';
}

export interface QBIResult {
  qbiIncome: number;
  qbiDeduction: number;             // min(20% QBI, 20% taxable income before QBI)
  limitingFactor: string;
}

export interface TaxComputationResult {
  taxableIncome: number;
  regularTax: number;
  qualifiedDivCapGainTax: number;   // preferential rates on qual divs + LT cap gains
  totalTax: number;
  effectiveRate: number;
  marginalRate: number;
}

export interface CreditResult {
  childTaxCredit: number;
  additionalChildTaxCredit: number; // refundable portion
  creditForOtherDependents: number;
  childDependentCareCredit: number;
  earnedIncomeCredit: number;
  americanOpportunityCredit: number;
  lifetimeLearningCredit: number;
  retirementSavingsCredit: number;
  residentialEnergyCredit: number;
  totalNonRefundableCredits: number;
  totalRefundableCredits: number;
  totalCredits: number;
}

export interface OtherTaxesResult {
  selfEmploymentTax: number;        // from Schedule SE
  additionalMedicareTax: number;    // 0.9% Form 8959
  netInvestmentIncomeTax: number;   // 3.8% Form 8960 on NIIT > threshold
  totalOtherTaxes: number;
}

export interface PaymentsResult {
  w2Withholding: number;
  estimatedTaxPayments: number;
  priorYearOverpayment: number;
  refundableCredits: number;
  totalPayments: number;
}

// ─── Final 1040 output ────────────────────────────────────────────────────────

export interface Form1040Line {
  lineNumber: string;
  description: string;
  amount: number;
  path: string;         // human-readable calculation trace
  isEstimated: boolean;
  sourceRefs?: string[];
}

export interface Form1040Section {
  title: string;
  lines: Form1040Line[];
  subtotal?: number;
}

export interface Form1040Result {
  taxYear: number;
  filingStatus: FilingStatus;

  // Intermediate results
  scheduleC:  ScheduleCResult;
  scheduleSE: ScheduleSEResult;
  scheduleD:  ScheduleDResult;
  form8829:   Form8829Result;
  agi:        AGIResult;
  deduction:  DeductionResult;
  qbi:        QBIResult;
  taxComp:    TaxComputationResult;
  credits:    CreditResult;
  otherTaxes: OtherTaxesResult;
  payments:   PaymentsResult;

  // Final bottom line
  taxableIncome:    number;
  totalTax:         number;
  totalPayments:    number;
  refundOrAmountDue: number;
  isRefund:         boolean;

  // Structured sections for display
  sections: Form1040Section[];

  // Warnings
  warnings: string[];
  validationErrors: string[];

  generatedAt: Date;
}

// ─── Default empty input ──────────────────────────────────────────────────────

export function emptyForm1040Input(taxYear: number): Form1040Input {
  return {
    taxYear,
    filingStatus: 'single',
    taxpayerAge: 35,
    taxpayerBlind: false,
    qualifyingChildren: [],
    otherDependents: [],
    w2WagesTotal: 0,
    w2WithholdingTotal: 0,
    w2StateWithholdingTotal: 0,
    w2RetirementPlanContrib: 0,
    taxableInterest: 0,
    taxExemptInterest: 0,
    ordinaryDividends: 0,
    qualifiedDividends: 0,
    k1OrdinaryIncome: 0,
    k1GuaranteedPayments: 0,
    k1RentalIncome: 0,
    k1OtherIncome: 0,
    scheduleCNetProfit: 0,
    capitalTransactions: [],
    priorYearCapLossCarryover: 0,
    rentalProperties: [],
    iRADistributions: 0,
    pensionAnnuity: 0,
    socialSecurityBenefits: 0,
    alimonyReceived: 0,
    gamblingWinnings: 0,
    otherIncome: 0,
    unemploymentCompensation: 0,
    educatorExpenses: 0,
    studentLoanInterest: 0,
    alimonyPaid: 0,
    iraDeduction: 0,
    sepSimpleContribution: 0,
    selfEmployedHealthInsurance: 0,
    halfSETax: 0,
    hsaDeduction: 0,
    armedForcesMovingExpenses: 0,
    charitableContribForStdDeduction: 0,
    homeOfficeSqFt: 0,
    totalHomeSqFt: 0,
    homeOfficeMortgageInterest: 0,
    homeOfficeRent: 0,
    homeOfficeUtilities: 0,
    homeOfficeInsurance: 0,
    homeOfficeRepairs: 0,
    useSimplifiedHomeOffice: true,
    useItemizedDeductions: false,
    itemizedDeductions: {
      mortgageInterest: 0,
      pointsPaid: 0,
      mortgageInsurancePremiums: 0,
      propertyTax_real: 0,
      propertyTax_personal: 0,
      stateIncomeTaxPaid: 0,
      foreignTaxesPaid: 0,
      cashCharitable: 0,
      nonCashCharitable: 0,
      carryoverCharitable: 0,
      medicalExpenses: 0,
      investmentInterestExpense: 0,
      miscellaneous: 0,
    },
    qbiIncome: 0,
    estimatedTaxPayments: 0,
    priorYearOverpaymentApplied: 0,
    nolCarryforward: 0,
  };
}
