/**
 * DocumentUploadPage.tsx
 *
 * Full-page AI document parsing pipeline.
 * Supports: W-2, Prior Year 1040, Business Income Summary, 1099-NEC/INT/DIV.
 *
 * Flow:
 *   1. Select document type
 *   2. Pick file (PDF or image)
 *   3. Parse via Claude API (with progress)
 *   4. Review extracted fields with confidence badges
 *   5. Confirm year (warn if mismatch)
 *   6. Import → creates Document + Transaction + Reconciliation entries
 */

import { useRef, useState, ChangeEvent } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Eye,
  EyeOff,
  FileSearch,
  BadgeCheck,
  TriangleAlert,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import {
  parseDocument,
  DocKind,
  ParseResult,
  ParsedField,
  CONFIDENCE_THRESHOLD,
  W2ParseResult,
  Prior1040ParseResult,
  BusinessIncomeParseResult,
  Form1099ParseResult,
} from '@/lib/documentParser';
import { mapToWorkflow, MappingOutput } from '@/lib/documentMapper';

// ─── Document type config ─────────────────────────────────────────────────────

type DocConfig = {
  kind: DocKind;
  label: string;
  description: string;
  icon: string;
  creates: string;
};

const DOC_CONFIGS: DocConfig[] = [
  {
    kind: 'w2',
    label: 'W-2',
    description: 'Wage and Tax Statement — all boxes including employer info, employee info, and state fields',
    icon: '📄',
    creates: 'Document entry with all box values',
  },
  {
    kind: 'prior_return',
    label: 'Prior Year 1040',
    description: 'Prior year federal return with schedules — income, deductions, Schedule C, carryforwards',
    icon: '📋',
    creates: 'Document + income reconciliation (if Sched C) + expense transactions',
  },
  {
    kind: 'business_income',
    label: 'Business Income Summary',
    description: 'P&L or income report — business name, total income, categorized expenses',
    icon: '💼',
    creates: 'Document + income reconciliation + expense transactions (requires_decision)',
  },
  {
    kind: '1099',
    label: '1099-NEC / INT / DIV',
    description: 'Any 1099 variant — payer info, recipient info, all box amounts',
    icon: '💰',
    creates: 'Document + income reconciliation entry',
  },
  {
    kind: '1099_b',
    label: '1099-B (Brokerage)',
    description: 'Proceeds from broker/barter exchange — capital gains, cost basis, individual sale lots (Schedule D)',
    icon: '📈',
    creates: 'Document + short-term and long-term capital gain/loss reconciliation + missing-basis alerts',
  },
  {
    kind: '1099_k',
    label: '1099-K (Payment Apps)',
    description: 'Payment card / third-party network transactions — PayPal, Venmo, Cash App, Stripe, Amazon, eBay, Etsy',
    icon: '💳',
    creates: 'Document + gross income reconciliation + reconciliation-required flag (fees and refunds must be deducted)',
  },
  {
    kind: '1099_r',
    label: '1099-R (Retirement)',
    description: 'IRA, pension, or annuity distributions — distribution codes, rollover flags, state withholding',
    icon: '🏦',
    creates: 'Document + retirement distribution reconciliation entry',
  },
];

// ─── Step types ───────────────────────────────────────────────────────────────

