/**
 * businessEntityForms.ts
 *
 * Maps entity types to their IRS form structures.
 * Contains line-by-line descriptions for Form 1120-S, Form 1065, and Form 1120.
 *
 * These descriptions are injected into Claude prompts and used to generate
 * the line-by-line return summary displayed to the preparer.
 */

import { EntityType } from '@/types/businessEntity';

// ─── Form line definitions ─────────────────────────────────────────────────────

export interface FormLineDefinition {
  line: string;
  description: string;
  section: string;
  isCalculated?: boolean;
}

// ─── Form 1120-S (S Corporation) ──────────────────────────────────────────────

export const FORM_1120S_LINES: FormLineDefinition[] = [
  // Income
  { line: '1a', description: 'Gross receipts or sales', section: 'Income' },
  { line: '1b', description: 'Returns and allowances', section: 'Income' },
  { line: '1c', description: 'Balance (subtract 1b from 1a)', section: 'Income', isCalculated: true },
  { line: '2',  description: 'Cost of goods sold (Form 1125-A)', section: 'Income' },
  { line: '3',  description: 'Gross profit (subtract line 2 from line 1c)', section: 'Income', isCalculated: true },
  { line: '4',  description: 'Net gain (loss) from Form 4797', section: 'Income' },
  { line: '5',  description: 'Other income (loss)', section: 'Income' },
  { line: '6',  description: 'Total income (loss)', section: 'Income', isCalculated: true },
  // Deductions
  { line: '7',  description: 'Compensation of officers (Form 1125-E)', section: 'Deductions' },
  { line: '8',  description: 'Salaries and wages (less employment credits)', section: 'Deductions' },
  { line: '9',  description: 'Repairs and maintenance', section: 'Deductions' },
  { line: '10', description: 'Bad debts', section: 'Deductions' },
  { line: '11', description: 'Rents', section: 'Deductions' },
  { line: '12', description: 'Taxes and licenses', section: 'Deductions' },
  { line: '13', description: 'Interest (see instructions)', section: 'Deductions' },
  { line: '14', description: 'Depreciation (Form 4562)', section: 'Deductions' },
  { line: '15', description: 'Depletion (Do not deduct oil and gas depletion)', section: 'Deductions' },
  { line: '16', description: 'Advertising', section: 'Deductions' },
  { line: '17', description: 'Pension, profit-sharing, etc., plans', section: 'Deductions' },
  { line: '18', description: 'Employee benefit programs', section: 'Deductions' },
  { line: '19', description: 'Other deductions (attach statement)', section: 'Deductions' },
  { line: '20', description: 'Total deductions', section: 'Deductions', isCalculated: true },
  { line: '21', description: 'Ordinary business income (loss)', section: 'Ordinary Income', isCalculated: true },
  // Tax / Payments
  { line: '22a', description: 'Excess net passive income / LIFO recapture tax', section: 'Tax' },
  { line: '22b', description: 'Tax from Schedule D (built-in gains)', section: 'Tax' },
  { line: '22c', description: 'Total tax', section: 'Tax', isCalculated: true },
  { line: '23a', description: 'Estimated tax payments', section: 'Payments' },
  { line: '23b', description: 'Tax deposited with Form 7004', section: 'Payments' },
  { line: '23c', description: 'Credit for federal tax paid on fuels', section: 'Payments' },
  { line: '23d', description: 'Total payments and credits', section: 'Payments', isCalculated: true },
  { line: '24',  description: 'Estimated tax penalty', section: 'Penalty' },
  { line: '25',  description: 'Amount owed', section: 'Balance Due', isCalculated: true },
  { line: '26',  description: 'Overpayment', section: 'Balance Due', isCalculated: true },
];

// ─── Schedule K (1120-S) — Items flowing to shareholders ──────────────────────

