/**
 * priorYearBuilder.ts
 *
 * Uses Claude to construct a completed prior year return from:
 *  1. Current year snapshot data (employers, businesses, income, deductions)
 *  2. User answers to differential questions (what changed in the target year)
 *  3. Year-specific tax rules from priorYearRules.ts
 *  4. Free-form notes/comments from the preparer or client
 *
 * Claude returns a structured JSON summary that maps to the 1040 line items
 * for the target year, with confidence flags on estimated values.
 */

import { YearTaxRules, formatRulesForPrompt } from './priorYearRules';

// ─── Input types ───────────────────────────────────────────────────────────────

export interface PriorYearDifferential {
  /** Was filing status the same? If not, what was it? */
  filingStatus: string;

  /** Were the same W-2 employers active? Name changes / new employers? */
  w2Changes: string;
  /** Estimated W-2 wages for this year (may differ from current year) */
  estimatedW2Wages: number | null;

  /** Were the same businesses active? Any additions or closures? */
  businessChanges: string;
  /** Estimated gross receipts per business for this year */
  businessIncomeEstimates: Array<{ businessName: string; estimatedGross: number }>;

  /** Any 1099 income (freelance, interest, dividends, etc.)? */
  other1099Income: string;
  estimated1099Amount: number | null;

  /** Did the client own a home in this year? */
  ownedHome: boolean | null;
  mortgageInterestPaid: number | null;
  propertyTaxPaid: number | null;

  /** Did the client have dependents? */
  hasDependents: boolean | null;
  numberOfDependents: number | null;
  dependentChildrenUnder17: number | null;

  /** Did the client make retirement contributions? */
  madeIRAContribution: boolean | null;
  iraContributionAmount: number | null;
  made401kContribution: boolean | null;
  k401ContributionAmount: number | null;
  madeSEPContribution: boolean | null;
  sepContributionAmount: number | null;

  /** Student loan interest paid */
  studentLoanInterest: number | null;

  /** Charitable contributions */
  charitableCashDonations: number | null;
  charitableNonCashDonations: number | null;

  /** Health/HSA */
  hsaContributions: number | null;
  selfEmployedHealthInsurance: number | null;

  /** Business use of home (home office) */
  hadHomeOffice: boolean | null;
  homeOfficeSquareFeet: number | null;
  totalHomeSqFt: number | null;

  /** Business vehicle miles driven */
  businessMilesDriven: number | null;

  /** Any significant events (sold home, received inheritance, etc.) */
  significantEvents: string;

  /** State of residence for this year */
  stateOfResidence: string;
}

export interface PriorYearBuilderInput {
  targetYear: number;
  rules: YearTaxRules;
  currentYearSnapshot: CurrentYearSnapshot;
  differential: PriorYearDifferential;
  preparerNotes: string;
}

export interface CurrentYearSnapshot {
  taxYear: number;
  filingStatus?: string;
  w2Employers: string[];
  totalW2Wages: number;
  businesses: Array<{ name: string; grossIncome: number }>;
  total1099Income: number;
  stateOfResidence?: string;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface PriorYearReturnLine {
  lineRef: string;         // e.g., "1040 Line 1a", "Schedule C Line 1"
  description: string;
  amount: number;
  isEstimated: boolean;    // true = based on approximation, verify with source docs
  notes?: string;
}

export interface PriorYearReturnSection {
  title: string;           // "Income", "Adjustments", "Deductions", "Credits", "Tax Summary"
  lines: PriorYearReturnLine[];
  subtotal?: number;
}

export interface PriorYearReturnSummary {
  taxYear: number;
  filingStatus: string;
  sections: PriorYearReturnSection[];

  // Key totals
  grossIncome: number;
  adjustedGrossIncome: number;
  standardOrItemizedDeduction: number;
  deductionType: 'standard' | 'itemized';
  taxableIncome: number;
  estimatedTaxLiability: number;
  totalCredits: number;
  estimatedRefundOrOwed: number;

  // Flags
  hasEstimatedValues: boolean;
  missingDocuments: string[];
  recommendedActions: string[];

