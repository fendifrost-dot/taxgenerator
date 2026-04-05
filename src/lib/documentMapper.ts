/**
 * documentMapper.ts
 *
 * Maps parsed document data (from documentParser.ts) into WorkflowContext entries.
 *
 * Per-document rules:
 *  - W-2       → Document entry only (W-2 wages are not Schedule C income)
 *  - Prior 1040 → Document + IncomeReconciliation (if Schedule C gross > 0) +
 *                 Transaction entries for each Schedule C expense line (requires_decision)
 *  - Business   → Document + IncomeReconciliation + Transaction entries per expense category
 *  - 1099       → Document + IncomeReconciliation
 *
 * Year validation:
 *  - If the document's detected year ≠ currentYear → Discrepancy entry is created
 *    and the Document.verificationStatus is set to 'mismatch'.
 *
 * Confidence:
 *  - Overall confidence < 0.85 → Document.verificationStatus = 'pending' (manual review)
 *  - Each flagged field is listed in MappingOutput.flaggedFields for the UI to highlight.
 */

import {
  Document,
  DocumentType,
  ParsedDocumentData,
  Transaction,
  IncomeReconciliation,
  Discrepancy,
  TaxYear,
} from '@/types/tax';
import {
  ParseResult,
  W2ParseResult,
  Prior1040ParseResult,
  BusinessIncomeParseResult,
  Form1099ParseResult,
  Form1099R_ParseResult,
  Form1099B_ParseResult,
  Form1099K_ParseResult,
  K1_1065_ParseResult,
  K1_1120S_ParseResult,
  ParsedField,
  CONFIDENCE_THRESHOLD,
} from './documentParser';

// ─── Output types ──────────────────────────────────────────────────────────────

export interface MappingOutput {
  /** The document entry to add via addDocument() */
  document: Document;
  /** Transaction entries to add via addTransaction() — all in requires_decision state */
  transactions: Transaction[];
  /** Income reconciliation entries to add via addReconciliation() */
  reconciliations: IncomeReconciliation[];
  /** Discrepancy entries to add via addDiscrepancy() */
  discrepancies: Discrepancy[];
  /** Human-readable field labels that were flagged (confidence < threshold) */
  flaggedFields: string[];
  /** True if the document's tax year doesn't match the selected year */
  yearMismatch: boolean;
  /** The detected year from the document, or null if unreadable */
  detectedYear: TaxYear | null;
  /** True if overall confidence is below threshold — requires manual review */
  requiresManualReview: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function numVal(field: ParsedField): number {
  const v = field.value;
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,]/g, ''));
    if (isFinite(n)) return n;
  }
  return 0;
}

function strVal(field: ParsedField): string {
  return typeof field.value === 'string' ? field.value : '';
}

function makeDocId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTxnId(): string {
  return `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeRecId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeDiscId(): string {
  return `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Detect tax year from a ParsedField — returns null if unreadable */
function extractYear(field: ParsedField): TaxYear | null {
  const v = field.value;
  if (typeof v === 'number' && v >= 2000 && v <= 2099) return v as TaxYear;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (n >= 2000 && n <= 2099) return n as TaxYear;
  }
  return null;
}

/** Build a year-mismatch Discrepancy */
function buildYearMismatch(
  detectedYear: TaxYear,
  currentYear: TaxYear,
  docFileName: string,
  docId: string,
): Discrepancy {
  return {
    id: makeDiscId(),
    type: 'year_mismatch',
    severity: 'material',
    description: `Document "${docFileName}" appears to be for tax year ${detectedYear}, but the selected year is ${currentYear}. Verify this is intentional.`,
    source1: `Document (${docFileName})`,
    source1Value: String(detectedYear),
    source2: 'Selected Tax Year',
    source2Value: String(currentYear),
    impactedLines: [],
    taxYear: currentYear,
  };
  void docId; // included in description above
}

// ─── W-2 mapper ───────────────────────────────────────────────────────────────

function mapW2(
  result: W2ParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  const docId = makeDocId();
  const detectedYear = extractYear(result.taxYear);
  const yearMismatch = detectedYear !== null && detectedYear !== currentYear;

  const parsedData: ParsedDocumentData = {
    documentType: 'w2',
    taxYear: detectedYear ?? currentYear,
    payer: strVal(result.employerName) || undefined,
    payerEIN: strVal(result.employerEIN) || undefined,
    recipient: strVal(result.employeeName) || undefined,
    recipientSSN: strVal(result.employeeSSNLast4)
      ? `***-**-${strVal(result.employeeSSNLast4)}`
      : undefined,
    amounts: {
      box1_wages: numVal(result.box1_wages),
      box2_federalWithholding: numVal(result.box2_federalWithholding),
      box3_socialSecurityWages: numVal(result.box3_socialSecurityWages),
      box4_socialSecurityTax: numVal(result.box4_socialSecurityTax),
      box5_medicareWages: numVal(result.box5_medicareWages),
      box6_medicareTax: numVal(result.box6_medicareTax),
      box12a_amount: numVal(result.box12a_amount),
      box12b_amount: numVal(result.box12b_amount),
      box12c_amount: numVal(result.box12c_amount),
      box12d_amount: numVal(result.box12d_amount),
      box16_stateWages: numVal(result.box16_stateWages),
      box17_stateTax: numVal(result.box17_stateTax),
      box18_localWages: numVal(result.box18_localWages),
      box19_localTax: numVal(result.box19_localTax),
    },
    boxFields: {
      box12a_code: strVal(result.box12a_code),
      box12b_code: strVal(result.box12b_code),
      box12c_code: strVal(result.box12c_code),
      box12d_code: strVal(result.box12d_code),
      box13_statutoryEmployee: String(result.box13_statutoryEmployee.value ?? false),
      box13_retirementPlan: String(result.box13_retirementPlan.value ?? false),
      box13_thirdPartySick: String(result.box13_thirdPartySick.value ?? false),
      box15_stateCode: strVal(result.box15_stateCode),
      box15_stateEIN: strVal(result.box15_stateEIN),
      box20_locality: strVal(result.box20_locality),
    },
    extractedAt: new Date(),
    confidence: result.overallConfidence,
  };

  const verificationStatus =
    yearMismatch
      ? 'mismatch'
      : result.overallConfidence < CONFIDENCE_THRESHOLD
        ? 'pending'
        : 'verified';

  const document: Document = {
    id: docId,
    type: 'w2',
    fileName,
    uploadedAt: new Date(),
    taxYear: currentYear,
    detectedTaxYear: detectedYear ?? undefined,
    yearMismatchConfirmed: false,
    sourceReference: `Claude extraction — W-2`,
    parsedData,
    rawContent: result.rawResponse,
    verificationStatus,
    verificationErrors: result.flaggedFields.length > 0
      ? [`${result.flaggedFields.length} field(s) require manual review: ${result.flaggedFields.slice(0, 5).join(', ')}${result.flaggedFields.length > 5 ? '...' : ''}`]
      : undefined,
  };

  const discrepancies: Discrepancy[] = [];
  if (yearMismatch && detectedYear !== null) {
    discrepancies.push(buildYearMismatch(detectedYear, currentYear, fileName, docId));
  }

  return {
    document,
    transactions: [],
    reconciliations: [],
    discrepancies,
    flaggedFields: result.flaggedFields,
    yearMismatch,
    detectedYear,
    requiresManualReview: result.overallConfidence < CONFIDENCE_THRESHOLD,
  };
}