export const SCHEDULE_K_1120S_LINES: FormLineDefinition[] = [
  { line: 'K-1',  description: 'Ordinary business income (loss)', section: 'Schedule K' },
  { line: 'K-2',  description: 'Net rental real estate income (loss)', section: 'Schedule K' },
  { line: 'K-3',  description: 'Other net rental income (loss)', section: 'Schedule K' },
  { line: 'K-4',  description: 'Interest income', section: 'Schedule K' },
  { line: 'K-5a', description: 'Ordinary dividends', section: 'Schedule K' },
  { line: 'K-5b', description: 'Qualified dividends', section: 'Schedule K' },
  { line: 'K-6',  description: 'Royalties', section: 'Schedule K' },
  { line: 'K-7',  description: 'Net short-term capital gain (loss)', section: 'Schedule K' },
  { line: 'K-8a', description: 'Net long-term capital gain (loss)', section: 'Schedule K' },
  { line: 'K-9',  description: 'Net Section 1231 gain (loss)', section: 'Schedule K' },
  { line: 'K-10', description: 'Other income (loss)', section: 'Schedule K' },
  { line: 'K-11', description: 'Section 179 deduction', section: 'Schedule K' },
  { line: 'K-12', description: 'Other deductions', section: 'Schedule K' },
  { line: 'K-13', description: 'Credits', section: 'Schedule K' },
  { line: 'K-16', description: 'Items affecting shareholder basis', section: 'Schedule K' },
  { line: 'K-17', description: 'Other information', section: 'Schedule K' },
];

// ─── Form 1065 (Partnership / LLC / LLLP) ────────────────────────────────────

export const FORM_1065_LINES: FormLineDefinition[] = [
  // Income
  { line: '1a', description: 'Gross receipts or sales', section: 'Income' },
  { line: '1b', description: 'Returns and allowances', section: 'Income' },
  { line: '1c', description: 'Balance (subtract 1b from 1a)', section: 'Income', isCalculated: true },
  { line: '2',  description: 'Cost of goods sold (Form 1125-A)', section: 'Income' },
  { line: '3',  description: 'Gross profit', section: 'Income', isCalculated: true },
  { line: '4',  description: 'Ordinary income (loss) from other partnerships / estates / trusts', section: 'Income' },
  { line: '5',  description: 'Net farm profit (loss)', section: 'Income' },
  { line: '6',  description: 'Net gain (loss) from Form 4797', section: 'Income' },
  { line: '7',  description: 'Other income (loss)', section: 'Income' },
  { line: '8',  description: 'Total income (loss)', section: 'Income', isCalculated: true },
  // Deductions
  { line: '9',  description: 'Salaries and wages (other than partners)', section: 'Deductions' },
  { line: '10', description: 'Guaranteed payments to partners', section: 'Deductions' },
  { line: '11', description: 'Repairs and maintenance', section: 'Deductions' },
  { line: '12', description: 'Bad debts', section: 'Deductions' },
  { line: '13', description: 'Rent', section: 'Deductions' },
  { line: '14', description: 'Taxes and licenses', section: 'Deductions' },
  { line: '15', description: 'Interest (see instructions)', section: 'Deductions' },
  { line: '16a', description: 'Depreciation (if required, attach Form 4562)', section: 'Deductions' },
  { line: '16b', description: 'Less depreciation reported on Form 1125-A', section: 'Deductions' },
  { line: '16c', description: 'Net depreciation', section: 'Deductions', isCalculated: true },
  { line: '17', description: 'Depletion', section: 'Deductions' },
  { line: '18', description: 'Retirement plans, etc.', section: 'Deductions' },
  { line: '19', description: 'Employee benefit programs', section: 'Deductions' },
  { line: '20', description: 'Other deductions', section: 'Deductions' },
  { line: '21', description: 'Total deductions', section: 'Deductions', isCalculated: true },
  { line: '22', description: 'Ordinary business income (loss)', section: 'Ordinary Income', isCalculated: true },
];

// ─── Schedule K (1065) ────────────────────────────────────────────────────────

