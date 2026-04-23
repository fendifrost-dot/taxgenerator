/**
 * documentParser.ts
 *
 * Sends uploaded tax documents to the Claude API and returns structured,
 * field-level parsed data with per-field confidence scores.
 *
 * RULES:
 *  - If a field cannot be read, its value is null and confidence is 0.
 *  - Every field carries a confidence score (0.0–1.0).
 *  - Fields with confidence < CONFIDENCE_THRESHOLD are flagged for manual review.
 *  - No guessing: Claude is instructed to prefer null over speculation.
 */

import { callClaudeMessages, extractText, AnthropicProxyError } from '@/lib/anthropicProxy';

export const CONFIDENCE_THRESHOLD = 0.85;

// ─── Field wrapper ─────────────────────────────────────────────────────────────

export interface ParsedField {
  value: string | number | boolean | null;
  confidence: number; // 0.0 – 1.0
  /** true when confidence < CONFIDENCE_THRESHOLD */
  flagged: boolean;
}

function makeField(value: unknown, confidence: unknown): ParsedField {
  const conf = typeof confidence === 'number' && confidence >= 0 && confidence <= 1 ? confidence : 0;
  return {
    value: value === undefined ? null : (value as string | number | boolean | null),
    confidence: conf,
    flagged: conf < CONFIDENCE_THRESHOLD,
  };
}

// ─── Per-document-type result shapes ──────────────────────────────────────────

export interface W2ParseResult {
  docKind: 'w2';
  taxYear: ParsedField;
  employerName: ParsedField;
  employerEIN: ParsedField;
  employerAddress: ParsedField;
  employeeName: ParsedField;
  employeeSSNLast4: ParsedField;
  employeeAddress: ParsedField;
  box1_wages: ParsedField;
  box2_federalWithholding: ParsedField;
  box3_socialSecurityWages: ParsedField;
  box4_socialSecurityTax: ParsedField;
  box5_medicareWages: ParsedField;
  box6_medicareTax: ParsedField;
  box12a_code: ParsedField;
  box12a_amount: ParsedField;
  box12b_code: ParsedField;
  box12b_amount: ParsedField;
  box12c_code: ParsedField;
  box12c_amount: ParsedField;
  box12d_code: ParsedField;
  box12d_amount: ParsedField;
  box13_statutoryEmployee: ParsedField;
  box13_retirementPlan: ParsedField;
  box13_thirdPartySick: ParsedField;
  box15_stateCode: ParsedField;
  box15_stateEIN: ParsedField;
  box16_stateWages: ParsedField;
  box17_stateTax: ParsedField;
  box18_localWages: ParsedField;
  box19_localTax: ParsedField;
  box20_locality: ParsedField;
  overallConfidence: number;
  flaggedFields: string[];
  rawResponse: string;
}

export interface Prior1040ParseResult {
  docKind: 'prior_return';
  taxYear: ParsedField;
  filerName: ParsedField;
  filingStatus: ParsedField;
  // Core 1040 lines
  totalWages: ParsedField;
  taxableInterest: ParsedField;
  ordinaryDividends: ParsedField;
  qualifiedDividends: ParsedField;
  totalIncome: ParsedField;
  adjustedGrossIncome: ParsedField;
  standardOrItemizedDeduction: ParsedField;
  qualifiedBusinessDeduction: ParsedField;
  taxableIncome: ParsedField;
  totalTax: ParsedField;
  totalPayments: ParsedField;
  refundOrOwed: ParsedField;
  // Schedule C (only populated if present)
  hasScheduleC: boolean;
  scheduleCBusinessName: ParsedField;
  scheduleCGrossReceipts: ParsedField;
  scheduleCTotalExpenses: ParsedField;
  scheduleCNetProfit: ParsedField;
  scheduleC_advertising: ParsedField;
  scheduleC_carTruck: ParsedField;
  scheduleC_commissionsFees: ParsedField;
  scheduleC_contractLabor: ParsedField;
  scheduleC_insurance: ParsedField;
  scheduleC_legalProfessional: ParsedField;
  scheduleC_officeExpense: ParsedField;
  scheduleC_supplies: ParsedField;
  scheduleC_travel: ParsedField;
  scheduleC_meals: ParsedField;
  scheduleC_utilities: ParsedField;
  scheduleC_otherExpenses: ParsedField;
  // Carryforwards
  carryforwardNOL: ParsedField;
  carryforwardCapitalLoss: ParsedField;
  overallConfidence: number;
  flaggedFields: string[];
  rawResponse: string;
}

export interface BusinessIncomeParseResult {
  docKind: 'business_income';
  taxYear: ParsedField;
  businessName: ParsedField;
  totalIncome: ParsedField;
  expense_mileage: ParsedField;
  expense_travel: ParsedField;
  expense_meals: ParsedField;
  expense_marketing: ParsedField;
  expense_advertising: ParsedField;
  expense_supplies: ParsedField;
  expense_contractLabor: ParsedField;
  expense_commissionsFees: ParsedField;
  expense_insurance: ParsedField;
  expense_legalProfessional: ParsedField;
  expense_officeExpense: ParsedField;
  expense_utilities: ParsedField;
  expense_otherExpenses: ParsedField;
  overallConfidence: number;
  flaggedFields: string[];
  rawResponse: string;
}

export interface Form1099ParseResult {
  docKind: '1099';
  variant: '1099_nec' | '1099_int' | '1099_div' | 'unknown';
  taxYear: ParsedField;
  payerName: ParsedField;
  payerEIN: ParsedField;
  payerAddress: ParsedField;
  recipientName: ParsedField;
  recipientTINLast4: ParsedField;
  recipientAddress: ParsedField;
  box1: ParsedField;
  box2: ParsedField;
  box3: ParsedField;
  box4_federalWithholding: ParsedField;
  box5: ParsedField;
  box6: ParsedField;
  box7: ParsedField;
  stateCode: ParsedField;
  stateTaxWithheld: ParsedField;
  stateIncome: ParsedField;
  overallConfidence: number;
  flaggedFields: string[];
  rawResponse: string;
}

// ─── K-1 parse results ────────────────────────────────────────────────────────