// ─── Schedule C expense line → category mapping ───────────────────────────────

type SchedCEntry = {
  field: ParsedField;
  categoryId: string;
  scheduleCLine: string;
  description: string;
};

function buildScheduleCEntries(result: Prior1040ParseResult | BusinessIncomeParseResult): SchedCEntry[] {
  if (result.docKind === 'prior_return') {
    return [
      { field: result.scheduleC_advertising,       categoryId: 'advertising',        scheduleCLine: '8',   description: 'Advertising (from prior return)' },
      { field: result.scheduleC_carTruck,          categoryId: 'car_truck',          scheduleCLine: '9',   description: 'Car and Truck Expenses (from prior return)' },
      { field: result.scheduleC_commissionsFees,   categoryId: 'commissions_fees',   scheduleCLine: '10',  description: 'Commissions and Fees (from prior return)' },
      { field: result.scheduleC_contractLabor,     categoryId: 'contract_labor',     scheduleCLine: '11',  description: 'Contract Labor (from prior return)' },
      { field: result.scheduleC_insurance,         categoryId: 'insurance',          scheduleCLine: '15',  description: 'Insurance (from prior return)' },
      { field: result.scheduleC_legalProfessional, categoryId: 'legal_professional', scheduleCLine: '17',  description: 'Legal and Professional Services (from prior return)' },
      { field: result.scheduleC_officeExpense,     categoryId: 'office_expense',     scheduleCLine: '18',  description: 'Office Expense (from prior return)' },
      { field: result.scheduleC_supplies,          categoryId: 'supplies',           scheduleCLine: '22',  description: 'Supplies (from prior return)' },
      { field: result.scheduleC_travel,            categoryId: 'travel',             scheduleCLine: '24a', description: 'Travel (from prior return)' },
      { field: result.scheduleC_meals,             categoryId: 'meals',              scheduleCLine: '24b', description: 'Deductible Meals (from prior return)' },
      { field: result.scheduleC_utilities,         categoryId: 'utilities',          scheduleCLine: '25',  description: 'Utilities (from prior return)' },
      { field: result.scheduleC_otherExpenses,     categoryId: 'other_expenses',     scheduleCLine: '27a', description: 'Other Expenses (from prior return)' },
    ];
  } else {
    return [
      { field: result.expense_mileage,          categoryId: 'car_truck',          scheduleCLine: '9',   description: 'Mileage/Vehicle Expense' },
      { field: result.expense_travel,           categoryId: 'travel',             scheduleCLine: '24a', description: 'Travel Expense' },
      { field: result.expense_meals,            categoryId: 'meals',              scheduleCLine: '24b', description: 'Meals Expense' },
      { field: result.expense_marketing,        categoryId: 'advertising',        scheduleCLine: '8',   description: 'Marketing/Advertising Expense' },
      { field: result.expense_advertising,      categoryId: 'advertising',        scheduleCLine: '8',   description: 'Advertising Expense' },
      { field: result.expense_supplies,         categoryId: 'supplies',           scheduleCLine: '22',  description: 'Supplies Expense' },
      { field: result.expense_contractLabor,    categoryId: 'contract_labor',     scheduleCLine: '11',  description: 'Contract Labor' },
      { field: result.expense_commissionsFees,  categoryId: 'commissions_fees',   scheduleCLine: '10',  description: 'Commissions and Fees' },
      { field: result.expense_insurance,        categoryId: 'insurance',          scheduleCLine: '15',  description: 'Insurance' },
      { field: result.expense_legalProfessional,categoryId: 'legal_professional', scheduleCLine: '17',  description: 'Legal and Professional Services' },
      { field: result.expense_officeExpense,    categoryId: 'office_expense',     scheduleCLine: '18',  description: 'Office Expense' },
      { field: result.expense_utilities,        categoryId: 'utilities',          scheduleCLine: '25',  description: 'Utilities' },
      { field: result.expense_otherExpenses,    categoryId: 'other_expenses',     scheduleCLine: '27a', description: 'Other Expenses' },
    ];
  }
}

function expenseEntriesToTransactions(
  entries: SchedCEntry[],
  docId: string,
  currentYear: TaxYear,
  sourceLabel: string,
): Transaction[] {
  const now = new Date();
  const txns: Transaction[] = [];

  for (const entry of entries) {
    const amount = numVal(entry.field);
    if (amount <= 0) continue; // skip zero/absent entries

    txns.push({
      id: makeTxnId(),
      date: now,
      description: entry.description,
      amount: -Math.abs(amount), // expenses are negative
      source: sourceLabel,
      sourceDocumentId: docId,
      state: 'requires_decision',
      categoryId: entry.categoryId,
      scheduleCLine: entry.scheduleCLine,
      evidenceStatus: 'pending',
      requiresBusinessPurpose: ['travel', 'meals', 'car_truck', 'other_expenses'].includes(entry.categoryId),
      taxYear: currentYear,
    });
  }

  return txns;
}

// ─── Prior 1040 mapper ────────────────────────────────────────────────────────

