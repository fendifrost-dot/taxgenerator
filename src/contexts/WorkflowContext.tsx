import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo } from 'react';
import { 
  WorkflowState, 
  WorkflowGates, 
  UnresolvedCounts, 
  FederalStatus, 
  StateStatus,
  Document,
  Transaction,
  Discrepancy,
  BlankForm,
  RequiredForm,
  IncomeReconciliation,
  Evidence,
  Invoice,
  ExpenseCategory,
  TaxYear
} from '@/types/tax';
import { useTaxYear } from './TaxYearContext';
import { passesFederalAndFinalizationGates } from '@/lib/workflowGates';
import { saveToStorage, loadFromStorage, STORAGE_KEYS } from '@/lib/persistence';

interface PersistedWorkflowData {
  documents: Document[];
  blankForms: BlankForm[];
  transactions: Transaction[];
  discrepancies: Discrepancy[];
  incomeReconciliations: IncomeReconciliation[];
  evidence: Evidence[];
  invoices: Invoice[];
  customCategories: ExpenseCategory[];
}

interface WorkflowContextType {
  // Core workflow state
  workflowState: WorkflowState;
  
  // Documents
  documents: Document[];
  addDocument: (doc: Document) => void;
  removeDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  
  // Blank forms
  blankForms: BlankForm[];
  requiredForms: RequiredForm[];
  addBlankForm: (form: BlankForm) => void;
  
  // Transactions
  transactions: Transaction[];
  addTransaction: (txn: Transaction) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  
  // Discrepancies
  discrepancies: Discrepancy[];
  addDiscrepancy: (disc: Discrepancy) => void;
  resolveDiscrepancy: (id: string, resolution: Discrepancy['resolution'], resolvedValue?: string) => void;
  
  // Income reconciliation
  incomeReconciliations: IncomeReconciliation[];
  addReconciliation: (rec: IncomeReconciliation) => void;
  updateReconciliation: (id: string, updates: Partial<IncomeReconciliation>) => void;
  
  // Evidence
  evidence: Evidence[];
  addEvidence: (ev: Evidence) => void;
  
  // Invoices
  invoices: Invoice[];
  addInvoice: (inv: Invoice) => void;
  
  // Categories (default + user-defined)
  categories: ExpenseCategory[];
  addCustomCategory: (category: ExpenseCategory) => void;
  
  // Gate checks
  canGenerateFederalReturn: boolean;
  canGenerateStateReturn: (stateCode: string) => boolean;
  canFinalizeYear: boolean;
  canLockYear: boolean;
  
  // Actions
  refreshWorkflowState: () => void;
}

const defaultGates: WorkflowGates = {
  taxYearSelected: false,
  statesConfigured: false,
  requiredFormsUploaded: false,
  noUnresolvedTransactions: true,
  noMaterialDiscrepancies: true,
  incomeReconciled: true,
  evidenceComplete: true,
  federalValidated: false,
  federalFinalized: false,
};

const defaultCounts: UnresolvedCounts = {
  missingDocuments: 0,
  missingBlankForms: 0,
  unresolvedTransactions: 0,
  unreconciledDeposits: 0,
  missingEvidence: 0,
  unresolvedDiscrepancies: 0,
};

const defaultWorkflowState: WorkflowState = {
  federalStatus: 'draft',
  stateStatuses: {},
  gates: defaultGates,
  unresolvedCounts: defaultCounts,
  blockedReasons: [],
};

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

