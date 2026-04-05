/**
 * client.ts
 *
 * Types for client management, per-client returns, tax optimization interview,
 * and client-facing portal tokens.
 */

// ─── Client & Return ───────────────────────────────────────────────────────────

export type ClientFilingStatus =
  | 'single'
  | 'married_filing_jointly'
  | 'married_filing_separately'
  | 'head_of_household'
  | 'qualifying_surviving_spouse';

export interface Client {
  id: string;
  preparerId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  ssnLast4?: string;

  // Extended intake fields
  dateOfBirth?: string;           // ISO date string YYYY-MM-DD
  filingStatus?: ClientFilingStatus;
  numDependents?: number;
  occupation?: string;

  // Address
  streetAddress?: string;
  city?: string;
  state?: string;                 // 2-letter state code
  zip?: string;

  // Spouse (if MFJ or MFS)
  spouseFirstName?: string;
  spouseLastName?: string;
  spouseSsnLast4?: string;
  spouseDateOfBirth?: string;     // ISO date string
  spouseOccupation?: string;

  // Engagement
  engagementNotes?: string;       // Internal preparer notes
  referralSource?: string;

  createdAt: string; // ISO string
  updatedAt: string;
}

export type ReturnStatus =
  | 'draft'
  | 'documents_requested'
  | 'questionnaire_sent'
  | 'in_progress'
  | 'under_review'
  | 'complete';

export interface ClientReturn {
  id: string;
  clientId: string;
  taxYear: number;
  status: ReturnStatus;
  workflowState: Record<string, unknown>;
  optimizationQuestions: OptimizationQuestion[];
  optimizationResponses: Record<string, OptimizationResponse>;
  createdAt: string;
  updatedAt: string;
}

// ─── Optimization Interview ────────────────────────────────────────────────────

export type AnswerType = 'yes_no' | 'dollar_amount' | 'percentage' | 'multiple_choice' | 'text';

export type OptimizationCategory =
  | 'self_employment'
  | 'retirement'
  | 'credits'
  | 'itemized_deductions'
  | 'healthcare'
  | 'education'
  | 'energy'
  | 'carryforwards';

export interface OptimizationQuestion {
  id: string;
  category: OptimizationCategory;
  question: string;
  helpText?: string;
  answerType: AnswerType;
  choices?: string[];
  potentialSavingsMin?: number;
  potentialSavingsMax?: number;
  triggeredBy: string[];   // document types / conditions that triggered this
  scheduleCLine?: string;
  formReference?: string;  // e.g., "Form 8829", "Schedule SE"
  priority: number;        // 1 = highest — used for display ordering
}

export interface OptimizationResponse {
  questionId: string;
  answer: string | number | boolean | null;
  answeredAt: string; // ISO string
}

// ─── Portal Tokens ────────────────────────────────────────────────────────────

export type PortalTokenType = 'upload' | 'questionnaire';

export interface PortalToken {
  id: string;
  returnId: string;
  token: string;
  tokenType: PortalTokenType;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

/** Enriched token shape returned by validatePortalToken() for portal pages */
export interface PortalTokenWithReturn extends PortalToken {
  clientFirstName: string;
  clientLastName: string;
  taxYear: number;
  optimizationQuestions?: OptimizationQuestion[];
}

// ─── Optimizer input snapshot ─────────────────────────────────────────────────

export interface BusinessSnapshot {
  name: string;
  grossIncome: number;
  currentDeductions: Array<{ category: string; amount: number }>;
}

export interface OptimizerInput {
  taxYear: number;
  filingStatus?: string;
  totalW2Wages: number;
  total1099Income: number;
  totalScheduleCIncome: number;
  businesses: BusinessSnapshot[];
  hasDependents: boolean;
  hasPriorReturn: boolean;
  documentTypes: string[];
  existingTransactionCategories: string[];
  carryforwardNOL: number;
  carryforwardCapitalLoss: number;
}
