// Core type definitions for the tax system

export type TaxYear = number;

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
  | 'pending';

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
  | 'identification';

export interface TaxYearConfig {
  year: TaxYear;
  isLocked: boolean;
  lockedAt?: Date;
  states: StateConfig[];
}

export interface StateConfig {
  stateCode: string;
  stateName: string;
  residencyStatus: ResidencyStatus;
  hasBusinessNexus: boolean;
}

export interface Document {
  id: string;
  type: DocumentType;
  fileName: string;
  uploadedAt: Date;
  taxYear: TaxYear;
  sourceReference: string;
  parsedData?: Record<string, unknown>;
  rawContent?: string;
}

export interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  source: string;
  sourceDocumentId?: string;
  state: TransactionState;
  categoryId?: string;
  subcategoryId?: string;
  splitAllocations?: SplitAllocation[];
  businessPurpose?: string;
  evidenceStatus: EvidenceStatus;
  evidenceIds?: string[];
  confirmedAt?: Date;
  confirmedBy?: string;
  rationale?: string;
}

export interface SplitAllocation {
  categoryId: string;
  percentage: number;
  amount: number;
  rationale: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  scheduleCLine?: string;
  parentId?: string;
  deductibilityRules: string;
  limitations?: string;
  commonFalsePositives?: string[];
  evidenceExpectations: string;
}

export interface Evidence {
  id: string;
  transactionId: string;
  type: 'receipt' | 'invoice' | 'contract' | 'email' | 'screenshot' | 'other';
  fileName: string;
  uploadedAt: Date;
  businessPurposeNote?: string;
}

export interface Invoice {
  id: string;
  type: 'formal' | 'memorialized';
  invoiceNumber: string;
  createdAt: Date;
  linkedDepositId?: string;
  clientName: string;
  amount: number;
  description: string;
  disclosureText?: string;
  isPostPayment: boolean;
}

export interface Carryforward {
  id: string;
  type: string;
  originatingYear: TaxYear;
  amount: number;
  description: string;
  stillApplicable?: boolean;
  confirmedForYear?: TaxYear;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  order: number;
  status: WorkflowStatus;
  completedAt?: Date;
  blockedBy?: string[];
}

export interface Discrepancy {
  id: string;
  type: 'name' | 'ssn' | 'address' | 'amount' | 'date';
  description: string;
  source1: string;
  source1Value: string;
  source2: string;
  source2Value: string;
  resolution?: 'source1' | 'source2' | 'manual';
  resolvedValue?: string;
  resolvedAt?: Date;
}