// Default expense categories mapped to Schedule C
const defaultCategories: ExpenseCategory[] = [
  {
    id: 'advertising',
    name: 'Advertising',
    scheduleCLine: '8',
    deductibilityRules: 'Ordinary and necessary advertising and promotional expenses',
    evidenceExpectations: 'Invoice, receipt, or proof of ad spend',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'car_truck',
    name: 'Car and Truck Expenses',
    scheduleCLine: '9',
    deductibilityRules: 'Business use of vehicle, either actual expenses or standard mileage rate',
    limitations: 'Must track business vs personal use percentage',
    evidenceExpectations: 'Mileage log or fuel/maintenance receipts with business purpose',
    evidenceRequired: true,
    requiresBusinessPurpose: true,
  },
  {
    id: 'commissions_fees',
    name: 'Commissions and Fees',
    scheduleCLine: '10',
    deductibilityRules: 'Payments to contractors for sales or services',
    evidenceExpectations: 'Invoice or 1099-NEC',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'contract_labor',
    name: 'Contract Labor',
    scheduleCLine: '11',
    deductibilityRules: 'Payments for work done by non-employees',
    evidenceExpectations: 'Contract, invoice, or 1099-NEC',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'insurance',
    name: 'Insurance (other than health)',
    scheduleCLine: '15',
    deductibilityRules: 'Business insurance premiums',
    evidenceExpectations: 'Insurance policy statement or receipt',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'legal_professional',
    name: 'Legal and Professional Services',
    scheduleCLine: '17',
    deductibilityRules: 'Attorney, accountant, and other professional fees for business',
    evidenceExpectations: 'Invoice from professional',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'office_expense',
    name: 'Office Expense',
    scheduleCLine: '18',
    deductibilityRules: 'Office supplies and materials',
    evidenceExpectations: 'Receipt or invoice',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'rent_lease_vehicle',
    name: 'Rent or Lease - Vehicles, Machinery, Equipment',
    scheduleCLine: '20a',
    deductibilityRules: 'Rental or lease payments for business equipment',
    evidenceExpectations: 'Lease agreement or payment receipt',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'rent_lease_property',
    name: 'Rent or Lease - Other Business Property',
    scheduleCLine: '20b',
    deductibilityRules: 'Rental payments for business property (not home office)',
    evidenceExpectations: 'Lease agreement or rent receipt',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'supplies',
    name: 'Supplies',
    scheduleCLine: '22',
    deductibilityRules: 'Materials and supplies consumed in business',
    evidenceExpectations: 'Receipt or invoice',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'travel',
    name: 'Travel',
    scheduleCLine: '24a',
    deductibilityRules: 'Travel expenses for business trips (not meals)',
    limitations: 'Must be away from tax home overnight',
    commonFalsePositives: ['Commuting expenses', 'Personal vacation'],
    evidenceExpectations: 'Receipts with business purpose documented',
    evidenceRequired: true,
    requiresBusinessPurpose: true,
  },
  {
    id: 'meals',
    name: 'Deductible Meals',
    scheduleCLine: '24b',
    deductibilityRules: 'Business meals with clients or during business travel',
    limitations: '50% deductible (or 100% for restaurant meals in 2021-2022)',
    commonFalsePositives: ['Personal meals', 'Entertainment'],
    evidenceExpectations: 'Receipt with date, amount, attendees, business purpose',
    evidenceRequired: true,
    requiresBusinessPurpose: true,
  },
  {
    id: 'utilities',
    name: 'Utilities',
    scheduleCLine: '25',
    deductibilityRules: 'Utilities for business property',
    evidenceExpectations: 'Utility bill or statement',
    evidenceRequired: true,
    requiresBusinessPurpose: false,
  },
  {
    id: 'other_expenses',
    name: 'Other Expenses',
    scheduleCLine: '27a',
    deductibilityRules: 'Other ordinary and necessary business expenses not listed elsewhere',
    evidenceExpectations: 'Receipt or invoice with clear business purpose',
    evidenceRequired: true,
    requiresBusinessPurpose: true,
  },
];