export const SCHEDULE_K_1065_LINES: FormLineDefinition[] = [
  { line: 'K-1',  description: 'Ordinary business income (loss)', section: 'Schedule K' },
  { line: 'K-2',  description: 'Net rental real estate income (loss)', section: 'Schedule K' },
  { line: 'K-3',  description: 'Other net rental income (loss)', section: 'Schedule K' },
  { line: 'K-4',  description: 'Guaranteed payments for services', section: 'Schedule K' },
  { line: 'K-5',  description: 'Guaranteed payments for capital', section: 'Schedule K' },
  { line: 'K-6',  description: 'Guaranteed payments total', section: 'Schedule K', isCalculated: true },
  { line: 'K-7',  description: 'Interest income', section: 'Schedule K' },
  { line: 'K-8',  description: 'Dividends and dividend equivalents', section: 'Schedule K' },
  { line: 'K-9',  description: 'Royalties', section: 'Schedule K' },
  { line: 'K-10', description: 'Net short-term capital gain (loss)', section: 'Schedule K' },
  { line: 'K-11a', description: 'Net long-term capital gain (loss)', section: 'Schedule K' },
  { line: 'K-12', description: 'Net Section 1231 gain (loss)', section: 'Schedule K' },
  { line: 'K-13', description: 'Other income (loss)', section: 'Schedule K' },
  { line: 'K-14', description: 'Section 179 deduction', section: 'Schedule K' },
  { line: 'K-15', description: 'Other deductions', section: 'Schedule K' },
  { line: 'K-16', description: 'Self-employment earnings (loss)', section: 'Schedule K' },
  { line: 'K-17', description: 'Credits', section: 'Schedule K' },
  { line: 'K-18', description: 'Foreign transactions', section: 'Schedule K' },
  { line: 'K-19', description: 'AMT items', section: 'Schedule K' },
  { line: 'K-20', description: 'Tax-exempt income and nondeductible expenses', section: 'Schedule K' },
  { line: 'K-21', description: 'Distributions', section: 'Schedule K' },
  { line: 'K-22', description: 'Other information', section: 'Schedule K' },
];

// ─── Form 1120 (C Corporation) ────────────────────────────────────────────────

