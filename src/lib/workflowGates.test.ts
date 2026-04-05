import { describe, expect, it } from 'vitest';
import type { WorkflowGates } from '@/types/tax';
import { passesFederalAndFinalizationGates, passesFullValidationGates } from './workflowGates';
import { analyzeOtherExpenses, suggestCategoryReassignment } from './otherExpenseGuard';

function baseGates(over: Partial<WorkflowGates> = {}): WorkflowGates {
  return {
    taxYearSelected: true,
    statesConfigured: true,
    requiredFormsUploaded: true,
    noUnresolvedTransactions: true,
    noMaterialDiscrepancies: true,
    incomeReconciled: true,
    evidenceComplete: true,
    federalValidated: false,
    federalFinalized: false,
    ...over,
  };
}

describe('passesFederalAndFinalizationGates', () => {
  it('returns true when all enforcement gates pass', () => {
    expect(passesFederalAndFinalizationGates(baseGates())).toBe(true);
  });

  it('ignores federalValidated and federalFinalized (stubs / separate flow)', () => {
    expect(
      passesFederalAndFinalizationGates(
        baseGates({ federalValidated: false, federalFinalized: false })
      )
    ).toBe(true);
    expect(
      passesFederalAndFinalizationGates(
        baseGates({ federalValidated: true, federalFinalized: true })
      )
    ).toBe(true);
  });

  const gateKeys: (keyof Pick<
    WorkflowGates,
    | 'taxYearSelected'
    | 'statesConfigured'
    | 'requiredFormsUploaded'
    | 'noUnresolvedTransactions'
    | 'noMaterialDiscrepancies'
    | 'incomeReconciled'
    | 'evidenceComplete'
  >)[] = [
    'taxYearSelected',
    'statesConfigured',
    'requiredFormsUploaded',
    'noUnresolvedTransactions',
    'noMaterialDiscrepancies',
    'incomeReconciled',
    'evidenceComplete',
  ];

  it.each(gateKeys)('returns false when %s is false', (key) => {
    expect(passesFederalAndFinalizationGates(baseGates({ [key]: false }))).toBe(false);
  });

  it('returns false when multiple gates fail', () => {
    expect(
      passesFederalAndFinalizationGates(
        baseGates({
          taxYearSelected: false,
          incomeReconciled: false,
          evidenceComplete: false,
        })
      )
    ).toBe(false);
  });
});

describe('passesFullValidationGates', () => {
  const allPass = {
    taxYearSelected: true,
    statesConfigured: true,
    requiredFormsUploaded: true,
    noUnresolvedTransactions: true,
    noMaterialDiscrepancies: true,
    incomeReconciled: true,
    evidenceComplete: true,
    federalValidated: true,
  };

  it('passes when all gates including federalValidated are true', () => {
    expect(passesFullValidationGates(allPass)).toBe(true);
  });

  it('fails when federalValidated is false', () => {
    expect(passesFullValidationGates({ ...allPass, federalValidated: false })).toBe(false);
  });
});

describe('analyzeOtherExpenses', () => {
  const categories = [
    {
      id: 'other_expenses',
      name: 'Other Expenses',
      scheduleCLine: '27a',
      deductibilityRules: '',
      evidenceExpectations: '',
      evidenceRequired: true,
      requiresBusinessPurpose: true,
    },
    {
      id: 'advertising',
      name: 'Advertising',
      scheduleCLine: '8',
      deductibilityRules: '',
      evidenceExpectations: '',
      evidenceRequired: true,
      requiresBusinessPurpose: false,
    },
  ];

  it('returns no warnings when no Other Expenses exist', () => {
    const warnings = analyzeOtherExpenses([], categories, 2024);
    expect(warnings).toHaveLength(0);
  });

  it('warns on high Other Expenses percentage', () => {
    const txns = [
      {
        id: '1',
        taxYear: 2024,
        state: 'deductible',
        categoryId: 'other_expenses',
        scheduleCLine: '27a',
        amount: -200,
        businessPurpose: 'test',
        evidenceStatus: 'present',
      },
      {
        id: '2',
        taxYear: 2024,
        state: 'deductible',
        categoryId: 'advertising',
        scheduleCLine: '8',
        amount: -100,
        businessPurpose: '',
        evidenceStatus: 'present',
      },
    ] as import('@/types/tax').Transaction[];
    const warnings = analyzeOtherExpenses(txns, categories, 2024);
    expect(warnings.some(w => w.type === 'high_usage')).toBe(true);
  });

  it('warns on missing business purpose for Other Expenses', () => {
    const txns = [
      {
        id: '1',
        taxYear: 2024,
        state: 'deductible',
        categoryId: 'other_expenses',
        scheduleCLine: '27a',
        amount: -50,
        businessPurpose: '',
        evidenceStatus: 'present',
      },
      {
        id: '2',
        taxYear: 2024,
        state: 'deductible',
        categoryId: 'advertising',
        scheduleCLine: '8',
        amount: -500,
        businessPurpose: '',
        evidenceStatus: 'present',
      },
    ] as import('@/types/tax').Transaction[];
    const warnings = analyzeOtherExpenses(txns, categories, 2024);
    expect(warnings.some(w => w.type === 'missing_detail')).toBe(true);
  });
});

describe('suggestCategoryReassignment', () => {
  const categories = [
    {
      id: 'advertising',
      name: 'Advertising',
      scheduleCLine: '8',
      deductibilityRules: '',
      evidenceExpectations: '',
      evidenceRequired: true,
      requiresBusinessPurpose: false,
    },
    {
      id: 'travel',
      name: 'Travel',
      scheduleCLine: '24a',
      deductibilityRules: '',
      evidenceExpectations: '',
      evidenceRequired: true,
      requiresBusinessPurpose: true,
    },
    {
      id: 'meals',
      name: 'Meals',
      scheduleCLine: '24b',
      deductibilityRules: '',
      evidenceExpectations: '',
      evidenceRequired: true,
      requiresBusinessPurpose: true,
    },
  ];

  it('suggests travel for flight-related description', () => {
    const txn = {
      id: 't1',
      taxYear: 2024,
      description: 'Delta flight to LA',
      businessPurpose: 'client meeting',
    } as import('@/types/tax').Transaction;
    const suggestions = suggestCategoryReassignment(txn, categories);
    expect(suggestions.some(s => s.id === 'travel')).toBe(true);
  });

  it('suggests advertising for promo-related description', () => {
    const txn = {
      id: 't2',
      taxYear: 2024,
      description: 'Instagram ad campaign',
      businessPurpose: '',
    } as import('@/types/tax').Transaction;
    const suggestions = suggestCategoryReassignment(txn, categories);
    expect(suggestions.some(s => s.id === 'advertising')).toBe(true);
  });

  it('returns empty for ambiguous descriptions', () => {
    const txn = {
      id: 't3',
      taxYear: 2024,
      description: 'misc payment',
      businessPurpose: '',
    } as import('@/types/tax').Transaction;
    const suggestions = suggestCategoryReassignment(txn, categories);
    expect(suggestions).toHaveLength(0);
  });
});