/** Schedule K-1 (Form 1065) — Partnership / Multi-member LLC / LLLP */
export interface K1_1065_ParseResult {
  docKind: 'k1_1065';
  taxYear: ParsedField;
  partnershipName: ParsedField;
  partnershipEIN: ParsedField;
  partnerName: ParsedField;
  partnerTINLast4: ParsedField;
  ownershipPct: ParsedField;
  isGeneralPartner: ParsedField;         // true/false
  // Schedule K-1 (1065) boxes
  box1_ordinaryIncome: ParsedField;
  box2_netRentalRealEstate: ParsedField;
  box3_otherNetRentalIncome: ParsedField;
  box4_guaranteedPaymentsServices: ParsedField;
  box5_guaranteedPaymentsCapital: ParsedField;
  box6a_netShortTermCapGain: ParsedField;
  box9a_netLongTermCapGain: ParsedField;
  box11_otherIncome: ParsedField;
  box12_section179: ParsedField;
  box13_otherDeductions: ParsedField;
  box14_seEarnings: ParsedField;         // Self-employment earnings (loss)
  box15_credits: ParsedField;
  box18_taxExemptIncome: ParsedField;
  box19_distributions: ParsedField;
  overallConfidence: number;
  flaggedFields: string[];
  rawResponse: string;
}

/** Schedule K-1 (Form 1120-S) — S Corporation */
export interface K1_1120S_ParseResult {
  docKind: 'k1_1120s';
  taxYear: ParsedField;
  corporationName: ParsedField;
  corporationEIN: ParsedField;
  shareholderName: ParsedField;
  shareholderTINLast4: ParsedField;
  ownershipPct: ParsedField;
  // Schedule K-1 (1120-S) boxes
  box1_ordinaryIncome: ParsedField;
  box2_netRentalRealEstate: ParsedField;
  box3_otherNetRentalIncome: ParsedField;
  box4_interestIncome: ParsedField;
  box5a_ordinaryDividends: ParsedField;
  box6_royalties: ParsedField;
  box7_netShortTermCapGain: ParsedField;
  box8a_netLongTermCapGain: ParsedField;
  box9_netSection1231: ParsedField;
  box10_otherIncome: ParsedField;
  box11_section179: ParsedField;
  box12_otherDeductions: ParsedField;
  box13_credits: ParsedField;
  box16_basisItems: ParsedField;
  box17_otherInfo: ParsedField;
  distributions: ParsedField;
  overallConfidence: number;
  flaggedFields: string[];
  rawResponse: string;
}

/** Form 1099-R — Distributions From Pensions, Annuities, Retirement Plans, IRAs */
export interface Form1099R_ParseResult {
  docKind: '1099_r';
  taxYear: ParsedField;
  payerName: ParsedField;
  payerEIN: ParsedField;
  recipientName: ParsedField;
  recipientTINLast4: ParsedField;
  // Core boxes
  box1_grossDistribution: ParsedField;   // Total amount distributed
  box2a_taxableAmount: ParsedField;      // Taxable portion
  box2b_taxableAmountNotDetermined: ParsedField; // Checkbox
  box2b_totalDistribution: ParsedField;  // Checkbox — final distribution
  box3_capitalGain: ParsedField;         // Capital gain portion
  box4_federalWithholding: ParsedField;  // Federal income tax withheld
  box5_employeeContributions: ParsedField; // After-tax contributions / basis
  box6_netUnrealizedAppreciation: ParsedField;
  box7_distributionCode: ParsedField;    // Single letter/number code (e.g., "1","2","G","H","Q")
  box7_irasepSimple: ParsedField;        // IRA/SEP/SIMPLE checkbox
  box8_otherAmount: ParsedField;
  box9b_totalEmployeeContributions: ParsedField;
  box10_amountAllocableToIRR: ParsedField;
  box12_stateCode: ParsedField;
  box13_stateDistributions: ParsedField;
  box14_stateTaxWithheld: ParsedField;
  overallConfidence: number;
  flaggedFields: string[];
  rawResponse: string;
}

// ─── Form 1099-B (Proceeds from Broker / Barter Exchange) ─────────────────────

export interface Form1099B_SaleLot {
  description: string | null;       // e.g. "100 SH AAPL"
  dateAcquired: string | null;       // "VARIOUS" or ISO date
  dateSold: string | null;
  proceeds: number | null;
  costBasis: number | null;
  adjustmentCode: string | null;     // W, H, B, M, etc.
  adjustmentAmount: number | null;
  gainOrLoss: number | null;
  termType: 'short' | 'long' | 'unknown'; // Box A/B/C/D/E/F
}

export interface Form1099B_ParseResult {
  docKind: '1099_b';
  taxYear: ParsedField;
  payerName: ParsedField;
  payerEIN: ParsedField;
  recipientName: ParsedField;
  recipientTINLast4: ParsedField;
  // Aggregate totals (some brokers report only these)
  totalProceeds: ParsedField;
  totalCostBasis: ParsedField;
  totalShortTermGainLoss: ParsedField;
  totalLongTermGainLoss: ParsedField;
  federalWithholding: ParsedField;
  stateWithholding: ParsedField;
  // Individual sale lots (if itemized)
  saleLots: Form1099B_SaleLot[];
  overallConfidence: number;
  flaggedFields: string[];
  rawResponse: string;
}

// ─── Form 1099-K (Payment Card / Third-Party Network Transactions) ─────────────

export interface Form1099K_ParseResult {
  docKind: '1099_k';
  taxYear: ParsedField;
  filerName: ParsedField;           // PSE (payment settlement entity)
  filerEIN: ParsedField;
  payeeNameOnFile: ParsedField;
  payeeAddress: ParsedField;
  payeeTINLast4: ParsedField;
  transactionType: ParsedField;     // "payment card" | "third party network"
  grossAmountTransactions: ParsedField; // Box 1a — total gross
  cardNotPresentTransactions: ParsedField; // Box 1b
  numberOfTransactions: ParsedField; // Box 3
  federalWithholding: ParsedField;  // Box 4
  // Month-by-month breakdown (Jan–Dec)
  monthlyAmounts: ParsedField[];    // 12-element array, boxes 5a–5l
  stateCode: ParsedField;
  stateIdNumber: ParsedField;
  stateTaxWithheld: ParsedField;
  overallConfidence: number;
  flaggedFields: string[];
  rawResponse: string;
}

export type DocKind = 'w2' | 'prior_return' | 'business_income' | '1099' | '1099_r' | '1099_b' | '1099_k' | 'k1_1065' | 'k1_1120s';

export type ParseResult =
  | W2ParseResult
  | Prior1040ParseResult
  | BusinessIncomeParseResult
  | Form1099ParseResult
  | Form1099R_ParseResult
  | Form1099B_ParseResult
  | Form1099K_ParseResult
  | K1_1065_ParseResult
  | K1_1120S_ParseResult;

export interface DocumentParseResponse {
  success: boolean;
  result?: ParseResult;
  error?: string;
  elapsedMs: number;
}

// ─── Prompts ───────────────────────────────────────────────────────────────────