type Step =
  | 'select'    // Choose document type
  | 'upload'    // Drop / pick file
  | 'parsing'   // Calling Claude API
  | 'review'    // User reviews extracted data
  | 'confirm'   // Year mismatch confirmation (if needed)
  | 'imported'  // Done
  | 'error';    // Fatal error

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfBadge({ field }: { field: ParsedField }) {
  const pct = Math.round(field.confidence * 100);
  if (field.confidence >= CONFIDENCE_THRESHOLD) {
    return (
      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 shrink-0">
        <BadgeCheck className="w-3 h-3 mr-1" />
        {pct}%
      </Badge>
    );
  }
  if (field.confidence >= 0.5) {
    return (
      <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200 shrink-0">
        <TriangleAlert className="w-3 h-3 mr-1" />
        {pct}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 shrink-0">
      <XCircle className="w-3 h-3 mr-1" />
      {pct}%
    </Badge>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({ label, field }: { label: string; field: ParsedField }) {
  const isEmpty = field.value === null || field.value === '' || field.value === 0;
  return (
    <div
      className={cn(
        'flex items-center justify-between py-2 px-3 rounded-md text-sm gap-3',
        field.flagged && !isEmpty && 'bg-yellow-50 border border-yellow-200',
        isEmpty && 'opacity-50',
      )}
    >
      <span className="text-muted-foreground min-w-[180px] shrink-0">{label}</span>
      <span className={cn('flex-1 font-mono text-xs truncate', isEmpty && 'italic text-muted-foreground')}>
        {isEmpty ? 'null / blank' : String(field.value)}
      </span>
      <ConfBadge field={field} />
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">{children}</CardContent>
    </Card>
  );
}

// ─── W-2 review ───────────────────────────────────────────────────────────────

function W2Review({ r }: { r: W2ParseResult }) {
  return (
    <div className="space-y-4">
      <ReviewSection title="Document Info">
        <FieldRow label="Tax Year" field={r.taxYear} />
      </ReviewSection>
      <ReviewSection title="Employer">
        <FieldRow label="Name" field={r.employerName} />
        <FieldRow label="EIN" field={r.employerEIN} />
        <FieldRow label="Address" field={r.employerAddress} />
      </ReviewSection>
      <ReviewSection title="Employee">
        <FieldRow label="Name" field={r.employeeName} />
        <FieldRow label="SSN (last 4)" field={r.employeeSSNLast4} />
        <FieldRow label="Address" field={r.employeeAddress} />
      </ReviewSection>
      <ReviewSection title="Wage & Tax Boxes">
        <FieldRow label="Box 1 — Wages" field={r.box1_wages} />
        <FieldRow label="Box 2 — Federal Withholding" field={r.box2_federalWithholding} />
        <FieldRow label="Box 3 — SS Wages" field={r.box3_socialSecurityWages} />
        <FieldRow label="Box 4 — SS Tax" field={r.box4_socialSecurityTax} />
        <FieldRow label="Box 5 — Medicare Wages" field={r.box5_medicareWages} />
        <FieldRow label="Box 6 — Medicare Tax" field={r.box6_medicareTax} />
      </ReviewSection>
      <ReviewSection title="Box 12 Codes">
        <FieldRow label="Box 12a Code" field={r.box12a_code} />
        <FieldRow label="Box 12a Amount" field={r.box12a_amount} />
        <FieldRow label="Box 12b Code" field={r.box12b_code} />
        <FieldRow label="Box 12b Amount" field={r.box12b_amount} />
        <FieldRow label="Box 12c Code" field={r.box12c_code} />
        <FieldRow label="Box 12c Amount" field={r.box12c_amount} />
        <FieldRow label="Box 12d Code" field={r.box12d_code} />
        <FieldRow label="Box 12d Amount" field={r.box12d_amount} />
      </ReviewSection>
      <ReviewSection title="Box 13 Checkboxes">
        <FieldRow label="Statutory Employee" field={r.box13_statutoryEmployee} />
        <FieldRow label="Retirement Plan" field={r.box13_retirementPlan} />
        <FieldRow label="Third-Party Sick Pay" field={r.box13_thirdPartySick} />
      </ReviewSection>
      <ReviewSection title="State & Local">
        <FieldRow label="Box 15 — State" field={r.box15_stateCode} />
        <FieldRow label="Box 15 — State EIN" field={r.box15_stateEIN} />
        <FieldRow label="Box 16 — State Wages" field={r.box16_stateWages} />
        <FieldRow label="Box 17 — State Tax" field={r.box17_stateTax} />
        <FieldRow label="Box 18 — Local Wages" field={r.box18_localWages} />
        <FieldRow label="Box 19 — Local Tax" field={r.box19_localTax} />
        <FieldRow label="Box 20 — Locality" field={r.box20_locality} />
      </ReviewSection>
    </div>
  );
}

// ─── Prior 1040 review ────────────────────────────────────────────────────────

function Prior1040Review({ r }: { r: Prior1040ParseResult }) {
  return (
    <div className="space-y-4">
      <ReviewSection title="Document Info">
        <FieldRow label="Tax Year" field={r.taxYear} />
        <FieldRow label="Filer Name" field={r.filerName} />
        <FieldRow label="Filing Status" field={r.filingStatus} />
      </ReviewSection>
      <ReviewSection title="Income Summary">
        <FieldRow label="Total Wages (W-2)" field={r.totalWages} />
        <FieldRow label="Taxable Interest" field={r.taxableInterest} />
        <FieldRow label="Ordinary Dividends" field={r.ordinaryDividends} />
        <FieldRow label="Qualified Dividends" field={r.qualifiedDividends} />
        <FieldRow label="Total Income" field={r.totalIncome} />
        <FieldRow label="AGI" field={r.adjustedGrossIncome} />
        <FieldRow label="Standard/Itemized Deduction" field={r.standardOrItemizedDeduction} />
        <FieldRow label="QBI Deduction (199A)" field={r.qualifiedBusinessDeduction} />
        <FieldRow label="Taxable Income" field={r.taxableIncome} />
        <FieldRow label="Total Tax" field={r.totalTax} />
        <FieldRow label="Total Payments" field={r.totalPayments} />
        <FieldRow label="Refund / (Owed)" field={r.refundOrOwed} />
      </ReviewSection>
      {r.hasScheduleC && (
        <ReviewSection title="Schedule C">
          <FieldRow label="Business Name" field={r.scheduleCBusinessName} />
          <FieldRow label="Gross Receipts" field={r.scheduleCGrossReceipts} />
          <FieldRow label="Total Expenses" field={r.scheduleCTotalExpenses} />
          <FieldRow label="Net Profit" field={r.scheduleCNetProfit} />
          <Separator className="my-2" />
          <FieldRow label="Advertising (L8)" field={r.scheduleC_advertising} />
          <FieldRow label="Car & Truck (L9)" field={r.scheduleC_carTruck} />
          <FieldRow label="Commissions/Fees (L10)" field={r.scheduleC_commissionsFees} />
          <FieldRow label="Contract Labor (L11)" field={r.scheduleC_contractLabor} />
          <FieldRow label="Insurance (L15)" field={r.scheduleC_insurance} />
          <FieldRow label="Legal/Professional (L17)" field={r.scheduleC_legalProfessional} />
          <FieldRow label="Office Expense (L18)" field={r.scheduleC_officeExpense} />
          <FieldRow label="Supplies (L22)" field={r.scheduleC_supplies} />
          <FieldRow label="Travel (L24a)" field={r.scheduleC_travel} />
          <FieldRow label="Meals (L24b)" field={r.scheduleC_meals} />
          <FieldRow label="Utilities (L25)" field={r.scheduleC_utilities} />
          <FieldRow label="Other Expenses (L27a)" field={r.scheduleC_otherExpenses} />
        </ReviewSection>
      )}
      <ReviewSection title="Carryforwards">
        <FieldRow label="NOL Carryforward" field={r.carryforwardNOL} />
        <FieldRow label="Capital Loss Carryforward" field={r.carryforwardCapitalLoss} />
      </ReviewSection>
    </div>
  );
}

// ─── Business income review ───────────────────────────────────────────────────

function BusinessIncomeReview({ r }: { r: BusinessIncomeParseResult }) {
  return (
    <div className="space-y-4">
      <ReviewSection title="Document Info">
        <FieldRow label="Tax Year" field={r.taxYear} />
        <FieldRow label="Business Name" field={r.businessName} />
        <FieldRow label="Total Income" field={r.totalIncome} />
      </ReviewSection>
      <ReviewSection title="Expense Categories">
        <FieldRow label="Mileage / Vehicle" field={r.expense_mileage} />
        <FieldRow label="Travel" field={r.expense_travel} />
        <FieldRow label="Meals" field={r.expense_meals} />
        <FieldRow label="Marketing" field={r.expense_marketing} />
        <FieldRow label="Advertising" field={r.expense_advertising} />
        <FieldRow label="Supplies" field={r.expense_supplies} />
        <FieldRow label="Contract Labor" field={r.expense_contractLabor} />
        <FieldRow label="Commissions & Fees" field={r.expense_commissionsFees} />
        <FieldRow label="Insurance" field={r.expense_insurance} />
        <FieldRow label="Legal & Professional" field={r.expense_legalProfessional} />
        <FieldRow label="Office Expense" field={r.expense_officeExpense} />
        <FieldRow label="Utilities" field={r.expense_utilities} />
        <FieldRow label="Other Expenses" field={r.expense_otherExpenses} />
      </ReviewSection>
    </div>
  );
}

// ─── 1099 review ──────────────────────────────────────────────────────────────

function Form1099Review({ r }: { r: Form1099ParseResult }) {
  const variantLabel = r.variant === '1099_nec' ? '1099-NEC'
    : r.variant === '1099_int' ? '1099-INT'
    : r.variant === '1099_div' ? '1099-DIV'
    : '1099 (Unknown Variant)';

  return (
    <div className="space-y-4">
      <ReviewSection title="Document Info">
        <div className="flex items-center justify-between py-2 px-3 text-sm">
          <span className="text-muted-foreground">Variant</span>
          <Badge variant="secondary">{variantLabel}</Badge>
        </div>
        <FieldRow label="Tax Year" field={r.taxYear} />
      </ReviewSection>
      <ReviewSection title="Payer">
        <FieldRow label="Name" field={r.payerName} />
        <FieldRow label="EIN" field={r.payerEIN} />
        <FieldRow label="Address" field={r.payerAddress} />
      </ReviewSection>
      <ReviewSection title="Recipient">
        <FieldRow label="Name" field={r.recipientName} />
        <FieldRow label="TIN (last 4)" field={r.recipientTINLast4} />
        <FieldRow label="Address" field={r.recipientAddress} />
      </ReviewSection>
      <ReviewSection title="Box Amounts">
        <FieldRow label="Box 1" field={r.box1} />
        <FieldRow label="Box 2" field={r.box2} />
        <FieldRow label="Box 3" field={r.box3} />
        <FieldRow label="Box 4 — Federal Withholding" field={r.box4_federalWithholding} />
        <FieldRow label="Box 5" field={r.box5} />
        <FieldRow label="Box 6" field={r.box6} />
        <FieldRow label="Box 7" field={r.box7} />
      </ReviewSection>
      <ReviewSection title="State">
        <FieldRow label="State Code" field={r.stateCode} />
        <FieldRow label="State Tax Withheld" field={r.stateTaxWithheld} />
        <FieldRow label="State Income" field={r.stateIncome} />
      </ReviewSection>
    </div>
  );
}

// ─── Import summary ───────────────────────────────────────────────────────────

function ImportSummary({ mapping }: { mapping: MappingOutput }) {
  return (
    <Card className="border-green-200 bg-green-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-green-800">
          <CheckCircle className="w-4 h-4" />
          Import Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Document created</span>
          <Badge variant="outline" className="bg-green-100">1</Badge>
        </div>
        {mapping.transactions.length > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Transactions added (requires review)</span>
            <Badge variant="outline" className="bg-yellow-100">{mapping.transactions.length}</Badge>
          </div>
        )}
        {mapping.reconciliations.length > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Income reconciliation entries</span>
            <Badge variant="outline" className="bg-blue-100">{mapping.reconciliations.length}</Badge>
          </div>
        )}
        {mapping.discrepancies.length > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discrepancies flagged</span>
            <Badge variant="outline" className="bg-red-100">{mapping.discrepancies.length}</Badge>
          </div>
        )}
        {mapping.flaggedFields.length > 0 && (
          <Alert className="mt-2">
            <Info className="h-4 w-4" />
            <AlertTitle className="text-xs font-semibold">Manual Review Required</AlertTitle>
            <AlertDescription className="text-xs">
              {mapping.flaggedFields.length} field(s) had confidence below {Math.round(CONFIDENCE_THRESHOLD * 100)}%:{' '}
              {mapping.flaggedFields.slice(0, 6).join(', ')}{mapping.flaggedFields.length > 6 ? '…' : ''}.
              Check the document directly to verify these values.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DocumentUploadPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const { addDocument, addTransaction, addReconciliation, addDiscrepancy } = useWorkflow();

  const [step, setStep] = useState<Step>('select');
  const [selectedKind, setSelectedKind] = useState<DocKind | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [mappingOutput, setMappingOutput] = useState<MappingOutput | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsedS, setElapsedS] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const [yearConfirmed, setYearConfirmed] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const apiKey = (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined) ?? '';

  // ── Handlers ──────────────────────────────────────────────────────────────

  function reset() {
    setStep('select');
    setSelectedKind(null);
    setFile(null);
    setProgress(0);
    setParseResult(null);
    setMappingOutput(null);
    setErrorMsg('');
    setElapsedS(0);
    setShowRaw(false);
    setYearConfirmed(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function selectKind(kind: DocKind) {
    setSelectedKind(kind);
    setStep('upload');
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!apiKey) {
      setErrorMsg('Missing VITE_ANTHROPIC_API_KEY — add it to your .env file.');
      setStep('error');
      return;
    }
    if (!currentYear || !selectedKind) return;

    setFile(f);
    setStep('parsing');

    // Animated progress bar (approximation — real timing varies)
    let p = 0;
    const ticker = setInterval(() => {
      p += Math.random() * 8;
      setProgress(Math.min(p, 90));
    }, 400);

    const t0 = Date.now();
    try {
      const response = await parseDocument(f, selectedKind, apiKey);
      clearInterval(ticker);
      setProgress(100);
      setElapsedS(Number((response.elapsedMs / 1000).toFixed(1)));

      if (!response.success || !response.result) {
        throw new Error(response.error ?? 'Unknown parse error');
      }

      setParseResult(response.result);

      // Build mapping output
      const mapping = mapToWorkflow(response.result, currentYear, f.name);
      setMappingOutput(mapping);

      // If year mismatch, go to confirm step
      if (mapping.yearMismatch) {
        setStep('confirm');
      } else {
        setStep('review');
      }
    } catch (err) {
      clearInterval(ticker);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
    void t0;
  }

  function handleImport() {
    if (!mappingOutput) return;

    addDocument(mappingOutput.document);
    mappingOutput.transactions.forEach(addTransaction);
    mappingOutput.reconciliations.forEach(addReconciliation);
    mappingOutput.discrepancies.forEach(addDiscrepancy);

    const txnCount = mappingOutput.transactions.length;
    const recCount = mappingOutput.reconciliations.length;

    toast.success(
      `Document imported. ${txnCount > 0 ? `${txnCount} expense transaction(s) added for review. ` : ''}${recCount > 0 ? `${recCount} income reconciliation(s) created.` : ''}`.trim()
    );

    setStep('imported');
  }

  function handleConfirmYearMismatch() {
    setYearConfirmed(true);
    if (mappingOutput) {
      mappingOutput.document.yearMismatchConfirmed = true;
      mappingOutput.document.verificationStatus = 'verified';
    }
    setStep('review');
  }

  // ── Guard: year not selected ───────────────────────────────────────────────

  if (!isYearSelected) {
    return (
      <div className="p-6">
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-status-warning mx-auto mb-4" />
            <h3 className="text-lg font-medium">Tax Year Required</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Select a tax year from the Dashboard before parsing documents.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Document Parser</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered extraction for tax year {currentYear}. Every field carries a confidence score.
          </p>
        </div>
        {step !== 'select' && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Parse Another
          </Button>
        )}
      </div>

      {/* API key warning */}
      {!apiKey && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>API Key Missing</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs">VITE_ANTHROPIC_API_KEY</code> in your <code className="font-mono text-xs">.env</code> file to enable AI parsing.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Step: Select document type ── */}
      {step === 'select' && (
        <div className="space-y-4">
          <h2 className="text-base font-medium text-muted-foreground uppercase tracking-wide text-xs">
            Step 1 — Choose Document Type
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DOC_CONFIGS.map((cfg) => (
              <Card
                key={cfg.kind}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md hover:border-accent',
                  !apiKey && 'opacity-50 pointer-events-none',
                )}
                onClick={() => selectKind(cfg.kind)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="text-3xl mt-0.5 shrink-0">{cfg.icon}</div>
                    <div>
                      <p className="font-semibold text-sm">{cfg.label}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{cfg.description}</p>
                      <div className="mt-3 flex items-center gap-1 text-xs text-accent">
                        <FileSearch className="w-3 h-3" />
                        <span>{cfg.creates}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Step: Upload file ── */}
      {step === 'upload' && selectedKind && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Step 2 — Upload File
            </h2>
            <Badge variant="secondary">
              {DOC_CONFIGS.find((c) => c.kind === selectedKind)?.icon}{' '}
              {DOC_CONFIGS.find((c) => c.kind === selectedKind)?.label}
            </Badge>
          </div>

          <Card
            className="border-2 border-dashed border-muted-foreground/30 hover:border-accent/60 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
              <Upload className="w-10 h-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium">Drop PDF or image here, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Supports: PDF, PNG, JPG, WEBP</p>
              </div>
              <Button variant="secondary" size="sm" type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                <Upload className="w-4 h-4 mr-2" />
                Choose File
              </Button>
            </CardContent>
          </Card>

          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              The file is sent to the Claude API for extraction and is not stored anywhere outside this browser session.
              All data flows into the WorkflowContext for tax year {currentYear}.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── Step: Parsing ── */}
      {step === 'parsing' && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-6 text-center">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
            <div>
              <p className="font-medium">Extracting with Claude…</p>
              <p className="text-xs text-muted-foreground mt-1">
                {file?.name} — this typically takes 5–20 seconds
              </p>
            </div>
            <div className="w-full max-w-sm space-y-1">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{Math.round(progress)}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step: Year mismatch confirm ── */}
      {step === 'confirm' && mappingOutput && (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Tax Year Mismatch Detected</AlertTitle>
            <AlertDescription>
              This document appears to be for tax year{' '}
              <strong>{mappingOutput.detectedYear}</strong>, but you are working
              on <strong>{currentYear}</strong>.
              <br />
              <br />
              You may still import this document (e.g., prior year return for carryforward reference),
              but the mismatch will be recorded as a discrepancy.
            </AlertDescription>
          </Alert>
          <div className="flex gap-3">
            <Button variant="destructive" onClick={handleConfirmYearMismatch}>
              <AlertTriangle className="w-4 h-4 mr-2" />
              Confirm — Import Despite Mismatch
            </Button>
            <Button variant="outline" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Review ── */}
      {step === 'review' && parseResult && mappingOutput && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="text-sm">
              {file?.name}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                parseResult.overallConfidence >= CONFIDENCE_THRESHOLD
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-yellow-50 text-yellow-700 border-yellow-200'
              )}
            >
              Overall confidence: {Math.round(parseResult.overallConfidence * 100)}%
            </Badge>
            {elapsedS > 0 && (
              <Badge variant="secondary">{elapsedS}s</Badge>
            )}
            {mappingOutput.requiresManualReview && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                <TriangleAlert className="w-3 h-3 mr-1" />
                Manual review required
              </Badge>
            )}
            {yearConfirmed && (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                Year mismatch confirmed
              </Badge>
            )}
          </div>

          {/* Flagged fields alert */}
          {parseResult.flaggedFields.length > 0 && (
            <Alert>
              <TriangleAlert className="h-4 w-4 text-yellow-600" />
              <AlertTitle>
                {parseResult.flaggedFields.length} field(s) below {Math.round(CONFIDENCE_THRESHOLD * 100)}% confidence
              </AlertTitle>
              <AlertDescription className="text-xs">
                Highlighted rows below need manual verification against the original document.
                Fields show their extracted value but you should confirm accuracy before importing.
              </AlertDescription>
            </Alert>
          )}

          {/* What will be imported */}
          <Card className="bg-secondary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">What will be imported</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>• 1 Document entry (verification status: {mappingOutput.requiresManualReview ? 'pending' : yearConfirmed ? 'mismatch-confirmed' : 'verified'})</p>
              {mappingOutput.transactions.length > 0 && (
                <p>• {mappingOutput.transactions.length} expense transaction(s) added as <strong>requires_decision</strong></p>
              )}
              {mappingOutput.reconciliations.length > 0 && (
                <p>• {mappingOutput.reconciliations.length} income reconciliation entry(ies) — unreconciled</p>
              )}
              {mappingOutput.discrepancies.length > 0 && (
                <p>• {mappingOutput.discrepancies.length} discrepancy(ies) flagged</p>
              )}
            </CardContent>
          </Card>

          {/* Extracted field review */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Extracted Fields — Review Before Importing
            </h3>
            {parseResult.docKind === 'w2' && <W2Review r={parseResult as W2ParseResult} />}
            {parseResult.docKind === 'prior_return' && <Prior1040Review r={parseResult as Prior1040ParseResult} />}
            {parseResult.docKind === 'business_income' && <BusinessIncomeReview r={parseResult as BusinessIncomeParseResult} />}
            {parseResult.docKind === '1099' && <Form1099Review r={parseResult as Form1099ParseResult} />}
          </div>

          {/* Raw response toggle */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
              {showRaw ? 'Hide' : 'Show'} raw Claude response
            </Button>
            {showRaw && (
              <pre className="mt-2 rounded-md bg-slate-950 text-slate-100 p-4 text-xs overflow-auto max-h-80">
                {parseResult.rawResponse}
              </pre>
            )}
          </div>

          {/* Import / Discard */}
          <div className="flex gap-3 pt-2">
            <Button onClick={handleImport}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Import into Workflow
            </Button>
            <Button variant="outline" onClick={reset}>
              <XCircle className="w-4 h-4 mr-2" />
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Imported ── */}
      {step === 'imported' && mappingOutput && (
        <div className="space-y-4">
          <ImportSummary mapping={mappingOutput} />
          <div className="flex gap-3">
            <Button onClick={reset}>
              <Upload className="w-4 h-4 mr-2" />
              Parse Another Document
            </Button>
          </div>
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertTitle>Next Steps</AlertTitle>
            <AlertDescription className="text-sm space-y-1">
              {mappingOutput.transactions.length > 0 && (
                <p>→ Go to <strong>Transactions</strong> to review and classify the imported expense entries.</p>
              )}
              {mappingOutput.reconciliations.length > 0 && (
                <p>→ Go to <strong>Reconciliation</strong> to match income entries against deposits.</p>
              )}
              {mappingOutput.discrepancies.length > 0 && (
                <p>→ Go to <strong>Discrepancies</strong> to resolve flagged issues.</p>
              )}
              {mappingOutput.flaggedFields.length > 0 && (
                <p>→ Review low-confidence fields against the original document before proceeding.</p>
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── Step: Error ── */}
      {step === 'error' && (
        <div className="space-y-4">
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Extraction Failed</AlertTitle>
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={reset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
