import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo, useEffect } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** Non-UUID UI sentinels (e.g. Manual Entry) must not be sent to `source_document_id` (UUID column). */
function reconciliationSourceDocumentIdForDb(sourceDocumentId: string | undefined): string | null {
  if (!sourceDocumentId || sourceDocumentId === 'manual') return null;
  return sourceDocumentId;
}

interface WorkflowContextType {
  workflowState: WorkflowState;
  documents: Document[];
  addDocument: (doc: Document) => void;
  removeDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  blankForms: BlankForm[];
  requiredForms: RequiredForm[];
  addBlankForm: (form: BlankForm) => void;
  transactions: Transaction[];
  addTransaction: (txn: Transaction) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  discrepancies: Discrepancy[];
  addDiscrepancy: (disc: Discrepancy) => void;
  resolveDiscrepancy: (id: string, resolution: Discrepancy['resolution'], resolvedValue?: string) => void;
  incomeReconciliations: IncomeReconciliation[];
  addReconciliation: (rec: IncomeReconciliation) => void;
  updateReconciliation: (id: string, updates: Partial<IncomeReconciliation>) => void;
  evidence: Evidence[];
  addEvidence: (ev: Evidence) => Promise<Evidence | null>;
  invoices: Invoice[];
  addInvoice: (inv: Invoice) => void;
  categories: ExpenseCategory[];
  canGenerateFederalReturn: boolean;
  canGenerateStateReturn: (stateCode: string) => boolean;
  canFinalizeYear: boolean;
  canLockYear: boolean;
  refreshWorkflowState: () => void;
  loading: boolean;
}

const defaultGates: WorkflowGates = {
  taxYearSelected: false, statesConfigured: false, requiredFormsUploaded: false,
  noUnresolvedTransactions: true, noMaterialDiscrepancies: true, incomeReconciled: true,
  evidenceComplete: true, federalValidated: false, federalFinalized: false,
};

const defaultCounts: UnresolvedCounts = {
  missingDocuments: 0, missingBlankForms: 0, unresolvedTransactions: 0,
  unreconciledDeposits: 0, missingEvidence: 0, unresolvedDiscrepancies: 0,
};

const defaultWorkflowState: WorkflowState = {
  federalStatus: 'draft', stateStatuses: {}, gates: defaultGates,
  unresolvedCounts: defaultCounts, blockedReasons: [],
};

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