function mapPrior1040(
  result: Prior1040ParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  const docId = makeDocId();
  const detectedYear = extractYear(result.taxYear);
  const yearMismatch = detectedYear !== null && detectedYear !== currentYear;

  // Build parsedData for Document
  const amounts: Record<string, number> = {
    totalWages: numVal(result.totalWages),
    totalIncome: numVal(result.totalIncome),
    adjustedGrossIncome: numVal(result.adjustedGrossIncome),
    taxableIncome: numVal(result.taxableIncome),
    totalTax: numVal(result.totalTax),
    refundOrOwed: numVal(result.refundOrOwed),
  };
  if (result.hasScheduleC) {
    amounts['scheduleCGrossReceipts'] = numVal(result.scheduleCGrossReceipts);
    amounts['scheduleCTotalExpenses'] = numVal(result.scheduleCTotalExpenses);
    amounts['scheduleCNetProfit'] = numVal(result.scheduleCNetProfit);
  }
  if (numVal(result.carryforwardNOL) !== 0) amounts['carryforwardNOL'] = numVal(result.carryforwardNOL);
  if (numVal(result.carryforwardCapitalLoss) !== 0) amounts['carryforwardCapitalLoss'] = numVal(result.carryforwardCapitalLoss);

  const parsedData: ParsedDocumentData = {
    documentType: 'prior_return',
    taxYear: detectedYear ?? currentYear,
    recipient: strVal(result.filerName) || undefined,
    amounts,
    boxFields: {
      filingStatus: strVal(result.filingStatus),
      hasScheduleC: String(result.hasScheduleC),
      scheduleCBusinessName: result.hasScheduleC ? strVal(result.scheduleCBusinessName) : '',
      carryforwardNOL: String(numVal(result.carryforwardNOL)),
      carryforwardCapitalLoss: String(numVal(result.carryforwardCapitalLoss)),
    },
    extractedAt: new Date(),
    confidence: result.overallConfidence,
  };

  const verificationStatus =
    yearMismatch ? 'mismatch' : result.overallConfidence < CONFIDENCE_THRESHOLD ? 'pending' : 'verified';

  const document: Document = {
    id: docId,
    type: 'prior_return',
    fileName,
    uploadedAt: new Date(),
    taxYear: currentYear,
    detectedTaxYear: detectedYear ?? undefined,
    yearMismatchConfirmed: false,
    sourceReference: `Claude extraction — Prior Year 1040`,
    parsedData,
    rawContent: result.rawResponse,
    verificationStatus,
    verificationErrors: result.flaggedFields.length > 0
      ? [`${result.flaggedFields.length} field(s) flagged: ${result.flaggedFields.slice(0, 5).join(', ')}`]
      : undefined,
  };

  // Reconciliation: if Schedule C gross > 0, treat as prior-year business income reference
  const reconciliations: IncomeReconciliation[] = [];
  const schedCGross = numVal(result.scheduleCGrossReceipts);
  if (result.hasScheduleC && schedCGross > 0) {
    reconciliations.push({
      id: makeRecId(),
      sourceType: 'processor_summary', // closest match for prior Sched C
      sourceDocumentId: docId,
      sourceDescription: `Prior Year ${detectedYear ?? ''} Schedule C — ${strVal(result.scheduleCBusinessName) || 'Business Income'}`,
      grossAmount: schedCGross,
      fees: 0,
      refundsChargebacks: 0,
      netAmount: numVal(result.scheduleCNetProfit),
      matchedDepositIds: [],
      matchedTransactionIds: [],
      isReconciled: false,
      reconciliationMethod: 'direct_entry',
      discrepancyNote: `From prior year ${detectedYear} return — used as reference only, not current year income.`,
      taxYear: currentYear,
    });
  }

  // Transactions: one per non-zero Schedule C expense line (requires_decision)
  const transactions: Transaction[] = result.hasScheduleC
    ? expenseEntriesToTransactions(
        buildScheduleCEntries(result),
        docId,
        currentYear,
        `Prior Year ${detectedYear ?? ''} Schedule C`,
      )
    : [];

  const discrepancies: Discrepancy[] = [];
  if (yearMismatch && detectedYear !== null) {
    discrepancies.push(buildYearMismatch(detectedYear, currentYear, fileName, docId));
  }

  return {
    document,
    transactions,
    reconciliations,
    discrepancies,
    flaggedFields: result.flaggedFields,
    yearMismatch,
    detectedYear,
    requiresManualReview: result.overallConfidence < CONFIDENCE_THRESHOLD,
  };
}

// ─── Business income mapper ───────────────────────────────────────────────────

function mapBusinessIncome(
  result: BusinessIncomeParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  const docId = makeDocId();
  const detectedYear = extractYear(result.taxYear);
  const yearMismatch = detectedYear !== null && detectedYear !== currentYear;
  const totalIncome = numVal(result.totalIncome);

  const parsedData: ParsedDocumentData = {
    documentType: 'payment_processor', // closest supported type for a business income summary
    taxYear: detectedYear ?? currentYear,
    payer: strVal(result.businessName) || undefined,
    amounts: {
      totalIncome,
      expense_mileage: numVal(result.expense_mileage),
      expense_travel: numVal(result.expense_travel),
      expense_meals: numVal(result.expense_meals),
      expense_marketing: numVal(result.expense_marketing),
      expense_advertising: numVal(result.expense_advertising),
      expense_supplies: numVal(result.expense_supplies),
      expense_contractLabor: numVal(result.expense_contractLabor),
      expense_commissionsFees: numVal(result.expense_commissionsFees),
      expense_insurance: numVal(result.expense_insurance),
      expense_legalProfessional: numVal(result.expense_legalProfessional),
      expense_officeExpense: numVal(result.expense_officeExpense),
      expense_utilities: numVal(result.expense_utilities),
      expense_otherExpenses: numVal(result.expense_otherExpenses),
    },
    extractedAt: new Date(),
    confidence: result.overallConfidence,
  };

  const verificationStatus =
    yearMismatch ? 'mismatch' : result.overallConfidence < CONFIDENCE_THRESHOLD ? 'pending' : 'verified';

  const document: Document = {
    id: docId,
    type: 'payment_processor',
    fileName,
    uploadedAt: new Date(),
    taxYear: currentYear,
    detectedTaxYear: detectedYear ?? undefined,
    yearMismatchConfirmed: false,
    sourceReference: `Claude extraction — Business Income Summary`,
    parsedData,
    rawContent: result.rawResponse,
    verificationStatus,
    verificationErrors: result.flaggedFields.length > 0
      ? [`${result.flaggedFields.length} field(s) flagged: ${result.flaggedFields.slice(0, 5).join(', ')}`]
      : undefined,
  };

  // Income reconciliation
  const reconciliations: IncomeReconciliation[] = [];
  if (totalIncome > 0) {
    reconciliations.push({
      id: makeRecId(),
      sourceType: 'processor_summary',
      sourceDocumentId: docId,
      sourceDescription: `Business Income — ${strVal(result.businessName) || fileName}`,
      grossAmount: totalIncome,
      fees: 0,
      refundsChargebacks: 0,
      netAmount: totalIncome,
      matchedDepositIds: [],
      matchedTransactionIds: [],
      isReconciled: false,
      reconciliationMethod: 'direct_entry',
      taxYear: currentYear,
    });
  }

  // Expense transactions
  const transactions = expenseEntriesToTransactions(
    buildScheduleCEntries(result),
    docId,
    currentYear,
    `Business Income Summary — ${strVal(result.businessName) || fileName}`,
  );

  const discrepancies: Discrepancy[] = [];
  if (yearMismatch && detectedYear !== null) {
    discrepancies.push(buildYearMismatch(detectedYear, currentYear, fileName, docId));
  }

  return {
    document,
    transactions,
    reconciliations,
    discrepancies,
    flaggedFields: result.flaggedFields,
    yearMismatch,
    detectedYear,
    requiresManualReview: result.overallConfidence < CONFIDENCE_THRESHOLD,
  };
}

