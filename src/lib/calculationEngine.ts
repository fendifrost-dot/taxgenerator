import {
  Transaction,
  IncomeReconciliation,
  ExpenseCategory,
  CalculationResult,
  CalculationEngine,
} from '@/types/tax';

/**
 * Deterministic calculation engine for federal return generation.
 * Every result includes source references and a human-readable calculation path.
 */

export function calculateScheduleC(
  transactions: Transaction[],
  _categories: ExpenseCategory[],
  incomeReconciliations: IncomeReconciliation[],
  taxYear: number
): CalculationEngine {
  void _categories;
  const results: CalculationResult[] = [];
  const validationErrors: string[] = [];
  const now = new Date();

  const yearTxns = transactions.filter(t => t.taxYear === taxYear);
  const deductibleWithEvidence = yearTxns.filter(
    t => t.state === 'deductible' && t.evidenceStatus === 'present'
  );
  const yearIncome = incomeReconciliations.filter(r => r.taxYear === taxYear);

  const grossReceipts = yearIncome.reduce((sum, r) => sum + r.grossAmount, 0);
  results.push({
    lineNumber: '1',
    description: 'Gross receipts or sales',
    value: grossReceipts,
    sourceType: 'aggregation',
    sourceReferences: yearIncome.map(r => r.id),
    calculationPath: `SUM(incomeReconciliations[taxYear=${taxYear}].grossAmount) = ${yearIncome.map(r => r.grossAmount).join(' + ')} = ${grossReceipts}`,
    ruleReference: 'Schedule C Line 1',
    timestamp: now,
  });

  results.push({
    lineNumber: '4',
    description: 'Cost of goods sold',
    value: 0,
    sourceType: 'calculation',
    sourceReferences: [],
    calculationPath: 'COGS not implemented — defaulting to 0',
    ruleReference: 'Schedule C Line 4',
    timestamp: now,
  });

  results.push({
    lineNumber: '5',
    description: 'Gross profit (Line 1 - Line 4)',
    value: grossReceipts,
    sourceType: 'calculation',
    sourceReferences: [],
    calculationPath: `Line1(${grossReceipts}) - Line4(0) = ${grossReceipts}`,
    ruleReference: 'Schedule C Line 5',
    timestamp: now,
  });

  const expenseByLine: Record<string, { txnIds: string[]; amounts: number[]; total: number }> = {};

  deductibleWithEvidence.forEach(t => {
    const line = t.scheduleCLine || '27a';
    if (!expenseByLine[line]) {
      expenseByLine[line] = { txnIds: [], amounts: [], total: 0 };
    }
    expenseByLine[line].txnIds.push(t.id);
    expenseByLine[line].amounts.push(Math.abs(t.amount));
    expenseByLine[line].total += Math.abs(t.amount);
  });

  const scheduleCLines: Record<string, string> = {
    '8': 'Advertising',
    '9': 'Car and truck expenses',
    '10': 'Commissions and fees',
    '11': 'Contract labor',
    '15': 'Insurance',
    '17': 'Legal and professional services',
    '18': 'Office expense',
    '20a': 'Rent or lease — vehicles/equipment',
    '20b': 'Rent or lease — other property',
    '22': 'Supplies',
    '24a': 'Travel',
    '24b': 'Deductible meals',
    '25': 'Utilities',
    '27a': 'Other expenses',
  };

  Object.entries(expenseByLine).forEach(([line, data]) => {
    results.push({
      lineNumber: line,
      description: scheduleCLines[line] || `Line ${line}`,
      value: data.total,
      sourceType: 'aggregation',
      sourceReferences: data.txnIds,
      calculationPath: `SUM(transactions[scheduleCLine="${line}"].amount) = ${data.amounts.join(' + ')} = ${data.total}`,
      ruleReference: `Schedule C Line ${line}`,
      timestamp: now,
    });
  });

  const totalExpenses = Object.values(expenseByLine).reduce((sum, d) => sum + d.total, 0);
  results.push({
    lineNumber: '28',
    description: 'Total expenses before home office',
    value: totalExpenses,
    sourceType: 'calculation',
    sourceReferences: [],
    calculationPath: `SUM(Lines 8-27a) = ${Object.entries(expenseByLine).map(([l, d]) => `Line${l}(${d.total})`).join(' + ')} = ${totalExpenses}`,
    ruleReference: 'Schedule C Line 28',
    timestamp: now,
  });

  const netProfit = grossReceipts - totalExpenses;
  results.push({
    lineNumber: '31',
    description: 'Net profit or (loss)',
    value: netProfit,
    sourceType: 'calculation',
    sourceReferences: [],
    calculationPath: `Line5(${grossReceipts}) - Line28(${totalExpenses}) = ${netProfit}`,
    ruleReference: 'Schedule C Line 31',
    timestamp: now,
  });

  if (grossReceipts === 0 && yearIncome.length === 0) {
    validationErrors.push('No income sources found for this tax year');
  }
  if (deductibleWithEvidence.length === 0 && yearTxns.some(t => t.state === 'deductible')) {
    validationErrors.push('Deductible transactions exist but none have evidence attached');
  }

  return {
    results,
    isValid: validationErrors.length === 0,
    validationErrors,
    generatedAt: now,
  };
}

export function getLineResult(engine: CalculationEngine, lineNumber: string): CalculationResult | undefined {
  return engine.results.find(r => r.lineNumber === lineNumber);
}

export function getLineAuditTrail(engine: CalculationEngine, lineNumber: string): string {
  const result = getLineResult(engine, lineNumber);
  if (!result) return `Line ${lineNumber}: not found in calculation results`;
  return `Line ${lineNumber} (${result.description}): ${result.calculationPath} [${result.ruleReference}] — ${result.sourceReferences.length} source(s)`;
}