const defaultCategories: ExpenseCategory[] = [
  { id: 'advertising', name: 'Advertising', scheduleCLine: '8', deductibilityRules: 'Ordinary and necessary advertising and promotional expenses', evidenceExpectations: 'Invoice, receipt, or proof of ad spend', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'car_truck', name: 'Car and Truck Expenses', scheduleCLine: '9', deductibilityRules: 'Business use of vehicle, either actual expenses or standard mileage rate', limitations: 'Must track business vs personal use percentage', evidenceExpectations: 'Mileage log or fuel/maintenance receipts with business purpose', evidenceRequired: true, requiresBusinessPurpose: true },
  { id: 'commissions_fees', name: 'Commissions and Fees', scheduleCLine: '10', deductibilityRules: 'Payments to contractors for sales or services', evidenceExpectations: 'Invoice or 1099-NEC', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'contract_labor', name: 'Contract Labor', scheduleCLine: '11', deductibilityRules: 'Payments for work done by non-employees', evidenceExpectations: 'Contract, invoice, or 1099-NEC', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'insurance', name: 'Insurance (other than health)', scheduleCLine: '15', deductibilityRules: 'Business insurance premiums', evidenceExpectations: 'Insurance policy statement or receipt', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'legal_professional', name: 'Legal and Professional Services', scheduleCLine: '17', deductibilityRules: 'Attorney, accountant, and other professional fees for business', evidenceExpectations: 'Invoice from professional', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'office_expense', name: 'Office Expense', scheduleCLine: '18', deductibilityRules: 'Office supplies and materials', evidenceExpectations: 'Receipt or invoice', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'rent_lease_vehicle', name: 'Rent or Lease - Vehicles, Machinery, Equipment', scheduleCLine: '20a', deductibilityRules: 'Rental or lease payments for business equipment', evidenceExpectations: 'Lease agreement or payment receipt', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'rent_lease_property', name: 'Rent or Lease - Other Business Property', scheduleCLine: '20b', deductibilityRules: 'Rental payments for business property (not home office)', evidenceExpectations: 'Lease agreement or rent receipt', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'supplies', name: 'Supplies', scheduleCLine: '22', deductibilityRules: 'Materials and supplies consumed in business', evidenceExpectations: 'Receipt or invoice', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'travel', name: 'Travel', scheduleCLine: '24a', deductibilityRules: 'Travel expenses for business trips (not meals)', limitations: 'Must be away from tax home overnight', commonFalsePositives: ['Commuting expenses', 'Personal vacation'], evidenceExpectations: 'Receipts with business purpose documented', evidenceRequired: true, requiresBusinessPurpose: true },
  { id: 'meals', name: 'Deductible Meals', scheduleCLine: '24b', deductibilityRules: 'Business meals with clients or during business travel', limitations: '50% deductible (or 100% for restaurant meals in 2021-2022)', commonFalsePositives: ['Personal meals', 'Entertainment'], evidenceExpectations: 'Receipt with date, amount, attendees, business purpose', evidenceRequired: true, requiresBusinessPurpose: true },
  { id: 'utilities', name: 'Utilities', scheduleCLine: '25', deductibilityRules: 'Utilities for business property', evidenceExpectations: 'Utility bill or statement', evidenceRequired: true, requiresBusinessPurpose: false },
  { id: 'other_expenses', name: 'Other Expenses', scheduleCLine: '27a', deductibilityRules: 'Other ordinary and necessary business expenses not listed elsewhere', evidenceExpectations: 'Receipt or invoice with clear business purpose', evidenceRequired: true, requiresBusinessPurpose: true },
];

// Helper: map DB row to Document interface
function mapDbDocument(row: any): Document {
  return {
    id: row.id, type: row.type, fileName: row.file_name,
    uploadedAt: new Date(row.uploaded_at || row.created_at), taxYear: row.tax_year,
    detectedTaxYear: row.detected_tax_year, yearMismatchConfirmed: row.year_mismatch_confirmed,
    sourceReference: row.source_reference || '', verificationStatus: row.verification_status || 'pending',
    verificationErrors: row.verification_errors,
  };
}

function mapDbTransaction(row: any): Transaction {
  return {
    id: row.id, date: new Date(row.date), description: row.description, amount: Number(row.amount),
    source: row.source || '', sourceDocumentId: row.source_document_id, state: row.state,
    categoryId: row.category_id, subcategoryId: row.subcategory_id, scheduleCLine: row.schedule_c_line,
    businessPurpose: row.business_purpose, evidenceStatus: row.evidence_status || 'missing',
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
    confirmedBy: row.confirmed_by, rationale: row.rationale,
    requiresBusinessPurpose: row.requires_business_purpose || false, taxYear: row.tax_year,
  };
}

function mapDbEvidence(row: any): Evidence {
  return {
    id: row.id, transactionId: row.transaction_id, type: row.type,
    fileName: row.file_name, uploadedAt: new Date(row.uploaded_at || row.created_at),
    businessPurposeNote: row.business_purpose_note, taxYear: row.tax_year,
  };
}

function mapDbInvoice(row: any): Invoice {
  return {
    id: row.id, type: row.type, invoiceNumber: row.invoice_number || '',
    createdAt: new Date(row.created_at), linkedDepositId: row.linked_deposit_id,
    linkedTransactionId: row.linked_transaction_id, clientName: row.client_name,
    clientIdentifier: row.client_identifier, platform: row.platform,
    amount: Number(row.amount), description: row.description,
    serviceTimeframe: row.service_timeframe, agreementType: row.agreement_type,
    isPostPayment: row.is_post_payment || false, taxYear: row.tax_year,
  };
}