const W2_PROMPT = `You are a precision tax document parser. Extract every field from this W-2 Wage and Tax Statement.

Return ONLY a valid JSON object — no markdown, no explanation — with this exact structure:

{
  "taxYear": { "value": <integer year or null>, "confidence": <0.0-1.0> },
  "employerName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "employerEIN": { "value": <"XX-XXXXXXX" formatted string or null>, "confidence": <0.0-1.0> },
  "employerAddress": { "value": <string or null>, "confidence": <0.0-1.0> },
  "employeeName": { "value": <full name string or null>, "confidence": <0.0-1.0> },
  "employeeSSNLast4": { "value": <last 4 digits as string like "1234" or null>, "confidence": <0.0-1.0> },
  "employeeAddress": { "value": <string or null>, "confidence": <0.0-1.0> },
  "box1_wages": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box2_federalWithholding": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box3_socialSecurityWages": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box4_socialSecurityTax": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box5_medicareWages": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box6_medicareTax": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box12a_code": { "value": <letter code string or null>, "confidence": <0.0-1.0> },
  "box12a_amount": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box12b_code": { "value": <letter code string or null>, "confidence": <0.0-1.0> },
  "box12b_amount": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box12c_code": { "value": <letter code string or null>, "confidence": <0.0-1.0> },
  "box12c_amount": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box12d_code": { "value": <letter code string or null>, "confidence": <0.0-1.0> },
  "box12d_amount": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box13_statutoryEmployee": { "value": <true/false/null>, "confidence": <0.0-1.0> },
  "box13_retirementPlan": { "value": <true/false/null>, "confidence": <0.0-1.0> },
  "box13_thirdPartySick": { "value": <true/false/null>, "confidence": <0.0-1.0> },
  "box15_stateCode": { "value": <2-letter state abbreviation or null>, "confidence": <0.0-1.0> },
  "box15_stateEIN": { "value": <string or null>, "confidence": <0.0-1.0> },
  "box16_stateWages": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box17_stateTax": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box18_localWages": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box19_localTax": { "value": <dollar amount as plain number or null>, "confidence": <0.0-1.0> },
  "box20_locality": { "value": <string or null>, "confidence": <0.0-1.0> }
}

Rules:
- Dollar amounts: plain numbers only (e.g., 52341.00 not "$52,341.00")
- Blank boxes: null value, confidence 1.0 (confirmed blank)
- Illegible text: null value, confidence proportional to legibility
- Do NOT guess — if uncertain, use null and low confidence
- Return ONLY the JSON object`;

const PRIOR_1040_PROMPT = `You are a precision tax document parser. Extract fields from this prior year IRS Form 1040 and any attached schedules.

Return ONLY a valid JSON object — no markdown, no explanation — with this exact structure:

{
  "taxYear": { "value": <integer year or null>, "confidence": <0.0-1.0> },
  "filerName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "filingStatus": { "value": <"single"|"married_jointly"|"married_separately"|"head_of_household"|"qualifying_widow" or null>, "confidence": <0.0-1.0> },
  "totalWages": { "value": <Line 1 amount as plain number or null>, "confidence": <0.0-1.0> },
  "taxableInterest": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "ordinaryDividends": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "qualifiedDividends": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "totalIncome": { "value": <Line 9 or equivalent total income as plain number or null>, "confidence": <0.0-1.0> },
  "adjustedGrossIncome": { "value": <AGI line as plain number or null>, "confidence": <0.0-1.0> },
  "standardOrItemizedDeduction": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "qualifiedBusinessDeduction": { "value": <Section 199A deduction as plain number or null>, "confidence": <0.0-1.0> },
  "taxableIncome": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "totalTax": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "totalPayments": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "refundOrOwed": { "value": <positive = refund, negative = owed, plain number or null>, "confidence": <0.0-1.0> },
  "hasScheduleC": <true if Schedule C is attached, false otherwise>,
  "scheduleCBusinessName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "scheduleCGrossReceipts": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "scheduleCTotalExpenses": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "scheduleCNetProfit": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_advertising": { "value": <Line 8 as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_carTruck": { "value": <Line 9 as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_commissionsFees": { "value": <Line 10 as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_contractLabor": { "value": <Line 11 as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_insurance": { "value": <Line 15 as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_legalProfessional": { "value": <Line 17 as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_officeExpense": { "value": <Line 18 as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_supplies": { "value": <Line 22 as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_travel": { "value": <Line 24a as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_meals": { "value": <Line 24b as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_utilities": { "value": <Line 25 as plain number or null>, "confidence": <0.0-1.0> },
  "scheduleC_otherExpenses": { "value": <Line 27a as plain number or null>, "confidence": <0.0-1.0> },
  "carryforwardNOL": { "value": <net operating loss carryforward as plain number or null>, "confidence": <0.0-1.0> },
  "carryforwardCapitalLoss": { "value": <capital loss carryforward as plain number or null>, "confidence": <0.0-1.0> }
}

Rules:
- Dollar amounts: plain numbers only (e.g., 75000.00)
- Blank/inapplicable lines: null value, confidence 1.0
- Illegible text: null value, low confidence
- hasScheduleC is a plain boolean (not wrapped in a field object)
- For scheduleC_* fields, return null values if hasScheduleC is false
- Do NOT guess — prefer null over speculation
- Return ONLY the JSON object`;

const BUSINESS_INCOME_PROMPT = `You are a precision tax document parser. Extract data from this business income summary document (may be a profit & loss statement, business income report, or similar).

Return ONLY a valid JSON object — no markdown, no explanation — with this exact structure:

{
  "taxYear": { "value": <integer year or null>, "confidence": <0.0-1.0> },
  "businessName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "totalIncome": { "value": <total gross business income as plain number or null>, "confidence": <0.0-1.0> },
  "expense_mileage": { "value": <mileage/vehicle expense as plain number or null>, "confidence": <0.0-1.0> },
  "expense_travel": { "value": <travel expense as plain number or null>, "confidence": <0.0-1.0> },
  "expense_meals": { "value": <meals expense as plain number or null>, "confidence": <0.0-1.0> },
  "expense_marketing": { "value": <marketing expense as plain number or null>, "confidence": <0.0-1.0> },
  "expense_advertising": { "value": <advertising expense as plain number or null>, "confidence": <0.0-1.0> },
  "expense_supplies": { "value": <supplies expense as plain number or null>, "confidence": <0.0-1.0> },
  "expense_contractLabor": { "value": <contract labor/1099 payments as plain number or null>, "confidence": <0.0-1.0> },
  "expense_commissionsFees": { "value": <commissions and fees as plain number or null>, "confidence": <0.0-1.0> },
  "expense_insurance": { "value": <insurance as plain number or null>, "confidence": <0.0-1.0> },
  "expense_legalProfessional": { "value": <legal and professional services as plain number or null>, "confidence": <0.0-1.0> },
  "expense_officeExpense": { "value": <office expense as plain number or null>, "confidence": <0.0-1.0> },
  "expense_utilities": { "value": <utilities as plain number or null>, "confidence": <0.0-1.0> },
  "expense_otherExpenses": { "value": <all other unlisted expenses as plain number or null>, "confidence": <0.0-1.0> }
}

Rules:
- Dollar amounts: plain numbers only, always positive (expenses are costs, not negative)
- If a category is not present in this document: null value, confidence 1.0 (confirmed absent)
- Illegible text: null value, low confidence
- Map expense line items to the closest matching category above
- Do NOT guess — prefer null over speculation
- Return ONLY the JSON object`;

