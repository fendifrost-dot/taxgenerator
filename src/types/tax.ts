// Core type definitions for the tax system
// ALL TYPES ARE YEAR-BOUND - NO CROSS-YEAR CONTAMINATION

export type TaxYear = number;

// ===== WORKFLOW STATUS TYPES =====
export type FederalStatus = 'draft' | 'blocked' | 'ready' | 'finalized' | 'locked';
export type StateStatus = 'not_started' | 'blocked' | 'ready' | 'finalized' | 'locked';
export type YearStatus = 'draft' | 'finalized' | 'locked';

export type TransactionState = 
  | 'deductible' 
  | 'requires_decision' 
  | 'non_deductible' 
  | 'not_expense';

export type WorkflowStatus = 
  | 'unresolved' 
  | 'confirmed' 
  | 'flagged' 
  | 'locked';

export type EvidenceStatus = 
  | 'present' 
  | 'missing' 
  | 'pending'
  | 'not_required';

export type ResidencyStatus = 
  | 'full_year' 
  | 'part_year' 
  | 'nonresident';

export type DocumentType = 
  | 'prior_return' 
  | 'w2' 
  | '1099_nec' 
  | '1099_int' 
  | '1099_div' 
  | 'bank_statement' 
  | 'payment_processor' 
  | 'invoice' 
  | 'receipt' 
  | 'identification'
  | 'blank_form';

export type FormType = 
  | '1040'
  | 'schedule_c'
  | 'schedule_se'
  | 'schedule_1'
  | 'schedule_2'
  | 'schedule_3'
  | 'state_return';

export type DiscrepancySeverity = 'critical' | 'material' | 'minor';

export type InvoiceType = 'formal' | 'memorialized';

// ===== WORKFLOW ENGINE TYPES =====
export interface WorkflowGates {
  taxYearSelected: boolean;
  statesConfigured: boolean;
  requiredFormsUploaded: boolean;
  noUnresolvedTransactions: boolean;
  noMaterialDiscrepancies: boolean;
  incomeReconciled: boolean;
  evidenceComplete: boolean;
  federalValidated: boolean;
  federalFinalized: boolean;
}

export interface UnresolvedCounts {
  missingDocuments: number;
  missingBlankForms: number;
  unresolvedTransactions: number;
  unreconciledDeposits: number;
  missingEvidence: number;
  unresolvedDiscrepancies: number;
}

export interface WorkflowState {
  federalStatus: FederalStatus;
  stateStatuses: Record<string, StateStatus>;
  gates: WorkflowGates;
  unresolvedCounts: UnresolvedCounts;
  blockedReasons: string[];
}

// ===== YEAR CONFIGURATION =====
export interface TaxYearConfig {
  year: TaxYear;
  status: YearStatus;
  version: number;
  versionHistory: VersionSnapshot[];
  isLocked: boolean;
  lockedAt?: Date;
  finalizedAt?: Date;
  states: StateConfig[];
  createdAt: Date;
  lastModified: Date;
}

export interface VersionSnapshot {
  version: number;
  createdAt: Date;
  changeLog: string;
  snapshotId: string;
}

export interface StateConfig {
  stateCode: string;
  stateName: string;
  residencyStatus: ResidencyStatus;
  hasBusinessNexus: boolean;
  status: StateStatus;
}

// ===== DOCUMENTS =====
export interface Document {
  id: string;
  type: DocumentType;
  fileName: string;
  uploadedAt: Date;
  taxYear: TaxYear;
  detectedTaxYear?: TaxYear;
  yearMismatchConfirmed?: boolean;
  sourceReference: string;
  parsedData?: ParsedDocumentData;
  rawContent?: string;
  verificationStatus: 'pending' | 'verified' | 'failed' | 'mismatch';
  verificationErrors?: string[];
}

export interface ParsedDocumentData {
  documentType: DocumentType;
  taxYear: TaxYear;
  payer?: string;
  payerEIN?: string;
  recipient?: string;
  recipientSSN?: string;
  amounts: Record<string, number>;
  boxFields?: Record<string, string | number>;
  extractedAt: Date;
  confidence: number;
  sourcePageRef?: string;
}

// ===== BLANK FORMS =====
export interface BlankForm {
  id: string;
  formType: FormType;
  formName: string;
  taxYear: TaxYear;
  jurisdiction: 'federal' | string; // state code for state forms
  residencyVersion?: 'resident' | 'part_year' | 'nonresident';
  uploadedAt: Date;
  verified: boolean;
  verificationErrors?: string[];
}

export interface RequiredForm {
  formType: FormType;
  formName: string;
  jurisdiction: 'federal' | string;
  residencyVersion?: 'resident' | 'part_year' | 'nonresident';
  reason: string;
  isRequired: boolean;
  isUploaded: boolean;
  isVerified: boolean;
}

// ===== TRANSACTIONS =====
export interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  source: string;
  sourceDocumentId?: string;
  sourcePageRef?: string;
  state: TransactionState;
  categoryId?: string;
  subcategoryId?: string;
  scheduleCLine?: string;
  splitAllocations?: SplitAllocation[];
  businessPurpose?: string;
  evidenceStatus: EvidenceStatus;
  evidenceIds?: string[];
  confirmedAt?: Date;
  confirmedBy?: string;
  rationale?: string;
  requiresBusinessPurpose: boolean;
  taxYear: TaxYear;
}

export interface SplitAllocation {
  id: string;
  categoryId: string;
  subcategoryId?: string;
  scheduleCLine: string;
  percentage: number;
  amount: number;
  rationale: string;
  confirmedAt: Date;
}