function mapDbDiscrepancy(row: any): Discrepancy {
  return {
    id: row.id, type: row.type, severity: row.severity, description: row.description,
    source1: row.source1 || '', source1Value: row.source1_value || '',
    source2: row.source2, source2Value: row.source2_value,
    impactedTotals: row.impacted_totals, impactedLines: row.impacted_lines,
    resolution: row.resolution, resolutionAction: row.resolution_action,
    resolvedValue: row.resolved_value,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    taxYear: row.tax_year,
  };
}

function mapDbReconciliation(row: any): IncomeReconciliation {
  return {
    id: row.id, sourceType: row.source_type, sourceDocumentId: row.source_document_id || '',
    sourceDescription: row.source_description || '', grossAmount: Number(row.gross_amount),
    fees: Number(row.fees || 0), refundsChargebacks: Number(row.refunds_chargebacks || 0),
    netAmount: Number(row.net_amount), matchedDepositIds: row.matched_deposit_ids || [],
    matchedTransactionIds: row.matched_transaction_ids || [], isReconciled: row.is_reconciled || false,
    discrepancyAmount: row.discrepancy_amount ? Number(row.discrepancy_amount) : undefined,
    discrepancyNote: row.discrepancy_note, taxYear: row.tax_year,
  };
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const { currentYear, yearConfig, isYearSelected } = useTaxYear();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [blankForms, setBlankForms] = useState<BlankForm[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [incomeReconciliations, setIncomeReconciliations] = useState<IncomeReconciliation[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [categories] = useState<ExpenseCategory[]>(defaultCategories);
  const [loading, setLoading] = useState(false);

  // Load all data from Supabase when year changes
  useEffect(() => {
    if (!currentYear) {
      setDocuments([]); setTransactions([]); setDiscrepancies([]);
      setIncomeReconciliations([]); setEvidence([]); setInvoices([]); setBlankForms([]);
      return;
    }
    loadAllData(currentYear);
  }, [currentYear]);

  const loadAllData = async (year: TaxYear) => {
    setLoading(true);
    try {
      const [docsRes, txnRes, discRes, recRes, evRes, invRes] = await Promise.all([
        supabase.from('documents').select('*').eq('tax_year', year).order('uploaded_at', { ascending: false }),
        supabase.from('transactions').select('*').eq('tax_year', year).order('date', { ascending: false }),
        supabase.from('discrepancies').select('*').eq('tax_year', year),
        supabase.from('income_reconciliations').select('*').eq('tax_year', year),
        supabase.from('evidence').select('*').eq('tax_year', year),
        supabase.from('invoices').select('*').eq('tax_year', year).order('created_at', { ascending: false }),
      ]);

      setDocuments((docsRes.data || []).map(mapDbDocument));
      const evidenceRows = (evRes.data || []).map(mapDbEvidence);
      const evidenceIdsByTxn = new Map<string, string[]>();
      for (const e of evidenceRows) {
        const list = evidenceIdsByTxn.get(e.transactionId) ?? [];
        list.push(e.id);
        evidenceIdsByTxn.set(e.transactionId, list);
      }
      setTransactions(
        (txnRes.data || []).map(mapDbTransaction).map((t) => ({
          ...t,
          evidenceIds: evidenceIdsByTxn.get(t.id) ?? [],
        })),
      );
      setDiscrepancies((discRes.data || []).map(mapDbDiscrepancy));
      setIncomeReconciliations((recRes.data || []).map(mapDbReconciliation));
      setEvidence(evidenceRows);
      setInvoices((invRes.data || []).map(mapDbInvoice));
    } catch (err) {
      console.error('Failed to load workflow data:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Required forms calculation (same logic, derived from loaded data)
  const requiredForms = useMemo((): RequiredForm[] => {
    const forms: RequiredForm[] = [];
    if (!isYearSelected) return forms;

    forms.push({
      formType: '1040', formName: 'Form 1040', jurisdiction: 'federal',
      reason: 'Required for all individual tax returns', isRequired: true,
      isUploaded: blankForms.some(f => f.formType === '1040' && f.verified),
      isVerified: blankForms.some(f => f.formType === '1040' && f.verified),
    });

    const hasBusinessIncome = documents.some(d => d.type === '1099_nec' || d.type === 'payment_processor');
    if (hasBusinessIncome) {
      forms.push({
        formType: 'schedule_c', formName: 'Schedule C', jurisdiction: 'federal',
        reason: 'Required for self-employment income', isRequired: true,
        isUploaded: blankForms.some(f => f.formType === 'schedule_c' && f.verified),
        isVerified: blankForms.some(f => f.formType === 'schedule_c' && f.verified),
      });
      forms.push({
        formType: 'schedule_se', formName: 'Schedule SE', jurisdiction: 'federal',
        reason: 'Required for self-employment tax', isRequired: true,
        isUploaded: blankForms.some(f => f.formType === 'schedule_se' && f.verified),
        isVerified: blankForms.some(f => f.formType === 'schedule_se' && f.verified),
      });
    }

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
        isUploaded: blankForms.some(f => f.formType === 'state_return' && f.jurisdiction === state.stateCode && f.verified),
        isVerified: blankForms.some(f => f.formType === 'state_return' && f.jurisdiction === state.stateCode && f.verified),
      });
    });

    return forms;
  }, [isYearSelected, documents, yearConfig?.states, blankForms]);

  // Workflow state calculation
  const workflowState = useMemo((): WorkflowState => {
    if (!isYearSelected) return defaultWorkflowState;

    const unresolvedTxns = transactions.filter(t => t.state === 'requires_decision');
    const missingEvidenceTxns = transactions.filter(t => t.state === 'deductible' && t.evidenceStatus === 'missing');
    const unresolvedDiscs = discrepancies.filter(d => !d.resolution);
    const materialDiscs = unresolvedDiscs.filter(d => d.severity === 'critical' || d.severity === 'material');
    const unreconciledRecs = incomeReconciliations.filter(r => !r.isReconciled);
    const missingRequiredForms = requiredForms.filter(f => f.isRequired && !f.isVerified);
    const incomeReconciled =
      incomeReconciliations.length > 0 && unreconciledRecs.length === 0;

    const counts: UnresolvedCounts = {
      missingDocuments: 0, missingBlankForms: missingRequiredForms.length,
      unresolvedTransactions: unresolvedTxns.length,
      unreconciledDeposits: incomeReconciliations.length === 0 ? 1 : unreconciledRecs.length,
      missingEvidence: missingEvidenceTxns.length, unresolvedDiscrepancies: unresolvedDiscs.length,
    };

    const gates: WorkflowGates = {
      taxYearSelected: isYearSelected,
      statesConfigured: (yearConfig?.states.length || 0) > 0,
      requiredFormsUploaded: missingRequiredForms.length === 0,
      noUnresolvedTransactions: unresolvedTxns.length === 0,
      noMaterialDiscrepancies: materialDiscs.length === 0,
      incomeReconciled,
      evidenceComplete: missingEvidenceTxns.length === 0,
      federalValidated: false,
      federalFinalized: yearConfig?.status === 'finalized' || yearConfig?.status === 'locked',
    };

    const blockedReasons: string[] = [];
    if (!gates.taxYearSelected) blockedReasons.push('Tax year not selected');
    if (!gates.statesConfigured) blockedReasons.push('No states configured');
    if (!gates.requiredFormsUploaded) blockedReasons.push(`${missingRequiredForms.length} required form(s) not uploaded`);
    if (!gates.noUnresolvedTransactions) blockedReasons.push(`${unresolvedTxns.length} transaction(s) require decision`);
    if (!gates.noMaterialDiscrepancies) blockedReasons.push(`${materialDiscs.length} material discrepancy(ies) unresolved`);
    if (!gates.incomeReconciled) {
      if (incomeReconciliations.length === 0) {
        blockedReasons.push('Add at least one income source in Income Reconciliation');
      } else {
        blockedReasons.push(`${unreconciledRecs.length} income source(s) not reconciled`);
      }
    }
    if (!gates.evidenceComplete) blockedReasons.push(`${missingEvidenceTxns.length} deductible expense(s) missing evidence`);

    let federalStatus: FederalStatus = 'draft';
    if (blockedReasons.length > 0) federalStatus = 'blocked';
    else if (yearConfig?.status === 'locked') federalStatus = 'locked';
    else if (yearConfig?.status === 'finalized') federalStatus = 'finalized';
    else if (gates.requiredFormsUploaded && gates.noUnresolvedTransactions && gates.noMaterialDiscrepancies) federalStatus = 'ready';

    const stateStatuses: Record<string, StateStatus> = {};
    yearConfig?.states.forEach(state => {
      if (!gates.federalFinalized) stateStatuses[state.stateCode] = 'blocked';
      else if (yearConfig?.status === 'locked') stateStatuses[state.stateCode] = 'locked';
      else stateStatuses[state.stateCode] = state.status || 'not_started';
    });

    return { federalStatus, stateStatuses, gates, unresolvedCounts: counts, blockedReasons };
  }, [isYearSelected, yearConfig, transactions, discrepancies, incomeReconciliations, requiredForms]);

  // === CRUD operations that persist to Supabase ===

  const addDocument = useCallback(async (doc: Document) => {
    try {
      const { data, error } = await supabase.from('documents').insert({
        type: doc.type, file_name: doc.fileName, tax_year: doc.taxYear,
        detected_tax_year: doc.detectedTaxYear, year_mismatch_confirmed: doc.yearMismatchConfirmed,
        source_reference: doc.sourceReference, verification_status: doc.verificationStatus,
        verification_errors: doc.verificationErrors,
      }).select().single();
      if (error) throw error;
      setDocuments(prev => [mapDbDocument(data), ...prev]);
    } catch (err: any) {
      console.error('Failed to add document:', err);
      toast.error('Failed to add document');
    }
  }, []);

  const removeDocument = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      console.error('Failed to remove document:', err);
      toast.error('Failed to remove document');
    }
  }, []);

  const updateDocument = useCallback(async (id: string, updates: Partial<Document>) => {
    try {
      const dbUpdates: any = {};
      if (updates.verificationStatus !== undefined) dbUpdates.verification_status = updates.verificationStatus;
      if (updates.verificationErrors !== undefined) dbUpdates.verification_errors = updates.verificationErrors;
      if (updates.yearMismatchConfirmed !== undefined) dbUpdates.year_mismatch_confirmed = updates.yearMismatchConfirmed;
      if (updates.detectedTaxYear !== undefined) dbUpdates.detected_tax_year = updates.detectedTaxYear;

      const { error } = await supabase.from('documents').update(dbUpdates).eq('id', id);
      if (error) throw error;
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    } catch (err: any) {
      console.error('Failed to update document:', err);
      toast.error('Failed to update document');
    }
  }, []);

  const addBlankForm = useCallback((form: BlankForm) => {
    setBlankForms(prev => [...prev, form]);
  }, []);

  const addTransaction = useCallback(async (txn: Transaction) => {
    try {
      const { data, error } = await supabase.from('transactions').insert({
        date: txn.date instanceof Date ? txn.date.toISOString().split('T')[0] : txn.date,
        description: txn.description, amount: txn.amount, source: txn.source,
        source_document_id: txn.sourceDocumentId, state: txn.state,
        category_id: txn.categoryId, subcategory_id: txn.subcategoryId,
        schedule_c_line: txn.scheduleCLine, business_purpose: txn.businessPurpose,
        evidence_status: txn.evidenceStatus, rationale: txn.rationale,
        requires_business_purpose: txn.requiresBusinessPurpose, tax_year: txn.taxYear,
      }).select().single();
      if (error) throw error;
      setTransactions(prev => [mapDbTransaction(data), ...prev]);
    } catch (err: any) {
      console.error('Failed to add transaction:', err);
      toast.error('Failed to add transaction');
    }
  }, []);

  const updateTransaction = useCallback(async (id: string, updates: Partial<Transaction>) => {
    try {
      const dbUpdates: any = {};
      if (updates.state !== undefined) dbUpdates.state = updates.state;
      if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;
      if (updates.subcategoryId !== undefined) dbUpdates.subcategory_id = updates.subcategoryId;
      if (updates.scheduleCLine !== undefined) dbUpdates.schedule_c_line = updates.scheduleCLine;
      if (updates.businessPurpose !== undefined) dbUpdates.business_purpose = updates.businessPurpose;
      if (updates.evidenceStatus !== undefined) dbUpdates.evidence_status = updates.evidenceStatus;
      if (updates.rationale !== undefined) dbUpdates.rationale = updates.rationale;
      if (updates.confirmedAt !== undefined) dbUpdates.confirmed_at = updates.confirmedAt instanceof Date ? updates.confirmedAt.toISOString() : updates.confirmedAt;
      if (updates.confirmedBy !== undefined) dbUpdates.confirmed_by = updates.confirmedBy;

      const { error } = await supabase.from('transactions').update(dbUpdates).eq('id', id);
      if (error) throw error;
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    } catch (err: any) {
      console.error('Failed to update transaction:', err);
      toast.error('Failed to update transaction');
    }
  }, []);

  const addDiscrepancy = useCallback(async (disc: Discrepancy) => {
    try {
      const { data, error } = await supabase.from('discrepancies').insert({
        type: disc.type, severity: disc.severity, description: disc.description,
        source1: disc.source1, source1_value: disc.source1Value,
        source2: disc.source2, source2_value: disc.source2Value,
        impacted_totals: disc.impactedTotals, impacted_lines: disc.impactedLines,
        tax_year: disc.taxYear,
      }).select().single();
      if (error) throw error;
      setDiscrepancies(prev => [...prev, mapDbDiscrepancy(data)]);
    } catch (err: any) {
      console.error('Failed to add discrepancy:', err);
      toast.error('Failed to add discrepancy');
    }
  }, []);

  const resolveDiscrepancy = useCallback(async (id: string, resolution: Discrepancy['resolution'], resolvedValue?: string) => {
    try {
      const { error } = await supabase.from('discrepancies').update({
        resolution, resolved_value: resolvedValue, resolved_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      setDiscrepancies(prev => prev.map(d =>
        d.id === id ? { ...d, resolution, resolvedValue, resolvedAt: new Date() } : d
      ));
    } catch (err: any) {
      console.error('Failed to resolve discrepancy:', err);
      toast.error('Failed to resolve discrepancy');
    }
  }, []);

  const addReconciliation = useCallback(async (rec: IncomeReconciliation) => {
    try {
      const { data, error } = await supabase.from('income_reconciliations').insert({
        source_type: rec.sourceType,
        source_document_id: reconciliationSourceDocumentIdForDb(rec.sourceDocumentId),
        source_description: rec.sourceDescription, gross_amount: rec.grossAmount,
        fees: rec.fees, refunds_chargebacks: rec.refundsChargebacks,
        net_amount: rec.netAmount, matched_deposit_ids: rec.matchedDepositIds,
        matched_transaction_ids: rec.matchedTransactionIds, is_reconciled: rec.isReconciled,
        discrepancy_amount: rec.discrepancyAmount, discrepancy_note: rec.discrepancyNote,
        tax_year: rec.taxYear,
      }).select().single();
      if (error) throw error;
      setIncomeReconciliations(prev => [...prev, mapDbReconciliation(data)]);
    } catch (err: any) {
      console.error('Failed to add reconciliation:', err);
      toast.error('Failed to add reconciliation');
    }
  }, []);

  const updateReconciliation = useCallback(async (id: string, updates: Partial<IncomeReconciliation>) => {
    try {
      const dbUpdates: any = {};
      if (updates.isReconciled !== undefined) dbUpdates.is_reconciled = updates.isReconciled;
      if (updates.discrepancyAmount !== undefined) dbUpdates.discrepancy_amount = updates.discrepancyAmount;
      if (updates.discrepancyNote !== undefined) dbUpdates.discrepancy_note = updates.discrepancyNote;
      if (updates.matchedDepositIds !== undefined) dbUpdates.matched_deposit_ids = updates.matchedDepositIds;
      if (updates.matchedTransactionIds !== undefined) dbUpdates.matched_transaction_ids = updates.matchedTransactionIds;

      const { error } = await supabase.from('income_reconciliations').update(dbUpdates).eq('id', id);
      if (error) throw error;
      setIncomeReconciliations(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    } catch (err: any) {
      console.error('Failed to update reconciliation:', err);
      toast.error('Failed to update reconciliation');
    }
  }, []);

  const addEvidence = useCallback(async (ev: Evidence): Promise<Evidence | null> => {
    try {
      const { data, error } = await supabase.from('evidence').insert({
        transaction_id: ev.transactionId, type: ev.type, file_name: ev.fileName,
        business_purpose_note: ev.businessPurposeNote, tax_year: ev.taxYear,
      }).select().single();
      if (error) throw error;
      const mapped = mapDbEvidence(data);
      setEvidence(prev => [...prev, mapped]);
      setTransactions(prev =>
        prev.map(t =>
          t.id === mapped.transactionId
            ? { ...t, evidenceIds: [...(t.evidenceIds || []), mapped.id] }
            : t,
        ),
      );
      return mapped;
    } catch (err: any) {
      console.error('Failed to add evidence:', err);
      toast.error('Failed to add evidence');
      return null;
    }
  }, []);

  const addInvoice = useCallback(async (inv: Invoice) => {
    try {
      const { data, error } = await supabase.from('invoices').insert({
        type: inv.type, invoice_number: inv.invoiceNumber, client_name: inv.clientName,
        client_identifier: inv.clientIdentifier, platform: inv.platform,
        amount: inv.amount, description: inv.description,
        service_timeframe: inv.serviceTimeframe, agreement_type: inv.agreementType,
        is_post_payment: inv.isPostPayment, tax_year: inv.taxYear,
        linked_deposit_id: inv.linkedDepositId, linked_transaction_id: inv.linkedTransactionId,
      }).select().single();
      if (error) throw error;
      setInvoices(prev => [mapDbInvoice(data), ...prev]);
    } catch (err: any) {
      console.error('Failed to add invoice:', err);
      toast.error('Failed to add invoice');
    }
  }, []);

  // Gate checks
  const canGenerateFederalReturn = useMemo(() => {
    const { gates } = workflowState;
    return gates.taxYearSelected && gates.statesConfigured && gates.requiredFormsUploaded &&
           gates.noUnresolvedTransactions && gates.noMaterialDiscrepancies;
  }, [workflowState]);

  const canGenerateStateReturn = useCallback((stateCode: string) => {
    return workflowState.gates.federalFinalized && workflowState.stateStatuses[stateCode] !== 'blocked';
  }, [workflowState]);

  const canFinalizeYear = useMemo(() => {
    return workflowState.federalStatus === 'ready' || workflowState.federalStatus === 'finalized';
  }, [workflowState]);

  const canLockYear = useMemo(() => {
    return yearConfig?.status === 'finalized';
  }, [yearConfig]);

  const refreshWorkflowState = useCallback(() => {
    if (currentYear) loadAllData(currentYear);
  }, [currentYear]);

  return (
    <WorkflowContext.Provider
      value={{
        workflowState, documents, addDocument, removeDocument, updateDocument,
        blankForms, requiredForms, addBlankForm, transactions, addTransaction, updateTransaction,
        discrepancies, addDiscrepancy, resolveDiscrepancy, incomeReconciliations,
        addReconciliation, updateReconciliation, evidence, addEvidence, invoices, addInvoice,
        categories, canGenerateFederalReturn, canGenerateStateReturn, canFinalizeYear, canLockYear,
        refreshWorkflowState, loading,
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