export const FORM_1120_LINES: FormLineDefinition[] = [
  // Income
  { line: '1a', description: 'Gross receipts or sales', section: 'Income' },
  { line: '1b', description: 'Returns and allowances', section: 'Income' },
  { line: '1c', description: 'Balance (subtract 1b from 1a)', section: 'Income', isCalculated: true },
  { line: '2',  description: 'Cost of goods sold (Form 1125-A)', section: 'Income' },
  { line: '3',  description: 'Gross profit', section: 'Income', isCalculated: true },
  { line: '4',  description: 'Dividends and inclusions (Schedule C, line 23)', section: 'Income' },
  { line: '5',  description: 'Interest', section: 'Income' },
  { line: '6',  description: 'Gross rents', section: 'Income' },
  { line: '7',  description: 'Gross royalties', section: 'Income' },
  { line: '8',  description: 'Capital gain net income (attach Schedule D)', section: 'Income' },
  { line: '9',  description: 'Net gain or loss from Form 4797', section: 'Income' },
  { line: '10', description: 'Other income', section: 'Income' },
  { line: '11', description: 'Total income', section: 'Income', isCalculated: true },
  // Deductions
  { line: '12', description: 'Compensation of officers (Form 1125-E)', section: 'Deductions' },
  { line: '13', description: 'Salaries and wages (less employment credits)', section: 'Deductions' },
  { line: '14', description: 'Repairs and maintenance', section: 'Deductions' },
  { line: '15', description: 'Bad debts', section: 'Deductions' },
  { line: '16', description: 'Rents', section: 'Deductions' },
  { line: '17', description: 'Taxes and licenses', section: 'Deductions' },
  { line: '18', description: 'Interest (see instructions)', section: 'Deductions' },
  { line: '19', description: 'Charitable contributions', section: 'Deductions' },
  { line: '20', description: 'Depreciation (Form 4562)', section: 'Deductions' },
  { line: '21', description: 'Depletion', section: 'Deductions' },
  { line: '22', description: 'Advertising', section: 'Deductions' },
  { line: '23', description: 'Pension, profit-sharing plans', section: 'Deductions' },
  { line: '24', description: 'Employee benefit programs', section: 'Deductions' },
  { line: '25', description: 'Reserved', section: 'Deductions' },
  { line: '26', description: 'Other deductions (attach statement)', section: 'Deductions' },
  { line: '27', description: 'Total deductions', section: 'Deductions', isCalculated: true },
  { line: '28', description: 'Taxable income before special deductions', section: 'Taxable Income', isCalculated: true },
  { line: '29a', description: 'Net operating loss deduction', section: 'Special Deductions' },
  { line: '29b', description: 'Special deductions (Schedule C, line 24)', section: 'Special Deductions' },
  { line: '29c', description: 'Total special deductions', section: 'Special Deductions', isCalculated: true },
  { line: '30', description: 'Taxable income', section: 'Taxable Income', isCalculated: true },
  // Tax
  { line: '31', description: 'Tax (21% of line 30)', section: 'Tax', isCalculated: true },
  { line: '32a', description: 'Tax from recomputing prior-year investment credit', section: 'Tax' },
  { line: '32b', description: 'Recapture of low-income housing credit', section: 'Tax' },
  { line: '32c', description: 'Interest due under look-back method', section: 'Tax' },
  { line: '32d', description: 'Alternative minimum tax (CAMT for large corps)', section: 'Tax' },
  { line: '32e', description: 'Bond interest tax', section: 'Tax' },
  { line: '32f', description: 'Total', section: 'Tax', isCalculated: true },
  // Payments
  { line: '33', description: 'Total tax', section: 'Payments', isCalculated: true },
  { line: '34a', description: 'Overpayment from prior year', section: 'Payments' },
  { line: '34b', description: 'Estimated tax payments', section: 'Payments' },
  { line: '34c', description: 'Form 4136 credit', section: 'Payments' },
  { line: '34d', description: 'Reserved', section: 'Payments' },
  { line: '34e', description: 'Tax deposited with Form 7004', section: 'Payments' },
  { line: '34f', description: 'Credits from Form 2439 / 4136', section: 'Payments' },
  { line: '34g', description: 'Total payments and credits', section: 'Payments', isCalculated: true },
  { line: '35', description: 'Estimated tax penalty', section: 'Penalty' },
  { line: '36', description: 'Amount owed', section: 'Balance Due', isCalculated: true },
  { line: '37', description: 'Overpayment', section: 'Balance Due', isCalculated: true },
];

// ─── Helper: get form lines by entity type ────────────────────────────────────

export function getFormLines(entityType: EntityType): FormLineDefinition[] {
  switch (entityType) {
    case 's_corp':
    case 'llc_s_corp':
      return FORM_1120S_LINES;
    case 'partnership':
    case 'llp':
    case 'lllp':
    case 'llc_partnership':
      return FORM_1065_LINES;
    case 'c_corp':
      return FORM_1120_LINES;
    case 'schedule_c':
    default:
      return []; // handled by existing 1040 workflow
  }
}

export function getScheduleKLines(entityType: EntityType): FormLineDefinition[] {
  switch (entityType) {
    case 's_corp':
    case 'llc_s_corp':
      return SCHEDULE_K_1120S_LINES;
    case 'partnership':
    case 'llp':
    case 'lllp':
    case 'llc_partnership':
      return SCHEDULE_K_1065_LINES;
    default:
      return [];
  }
}

// ─── S Corp reasonable compensation guidance ─────────────────────────────────

export const REASONABLE_COMP_GUIDANCE = `
S Corp shareholders who perform services MUST receive reasonable W-2 compensation
before taking distributions. The IRS scrutinizes cases where S Corp owners pay
themselves little or no salary to avoid payroll taxes.
Factors in determining reasonable compensation:
 • Training and experience
 • Duties and responsibilities
 • Time and effort devoted to the business
 • Payments to non-shareholder employees for similar services
 • What comparable businesses would pay for the same services
 • Compensation agreements
Common safe harbor: Salary ≥ 40–60% of total S Corp distributions to the shareholder.
`;

