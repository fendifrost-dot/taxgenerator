/**
 * taxOptimizer.ts
 *
 * Analyzes a tax return snapshot and generates a targeted list of optimization
 * questions to ask the client. Uses the Claude API to produce context-aware
 * questions that surface deductions, credits, and strategies specific to the
 * client's situation.
 *
 * Every question that comes back is:
 *  - Tied to a specific tax form / Schedule C line
 *  - Ordered by potential savings (highest impact first)
 *  - Typed for the appropriate input (yes_no / dollar_amount / multiple_choice)
 */

import { OptimizerInput, OptimizationQuestion } from '@/types/client';
import { callClaudeMessages, extractText, AnthropicProxyError, CLAUDE_MODEL } from '@/lib/anthropicProxy';

export interface OptimizerResult {
  questions: OptimizationQuestion[];
  elapsedMs: number;
  error?: string;
}

// ─── Prompt construction ──────────────────────────────────────────────────────

function buildPrompt(input: OptimizerInput): string {
  const businessList = input.businesses.length > 0
    ? input.businesses.map(b =>
        `  • ${b.name}: gross income $${b.grossIncome.toLocaleString()}, ` +
        `current deductions: ${b.currentDeductions.map(d => `${d.category} $${d.amount}`).join(', ') || 'none captured yet'}`
      ).join('\n')
    : '  None';

  return `You are an expert tax optimization analyst. Review the following tax return data and generate a prioritized list of targeted questions to ask the client. The goal is to identify every deduction, credit, and tax strategy they may be missing.

TAX RETURN DATA:
- Tax year: ${input.taxYear}
- Filing status: ${input.filingStatus ?? 'unknown (ask if needed)'}
- W-2 wages: $${input.totalW2Wages.toLocaleString()}
- 1099 income: $${input.total1099Income.toLocaleString()}
- Schedule C gross income: $${input.totalScheduleCIncome.toLocaleString()}
- Has dependents: ${input.hasDependents ? 'Yes' : 'Not detected'}
- Prior year return on file: ${input.hasPriorReturn ? 'Yes' : 'No'}
- Documents already uploaded: ${input.documentTypes.join(', ') || 'none'}
- Expense categories already captured: ${input.existingTransactionCategories.join(', ') || 'none'}
- NOL carryforward: $${input.carryforwardNOL.toLocaleString()}
- Capital loss carryforward: $${input.carryforwardCapitalLoss.toLocaleString()}

BUSINESSES (Schedule C):
${businessList}

INSTRUCTIONS:
Generate a JSON array of optimization questions. Only include questions that are:
1. Directly relevant to this client's specific situation
2. Not already captured in the uploaded documents or existing transactions
3. Likely to produce a real tax benefit based on the numbers

Cover these areas where applicable:
- Self-employment: home office (Form 8829), SEP-IRA/Solo 401k, self-employed health insurance, half of SE tax, QBI deduction, vehicle actual vs standard mileage, business phone/internet %
- Retirement: traditional IRA contributions, Roth conversion considerations
- Credits: earned income credit, child tax credit, child/dependent care credit, education credits (AOC/LLC), retirement savings credit (Form 8880), residential energy credits
- Itemized deductions: charitable contributions, mortgage interest (Form 1098), medical expenses, SALT ($10k cap), unreimbursed employee expenses
- Healthcare: HSA contributions (Form 8889), health insurance premiums
- Education: student loan interest (Form 1098-E), tuition/fees
- Carryforwards: using existing NOL/capital loss carryforwards
- Other: alimony paid (pre-2019 agreements), casualty losses, gambling losses offset, rental income/loss

REQUIRED JSON FORMAT — return ONLY a valid JSON array, no prose:
[
  {
    "id": "home_office_deduction",
    "category": "self_employment",
    "question": "Do you use a dedicated space in your home exclusively for business?",
    "helpText": "If yes, you may be able to deduct $5 per square foot (up to 300 sq ft = $1,500 max via simplified method) or actual home expenses proportional to office size.",
    "answerType": "yes_no",
    "potentialSavingsMin": 500,
    "potentialSavingsMax": 3000,
    "triggeredBy": ["business_income"],
    "formReference": "Form 8829 / Schedule C Line 30",
    "priority": 1
  }
]

answerType must be one of: "yes_no", "dollar_amount", "percentage", "multiple_choice", "text"
category must be one of: "self_employment", "retirement", "credits", "itemized_deductions", "healthcare", "education", "energy", "carryforwards"
priority: 1 = highest impact / most likely relevant

Return 8–20 questions maximum. Rank by priority (1 = highest potential savings, lowest number = show first).`;
}

// ─── Claude API call ──────────────────────────────────────────────────────────