// ─── 1099 mapper ──────────────────────────────────────────────────────────────

function map1099(
  result: Form1099ParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  const docId = makeDocId();
  const detectedYear = extractYear(result.taxYear);
  const yearMismatch = detectedYear !== null && detectedYear !== currentYear;

  const docTypeMap: Record<Form1099ParseResult['variant'], DocumentType> = {
    '1099_nec': '1099_nec',
    '1099_int': '1099_int',
    '1099_div': '1099_div',
    'unknown': '1099_nec', // default fallback
  };
  const docType = docTypeMap[result.variant];

  // Box 1 is the primary income field for all 1099 variants
  const grossAmount = numVal(result.box1);
  const federalWithheld = numVal(result.box4_federalWithholding);

  const parsedData: ParsedDocumentData = {
    documentType: docType,
    taxYear: detectedYear ?? currentYear,
    payer: strVal(result.payerName) || undefined,
    payerEIN: strVal(result.payerEIN) || undefined,
    recipient: strVal(result.recipientName) || undefined,
    recipientSSN: strVal(result.recipientTINLast4)
      ? `***-**-${strVal(result.recipientTINLast4)}`
      : undefined,
    amounts: {
      box1: grossAmount,
      box2: numVal(result.box2),
      box3: numVal(result.box3),
      box4_federalWithholding: federalWithheld,
      box5: numVal(result.box5),
      box6: numVal(result.box6),
      box7: numVal(result.box7),
      stateTaxWithheld: numVal(result.stateTaxWithheld),
      stateIncome: numVal(result.stateIncome),
    },
    boxFields: {
      variant: result.variant,
      stateCode: strVal(result.stateCode),
    },
    extractedAt: new Date(),
    confidence: result.overallConfidence,
  };

  const verificationStatus =
    yearMismatch ? 'mismatch' : result.overallConfidence < CONFIDENCE_THRESHOLD ? 'pending' : 'verified';

  const document: Document = {
    id: docId,
    type: docType,
    fileName,
    uploadedAt: new Date(),
    taxYear: currentYear,
    detectedTaxYear: detectedYear ?? undefined,
    yearMismatchConfirmed: false,
    sourceReference: `Claude extraction — ${result.variant.toUpperCase().replace('_', '-')}`,
    parsedData,
    rawContent: result.rawResponse,
    verificationStatus,
    verificationErrors: result.flaggedFields.length > 0
      ? [`${result.flaggedFields.length} field(s) flagged: ${result.flaggedFields.slice(0, 5).join(', ')}`]
      : undefined,
  };

  // Income reconciliation — all 1099 types require reconciliation
  const reconciliations: IncomeReconciliation[] = [];
  if (grossAmount > 0) {
    const variantLabel = result.variant === '1099_nec' ? '1099-NEC'
      : result.variant === '1099_int' ? '1099-INT'
      : result.variant === '1099_div' ? '1099-DIV'
      : '1099';

    reconciliations.push({
      id: makeRecId(),
      sourceType: '1099',
      sourceDocumentId: docId,
      sourceDescription: `${variantLabel} — ${strVal(result.payerName) || 'Unknown Payer'}`,
      grossAmount,
      fees: 0,
      refundsChargebacks: 0,
      netAmount: grossAmount,
      matchedDepositIds: [],
      matchedTransactionIds: [],
      isReconciled: false,
      reconciliationMethod: 'direct_entry',
      taxYear: currentYear,
    });
  }

  const discrepancies: Discrepancy[] = [];
  if (yearMismatch && detectedYear !== null) {
    discrepancies.push(buildYearMismatch(detectedYear, currentYear, fileName, docId));
  }

  return {
    document,
    transactions: [],
    reconciliations,
    discrepancies,
    flaggedFields: result.flaggedFields,
    yearMismatch,
    detectedYear,
    requiresManualReview: result.overallConfidence < CONFIDENCE_THRESHOLD,
  };
}

// ─── 1099-R mapper ────────────────────────────────────────────────────────────