// ===== EXPENSE CATEGORIES =====
export interface ExpenseCategory {
  id: string;
  name: string;
  scheduleCLine: string;
  parentId?: string;
  deductibilityRules: string;
  limitations?: string;
  commonFalsePositives?: string[];
  evidenceExpectations: string;
  evidenceRequired: boolean;
  requiresBusinessPurpose: boolean;
  subcategories?: ExpenseCategory[];
}

// ===== EVIDENCE =====
export interface Evidence {
  id: string;
  transactionId: string;
  type: 'receipt' | 'invoice' | 'contract' | 'email' | 'screenshot' | 'other';
  fileName: string;
  uploadedAt: Date;
  businessPurposeNote?: string;
  taxYear: TaxYear;
}

// ===== INVOICES =====
export interface Invoice {
  id: string;
  type: InvoiceType;
  invoiceNumber: string;
  createdAt: Date;
  linkedDepositId?: string;
  linkedTransactionId?: string;
  clientName: string;
  clientIdentifier?: string;
  platform?: string;
  amount: number;
  description: string;
  serviceTimeframe?: string;
  agreementType?: 'verbal' | 'informal' | 'implied' | 'written';
  disclosureText?: string;
  isPostPayment: boolean;
  taxYear: TaxYear;
}

// ===== INCOME RECONCILIATION =====
export interface IncomeReconciliation {
  id: string;
  sourceType: '1099' | 'processor_summary' | 'bank_deposit';
  sourceDocumentId: string;
  sourceDescription: string;
  grossAmount: number;
  fees: number;
  refundsChargebacks: number;
  netAmount: number;
  matchedDepositIds: string[];
  matchedTransactionIds: string[];
  isReconciled: boolean;
  discrepancyAmount?: number;
  discrepancyNote?: string;
  taxYear: TaxYear;
}

// ===== DISCREPANCIES =====
export interface Discrepancy {
  id: string;
  type: 'name' | 'ssn' | 'address' | 'amount' | 'date' | 'missing_doc' | 'year_mismatch' | 'unmatched_deposit';
  severity: DiscrepancySeverity;
  description: string;
  source1: string;
  source1Value: string;
  source2?: string;
  source2Value?: string;
  impactedTotals?: string[];
  impactedLines?: string[];
  resolution?: 'source1' | 'source2' | 'manual' | 'excluded' | 'confirmed';
  resolutionAction?: string;
  resolvedValue?: string;
  resolvedAt?: Date;
  taxYear: TaxYear;
}

// ===== CARRYFORWARDS =====
export interface Carryforward {
  id: string;
  type: string;
  originatingYear: TaxYear;
  amount: number;
  description: string;
  stillApplicable?: boolean;
  confirmedForYear?: TaxYear;
  confirmationRequired: boolean;
}

// ===== FORM FILLING =====
export interface FormLine {
  lineNumber: string;
  description: string;
  value: number | string;
  sourceType: 'document' | 'calculation' | 'user_input' | 'carryforward';
  sourceReference: string;
  calculationPath?: string;
  ruleReference?: string;
}

export interface FilledForm {
  id: string;
  formType: FormType;
  taxYear: TaxYear;
  jurisdiction: 'federal' | string;
  lines: FormLine[];
  validationErrors: string[];
  isValid: boolean;
  generatedAt: Date;
}

// ===== RETURN PACKAGES =====
export interface ReturnPackage {
  id: string;
  type: 'federal' | 'state';
  jurisdiction: string;
  taxYear: TaxYear;
  version: number;
  forms: FilledForm[];
  reconciliationSchedules?: ReconciliationSchedule[];
  allocationWorksheets?: AllocationWorksheet[];
  generatedAt: Date;
  traceabilityLog: TraceabilityEntry[];
}

export interface ReconciliationSchedule {
  id: string;
  type: 'federal_to_state' | 'income' | 'expense';
  description: string;
  entries: ReconciliationEntry[];
}

export interface ReconciliationEntry {
  description: string;
  federalAmount?: number;
  stateAmount?: number;
  adjustment?: number;
  adjustmentReason?: string;
}

export interface AllocationWorksheet {
  id: string;
  type: 'apportionment' | 'allocation';
  description: string;
  states: string[];
  entries: AllocationEntry[];
}

export interface AllocationEntry {
  description: string;
  totalAmount: number;
  stateAllocations: Record<string, number>;
  method: string;
}

export interface TraceabilityEntry {
  lineReference: string;
  value: number | string;
  sourceDocumentId?: string;
  sourceDocumentRef?: string;
  calculationPath?: string;
  ruleReference: string;
}

// ===== AUDIT PACK =====
export interface AuditPack {
  id: string;
  taxYear: TaxYear;
  version: number;
  generatedAt: Date;
  federalReturn: ReturnPackage;
  stateReturns: ReturnPackage[];
  reconciliationSchedules: ReconciliationSchedule[];
  allocationWorksheets: AllocationWorksheet[];
  incomeSubstantiation: IncomeReconciliation[];
  evidenceIndex: EvidenceIndexEntry[];
  transactionLedger: Transaction[];
}

export interface EvidenceIndexEntry {
  transactionId: string;
  transactionDescription: string;
  amount: number;
  category: string;
  evidenceFiles: string[];
  businessPurpose?: string;
}

// ===== REPORTS =====
export interface PLReport {
  id: string;
  taxYear: TaxYear;
  period: 'monthly' | 'quarterly' | 'annual';
  periodStart: Date;
  periodEnd: Date;
  grossIncome: number;
  totalExpenses: number;
  netProfit: number;
  categoryBreakdown: CategoryTotal[];
  scheduleCMapping: ScheduleCLineTotal[];
}

export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  scheduleCLine: string;
  amount: number;
  transactionCount: number;
}

export interface ScheduleCLineTotal {
  line: string;
  description: string;
  amount: number;
}