const FORM_1099_PROMPT = `You are a precision tax document parser. Extract all fields from this 1099 form (may be NEC, INT, DIV, or MISC).

Return ONLY a valid JSON object — no markdown, no explanation — with this exact structure:

{
  "variant": <"1099_nec" | "1099_int" | "1099_div" | "unknown">,
  "taxYear": { "value": <integer year or null>, "confidence": <0.0-1.0> },
  "payerName": { "value": <payer/issuer name string or null>, "confidence": <0.0-1.0> },
  "payerEIN": { "value": <"XX-XXXXXXX" formatted string or null>, "confidence": <0.0-1.0> },
  "payerAddress": { "value": <string or null>, "confidence": <0.0-1.0> },
  "recipientName": { "value": <recipient name string or null>, "confidence": <0.0-1.0> },
  "recipientTINLast4": { "value": <last 4 digits of TIN/SSN as string like "5678" or null>, "confidence": <0.0-1.0> },
  "recipientAddress": { "value": <string or null>, "confidence": <0.0-1.0> },
  "box1": { "value": <Box 1 amount as plain number or null>, "confidence": <0.0-1.0> },
  "box2": { "value": <Box 2 amount as plain number or null>, "confidence": <0.0-1.0> },
  "box3": { "value": <Box 3 amount as plain number or null>, "confidence": <0.0-1.0> },
  "box4_federalWithholding": { "value": <federal income tax withheld as plain number or null>, "confidence": <0.0-1.0> },
  "box5": { "value": <Box 5 amount as plain number or null>, "confidence": <0.0-1.0> },
  "box6": { "value": <Box 6 amount as plain number or null>, "confidence": <0.0-1.0> },
  "box7": { "value": <Box 7 amount as plain number or null>, "confidence": <0.0-1.0> },
  "stateCode": { "value": <2-letter state abbreviation or null>, "confidence": <0.0-1.0> },
  "stateTaxWithheld": { "value": <plain number or null>, "confidence": <0.0-1.0> },
  "stateIncome": { "value": <plain number or null>, "confidence": <0.0-1.0> }
}

Rules:
- variant is a plain string (not wrapped in a field object)
- Dollar amounts: plain numbers only (e.g., 12500.00)
- Blank boxes: null value, confidence 1.0 (confirmed blank)
- For 1099-NEC: Box 1 = Nonemployee compensation
- For 1099-INT: Box 1 = Interest income
- For 1099-DIV: Box 1a = Total ordinary dividends, Box 1b = Qualified dividends
- Do NOT guess — prefer null over speculation
- Return ONLY the JSON object`;

// ─── Helpers ───────────────────────────────────────────────────────────────────

const K1_1065_PROMPT = `You are a precision tax document parser. Extract all fields from this Schedule K-1 (Form 1065) — Partnership or Multi-Member LLC.

Return ONLY a valid JSON object with this exact structure:

{
  "taxYear": { "value": <integer year or null>, "confidence": <0.0-1.0> },
  "partnershipName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "partnershipEIN": { "value": <"XX-XXXXXXX" string or null>, "confidence": <0.0-1.0> },
  "partnerName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "partnerTINLast4": { "value": <last 4 digits as string or null>, "confidence": <0.0-1.0> },
  "ownershipPct": { "value": <number 0-100 or null>, "confidence": <0.0-1.0> },
  "isGeneralPartner": { "value": <true/false or null>, "confidence": <0.0-1.0> },
  "box1_ordinaryIncome": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box2_netRentalRealEstate": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box3_otherNetRentalIncome": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box4_guaranteedPaymentsServices": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box5_guaranteedPaymentsCapital": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box6a_netShortTermCapGain": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box9a_netLongTermCapGain": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box11_otherIncome": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box12_section179": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box13_otherDeductions": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box14_seEarnings": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box15_credits": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box18_taxExemptIncome": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box19_distributions": { "value": <number or null>, "confidence": <0.0-1.0> }
}

RULES: Never guess. Use null + confidence 0 when unreadable. Losses are negative numbers.`;

const K1_1120S_PROMPT = `You are a precision tax document parser. Extract all fields from this Schedule K-1 (Form 1120-S) — S Corporation.

Return ONLY a valid JSON object with this exact structure:

{
  "taxYear": { "value": <integer year or null>, "confidence": <0.0-1.0> },
  "corporationName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "corporationEIN": { "value": <"XX-XXXXXXX" string or null>, "confidence": <0.0-1.0> },
  "shareholderName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "shareholderTINLast4": { "value": <last 4 digits as string or null>, "confidence": <0.0-1.0> },
  "ownershipPct": { "value": <number 0-100 or null>, "confidence": <0.0-1.0> },
  "box1_ordinaryIncome": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box2_netRentalRealEstate": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box3_otherNetRentalIncome": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box4_interestIncome": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box5a_ordinaryDividends": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box6_royalties": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box7_netShortTermCapGain": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box8a_netLongTermCapGain": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box9_netSection1231": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box10_otherIncome": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box11_section179": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box12_otherDeductions": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box13_credits": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box16_basisItems": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box17_otherInfo": { "value": <string or null>, "confidence": <0.0-1.0> },
  "distributions": { "value": <number or null>, "confidence": <0.0-1.0> }
}

RULES: Never guess. Use null + confidence 0 when unreadable. Losses are negative numbers.`;

