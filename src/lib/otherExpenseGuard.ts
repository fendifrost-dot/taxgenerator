import { Transaction, ExpenseCategory } from '@/types/tax';

export interface OtherExpenseWarning {
  type: 'high_usage' | 'missing_detail' | 'reassignment_suggested';
  message: string;
  transactionIds: string[];
  suggestedAction?: string;
}

/**
 * Analyze "Other Expenses" usage and generate warnings.
 * Does NOT block — only warns and suggests reassignment.
 */
export function analyzeOtherExpenses(
  transactions: Transaction[],
  categories: ExpenseCategory[],
  taxYear: number
): OtherExpenseWarning[] {
  const warnings: OtherExpenseWarning[] = [];

  const yearTxns = transactions.filter(t => t.taxYear === taxYear);
  const deductible = yearTxns.filter(t => t.state === 'deductible');
  const otherExpenses = deductible.filter(t => {
    const cat = categories.find(c => c.id === t.categoryId);
    return cat?.scheduleCLine === '27a' || t.scheduleCLine === '27a';
  });

  if (otherExpenses.length === 0) return warnings;

  const totalDeductible = deductible.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalOther = otherExpenses.reduce((s, t) => s + Math.abs(t.amount), 0);
  const percentage = totalDeductible > 0 ? (totalOther / totalDeductible) * 100 : 0;

  if (percentage > 15) {
    warnings.push({
      type: 'high_usage',
      message: `${percentage.toFixed(1)}% of deductions ($${totalOther.toLocaleString()}) are in "Other Expenses." Consider reassigning to specific Schedule C lines for clearer substantiation.`,
      transactionIds: otherExpenses.map(t => t.id),
      suggestedAction: 'Review and reassign transactions to specific expense categories',
    });
  }

  const missingPurpose = otherExpenses.filter(t => !t.businessPurpose?.trim());
  if (missingPurpose.length > 0) {
    warnings.push({
      type: 'missing_detail',
      message: `${missingPurpose.length} "Other Expense" transaction(s) lack a business purpose notation. Each should have a clear explanation for audit defensibility.`,
      transactionIds: missingPurpose.map(t => t.id),
      suggestedAction: 'Add business purpose to each "Other Expense" transaction',
    });
  }

  return warnings;
}

/**
 * Check if a transaction in "Other Expenses" could be reassigned
 * to an existing specific category based on keyword matching.
 */
export function suggestCategoryReassignment(
  transaction: Transaction,
  categories: ExpenseCategory[]
): ExpenseCategory[] {
  const desc = transaction.description.toLowerCase();
  const purpose = (transaction.businessPurpose || '').toLowerCase();
  const combined = `${desc} ${purpose}`;

  const suggestions: ExpenseCategory[] = [];

  const keywordMap: Record<string, string[]> = {
    advertising: ['ad', 'promo', 'marketing', 'sponsor', 'boost', 'campaign'],
    car_truck: ['gas', 'fuel', 'mileage', 'uber', 'lyft', 'parking', 'toll'],
    insurance: ['insurance', 'policy', 'premium', 'coverage'],
    legal_professional: ['lawyer', 'attorney', 'accountant', 'cpa', 'legal', 'consult'],
    office_expense: ['office', 'staples', 'paper', 'printer', 'ink', 'desk'],
    supplies: ['supply', 'supplies', 'material', 'equipment'],
    travel: ['flight', 'hotel', 'airbnb', 'travel', 'lodging', 'airfare'],
    meals: ['meal', 'dinner', 'lunch', 'restaurant', 'food', 'catering'],
    utilities: ['electric', 'water', 'internet', 'phone', 'utility', 'wifi'],
    contract_labor: ['freelance', 'contractor', 'labor', 'hired'],
    commissions_fees: ['commission', 'fee', 'platform fee', 'processing'],
  };

  Object.entries(keywordMap).forEach(([catId, keywords]) => {
    if (keywords.some(kw => combined.includes(kw))) {
      const cat = categories.find(c => c.id === catId);
      if (cat) suggestions.push(cat);
    }
  });

  return suggestions;
}