// ─── C Corp tax rates ─────────────────────────────────────────────────────────

/** Flat 21% C Corp rate effective 2018+ (Tax Cuts & Jobs Act) */
export const C_CORP_TAX_RATE = 0.21;

/** Corporate AMT (CAMT) — applies to corporations with 3-year avg adjusted
 *  financial statement income > $1 billion. Added by Inflation Reduction Act 2022. */
export const CAMT_THRESHOLD = 1_000_000_000;
export const CAMT_RATE = 0.15;

// ─── Partnership SE income rules ─────────────────────────────────────────────

export const PARTNERSHIP_SE_GUIDANCE = `
Self-employment tax for partners:
 • General partners: SE tax applies to their distributive share of net income PLUS guaranteed payments
 • Limited partners: SE tax applies ONLY to guaranteed payments (NOT distributive share)
 • LLC members: treated as general partners unless they are "passive" per state law
 • LLLP limited partners: same as limited partners — no SE tax on distributive share
`;

// ─── Key compliance reminders ─────────────────────────────────────────────────

export const ENTITY_COMPLIANCE_NOTES: Record<EntityType, string[]> = {
  schedule_c: [],
  s_corp: [
    'S Corp shareholders performing services must receive reasonable W-2 compensation',
    'S Corp loses its election if it exceeds 100 shareholders, has a non-individual/non-resident alien shareholder, or has more than one class of stock',
    'Built-in gains tax applies for 5 years after C-to-S conversion for appreciated assets',
    'Health insurance premiums paid for >2% shareholders are includible in W-2 wages but deductible on 1040',
    'Losses are limited to shareholder basis (stock basis + direct loans to corporation)',
  ],
  partnership: [
    'Partners are not employees — they receive K-1 income, not W-2 wages',
    'General partners owe SE tax on their distributive share + guaranteed payments',
    'Partnership must file Form 1065 even if it has no income',
    'Section 754 election can step up inside basis upon partner exit or death',
    'Check if state requires separate state partnership return',
  ],
  llp: [
    'LLP partners are generally limited partners for SE tax purposes on distributive share',
    'Must verify state law — some states treat all LLP partners as general for SE',
    'Annual filing of LLP renewal typically required with state',
    'Partners are not employees — they receive K-1, not W-2',
  ],
  lllp: [
    'LLLP general partners: SE tax on distributive share + guaranteed payments',
    'LLLP limited partners: SE tax only on guaranteed payments (not distributive share)',
    'LLLP must maintain both general and limited partner classes',
    'Some states do not recognize LLLP structure — verify state of formation',
  ],
  llc_partnership: [
    'Multi-member LLC default classification is partnership — Form 1065 required',
    'Members treated as general partners for SE tax unless passive under state law',
    'Check box on Form 8832 if entity has made or needs to make a tax classification election',
    'State may impose separate LLC franchise/excise tax',
  ],
  llc_s_corp: [
    'LLC must have a valid S Corp election (Form 2553) on file',
    'All S Corp rules apply: reasonable compensation, shareholder limits, one class of stock',
    'State conformity to S Corp election varies — verify state treatment',
    'Self-employment tax avoided on distributions (only W-2 wages subject to payroll tax)',
  ],
  c_corp: [
    '21% flat tax rate on taxable income (TCJA 2017)',
    'Dividends paid to shareholders are NOT deductible — double taxation applies',
    'Consider personal holding company (PHC) rules if >60% passive income with ≤5 shareholders',
    'Accumulated earnings tax applies if retaining earnings beyond reasonable business needs',
    'Dividends-received deduction (DRD) available for dividends from other corporations',
    'NOL carryforward indefinitely at 80% of taxable income limitation (post-TCJA)',
    'Corporate AMT (CAMT) at 15% applies to corps with avg adjusted financial statement income >$1B',
  ],
};