const FORM_1099R_PROMPT = `You are a precision tax document parser. Extract all fields from this Form 1099-R (Distributions From Pensions, Annuities, Retirement or Profit-Sharing Plans, IRAs, Insurance Contracts, etc.).

Return ONLY a valid JSON object — no markdown, no explanation — with this exact structure:

{
  "taxYear": { "value": <integer year or null>, "confidence": <0.0-1.0> },
  "payerName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "payerEIN": { "value": <"XX-XXXXXXX" or null>, "confidence": <0.0-1.0> },
  "recipientName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "recipientTINLast4": { "value": <last 4 digits as string or null>, "confidence": <0.0-1.0> },
  "box1_grossDistribution": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box2a_taxableAmount": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box2b_taxableAmountNotDetermined": { "value": <boolean or null>, "confidence": <0.0-1.0> },
  "box2b_totalDistribution": { "value": <boolean or null>, "confidence": <0.0-1.0> },
  "box3_capitalGain": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box4_federalWithholding": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box5_employeeContributions": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box6_netUnrealizedAppreciation": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box7_distributionCode": { "value": <single character code string or null>, "confidence": <0.0-1.0> },
  "box7_irasepSimple": { "value": <boolean or null>, "confidence": <0.0-1.0> },
  "box8_otherAmount": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box9b_totalEmployeeContributions": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box10_amountAllocableToIRR": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box12_stateCode": { "value": <2-letter state code or null>, "confidence": <0.0-1.0> },
  "box13_stateDistributions": { "value": <number or null>, "confidence": <0.0-1.0> },
  "box14_stateTaxWithheld": { "value": <number or null>, "confidence": <0.0-1.0> }
}

DISTRIBUTION CODE REFERENCE (Box 7):
1 = Early distribution (no exception)
2 = Early distribution (exception applies)
3 = Disability
4 = Death
7 = Normal distribution (age 59½+)
G = Direct rollover to qualified plan
H = Direct rollover of a designated Roth account
Q = Qualified distribution from Roth IRA
R = Recharacterized IRA contribution
T = Roth IRA distribution (exception applies)

RULES: Never guess. Use null + confidence 0 if field is blank or unreadable.`;

const FORM_1099B_PROMPT = `You are a precision tax document parser. Extract all data from this Form 1099-B (Proceeds from Broker and Barter Exchange Transactions).

Return ONLY a valid JSON object with this exact structure:

{
  "taxYear": { "value": <integer year or null>, "confidence": <0.0-1.0> },
  "payerName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "payerEIN": { "value": <"XX-XXXXXXX" or null>, "confidence": <0.0-1.0> },
  "recipientName": { "value": <string or null>, "confidence": <0.0-1.0> },
  "recipientTINLast4": { "value": <last 4 digits string or null>, "confidence": <0.0-1.0> },
  "totalProceeds": { "value": <number or null>, "confidence": <0.0-1.0> },
  "totalCostBasis": { "value": <number or null>, "confidence": <0.0-1.0> },
  "totalShortTermGainLoss": { "value": <number or null>, "confidence": <0.0-1.0> },
  "totalLongTermGainLoss": { "value": <number or null>, "confidence": <0.0-1.0> },
  "federalWithholding": { "value": <number or null>, "confidence": <0.0-1.0> },
  "stateWithholding": { "value": <number or null>, "confidence": <0.0-1.0> },
  "saleLots": [
    {
      "description": <string or null>,
      "dateAcquired": <"VARIOUS" or "YYYY-MM-DD" or null>,
      "dateSold": <"YYYY-MM-DD" or null>,
      "proceeds": <number or null>,
      "costBasis": <number or null>,
      "adjustmentCode": <string or null>,
      "adjustmentAmount": <number or null>,
      "gainOrLoss": <number or null>,
      "termType": <"short" | "long" | "unknown">
    }
  ]
}

TERM TYPE GUIDE:
- Box A or B or C with short-term checkbox → "short"
- Box D or E or F with long-term checkbox → "long"
- If unclear → "unknown"
Gains are positive numbers. Losses are negative numbers.
RULES: Never guess. Use null + confidence 0 when unreadable. saleLots may be empty array if broker reports only aggregate totals.`;

const FORM_1099K_PROMPT = `You are a precision tax document parser. Extract all data from this Form 1099-K (Payment Card and Third Party Network Transactions).

Return ONLY a valid JSON object with this exact structure:

{
  "taxYear": { "value": <integer year or null>, "confidence": <0.0-1.0> },
  "filerName": { "value": <PSE name string or null>, "confidence": <0.0-1.0> },
  "filerEIN": { "value": <"XX-XXXXXXX" or null>, "confidence": <0.0-1.0> },
  "payeeNameOnFile": { "value": <string or null>, "confidence": <0.0-1.0> },
  "payeeAddress": { "value": <string or null>, "confidence": <0.0-1.0> },
  "payeeTINLast4": { "value": <last 4 digits string or null>, "confidence": <0.0-1.0> },
  "transactionType": { "value": <"payment card" | "third party network" | null>, "confidence": <0.0-1.0> },
  "grossAmountTransactions": { "value": <number or null>, "confidence": <0.0-1.0> },
  "cardNotPresentTransactions": { "value": <number or null>, "confidence": <0.0-1.0> },
  "numberOfTransactions": { "value": <integer or null>, "confidence": <0.0-1.0> },
  "federalWithholding": { "value": <number or null>, "confidence": <0.0-1.0> },
  "monthlyAmounts": [
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> },
    { "value": <number or null>, "confidence": <0.0-1.0> }
  ],
  "stateCode": { "value": <2-letter state code or null>, "confidence": <0.0-1.0> },
  "stateIdNumber": { "value": <string or null>, "confidence": <0.0-1.0> },
  "stateTaxWithheld": { "value": <number or null>, "confidence": <0.0-1.0> }
}

COMMON ISSUERS: PayPal (EIN 26-2777165), Venmo (same as PayPal), Cash App (Square Inc), Stripe, Amazon, Etsy, eBay.
The monthlyAmounts array must always have exactly 12 elements (Jan=index 0, Dec=index 11). Use null for missing months.
RULES: Never guess. Use null + confidence 0 when unreadable.`;

function promptForKind(kind: DocKind): string {
  switch (kind) {
    case 'w2': return W2_PROMPT;
    case 'prior_return': return PRIOR_1040_PROMPT;
    case 'business_income': return BUSINESS_INCOME_PROMPT;
    case '1099': return FORM_1099_PROMPT;
    case '1099_r': return FORM_1099R_PROMPT;
    case '1099_b': return FORM_1099B_PROMPT;
    case '1099_k': return FORM_1099K_PROMPT;
    case 'k1_1065': return K1_1065_PROMPT;
    case 'k1_1120s': return K1_1120S_PROMPT;
  }
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
}

function extractJsonObject(text: string): string {
  const stripped = stripCodeFences(text);
  // Try the full string first
  try { JSON.parse(stripped); return stripped; } catch { /* fall through */ }
  // Use brace counting to find the FIRST complete {...} block (avoids greedy regex capturing too much)
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = stripped.slice(start, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { /* malformed — keep looking */ }
        start = -1;
      }
    }
  }
  throw new Error('No valid JSON object found in model response');
}

type RawField = { value?: unknown; confidence?: unknown };