function map1099R(
  result: Form1099R_ParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  const docId = makeDocId();
  const detectedYear = extractYear(result.taxYear);
  const yearMismatch = detectedYear !== null && detectedYear !== currentYear;

  const grossDist = numVal(result.box1_grossDistribution);
  const taxableAmt = numVal(result.box2a_taxableAmount);
  const federalWithheld = numVal(result.box4_federalWithholding);
  const distributionCode = strVal(result.box7_distributionCode);

  // Determine document type label
  const isRoth = ['Q', 'T', 'H'].includes(distributionCode.toUpperCase());
  const isRollover = ['G', 'H'].includes(distributionCode.toUpperCase());

  const parsedData: ParsedDocumentData = {
    documentType: '1099_r',
    taxYear: detectedYear ?? currentYear,
    payer: strVal(result.payerName) || undefined,
    payerEIN: strVal(result.payerEIN) || undefined,
    recipient: strVal(result.recipientName) || undefined,
    recipientSSN: strVal(result.recipientTINLast4)
      ? `***-**-${strVal(result.recipientTINLast4)}`
      : undefined,
    amounts: {
      box1_grossDistribution: grossDist,
      box2a_taxableAmount: taxableAmt,
      box4_federalWithholding: federalWithheld,
      box5_employeeContributions: numVal(result.box5_employeeContributions),
      box13_stateDistributions: numVal(result.box13_stateDistributions),
      box14_stateTaxWithheld: numVal(result.box14_stateTaxWithheld),
    },
    boxFields: {
      box7_distributionCode: distributionCode,
      box7_irasepSimple: String(result.box7_irasepSimple.value ?? false),
      isRoth: String(isRoth),
      isRollover: String(isRollover),
      box12_stateCode: strVal(result.box12_stateCode),  // IRS Form 1099-R Box 12 — state/payer's state no.
    },
    extractedAt: new Date(),
    confidence: result.overallConfidence,
  };

  const verificationStatus =
    yearMismatch ? 'mismatch' : result.overallConfidence < CONFIDENCE_THRESHOLD ? 'pending' : 'verified';

  const document: Document = {
    id: docId,
    type: '1099_r',
    fileName,
    uploadedAt: new Date(),
    taxYear: currentYear,
    detectedTaxYear: detectedYear ?? undefined,
    yearMismatchConfirmed: false,
    sourceReference: `Claude extraction — 1099-R`,
    parsedData,
    rawContent: result.rawResponse,
    verificationStatus,
    verificationErrors: result.flaggedFields.length > 0
      ? [`${result.flaggedFields.length} field(s) flagged: ${result.flaggedFields.slice(0, 5).join(', ')}`]
      : undefined,
  };

  // Income reconciliation — only if there's taxable income and it's not a rollover
  const reconciliations: IncomeReconciliation[] = [];
  if (taxableAmt > 0 && !isRollover) {
    reconciliations.push({
      id: makeRecId(),
      sourceType: '1099',
      sourceDocumentId: docId,
      sourceDescription: `1099-R — ${strVal(result.payerName) || 'Unknown Payer'} (Code ${distributionCode || '?'})`,
      grossAmount: taxableAmt,
      fees: 0,
      refundsChargebacks: 0,
      netAmount: taxableAmt,
      matchedDepositIds: [],
      matchedTransactionIds: [],
      isReconciled: false,
      reconciliationMethod: 'direct_entry',
      discrepancyNote: distributionCode === '1'
        ? 'Early distribution — 10% penalty may apply unless exception claimed.'
        : undefined,
      taxYear: currentYear,
    });
  }

  const discrepancies: Discrepancy[] = [];
  if (yearMismatch && detectedYear !== null) {
    discrepancies.push(buildYearMismatch(detectedYear, currentYear, fileName, docId));
  }
  // Warn about early distribution penalty
  if (distributionCode === '1') {
    discrepancies.push({
      id: makeDiscId(),
      type: 'classification',
      severity: 'material',
      description: `1099-R from ${strVal(result.payerName) || fileName} has distribution code "1" (early distribution). A 10% additional tax (Form 5329) may apply unless an exception is claimed. Verify with taxpayer.`,
      source1: '1099-R Box 7',
      source1Value: '1',
      source2: 'IRS Rules',
      source2Value: 'Code 1 = early, potential 10% penalty',
      impactedLines: ['Form 5329', 'Form 1040 Schedule 2 Line 8'],
      taxYear: currentYear,
    });
  }

  return {
    document,
    transactions: [],
    reconciliations,
    discrepancies,
    flaggedFields: result.flaggedFields,
    yearMismatch,
    detectedYear,
    requiresManualReview: result.overallConfidence < CONFIDENCE_THRESHOLD,
  };
}

// ─── K-1 (1065) mapper ────────────────────────────────────────────────────────

function mapK1_1065(
  result: K1_1065_ParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  const docId = makeDocId();
  const detectedYear = extractYear(result.taxYear);
  const yearMismatch = detectedYear !== null && detectedYear !== currentYear;

  const ordinaryIncome = numVal(result.box1_ordinaryIncome);
  const guaranteedPaymentsServices = numVal(result.box4_guaranteedPaymentsServices);
  const guaranteedPaymentsCapital = numVal(result.box5_guaranteedPaymentsCapital);
  const rentalIncome = numVal(result.box2_netRentalRealEstate) + numVal(result.box3_otherNetRentalIncome);
  const stCapGain = numVal(result.box6a_netShortTermCapGain);
  const ltCapGain = numVal(result.box9a_netLongTermCapGain);
  const seEarnings = numVal(result.box14_seEarnings);

  const totalPassThrough =
    ordinaryIncome + guaranteedPaymentsServices + guaranteedPaymentsCapital + rentalIncome;

  const parsedData: ParsedDocumentData = {
    documentType: 'k1_1065',
    taxYear: detectedYear ?? currentYear,
    payer: strVal(result.partnershipName) || undefined,
    payerEIN: strVal(result.partnershipEIN) || undefined,
    recipient: strVal(result.partnerName) || undefined,
    recipientSSN: strVal(result.partnerTINLast4)
      ? `***-**-${strVal(result.partnerTINLast4)}`
      : undefined,
    amounts: {
      box1_ordinaryIncome: ordinaryIncome,
      box2_netRentalRealEstate: numVal(result.box2_netRentalRealEstate),
      box3_otherNetRentalIncome: numVal(result.box3_otherNetRentalIncome),
      box4_guaranteedPaymentsServices: guaranteedPaymentsServices,
      box5_guaranteedPaymentsCapital: guaranteedPaymentsCapital,
      box6a_netShortTermCapGain: stCapGain,
      box9a_netLongTermCapGain: ltCapGain,
      box11_otherIncome: numVal(result.box11_otherIncome),
      box12_section179: numVal(result.box12_section179),
      box14_seEarnings: seEarnings,
      box19_distributions: numVal(result.box19_distributions),
    },
    boxFields: {
      isGeneralPartner: String(result.isGeneralPartner.value ?? false),
      ownershipPct: String(result.ownershipPct.value ?? ''),
    },
    extractedAt: new Date(),
    confidence: result.overallConfidence,
  };

  const verificationStatus =
    yearMismatch ? 'mismatch' : result.overallConfidence < CONFIDENCE_THRESHOLD ? 'pending' : 'verified';

  const document: Document = {
    id: docId,
    type: 'k1_1065',
    fileName,
    uploadedAt: new Date(),
    taxYear: currentYear,
    detectedTaxYear: detectedYear ?? undefined,
    yearMismatchConfirmed: false,
    sourceReference: `Claude extraction — Schedule K-1 (Form 1065)`,
    parsedData,
    rawContent: result.rawResponse,
    verificationStatus,
    verificationErrors: result.flaggedFields.length > 0
      ? [`${result.flaggedFields.length} field(s) flagged: ${result.flaggedFields.slice(0, 5).join(', ')}`]
      : undefined,
  };

  // Income reconciliation for pass-through income
  const reconciliations: IncomeReconciliation[] = [];
  if (Math.abs(totalPassThrough) > 0 || Math.abs(guaranteedPaymentsServices) > 0) {
    const description = `K-1 (1065) — ${strVal(result.partnershipName) || 'Partnership'}`;
    if (Math.abs(ordinaryIncome) > 0) {
      reconciliations.push({
        id: makeRecId(),
        sourceType: '1099',
        sourceDocumentId: docId,
        sourceDescription: `${description} — Ordinary Income (Box 1)`,
        grossAmount: ordinaryIncome,
        fees: 0,
        refundsChargebacks: 0,
        netAmount: ordinaryIncome,
        matchedDepositIds: [],
        matchedTransactionIds: [],
        isReconciled: false,
        reconciliationMethod: 'direct_entry',
        taxYear: currentYear,
      });
    }
    if (Math.abs(guaranteedPaymentsServices) > 0) {
      reconciliations.push({
        id: makeRecId(),
        sourceType: '1099',
        sourceDocumentId: docId,
        sourceDescription: `${description} — Guaranteed Payments (Box 4)`,
        grossAmount: guaranteedPaymentsServices,
        fees: 0,
        refundsChargebacks: 0,
        netAmount: guaranteedPaymentsServices,
        matchedDepositIds: [],
        matchedTransactionIds: [],
        isReconciled: false,
        reconciliationMethod: 'direct_entry',
        discrepancyNote: 'Guaranteed payments are subject to SE tax — verify Box 14.',
        taxYear: currentYear,
      });
    }
  }

  const discrepancies: Discrepancy[] = [];
  if (yearMismatch && detectedYear !== null) {
    discrepancies.push(buildYearMismatch(detectedYear, currentYear, fileName, docId));
  }
  // Warn about SE tax on general partner income
  const isGP = result.isGeneralPartner.value === true || result.isGeneralPartner.value === 'true';
  if (isGP && seEarnings !== 0) {
    discrepancies.push({
      id: makeDiscId(),
      type: 'classification',
      severity: 'informational',
      description: `K-1 (1065) — ${strVal(result.partnershipName) || fileName}: General partner has SE earnings (Box 14 = $${seEarnings.toLocaleString()}). Self-employment tax applies via Schedule SE.`,
      source1: 'K-1 Box 14',
      source1Value: String(seEarnings),
      source2: 'Schedule SE',
      source2Value: 'SE tax required',
      impactedLines: ['Schedule SE', 'Form 1040 Schedule 2'],
      taxYear: currentYear,
    });
  }

  return {
    document,
    transactions: [],
    reconciliations,
    discrepancies,
    flaggedFields: result.flaggedFields,
    yearMismatch,
    detectedYear,
    requiresManualReview: result.overallConfidence < CONFIDENCE_THRESHOLD,
  };
}