  // Year-specific notes from Claude
  yearSpecificNotes: string;
  preparerSummary: string;
}

export interface BuilderResult {
  summary: PriorYearReturnSummary | null;
  rawResponse: string;
  elapsedMs: number;
  error?: string;
}

// ─── Question definitions ─────────────────────────────────────────────────────

export interface PriorYearQuestion {
  id: keyof PriorYearDifferential;
  label: string;
  helpText?: string;
  type: 'text' | 'yesno' | 'number' | 'currency' | 'business_income_list';
  defaultFromCurrentYear?: (snap: CurrentYearSnapshot) => string | number | boolean | null;
  showIf?: (answers: Partial<PriorYearDifferential>) => boolean;
}

export const PRIOR_YEAR_QUESTIONS: PriorYearQuestion[] = [
  {
    id: 'filingStatus',
    label: 'What was your filing status in {year}?',
    helpText: 'Single, Married Filing Jointly, Married Filing Separately, Head of Household, or Qualifying Widow(er).',
    type: 'text',
    defaultFromCurrentYear: (s) => s.filingStatus ?? 'Single',
  },
  {
    id: 'stateOfResidence',
    label: 'What state did you live in during {year}?',
    helpText: 'Use 2-letter state code (e.g., TX, CA, FL). This affects state-level filing requirements.',
    type: 'text',
    defaultFromCurrentYear: (s) => s.stateOfResidence ?? '',
  },
  {
    id: 'w2Changes',
    label: 'Did you have W-2 employment income in {year}? Any employer changes from current year?',
    helpText: `Your current year employers are listed as context. Note any additions, departures, or name changes for {year}.`,
    type: 'text',
    defaultFromCurrentYear: (s) => s.w2Employers.length > 0
      ? `Same employers: ${s.w2Employers.join(', ')}`
      : 'No W-2 employment',
  },
  {
    id: 'estimatedW2Wages',
    label: 'Approximate total W-2 wages for {year}',
    helpText: 'Estimate if exact W-2 not available. Mark as estimated — we recommend requesting an IRS wage transcript.',
    type: 'currency',
    defaultFromCurrentYear: (s) => s.totalW2Wages,
    showIf: (a) => a.w2Changes !== 'No W-2 employment',
  },
  {
    id: 'businessChanges',
    label: 'Were your businesses active in {year}? Any changes from current year?',
    helpText: 'Note if a business was not yet open, closed, or had significantly different activity.',
    type: 'text',
  },
  {
    id: 'businessIncomeEstimates',
    label: 'Estimated gross receipts per business in {year}',
    helpText: 'Provide your best estimate of total gross income (before expenses) for each business.',
    type: 'business_income_list',
  },
  {
    id: 'other1099Income',
    label: 'Did you receive any 1099 income in {year}? (freelance, interest, dividends, unemployment, etc.)',
    type: 'text',
  },
  {
    id: 'estimated1099Amount',
    label: 'Approximate total 1099 income in {year}',
    type: 'currency',
    showIf: (a) => Boolean(a.other1099Income && a.other1099Income.trim().length > 3),
  },
  {
    id: 'hasDependents',
    label: 'Did you have any dependents (children or other qualifying persons) in {year}?',
    type: 'yesno',
  },
  {
    id: 'numberOfDependents',
    label: 'Total number of dependents in {year}',
    type: 'number',
    showIf: (a) => a.hasDependents === true,
  },
  {
    id: 'dependentChildrenUnder17',
    label: 'How many dependent children were under age 17 at year-end {year}?',
    helpText: 'Used for Child Tax Credit calculation.',
    type: 'number',
    showIf: (a) => a.hasDependents === true,
  },
  {
    id: 'ownedHome',
    label: 'Did you own your home in {year}?',
    type: 'yesno',
  },
  {
    id: 'mortgageInterestPaid',
    label: 'Approximate mortgage interest paid in {year} (from Form 1098)',
    type: 'currency',
    showIf: (a) => a.ownedHome === true,
  },
  {
    id: 'propertyTaxPaid',
    label: 'Approximate property taxes paid in {year}',
    type: 'currency',
    showIf: (a) => a.ownedHome === true,
  },
  {
    id: 'hadHomeOffice',
    label: 'Did you use a home office exclusively for business in {year}?',
    type: 'yesno',
  },
  {
    id: 'homeOfficeSquareFeet',
    label: 'Square footage of dedicated home office space in {year}',
    helpText: 'Simplified method: $5 × sq ft (max 300 sq ft = $1,500 deduction).',
    type: 'number',
    showIf: (a) => a.hadHomeOffice === true,
  },
  {
    id: 'totalHomeSqFt',
    label: 'Total square footage of your home in {year}',
    helpText: 'Used for actual expense method calculation if more beneficial than simplified.',
    type: 'number',
    showIf: (a) => a.hadHomeOffice === true,
  },
  {
    id: 'businessMilesDriven',
    label: 'Approximate business miles driven in {year}',
    helpText: 'Used with the IRS mileage rate for that year. Estimate if mileage log unavailable.',
    type: 'number',
  },
  {
    id: 'madeIRAContribution',
    label: 'Did you make a Traditional IRA contribution in {year}?',
    type: 'yesno',
  },
  {
    id: 'iraContributionAmount',
    label: 'IRA contribution amount in {year}',
    type: 'currency',
    showIf: (a) => a.madeIRAContribution === true,
  },
  {
    id: 'madeSEPContribution',
    label: 'Did you make a SEP-IRA contribution in {year}?',
    helpText: 'Applies to self-employed individuals. Maximum is the lesser of 25% of net SE earnings or the year limit.',
    type: 'yesno',
  },
  {
    id: 'sepContributionAmount',
    label: 'SEP-IRA contribution amount in {year}',
    type: 'currency',
    showIf: (a) => a.madeSEPContribution === true,
  },
  {
    id: 'selfEmployedHealthInsurance',
    label: 'Health insurance premiums paid for yourself/family as a self-employed person in {year}',
    helpText: '100% deductible above the line if self-employed and not eligible for employer-sponsored coverage.',
    type: 'currency',
  },
  {
    id: 'hsaContributions',
    label: 'HSA contributions in {year}',
    type: 'currency',
  },
  {
    id: 'studentLoanInterest',
    label: 'Student loan interest paid in {year} (from Form 1098-E)',
    helpText: 'Up to $2,500 deductible above the line, subject to income phase-out.',
    type: 'currency',
  },
  {
    id: 'charitableCashDonations',
    label: 'Cash charitable donations in {year}',
    type: 'currency',
  },
  {
    id: 'charitableNonCashDonations',
    label: 'Non-cash charitable donations in {year} (clothing, goods, etc.)',
    type: 'currency',
  },
  {
    id: 'significantEvents',
    label: 'Any significant financial events in {year}? (Sold property, received inheritance, legal settlements, gambling winnings, etc.)',
    helpText: 'List anything that would affect your tax picture beyond the categories above.',
    type: 'text',
  },
];

// ─── Claude API call ──────────────────────────────────────────────────────────

function buildPrompt(input: PriorYearBuilderInput): string {
  const { targetYear, rules, currentYearSnapshot, differential: d, preparerNotes } = input;
  const bizList = input.currentYearSnapshot.businesses.map(b =>
    `  • ${b.name}: current year gross ~$${b.grossIncome.toLocaleString()}`
  ).join('\n') || '  None';

  const bizEstimates = d.businessIncomeEstimates.length > 0
    ? d.businessIncomeEstimates.map(b =>
        `  • ${b.businessName}: ~$${b.estimatedGross.toLocaleString()} in ${targetYear}`
      ).join('\n')
    : '  No business income estimates provided';

  return `You are an expert tax preparer completing a ${targetYear} IRS Form 1040 based on client-provided information.

INSTRUCTIONS:
Using the tax rules for ${targetYear}, the current-year baseline, and the client's answers, construct a complete ${targetYear} return summary.

For any value that is estimated (not from an actual document), mark isEstimated: true.
Identify missing documents and recommended actions to finalize the return properly.
Apply ${targetYear}-specific rules — NOT current year rules.

${formatRulesForPrompt(rules)}

CURRENT YEAR BASELINE (${currentYearSnapshot.taxYear}):
- Filing status: ${currentYearSnapshot.filingStatus ?? 'unknown'}
- W-2 employers: ${currentYearSnapshot.w2Employers.join(', ') || 'none'}
- Current W-2 wages: $${currentYearSnapshot.totalW2Wages.toLocaleString()}
- Current 1099 income: $${currentYearSnapshot.total1099Income.toLocaleString()}
- Businesses:
${bizList}

CLIENT ANSWERS FOR ${targetYear}:
- Filing status in ${targetYear}: ${d.filingStatus || 'Same as current year'}
- State of residence: ${d.stateOfResidence || 'Not specified'}
- W-2 employer changes: ${d.w2Changes || 'Not specified'}
- Estimated W-2 wages: ${d.estimatedW2Wages != null ? '$' + d.estimatedW2Wages.toLocaleString() : 'Not provided'}
- Business changes: ${d.businessChanges || 'No changes noted'}
- Business income estimates for ${targetYear}:
${bizEstimates}
- Other 1099 income: ${d.other1099Income || 'None noted'}
- Estimated 1099 amount: ${d.estimated1099Amount != null ? '$' + d.estimated1099Amount.toLocaleString() : 'N/A'}
- Dependents: ${d.hasDependents === true ? `Yes — ${d.numberOfDependents ?? '?'} total, ${d.dependentChildrenUnder17 ?? '?'} under 17` : d.hasDependents === false ? 'No' : 'Not answered'}
- Owned home: ${d.ownedHome === true ? 'Yes' : d.ownedHome === false ? 'No' : 'Not answered'}
  - Mortgage interest: ${d.mortgageInterestPaid != null ? '$' + d.mortgageInterestPaid.toLocaleString() : 'Not provided'}
  - Property tax: ${d.propertyTaxPaid != null ? '$' + d.propertyTaxPaid.toLocaleString() : 'Not provided'}
- Home office: ${d.hadHomeOffice === true ? `Yes — ${d.homeOfficeSquareFeet ?? '?'} sq ft of ${d.totalHomeSqFt ?? '?'} sq ft` : 'No'}
- Business miles driven: ${d.businessMilesDriven != null ? d.businessMilesDriven.toLocaleString() + ' miles @ ' + rules.mileageRate_cents + ' cents = $' + Math.round(d.businessMilesDriven * rules.mileageRate_cents / 100).toLocaleString() : 'Not provided'}
- Traditional IRA contribution: ${d.madeIRAContribution === true ? '$' + (d.iraContributionAmount ?? 0).toLocaleString() : 'None'}
- SEP-IRA contribution: ${d.madeSEPContribution === true ? '$' + (d.sepContributionAmount ?? 0).toLocaleString() : 'None'}
- Self-employed health insurance: ${d.selfEmployedHealthInsurance != null ? '$' + d.selfEmployedHealthInsurance.toLocaleString() : 'Not provided'}
- HSA contributions: ${d.hsaContributions != null ? '$' + d.hsaContributions.toLocaleString() : 'Not provided'}
- Student loan interest: ${d.studentLoanInterest != null ? '$' + d.studentLoanInterest.toLocaleString() : 'Not provided'}
- Cash charitable donations: ${d.charitableCashDonations != null ? '$' + d.charitableCashDonations.toLocaleString() : 'Not provided'}
- Non-cash charitable donations: ${d.charitableNonCashDonations != null ? '$' + d.charitableNonCashDonations.toLocaleString() : 'Not provided'}
- Significant events: ${d.significantEvents || 'None noted'}

PREPARER NOTES:
${preparerNotes || 'None'}

REQUIRED JSON OUTPUT FORMAT — return only valid JSON, no prose, no markdown:
{
  "taxYear": ${targetYear},
  "filingStatus": "Single|Married Filing Jointly|...",
  "sections": [
    {
      "title": "Income",
      "lines": [
        { "lineRef": "1040 Line 1a", "description": "W-2 Wages", "amount": 0, "isEstimated": true, "notes": "Based on client estimate — request W-2 or IRS transcript" }
      ],
      "subtotal": 0
    },
    { "title": "Adjustments to Income (Schedule 1)", "lines": [], "subtotal": 0 },
    { "title": "Schedule C — Business Income/Loss", "lines": [], "subtotal": 0 },
    { "title": "Deductions", "lines": [], "subtotal": 0 },
    { "title": "Credits", "lines": [], "subtotal": 0 },
    { "title": "Tax Summary", "lines": [], "subtotal": 0 }
  ],
  "grossIncome": 0,
  "adjustedGrossIncome": 0,
  "standardOrItemizedDeduction": 0,
  "deductionType": "standard",
  "taxableIncome": 0,
  "estimatedTaxLiability": 0,
  "totalCredits": 0,
  "estimatedRefundOrOwed": 0,
  "hasEstimatedValues": true,
  "missingDocuments": ["List any documents needed to finalize this return"],
  "recommendedActions": ["e.g., Request IRS wage transcript for ${targetYear}", "Verify SEP-IRA deduction with contribution statement"],
  "yearSpecificNotes": "Key ${targetYear}-specific items that affected this return (stimulus, expanded credits, etc.)",
  "preparerSummary": "2-3 sentence summary of the return outcome and key findings"
}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function buildPriorYearReturn(
  input: PriorYearBuilderInput,
  apiKey: string,
): Promise<BuilderResult> {
  const t0 = Date.now();

  let raw: string;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 8192,
        system: 'You are a highly accurate tax return preparer. Return only valid JSON with no markdown fences or prose.',
        messages: [{ role: 'user', content: buildPrompt(input) }],
      }),
    });

    if (!res.ok) {
      return { summary: null, rawResponse: '', elapsedMs: Date.now() - t0, error: `API error: ${res.status}` };
    }

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    raw = data.content.find(b => b.type === 'text')?.text ?? '';
  } catch (e) {
    return { summary: null, rawResponse: '', elapsedMs: Date.now() - t0, error: e instanceof Error ? e.message : 'Network error' };
  }

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as PriorYearReturnSummary;
    return { summary: parsed, rawResponse: raw, elapsedMs: Date.now() - t0 };
  } catch {
    return { summary: null, rawResponse: raw, elapsedMs: Date.now() - t0, error: 'Failed to parse return summary' };
  }
}

// ─── Helper: build current year snapshot from WorkflowContext ─────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCurrentYearSnapshot(contextSnap: Record<string, any>, taxYear: number): CurrentYearSnapshot {
  const docs: Array<{ parsedData?: { documentType?: string; amounts?: Record<string, number>; payer?: string; boxFields?: Record<string, string> } }> =
    contextSnap['documents'] ?? [];

  const w2Employers: string[] = [];
  let totalW2Wages = 0;
  let total1099Income = 0;
  let filingStatus: string | undefined;
  const businesses: Array<{ name: string; grossIncome: number }> = [];

  for (const doc of docs) {
    const pd = doc.parsedData;
    if (!pd) continue;
    const amounts = pd.amounts ?? {};
    const fields  = pd.boxFields  ?? {};

    switch (pd.documentType) {
      case 'w2':
        totalW2Wages += Number(amounts['box1_wages'] ?? 0);
        if (pd.payer && !w2Employers.includes(pd.payer)) w2Employers.push(pd.payer);
        break;
      case '1099_nec':
      case '1099_int':
      case '1099_div':
        total1099Income += Number(amounts['box1'] ?? 0);
        break;
      case 'prior_return':
        if (fields['filingStatus']) filingStatus = fields['filingStatus'];
        break;
      case 'payment_processor':
        if (pd.payer) {
          businesses.push({ name: pd.payer, grossIncome: Number(amounts['totalIncome'] ?? 0) });
        }
        break;
    }
  }

  return { taxYear, filingStatus, w2Employers, totalW2Wages, total1099Income, businesses };
}