/**
 * Coerce a raw value from the model into a number or null.
 * Models sometimes return numeric values as strings (e.g. "1234.56", "(500.00)", "$1,200").
 * This handles those cases so 1099-B saleLot numeric fields don't silently become null.
 */
function coerceNum(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string') {
    // Strip currency symbols, commas; handle parentheses as negative
    const isNeg = v.trim().startsWith('(') && v.trim().endsWith(')');
    const cleaned = v.replace(/[$,()]/g, '').trim();
    const n = parseFloat(cleaned);
    if (isFinite(n)) return isNeg ? -n : n;
  }
  return null;
}

function fieldFrom(raw: unknown): ParsedField {
  if (raw === null || raw === undefined) return makeField(null, 0);
  const r = raw as RawField;
  return makeField(r.value ?? null, r.confidence ?? 0);
}

function collectFlagged(fields: Record<string, ParsedField>): string[] {
  return Object.entries(fields)
    .filter(([, f]) => f.flagged)
    .map(([k]) => k);
}

function avgConfidence(fields: Record<string, ParsedField>): number {
  const vals = Object.values(fields);
  if (vals.length === 0) return 0;
  return vals.reduce((s, f) => s + f.confidence, 0) / vals.length;
}

// ─── Per-document-type response parsers ───────────────────────────────────────

function parseW2Response(raw: Record<string, unknown>, text: string): W2ParseResult {
  const f = (key: string): ParsedField => fieldFrom(raw[key]);
  const fields: Record<string, ParsedField> = {
    taxYear: f('taxYear'),
    employerName: f('employerName'),
    employerEIN: f('employerEIN'),
    employerAddress: f('employerAddress'),
    employeeName: f('employeeName'),
    employeeSSNLast4: f('employeeSSNLast4'),
    employeeAddress: f('employeeAddress'),
    box1_wages: f('box1_wages'),
    box2_federalWithholding: f('box2_federalWithholding'),
    box3_socialSecurityWages: f('box3_socialSecurityWages'),
    box4_socialSecurityTax: f('box4_socialSecurityTax'),
    box5_medicareWages: f('box5_medicareWages'),
    box6_medicareTax: f('box6_medicareTax'),
    box12a_code: f('box12a_code'),
    box12a_amount: f('box12a_amount'),
    box12b_code: f('box12b_code'),
    box12b_amount: f('box12b_amount'),
    box12c_code: f('box12c_code'),
    box12c_amount: f('box12c_amount'),
    box12d_code: f('box12d_code'),
    box12d_amount: f('box12d_amount'),
    box13_statutoryEmployee: f('box13_statutoryEmployee'),
    box13_retirementPlan: f('box13_retirementPlan'),
    box13_thirdPartySick: f('box13_thirdPartySick'),
    box15_stateCode: f('box15_stateCode'),
    box15_stateEIN: f('box15_stateEIN'),
    box16_stateWages: f('box16_stateWages'),
    box17_stateTax: f('box17_stateTax'),
    box18_localWages: f('box18_localWages'),
    box19_localTax: f('box19_localTax'),
    box20_locality: f('box20_locality'),
  };

  return {
    docKind: 'w2',
    ...fields,
    overallConfidence: avgConfidence(fields),
    flaggedFields: collectFlagged(fields),
    rawResponse: text,
  } as W2ParseResult;
}

function parsePrior1040Response(raw: Record<string, unknown>, text: string): Prior1040ParseResult {
  const f = (key: string): ParsedField => fieldFrom(raw[key]);
  const fields: Record<string, ParsedField> = {
    taxYear: f('taxYear'),
    filerName: f('filerName'),
    filingStatus: f('filingStatus'),
    totalWages: f('totalWages'),
    taxableInterest: f('taxableInterest'),
    ordinaryDividends: f('ordinaryDividends'),
    qualifiedDividends: f('qualifiedDividends'),
    totalIncome: f('totalIncome'),
    adjustedGrossIncome: f('adjustedGrossIncome'),
    standardOrItemizedDeduction: f('standardOrItemizedDeduction'),
    qualifiedBusinessDeduction: f('qualifiedBusinessDeduction'),
    taxableIncome: f('taxableIncome'),
    totalTax: f('totalTax'),
    totalPayments: f('totalPayments'),
    refundOrOwed: f('refundOrOwed'),
    scheduleCBusinessName: f('scheduleCBusinessName'),
    scheduleCGrossReceipts: f('scheduleCGrossReceipts'),
    scheduleCTotalExpenses: f('scheduleCTotalExpenses'),
    scheduleCNetProfit: f('scheduleCNetProfit'),
    scheduleC_advertising: f('scheduleC_advertising'),
    scheduleC_carTruck: f('scheduleC_carTruck'),
    scheduleC_commissionsFees: f('scheduleC_commissionsFees'),
    scheduleC_contractLabor: f('scheduleC_contractLabor'),
    scheduleC_insurance: f('scheduleC_insurance'),
    scheduleC_legalProfessional: f('scheduleC_legalProfessional'),
    scheduleC_officeExpense: f('scheduleC_officeExpense'),
    scheduleC_supplies: f('scheduleC_supplies'),
    scheduleC_travel: f('scheduleC_travel'),
    scheduleC_meals: f('scheduleC_meals'),
    scheduleC_utilities: f('scheduleC_utilities'),
    scheduleC_otherExpenses: f('scheduleC_otherExpenses'),
    carryforwardNOL: f('carryforwardNOL'),
    carryforwardCapitalLoss: f('carryforwardCapitalLoss'),
  };

  return {
    docKind: 'prior_return',
    ...fields,
    hasScheduleC: Boolean(raw['hasScheduleC']),
    overallConfidence: avgConfidence(fields),
    flaggedFields: collectFlagged(fields),
    rawResponse: text,
  } as Prior1040ParseResult;
}

function parseBusinessIncomeResponse(raw: Record<string, unknown>, text: string): BusinessIncomeParseResult {
  const f = (key: string): ParsedField => fieldFrom(raw[key]);
  const fields: Record<string, ParsedField> = {
    taxYear: f('taxYear'),
    businessName: f('businessName'),
    totalIncome: f('totalIncome'),
    expense_mileage: f('expense_mileage'),
    expense_travel: f('expense_travel'),
    expense_meals: f('expense_meals'),
    expense_marketing: f('expense_marketing'),
    expense_advertising: f('expense_advertising'),
    expense_supplies: f('expense_supplies'),
    expense_contractLabor: f('expense_contractLabor'),
    expense_commissionsFees: f('expense_commissionsFees'),
    expense_insurance: f('expense_insurance'),
    expense_legalProfessional: f('expense_legalProfessional'),
    expense_officeExpense: f('expense_officeExpense'),
    expense_utilities: f('expense_utilities'),
    expense_otherExpenses: f('expense_otherExpenses'),
  };

  return {
    docKind: 'business_income',
    ...fields,
    overallConfidence: avgConfidence(fields),
    flaggedFields: collectFlagged(fields),
    rawResponse: text,
  } as BusinessIncomeParseResult;
}