// Income doc types that auto-create reconciliation entries when uploaded via Document Parser.
// Bank statements are intentionally excluded — they are optional supporting evidence,
// not a hard requirement. A return can be generated from source documents alone.
const INCOME_DOC_TYPES_REQUIRING_RECONCILIATION: Document['type'][] = [
  '1099_nec',
  '1099_int',
  '1099_div',
  'payment_processor',
];

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const { currentYear, yearConfig, isYearSelected } = useTaxYear();

  // ── Rehydrate from localStorage on first render ──────────────────────────
  const persisted = loadFromStorage<PersistedWorkflowData>(STORAGE_KEYS.WORKFLOW);

  const [documents, setDocuments] = useState<Document[]>(persisted?.documents ?? []);
  const [blankForms, setBlankForms] = useState<BlankForm[]>(persisted?.blankForms ?? []);
  const [transactions, setTransactions] = useState<Transaction[]>(persisted?.transactions ?? []);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>(persisted?.discrepancies ?? []);
  const [incomeReconciliations, setIncomeReconciliations] = useState<IncomeReconciliation[]>(persisted?.incomeReconciliations ?? []);
  const [evidence, setEvidence] = useState<Evidence[]>(persisted?.evidence ?? []);
  const [invoices, setInvoices] = useState<Invoice[]>(persisted?.invoices ?? []);
  const [customCategories, setCustomCategories] = useState<ExpenseCategory[]>(persisted?.customCategories ?? []);
  const categories = useMemo(
    () => [...defaultCategories, ...customCategories],
    [customCategories]
  );

  const addCustomCategory = useCallback((category: ExpenseCategory) => {
    setCustomCategories(prev => [...prev, category]);
  }, []);

  // ── Persist workflow data whenever any array changes ─────────────────────
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.WORKFLOW, {
      documents,
      blankForms,
      transactions,
      discrepancies,
      incomeReconciliations,
      evidence,
      invoices,
      customCategories,
    });
  }, [documents, blankForms, transactions, discrepancies, incomeReconciliations, evidence, invoices, customCategories]);

  // Calculate required forms based on documents, transactions, and states
  const requiredForms = useMemo((): RequiredForm[] => {
    const forms: RequiredForm[] = [];
    
    if (!isYearSelected || currentYear == null) return forms;

    const yearDocs = documents.filter(d => d.taxYear === currentYear);
    const yearTx = transactions.filter(t => t.taxYear === currentYear);
    
    // Always need 1040
    forms.push({
      formType: '1040',
      formName: 'Form 1040',
      jurisdiction: 'federal',
      reason: 'Required for all individual tax returns',
      isRequired: true,
      isUploaded: blankForms.some(f => f.formType === '1040' && f.verified),
      isVerified: blankForms.some(f => f.formType === '1040' && f.verified),
    });
    
    // Schedule C / SE when business income docs exist OR deductible business expenses exist
    const hasBusinessIncomeDocs = yearDocs.some(d =>
      d.type === '1099_nec' || d.type === 'payment_processor'
    );
    const hasScheduleCExpenses = yearTx.some(
      t => t.state === 'deductible' && Boolean(t.categoryId)
    );
    const hasBusinessIncome = hasBusinessIncomeDocs || hasScheduleCExpenses;

    // 1099-K triggers Schedule C (gig/payment platform income) when present
    const has1099K = yearDocs.some(d => d.type === '1099_k');

    if (hasBusinessIncome || has1099K) {
      forms.push({
        formType: 'schedule_c',
        formName: 'Schedule C',
        jurisdiction: 'federal',
        reason: has1099K && !hasBusinessIncome
          ? 'Required: 1099-K payment receipts must be reported on Schedule C'
          : 'Required for self-employment income',
        isRequired: true,
        isUploaded: blankForms.some(f => f.formType === 'schedule_c' && f.verified),
        isVerified: blankForms.some(f => f.formType === 'schedule_c' && f.verified),
      });

      forms.push({
        formType: 'schedule_se',
        formName: 'Schedule SE',
        jurisdiction: 'federal',
        reason: 'Required for self-employment tax',
        isRequired: true,
        isUploaded: blankForms.some(f => f.formType === 'schedule_se' && f.verified),
        isVerified: blankForms.some(f => f.formType === 'schedule_se' && f.verified),
      });
    }

    // Schedule D / Form 8949 when 1099-B brokerage documents exist
    const has1099B = yearDocs.some(d => d.type === '1099_b');
    if (has1099B) {
      forms.push({
        formType: 'schedule_d',
        formName: 'Schedule D + Form 8949',
        jurisdiction: 'federal',
        reason: 'Required: 1099-B brokerage transactions must be reported on Schedule D',
        isRequired: true,
        isUploaded: blankForms.some(f => f.formType === 'schedule_d' && f.verified),
        isVerified: blankForms.some(f => f.formType === 'schedule_d' && f.verified),
      });
    }
    
    // State returns
    yearConfig?.states.forEach(state => {
      forms.push({
        formType: 'state_return',
        formName: `${state.stateName} Income Tax Return`,
        jurisdiction: state.stateCode,
        residencyVersion: state.residencyStatus === 'full_year' ? 'resident' : 
                         state.residencyStatus === 'part_year' ? 'part_year' : 'nonresident',
        reason: `${state.residencyStatus === 'full_year' ? 'Full-year' : 
                 state.residencyStatus === 'part_year' ? 'Part-year' : 'Nonresident'} of ${state.stateName}`,
        isRequired: true,
        isUploaded: blankForms.some(f => 
          f.formType === 'state_return' && 
          f.jurisdiction === state.stateCode && 
          f.verified
        ),
        isVerified: blankForms.some(f => 
          f.formType === 'state_return' && 
          f.jurisdiction === state.stateCode && 
          f.verified
        ),
      });
    });
    
    return forms;
  }, [isYearSelected, currentYear, documents, transactions, yearConfig?.states, blankForms]);

  // Calculate workflow state based on all data (scoped to selected tax year)
  const workflowState = useMemo((): WorkflowState => {
    if (!isYearSelected || currentYear == null) {
      return defaultWorkflowState;
    }

    const yTx = transactions.filter(t => t.taxYear === currentYear);
    const yDisc = discrepancies.filter(d => d.taxYear === currentYear);
    const yRec = incomeReconciliations.filter(r => r.taxYear === currentYear);
    const yDocs = documents.filter(d => d.taxYear === currentYear);

    const unresolvedTxns = yTx.filter(t => t.state === 'requires_decision');
    const missingEvidenceTxns = yTx.filter(t => 
      t.state === 'deductible' && t.evidenceStatus === 'missing'
    );
    const unresolvedDiscs = yDisc.filter(d => !d.resolution);
    const materialDiscs = unresolvedDiscs.filter(d => d.severity === 'critical' || d.severity === 'material');
    const unreconciledRecs = yRec.filter(r => !r.isReconciled);

    // Bank statements are optional. Income reconciliation only blocks when there are
    // explicit reconciliation entries that haven't been resolved yet — either by
    // bank deposit matching OR by "Accept Without Bank Statement".
    // If no reconciliation entries exist at all (no income docs uploaded, or income
    // captured purely via transactions), the gate passes.
    const incomeReconciled = unreconciledRecs.length === 0;

    const missingRequiredForms = requiredForms.filter(f => f.isRequired && !f.isVerified);
    
    const counts: UnresolvedCounts = {
      missingDocuments: 0, // Would be calculated based on expected vs actual
      missingBlankForms: missingRequiredForms.length,
      unresolvedTransactions: unresolvedTxns.length,
      unreconciledDeposits: unreconciledRecs.length,
      missingEvidence: missingEvidenceTxns.length,
      unresolvedDiscrepancies: unresolvedDiscs.length,
    };
    
    const gates: WorkflowGates = {
      taxYearSelected: isYearSelected,
      statesConfigured: (yearConfig?.states.length || 0) > 0,
      requiredFormsUploaded: missingRequiredForms.length === 0,
      noUnresolvedTransactions: unresolvedTxns.length === 0,
      noMaterialDiscrepancies: materialDiscs.length === 0,
      incomeReconciled,
      evidenceComplete: missingEvidenceTxns.length === 0,
      federalValidated: false, // Set when automated validation pipeline exists
      federalFinalized: yearConfig?.status === 'finalized' || yearConfig?.status === 'locked',
    };
    
    const blockedReasons: string[] = [];
    if (!gates.taxYearSelected) blockedReasons.push('Tax year not selected');
    if (!gates.statesConfigured) blockedReasons.push('No states configured');
    if (!gates.requiredFormsUploaded) blockedReasons.push(`${missingRequiredForms.length} required form(s) not uploaded`);
    if (!gates.noUnresolvedTransactions) blockedReasons.push(`${unresolvedTxns.length} transaction(s) require decision`);
    if (!gates.noMaterialDiscrepancies) blockedReasons.push(`${materialDiscs.length} material discrepancy(ies) unresolved`);
    if (!gates.incomeReconciled) {
      blockedReasons.push(
        `${unreconciledRecs.length} income source(s) not reconciled — match to bank deposits or accept as stated`
      );
    }
    if (!gates.evidenceComplete) blockedReasons.push(`${missingEvidenceTxns.length} deductible expense(s) missing evidence`);
    
    // Determine federal status
    let federalStatus: FederalStatus = 'draft';
    if (blockedReasons.length > 0) {
      federalStatus = 'blocked';
    } else if (yearConfig?.status === 'locked') {
      federalStatus = 'locked';
    } else if (yearConfig?.status === 'finalized') {
      federalStatus = 'finalized';
    } else if (gates.requiredFormsUploaded && gates.noUnresolvedTransactions && gates.noMaterialDiscrepancies) {
      federalStatus = 'ready';
    }
    
    // Determine state statuses
    const stateStatuses: Record<string, StateStatus> = {};
    yearConfig?.states.forEach(state => {
      if (!gates.federalFinalized) {
        stateStatuses[state.stateCode] = 'blocked';
      } else if (yearConfig?.status === 'locked') {
        stateStatuses[state.stateCode] = 'locked';
      } else {
        stateStatuses[state.stateCode] = state.status || 'not_started';
      }
    });
    
    return {
      federalStatus,
      stateStatuses,
      gates,
      unresolvedCounts: counts,
      blockedReasons,
    };
  }, [isYearSelected, currentYear, yearConfig, transactions, discrepancies, incomeReconciliations, documents, requiredForms]);

  const assertYearMatch = useCallback(
    (taxYear: TaxYear) => currentYear != null && taxYear === currentYear,
    [currentYear]
  );

  // Document operations
  const addDocument = useCallback((doc: Document) => {
    if (!assertYearMatch(doc.taxYear)) return;
    setDocuments(prev => [...prev, doc]);
  }, [assertYearMatch]);
  
  const removeDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);
  
  const updateDocument = useCallback((id: string, updates: Partial<Document>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  // Blank form operations
  const addBlankForm = useCallback((form: BlankForm) => {
    if (!assertYearMatch(form.taxYear)) return;
    setBlankForms(prev => [...prev, form]);
  }, [assertYearMatch]);

  // Transaction operations
  const addTransaction = useCallback((txn: Transaction) => {
    if (!assertYearMatch(txn.taxYear)) return;
    setTransactions(prev => [...prev, txn]);
  }, [assertYearMatch]);
  
  const updateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  // Discrepancy operations
  const addDiscrepancy = useCallback((disc: Discrepancy) => {
    if (!assertYearMatch(disc.taxYear)) return;
    setDiscrepancies(prev => [...prev, disc]);
  }, [assertYearMatch]);
  
  const resolveDiscrepancy = useCallback((
    id: string, 
    resolution: Discrepancy['resolution'], 
    resolvedValue?: string
  ) => {
    setDiscrepancies(prev => prev.map(d => 
      d.id === id 
        ? { ...d, resolution, resolvedValue, resolvedAt: new Date() } 
        : d
    ));
  }, []);

  // Income reconciliation operations
  const addReconciliation = useCallback((rec: IncomeReconciliation) => {
    if (!assertYearMatch(rec.taxYear)) return;
    setIncomeReconciliations(prev => [...prev, rec]);
  }, [assertYearMatch]);
  
  const updateReconciliation = useCallback((id: string, updates: Partial<IncomeReconciliation>) => {
    setIncomeReconciliations(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  // Evidence operations
  const addEvidence = useCallback((ev: Evidence) => {
    if (!assertYearMatch(ev.taxYear)) return;
    setEvidence(prev => [...prev, ev]);
  }, [assertYearMatch]);

  // Invoice operations
  const addInvoice = useCallback((inv: Invoice) => {
    if (!assertYearMatch(inv.taxYear)) return;
    if (inv.type === 'memorialized') {
      const hasDepositLink = Boolean(inv.linkedDepositId?.trim() || inv.linkedTransactionId?.trim());
      if (!hasDepositLink || !inv.isPostPayment || !inv.disclosureText?.trim()) return;
    }
    setInvoices(prev => [...prev, inv]);
  }, [assertYearMatch]);

  // Gate checks
  const canGenerateFederalReturn = useMemo(() => {
    return passesFederalAndFinalizationGates(workflowState.gates);
  }, [workflowState.gates]);

  const canGenerateStateReturn = useCallback((stateCode: string) => {
    return workflowState.gates.federalFinalized && 
           workflowState.stateStatuses[stateCode] !== 'blocked';
  }, [workflowState]);

  const canFinalizeYear = useMemo(() => {
    return passesFederalAndFinalizationGates(workflowState.gates);
  }, [workflowState.gates]);

  const canLockYear = useMemo(() => {
    return yearConfig?.status === 'finalized';
  }, [yearConfig]);

  const refreshWorkflowState = useCallback(() => {
    // Force recalculation by triggering a state update
    // In a real implementation, this might fetch fresh data
  }, []);

  return (
    <WorkflowContext.Provider
      value={{
        workflowState,
        documents,
        addDocument,
        removeDocument,
        updateDocument,
        blankForms,
        requiredForms,
        addBlankForm,
        transactions,
        addTransaction,
        updateTransaction,
        discrepancies,
        addDiscrepancy,
        resolveDiscrepancy,
        incomeReconciliations,
        addReconciliation,
        updateReconciliation,
        evidence,
        addEvidence,
        invoices,
        addInvoice,
        categories,
        addCustomCategory,
        canGenerateFederalReturn,
        canGenerateStateReturn,
        canFinalizeYear,
        canLockYear,
        refreshWorkflowState,
      }}
    >
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (context === undefined) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
}