export async function generateOptimizationQuestions(
  input: OptimizerInput,
): Promise<OptimizerResult> {
  const t0 = Date.now();

  const prompt = buildPrompt(input);

  let raw: string;
  try {
    const data = await callClaudeMessages({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: 'You are a highly accurate tax optimization analyst. Return only valid JSON arrays with no markdown, no prose, no code fences.',
      messages: [{ role: 'user', content: prompt }],
    });
    raw = extractText(data) || '[]';
  } catch (e) {
    const message = e instanceof AnthropicProxyError
      ? `API error ${e.status}: ${e.message}`
      : e instanceof Error
        ? e.message
        : 'Network error';
    return {
      questions: [],
      elapsedMs: Date.now() - t0,
      error: message,
    };
  }

  // Parse JSON — strip any accidental markdown fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/,            '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(parsed)) {
      return { questions: [], elapsedMs: Date.now() - t0, error: 'Response was not a JSON array' };
    }
    const questions = (parsed as OptimizationQuestion[]).sort((a, b) => a.priority - b.priority);
    return { questions, elapsedMs: Date.now() - t0 };
  } catch {
    return { questions: [], elapsedMs: Date.now() - t0, error: 'Failed to parse optimization questions' };
  }
}

// ─── Build optimizer input from WorkflowContext state ─────────────────────────

/**
 * Call this with the raw WorkflowContext state (documents, transactions, etc.)
 * to produce the OptimizerInput snapshot for generateOptimizationQuestions().
 */
export function buildOptimizerInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contextSnapshot: Record<string, any>,
  taxYear: number,
): OptimizerInput {
  const docs: Array<{ type: string; parsedData?: { documentType?: string; amounts?: Record<string, number>; boxFields?: Record<string, string> } }> =
    contextSnapshot['documents'] ?? [];
  const transactions: Array<{ categoryId?: string; amount?: number; state?: string }> =
    contextSnapshot['transactions'] ?? [];

  // Aggregate income by document type
  let totalW2Wages = 0;
  let total1099Income = 0;
  let totalScheduleCIncome = 0;
  let filingStatus: string | undefined;
  let hasPriorReturn = false;
  const hasDependents = false;
  let carryforwardNOL = 0;
  let carryforwardCapitalLoss = 0;

  const businessMap = new Map<string, { name: string; grossIncome: number; deductions: Map<string, number> }>();
  const documentTypes: string[] = [];

  for (const doc of docs) {
    const pd = doc.parsedData;
    if (!pd) continue;
    const dt = pd.documentType ?? doc.type ?? '';
    if (dt && !documentTypes.includes(dt)) documentTypes.push(dt);

    const amounts = pd.amounts ?? {};
    const fields  = pd.boxFields ?? {};

    switch (dt) {
      case 'w2':
        totalW2Wages += Number(amounts['box1_wages'] ?? 0);
        break;
      case '1099_nec':
      case '1099_int':
      case '1099_div':
        total1099Income += Number(amounts['box1'] ?? 0);
        break;
      case 'prior_return':
        hasPriorReturn = true;
        totalScheduleCIncome += Number(amounts['scheduleCGrossReceipts'] ?? 0);
        if (fields['filingStatus']) filingStatus = fields['filingStatus'];
        carryforwardNOL          = Number(amounts['carryforwardNOL'] ?? 0);
        carryforwardCapitalLoss  = Number(amounts['carryforwardCapitalLoss'] ?? 0);
        break;
      case 'payment_processor': {
        const bizName    = String((pd as any).payer ?? 'Business');
        const grossIncome = Number(amounts['totalIncome'] ?? 0);
        totalScheduleCIncome += grossIncome;
        if (!businessMap.has(bizName)) {
          businessMap.set(bizName, { name: bizName, grossIncome, deductions: new Map() });
        }
        break;
      }
    }
  }

  // Pull deductions from transactions already captured
  const existingCategories: string[] = [];
  for (const txn of transactions) {
    if (!txn.categoryId) continue;
    if (!existingCategories.includes(txn.categoryId)) existingCategories.push(txn.categoryId);
    // Associate with a business if possible (simplified: just accumulate)
    for (const [, biz] of businessMap) {
      const current = biz.deductions.get(txn.categoryId) ?? 0;
      biz.deductions.set(txn.categoryId, current + Math.abs(txn.amount ?? 0));
    }
  }

  const businesses = Array.from(businessMap.values()).map(b => ({
    name: b.name,
    grossIncome: b.grossIncome,
    currentDeductions: Array.from(b.deductions.entries()).map(([category, amount]) => ({ category, amount })),
  }));

  return {
    taxYear,
    filingStatus,
    totalW2Wages,
    total1099Income,
    totalScheduleCIncome,
    businesses,
    hasDependents,
    hasPriorReturn,
    documentTypes,
    existingTransactionCategories: existingCategories,
    carryforwardNOL,
    carryforwardCapitalLoss,
  };
}

// ─── Category display helpers ─────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  self_employment:     'Self-Employment',
  retirement:          'Retirement',
  credits:             'Tax Credits',
  itemized_deductions: 'Itemized Deductions',
  healthcare:          'Healthcare & HSA',
  education:           'Education',
  energy:              'Energy Credits',
  carryforwards:       'Carryforwards',
};

export const CATEGORY_ORDER: string[] = [
  'self_employment',
  'retirement',
  'credits',
  'healthcare',
  'itemized_deductions',
  'education',
  'energy',
  'carryforwards',
];