function parse1099Response(raw: Record<string, unknown>, text: string): Form1099ParseResult {
  const f = (key: string): ParsedField => fieldFrom(raw[key]);
  const variantRaw = String(raw['variant'] ?? 'unknown');
  const validVariants = ['1099_nec', '1099_int', '1099_div'];
  const variant = validVariants.includes(variantRaw)
    ? (variantRaw as Form1099ParseResult['variant'])
    : 'unknown';

  const fields: Record<string, ParsedField> = {
    taxYear: f('taxYear'),
    payerName: f('payerName'),
    payerEIN: f('payerEIN'),
    payerAddress: f('payerAddress'),
    recipientName: f('recipientName'),
    recipientTINLast4: f('recipientTINLast4'),
    recipientAddress: f('recipientAddress'),
    box1: f('box1'),
    box2: f('box2'),
    box3: f('box3'),
    box4_federalWithholding: f('box4_federalWithholding'),
    box5: f('box5'),
    box6: f('box6'),
    box7: f('box7'),
    stateCode: f('stateCode'),
    stateTaxWithheld: f('stateTaxWithheld'),
    stateIncome: f('stateIncome'),
  };

  return {
    docKind: '1099',
    variant,
    ...fields,
    overallConfidence: avgConfidence(fields),
    flaggedFields: collectFlagged(fields),
    rawResponse: text,
  } as Form1099ParseResult;
}

function parseK1_1065Response(raw: Record<string, unknown>, text: string): K1_1065_ParseResult {
  const fields = {
    taxYear:                       fieldFrom(raw.taxYear),
    partnershipName:               fieldFrom(raw.partnershipName),
    partnershipEIN:                fieldFrom(raw.partnershipEIN),
    partnerName:                   fieldFrom(raw.partnerName),
    partnerTINLast4:               fieldFrom(raw.partnerTINLast4),
    ownershipPct:                  fieldFrom(raw.ownershipPct),
    isGeneralPartner:              fieldFrom(raw.isGeneralPartner),
    box1_ordinaryIncome:           fieldFrom(raw.box1_ordinaryIncome),
    box2_netRentalRealEstate:      fieldFrom(raw.box2_netRentalRealEstate),
    box3_otherNetRentalIncome:     fieldFrom(raw.box3_otherNetRentalIncome),
    box4_guaranteedPaymentsServices: fieldFrom(raw.box4_guaranteedPaymentsServices),
    box5_guaranteedPaymentsCapital:  fieldFrom(raw.box5_guaranteedPaymentsCapital),
    box6a_netShortTermCapGain:     fieldFrom(raw.box6a_netShortTermCapGain),
    box9a_netLongTermCapGain:      fieldFrom(raw.box9a_netLongTermCapGain),
    box11_otherIncome:             fieldFrom(raw.box11_otherIncome),
    box12_section179:              fieldFrom(raw.box12_section179),
    box13_otherDeductions:         fieldFrom(raw.box13_otherDeductions),
    box14_seEarnings:              fieldFrom(raw.box14_seEarnings),
    box15_credits:                 fieldFrom(raw.box15_credits),
    box18_taxExemptIncome:         fieldFrom(raw.box18_taxExemptIncome),
    box19_distributions:           fieldFrom(raw.box19_distributions),
  };
  return {
    docKind: 'k1_1065',
    ...fields,
    overallConfidence: avgConfidence(fields),
    flaggedFields: collectFlagged(fields),
    rawResponse: text,
  };
}

function parseK1_1120SResponse(raw: Record<string, unknown>, text: string): K1_1120S_ParseResult {
  const fields = {
    taxYear:                fieldFrom(raw.taxYear),
    corporationName:        fieldFrom(raw.corporationName),
    corporationEIN:         fieldFrom(raw.corporationEIN),
    shareholderName:        fieldFrom(raw.shareholderName),
    shareholderTINLast4:    fieldFrom(raw.shareholderTINLast4),
    ownershipPct:           fieldFrom(raw.ownershipPct),
    box1_ordinaryIncome:    fieldFrom(raw.box1_ordinaryIncome),
    box2_netRentalRealEstate: fieldFrom(raw.box2_netRentalRealEstate),
    box3_otherNetRentalIncome: fieldFrom(raw.box3_otherNetRentalIncome),
    box4_interestIncome:    fieldFrom(raw.box4_interestIncome),
    box5a_ordinaryDividends: fieldFrom(raw.box5a_ordinaryDividends),
    box6_royalties:         fieldFrom(raw.box6_royalties),
    box7_netShortTermCapGain: fieldFrom(raw.box7_netShortTermCapGain),
    box8a_netLongTermCapGain: fieldFrom(raw.box8a_netLongTermCapGain),
    box9_netSection1231:    fieldFrom(raw.box9_netSection1231),
    box10_otherIncome:      fieldFrom(raw.box10_otherIncome),
    box11_section179:       fieldFrom(raw.box11_section179),
    box12_otherDeductions:  fieldFrom(raw.box12_otherDeductions),
    box13_credits:          fieldFrom(raw.box13_credits),
    box16_basisItems:       fieldFrom(raw.box16_basisItems),
    box17_otherInfo:        fieldFrom(raw.box17_otherInfo),
    distributions:          fieldFrom(raw.distributions),
  };
  return {
    docKind: 'k1_1120s',
    ...fields,
    overallConfidence: avgConfidence(fields),
    flaggedFields: collectFlagged(fields),
    rawResponse: text,
  };
}

function parse1099RResponse(raw: Record<string, unknown>, text: string): Form1099R_ParseResult {
  const f = (key: string): ParsedField => fieldFrom(raw[key]);
  const fields: Record<string, ParsedField> = {
    taxYear: f('taxYear'),
    payerName: f('payerName'),
    payerEIN: f('payerEIN'),
    recipientName: f('recipientName'),
    recipientTINLast4: f('recipientTINLast4'),
    box1_grossDistribution: f('box1_grossDistribution'),
    box2a_taxableAmount: f('box2a_taxableAmount'),
    box2b_taxableAmountNotDetermined: f('box2b_taxableAmountNotDetermined'),
    box2b_totalDistribution: f('box2b_totalDistribution'),
    box3_capitalGain: f('box3_capitalGain'),
    box4_federalWithholding: f('box4_federalWithholding'),
    box5_employeeContributions: f('box5_employeeContributions'),
    box6_netUnrealizedAppreciation: f('box6_netUnrealizedAppreciation'),
    box7_distributionCode: f('box7_distributionCode'),
    box7_irasepSimple: f('box7_irasepSimple'),
    box8_otherAmount: f('box8_otherAmount'),
    box9b_totalEmployeeContributions: f('box9b_totalEmployeeContributions'),
    box10_amountAllocableToIRR: f('box10_amountAllocableToIRR'),
    box12_stateCode: f('box12_stateCode'),
    box13_stateDistributions: f('box13_stateDistributions'),
    box14_stateTaxWithheld: f('box14_stateTaxWithheld'),
  };
  return {
    docKind: '1099_r',
    ...fields,
    overallConfidence: avgConfidence(fields),
    flaggedFields: collectFlagged(fields),
    rawResponse: text,
  } as Form1099R_ParseResult;
}