// ─── K-1 (1120-S) mapper ──────────────────────────────────────────────────────

function mapK1_1120S(
  result: K1_1120S_ParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  const docId = makeDocId();
  const detectedYear = extractYear(result.taxYear);
  const yearMismatch = detectedYear !== null && detectedYear !== currentYear;

  const ordinaryIncome = numVal(result.box1_ordinaryIncome);
  const rentalIncome = numVal(result.box2_netRentalRealEstate) + numVal(result.box3_otherNetRentalIncome);
  const stCapGain = numVal(result.box7_netShortTermCapGain);
  const ltCapGain = numVal(result.box8a_netLongTermCapGain);
  const section1231 = numVal(result.box9_netSection1231);
  const totalPassThrough = ordinaryIncome + rentalIncome;

  const parsedData: ParsedDocumentData = {
    documentType: 'k1_1120s',
    taxYear: detectedYear ?? currentYear,
    payer: strVal(result.corporationName) || undefined,
    payerEIN: strVal(result.corporationEIN) || undefined,
    recipient: strVal(result.shareholderName) || undefined,
    recipientSSN: strVal(result.shareholderTINLast4)
      ? `***-**-${strVal(result.shareholderTINLast4)}`
      : undefined,
    amounts: {
      box1_ordinaryIncome: ordinaryIncome,
      box2_netRentalRealEstate: numVal(result.box2_netRentalRealEstate),
      box3_otherNetRentalIncome: numVal(result.box3_otherNetRentalIncome),
      box4_interestIncome: numVal(result.box4_interestIncome),
      box5a_ordinaryDividends: numVal(result.box5a_ordinaryDividends),
      box6_royalties: numVal(result.box6_royalties),
      box7_netShortTermCapGain: stCapGain,
      box8a_netLongTermCapGain: ltCapGain,
      box9_netSection1231: section1231,
      box10_otherIncome: numVal(result.box10_otherIncome),
      box11_section179: numVal(result.box11_section179),
      distributions: numVal(result.distributions),
    },
    boxFields: {
      ownershipPct: String(result.ownershipPct.value ?? ''),
    },
    extractedAt: new Date(),
    confidence: result.overallConfidence,
  };

  const verificationStatus =
    yearMismatch ? 'mismatch' : result.overallConfidence < CONFIDENCE_THRESHOLD ? 'pending' : 'verified';

  const document: Document = {
    id: docId,
    type: 'k1_1120s',
    fileName,
    uploadedAt: new Date(),
    taxYear: currentYear,
    detectedTaxYear: detectedYear ?? undefined,
    yearMismatchConfirmed: false,
    sourceReference: `Claude extraction — Schedule K-1 (Form 1120-S)`,
    parsedData,
    rawContent: result.rawResponse,
    verificationStatus,
    verificationErrors: result.flaggedFields.length > 0
      ? [`${result.flaggedFields.length} field(s) flagged: ${result.flaggedFields.slice(0, 5).join(', ')}`]
      : undefined,
  };

  // Income reconciliation
  const reconciliations: IncomeReconciliation[] = [];
  const description = `K-1 (1120-S) — ${strVal(result.corporationName) || 'S Corporation'}`;
  if (Math.abs(ordinaryIncome) > 0) {
    reconciliations.push({
      id: makeRecId(),
      sourceType: '1099',
      sourceDocumentId: docId,
      sourceDescription: `${description} — Ordinary Income (Box 1)`,
      grossAmount: ordinaryIncome,
      fees: 0,
      refundsChargebacks: 0,
      netAmount: ordinaryIncome,
      matchedDepositIds: [],
      matchedTransactionIds: [],
      isReconciled: false,
      reconciliationMethod: 'direct_entry',
      taxYear: currentYear,
    });
  }

  const discrepancies: Discrepancy[] = [];
  if (yearMismatch && detectedYear !== null) {
    discrepancies.push(buildYearMismatch(detectedYear, currentYear, fileName, docId));
  }
  // Remind about reasonable compensation requirement
  discrepancies.push({
    id: makeDiscId(),
    type: 'classification',
    severity: 'informational',
    description: `S Corp K-1 from ${strVal(result.corporationName) || fileName}: Verify that reasonable shareholder-employee compensation (W-2 wages) was paid. IRS requires S Corp owner-employees to receive reasonable compensation before distributions.`,
    source1: 'K-1 (1120-S)',
    source1Value: strVal(result.corporationName) || fileName,
    source2: 'IRS Reasonable Compensation Rules',
    source2Value: 'W-2 wages required for shareholder-employees',
    impactedLines: ['W-2 Box 1', 'S Corp payroll'],
    taxYear: currentYear,
  });

  return {
    document,
    transactions: [],
    reconciliations,
    discrepancies,
    flaggedFields: result.flaggedFields,
    yearMismatch,
    detectedYear,
    requiresManualReview: result.overallConfidence < CONFIDENCE_THRESHOLD,
  };
}