function parse1099BResponse(raw: Record<string, unknown>, text: string): Form1099B_ParseResult {
  const f = (key: string): ParsedField => fieldFrom(raw[key]);

  // Parse individual sale lots
  const rawLots = Array.isArray(raw['saleLots']) ? raw['saleLots'] as Record<string, unknown>[] : [];
  // Use coerceNum for all numeric fields — models sometimes return strings like "1234.56" or "(500.00)"
  const saleLots: Form1099B_SaleLot[] = rawLots.map((lot) => ({
    description: (lot['description'] as string | null) ?? null,
    dateAcquired: (lot['dateAcquired'] as string | null) ?? null,
    dateSold: (lot['dateSold'] as string | null) ?? null,
    proceeds: coerceNum(lot['proceeds']),
    costBasis: coerceNum(lot['costBasis']),
    adjustmentCode: (lot['adjustmentCode'] as string | null) ?? null,
    adjustmentAmount: coerceNum(lot['adjustmentAmount']),
    gainOrLoss: coerceNum(lot['gainOrLoss']),
    termType: (['short', 'long', 'unknown'].includes(lot['termType'] as string)
      ? lot['termType']
      : 'unknown') as 'short' | 'long' | 'unknown',
  }));

  const fields: Record<string, ParsedField> = {
    taxYear: f('taxYear'),
    payerName: f('payerName'),
    payerEIN: f('payerEIN'),
    recipientName: f('recipientName'),
    recipientTINLast4: f('recipientTINLast4'),
    totalProceeds: f('totalProceeds'),
    totalCostBasis: f('totalCostBasis'),
    totalShortTermGainLoss: f('totalShortTermGainLoss'),
    totalLongTermGainLoss: f('totalLongTermGainLoss'),
    federalWithholding: f('federalWithholding'),
    stateWithholding: f('stateWithholding'),
  };

  return {
    docKind: '1099_b',
    ...fields,
    saleLots,
    overallConfidence: avgConfidence(fields),
    flaggedFields: collectFlagged(fields),
    rawResponse: text,
  } as Form1099B_ParseResult;
}

function parse1099KResponse(raw: Record<string, unknown>, text: string): Form1099K_ParseResult {
  const f = (key: string): ParsedField => fieldFrom(raw[key]);

  // Parse monthly amounts array (12 elements)
  const rawMonthly = Array.isArray(raw['monthlyAmounts']) ? raw['monthlyAmounts'] as unknown[] : [];
  const monthlyAmounts: ParsedField[] = Array.from({ length: 12 }, (_, i) =>
    fieldFrom(rawMonthly[i] ?? null)
  );

  const fields: Record<string, ParsedField> = {
    taxYear: f('taxYear'),
    filerName: f('filerName'),
    filerEIN: f('filerEIN'),
    payeeNameOnFile: f('payeeNameOnFile'),
    payeeAddress: f('payeeAddress'),
    payeeTINLast4: f('payeeTINLast4'),
    transactionType: f('transactionType'),
    grossAmountTransactions: f('grossAmountTransactions'),
    cardNotPresentTransactions: f('cardNotPresentTransactions'),
    numberOfTransactions: f('numberOfTransactions'),
    federalWithholding: f('federalWithholding'),
    stateCode: f('stateCode'),
    stateIdNumber: f('stateIdNumber'),
    stateTaxWithheld: f('stateTaxWithheld'),
  };

  return {
    docKind: '1099_k',
    ...fields,
    monthlyAmounts,
    overallConfidence: avgConfidence(fields),
    flaggedFields: collectFlagged(fields),
    rawResponse: text,
  } as Form1099K_ParseResult;
}

function parseClaudeResponse(text: string, kind: DocKind): ParseResult {
  const jsonText = extractJsonObject(text);
  const raw = JSON.parse(jsonText) as Record<string, unknown>;

  switch (kind) {
    case 'w2':             return parseW2Response(raw, text);
    case 'prior_return':   return parsePrior1040Response(raw, text);
    case 'business_income': return parseBusinessIncomeResponse(raw, text);
    case '1099':           return parse1099Response(raw, text);
    case '1099_r':         return parse1099RResponse(raw, text);
    case '1099_b':         return parse1099BResponse(raw, text);
    case '1099_k':         return parse1099KResponse(raw, text);
    case 'k1_1065':        return parseK1_1065Response(raw, text);
    case 'k1_1120s':       return parseK1_1120SResponse(raw, text);
  }
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse a tax document using the Claude API.
 * The file must be a PDF or image.
 * Returns structured data with per-field confidence scores.
 */
export async function parseDocument(
  file: File,
  kind: DocKind,
): Promise<DocumentParseResponse> {
  const t0 = Date.now();

  try {
    // Read file as base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    const isImage = file.type.startsWith('image/');
    const mediaType = (isImage ? file.type : 'application/pdf') as
      | 'application/pdf'
      | 'image/jpeg'
      | 'image/png'
      | 'image/gif'
      | 'image/webp';

    const contentBlock = isImage
      ? { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data: base64 } }
      : { type: 'document' as const, source: { type: 'base64' as const, media_type: mediaType, data: base64 } };

    const payload = await callClaudeMessages({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system:
        'You are a highly accurate tax document data extractor. Return only valid JSON objects. Never include explanations, markdown, or commentary outside the JSON.',
      messages: [
        {
          role: 'user',
          content: [contentBlock, { type: 'text', text: promptForKind(kind) }],
        },
      ],
    });

    const text = extractText(payload);
    if (!text) throw new Error('Empty response from API');

    const result = parseClaudeResponse(text, kind);

    return { success: true, result, elapsedMs: Date.now() - t0 };
  } catch (err) {
    const message =
      err instanceof AnthropicProxyError
        ? `API error ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      success: false,
      error: message,
      elapsedMs: Date.now() - t0,
    };
  }
}