// ─── 1099-B mapper ─────────────────────────────────────────────────────────────

function map1099B(
  result: Form1099B_ParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  const docId = makeDocId();
  const detectedYear = numVal(result.taxYear) as TaxYear | null;
  const yearMismatch = detectedYear !== null && detectedYear !== currentYear;

  const payerName = strVal(result.payerName) || 'Unknown Broker';
  const shortTerm = numVal(result.totalShortTermGainLoss);
  const longTerm = numVal(result.totalLongTermGainLoss);
  const totalProceeds = numVal(result.totalProceeds);
  const totalBasis = numVal(result.totalCostBasis);
  const netGainLoss = shortTerm + longTerm;

  const parsedData: ParsedDocumentData = {
    documentType: '1099_b',
    taxYear: detectedYear ?? currentYear,
    payer: payerName,
    payerEIN: strVal(result.payerEIN) || undefined,
    recipient: strVal(result.recipientName) || undefined,
    recipientSSN: strVal(result.recipientTINLast4)
      ? `***-**-${strVal(result.recipientTINLast4)}`
      : undefined,
    amounts: {
      totalProceeds,
      totalCostBasis: totalBasis,
      totalShortTermGainLoss: shortTerm,
      totalLongTermGainLoss: longTerm,
      federalWithholding: numVal(result.federalWithholding),
      stateWithholding: numVal(result.stateWithholding),
      saleLotCount: result.saleLots.length,
    },
    boxFields: {
      recipientTINLast4: strVal(result.recipientTINLast4) || '',
    },
    extractedAt: new Date(),
    confidence: result.overallConfidence,
  };

  const verificationStatus =
    yearMismatch ? 'mismatch' : result.overallConfidence < CONFIDENCE_THRESHOLD ? 'pending' : 'verified';

  const document: Document = {
    id: docId,
    type: '1099_b' as DocumentType,
    fileName,
    uploadedAt: new Date(),
    taxYear: currentYear,
    detectedTaxYear: detectedYear ?? undefined,
    yearMismatchConfirmed: false,
    sourceReference: `1099-B — ${payerName}`,
    parsedData,
    rawContent: result.rawResponse,
    verificationStatus,
    verificationErrors: result.flaggedFields.length > 0
      ? [`${result.flaggedFields.length} field(s) flagged: ${result.flaggedFields.slice(0, 5).join(', ')}`]
      : undefined,
  };

  // Short-term capital gains → Schedule D Part I
  const reconciliations: IncomeReconciliation[] = [];
  if (Math.abs(shortTerm) > 0) {
    reconciliations.push({
      id: makeRecId(),
      sourceType: 'capital_gains',
      sourceDocumentId: docId,
      sourceDescription: `1099-B — ${payerName} — Short-Term Gain/Loss (Schedule D Part I)`,
      grossAmount: shortTerm,
      fees: 0,
      refundsChargebacks: 0,
      netAmount: shortTerm,
      matchedDepositIds: [],
      matchedTransactionIds: [],
      isReconciled: false,
      reconciliationMethod: 'direct_entry',
      taxYear: currentYear,
    });
  }
  // Long-term capital gains → Schedule D Part II
  if (Math.abs(longTerm) > 0) {
    reconciliations.push({
      id: makeRecId(),
      sourceType: 'capital_gains',
      sourceDocumentId: docId,
      sourceDescription: `1099-B — ${payerName} — Long-Term Gain/Loss (Schedule D Part II)`,
      grossAmount: longTerm,
      fees: 0,
      refundsChargebacks: 0,
      netAmount: longTerm,
      matchedDepositIds: [],
      matchedTransactionIds: [],
      isReconciled: false,
      reconciliationMethod: 'direct_entry',
      taxYear: currentYear,
    });
  }

  const discrepancies: Discrepancy[] = [];
  if (yearMismatch && detectedYear !== null) {
    discrepancies.push(buildYearMismatch(detectedYear, currentYear, fileName, docId));
  }

  // Warn when cost basis is missing (Box 5 "noncovered" securities)
  if (totalProceeds > 0 && totalBasis === 0) {
    discrepancies.push({
      id: makeDiscId(),
      type: 'missing_doc',
      severity: 'material',
      description: `1099-B from ${payerName}: Cost basis is $0 or missing. This may indicate "noncovered" securities where basis isn't reported to the IRS. You must determine the actual cost basis from purchase records before filing Schedule D. Entering $0 basis will overstate taxable gain. See IRS Pub 550 and Form 8949 instructions.`,
      source1: '1099-B Box 1e (Cost Basis)',
      source1Value: '$0',
      source2: 'IRS Form 8949 / Pub 550',
      source2Value: 'Actual basis required',
      impactedLines: ['Schedule D', 'Form 8949'],
      taxYear: currentYear,
    });
  }

  // Warn if federal withholding is present (backup withholding)
  const withholding = numVal(result.federalWithholding);
  if (withholding > 0) {
    discrepancies.push({
      id: makeDiscId(),
      type: 'amount',
      severity: 'minor',
      description: `1099-B from ${payerName} shows $${withholding.toFixed(2)} federal backup withholding (Box 4). This should be included in total federal tax payments on Form 1040 line 25b.`,
      source1: '1099-B Box 4 (Federal Withholding)',
      source1Value: `$${withholding.toFixed(2)}`,
      source2: 'Form 1040 Line 25b',
      source2Value: 'Include in total payments',
      impactedLines: ['1040 Line 25b', 'Schedule D'],
      taxYear: currentYear,
    });
  }

  return {
    document,
    transactions: [],
    reconciliations,
    discrepancies,
    flaggedFields: result.flaggedFields,
    yearMismatch,
    detectedYear,
    requiresManualReview: result.overallConfidence < CONFIDENCE_THRESHOLD || result.saleLots.some(l => l.costBasis === null),
  };
}

// ─── 1099-K mapper ─────────────────────────────────────────────────────────────

function map1099K(
  result: Form1099K_ParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  const docId = makeDocId();
  const detectedYear = numVal(result.taxYear) as TaxYear | null;
  const yearMismatch = detectedYear !== null && detectedYear !== currentYear;

  const filerName = strVal(result.filerName) || 'Payment Processor';
  const grossAmount = numVal(result.grossAmountTransactions);
  const txnCount = typeof result.numberOfTransactions.value === 'number'
    ? result.numberOfTransactions.value
    : null;

  const parsedData: ParsedDocumentData = {
    documentType: '1099_k',
    taxYear: detectedYear ?? currentYear,
    payer: filerName,
    payerEIN: strVal(result.filerEIN) || undefined,
    recipient: strVal(result.payeeNameOnFile) || undefined,
    recipientSSN: strVal(result.payeeTINLast4)
      ? `***-**-${strVal(result.payeeTINLast4)}`
      : undefined,
    amounts: {
      grossAmountTransactions: grossAmount,
      cardNotPresentTransactions: numVal(result.cardNotPresentTransactions),
      numberOfTransactions: txnCount ?? 0,
      federalWithholding: numVal(result.federalWithholding),
      stateTaxWithheld: numVal(result.stateTaxWithheld),
    },
    boxFields: {
      transactionType: strVal(result.transactionType) || '',
      stateCode: strVal(result.stateCode) || '',
    },
    extractedAt: new Date(),
    confidence: result.overallConfidence,
  };

  const verificationStatus =
    yearMismatch ? 'mismatch' : result.overallConfidence < CONFIDENCE_THRESHOLD ? 'pending' : 'verified';

  const document: Document = {
    id: docId,
    type: '1099_k' as DocumentType,
    fileName,
    uploadedAt: new Date(),
    taxYear: currentYear,
    detectedTaxYear: detectedYear ?? undefined,
    yearMismatchConfirmed: false,
    sourceReference: `1099-K — ${filerName}`,
    parsedData,
    rawContent: result.rawResponse,
    verificationStatus,
    verificationErrors: result.flaggedFields.length > 0
      ? [`${result.flaggedFields.length} field(s) flagged: ${result.flaggedFields.slice(0, 5).join(', ')}`]
      : undefined,
  };

  // 1099-K gross goes to Schedule C (or Schedule D for investment platforms)
  const reconciliations: IncomeReconciliation[] = [];
  if (grossAmount > 0) {
    reconciliations.push({
      id: makeRecId(),
      sourceType: '1099_k',
      sourceDocumentId: docId,
      sourceDescription: `1099-K — ${filerName} — Gross Payment Receipts (${txnCount ? txnCount + ' transactions' : 'see form'})`,
      grossAmount,
      fees: 0,
      refundsChargebacks: 0,
      netAmount: grossAmount,
      matchedDepositIds: [],
      matchedTransactionIds: [],
      isReconciled: false,
      reconciliationMethod: 'direct_entry',
      taxYear: currentYear,
    });
  }

  const discrepancies: Discrepancy[] = [];
  if (yearMismatch && detectedYear !== null) {
    discrepancies.push(buildYearMismatch(detectedYear, currentYear, fileName, docId));
  }

  // Critical: 1099-K is GROSS — fees, refunds, and COGS reduce taxable income
  discrepancies.push({
    id: makeDiscId(),
    type: 'amount',
    severity: 'material',
    description: `1099-K from ${filerName} reports $${grossAmount.toLocaleString()} GROSS payment volume — this is NOT the same as taxable income. Platform fees, refunds, chargebacks, and cost of goods sold must be deducted. Reconcile this 1099-K against your actual deposit records. Per IRS Notice 2024-85, the reporting threshold for TY2024 is $5,000. See IRS Pub 334 (Schedule C) or Pub 550 (investment).`,
    source1: `1099-K Box 1a — ${filerName}`,
    source1Value: `$${grossAmount.toLocaleString()} gross`,
    source2: 'IRS Schedule C / Pub 334 / Notice 2024-85',
    source2Value: 'Deduct fees, refunds, COGS',
    impactedLines: ['Schedule C Line 1', 'or Schedule D'],
    taxYear: currentYear,
  });

  // Flag if sum of monthly amounts ≠ Box 1a (data integrity check)
  const monthlySum = result.monthlyAmounts.reduce((sum, m) => {
    const v = typeof m.value === 'number' ? m.value : 0;
    return sum + v;
  }, 0);
  if (Math.abs(monthlySum - grossAmount) > 1 && monthlySum > 0) {
    discrepancies.push({
      id: makeDiscId(),
      type: 'amount',
      severity: 'minor',
      description: `1099-K from ${filerName}: Monthly breakdown sums to $${monthlySum.toFixed(2)} but Box 1a shows $${grossAmount.toFixed(2)} — difference of $${Math.abs(monthlySum - grossAmount).toFixed(2)}. Verify the form for OCR errors.`,
      source1: '1099-K Monthly Totals (Boxes 5a–5l)',
      source1Value: `$${monthlySum.toFixed(2)}`,
      source2: '1099-K Box 1a Gross',
      source2Value: `$${grossAmount.toFixed(2)}`,
      impactedLines: ['1099-K verification'],
      taxYear: currentYear,
    });
  }

  return {
    document,
    transactions: [],
    reconciliations,
    discrepancies,
    flaggedFields: result.flaggedFields,
    yearMismatch,
    detectedYear,
    requiresManualReview: true, // Always review 1099-K — reconciliation required
  };
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Map a ParseResult into Document, Transaction, IncomeReconciliation, and
 * Discrepancy entries ready to be fed into WorkflowContext add* functions.
 *
 * @param result     - Output from documentParser.parseDocument()
 * @param currentYear - The currently selected tax year (WorkflowContext)
 * @param fileName   - Original file name
 */
export function mapToWorkflow(
  result: ParseResult,
  currentYear: TaxYear,
  fileName: string,
): MappingOutput {
  switch (result.docKind) {
    case 'w2':
      return mapW2(result as W2ParseResult, currentYear, fileName);
    case 'prior_return':
      return mapPrior1040(result as Prior1040ParseResult, currentYear, fileName);
    case 'business_income':
      return mapBusinessIncome(result as BusinessIncomeParseResult, currentYear, fileName);
    case '1099':
      return map1099(result as Form1099ParseResult, currentYear, fileName);
    case '1099_r':
      return map1099R(result as Form1099R_ParseResult, currentYear, fileName);
    case '1099_b':
      return map1099B(result as Form1099B_ParseResult, currentYear, fileName);
    case '1099_k':
      return map1099K(result as Form1099K_ParseResult, currentYear, fileName);
    case 'k1_1065':
      return mapK1_1065(result as K1_1065_ParseResult, currentYear, fileName);
    case 'k1_1120s':
      return mapK1_1120S(result as K1_1120S_ParseResult, currentYear, fileName);
  }
}
