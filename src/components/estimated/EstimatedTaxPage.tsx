/**
 * EstimatedTaxPage.tsx
 *
 * Form 1040-ES quarterly estimated tax calculator.
 * Safe harbor computation (IRC §6654) with per-quarter breakdown,
 * voucher summaries, and mailing addresses.
 */

import { useState, useMemo } from 'react';
import {
  Calendar, Calculator, DollarSign, Info, AlertTriangle,
  Check, ChevronDown, ChevronUp, FileText, Printer,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  computeEstimatedTax,
  buildVouchers,
  EstimatedTaxInput,
  EstimatedTaxResult,
  QuarterlyPayment,
} from '@/lib/estimatedTaxEngine';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  '$' + Math.abs(Math.round(n)).toLocaleString('en-US');

function CurrencyInput({
  label, hint, value, onChange,
}: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground/60 mb-1">{hint}</p>}
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          type="number" min={0} step={1}
          value={value === 0 ? '' : String(value)}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className="pl-7 h-8 text-sm"
          placeholder="0"
        />
      </div>
    </div>
  );
}

// ─── Quarter card ─────────────────────────────────────────────────────────────

function QuarterCard({ q, taxYear }: { q: QuarterlyPayment; taxYear: number }) {
  const statusColor =
    q.balanceDue === 0 && q.alreadyPaid >= q.requiredPayment
      ? 'border-status-success/40 bg-status-success/5'
      : q.balanceDue > 0
        ? 'border-status-warning/40 bg-status-warning/5'
        : 'border-border';

  return (
    <Card className={cn('relative', statusColor)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold">{q.label}</span>
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                Due {q.dueDate}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Required: <span className="text-foreground font-mono">{fmt(q.requiredPayment)}</span></div>
              {q.alreadyPaid > 0 && (
                <div>Already paid: <span className="font-mono text-status-success">{fmt(q.alreadyPaid)}</span></div>
              )}
            </div>
          </div>
          <div className="text-right">
            {q.balanceDue === 0 ? (
              <div className="flex items-center gap-1 text-status-success text-sm font-medium">
                <Check className="w-4 h-4" />
                Covered
              </div>
            ) : (
              <div>
                <div className="text-lg font-bold font-mono text-status-warning">
                  {fmt(q.balanceDue)}
                </div>
                <div className="text-xs text-muted-foreground">balance due</div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Safe harbor breakdown card ───────────────────────────────────────────────

function SafeHarborCard({ result }: { result: EstimatedTaxResult }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader
        className="py-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Safe Harbor Computation</CardTitle>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 pb-4">
          <div className="font-mono text-xs space-y-1">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Prior year tax liability</span>
              <span>{fmt(result.safeHarbor_100pct)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Safe harbor A — 100% of prior year</span>
              <span>{fmt(result.safeHarbor_100pct)}</span>
            </div>
            <div className={cn('flex justify-between py-1', result.highIncomeRule ? '' : 'opacity-40')}>
              <span className="text-muted-foreground">
                Safe harbor A (high-income) — 110% of prior year
                {result.highIncomeRule && <span className="ml-1 text-status-warning font-sans">← applies</span>}
              </span>
              <span>{fmt(result.safeHarbor_110pct)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Safe harbor B — 90% of current year projected</span>
              <span>{fmt(result.safeHarbor_90pct_currentYear)}</span>
            </div>
            <Separator />
            <div className="flex justify-between py-1 font-semibold">
              <span>Required annual payment (lesser of A and B)</span>
              <span>{fmt(result.requiredAnnualPayment)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Covered by W-2 withholding</span>
              <span className="text-status-success">-{fmt(result.requiredFromWithholding)}</span>
            </div>
            <Separator />
            <div className="flex justify-between py-1 font-semibold">
              <span>Required from estimated tax payments</span>
              <span>{fmt(result.requiredFromEstimatedPayments)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Per quarter (÷ 4)</span>
              <span>{fmt(Math.ceil(result.requiredFromEstimatedPayments / 4))}</span>
            </div>
          </div>
          <div className="p-2 bg-muted/30 rounded text-xs text-muted-foreground">
            <strong>IRC §6654:</strong> Underpayment penalty is avoided by paying the lesser of (A) 100%/110% of prior year tax or (B) 90% of current year liability in equal quarterly installments.
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const EMPTY_INPUT: Omit<EstimatedTaxInput, 'taxYear'> = {
  projectedAGI: 0,
  projectedTaxableIncome: 0,
  projectedTaxLiability: 0,
  projectedW2Withholding: 0,
  projectedSelfEmploymentIncome: 0,
  priorYearAGI: 0,
  priorYearTaxLiability: 0,
  q1PaidAlready: 0,
  q2PaidAlready: 0,
  q3PaidAlready: 0,
  q4PaidAlready: 0,
};

export function EstimatedTaxPage() {
  const { currentYear, isYearSelected, yearConfig } = useTaxYear();
  const { incomeReconciliations, documents } = useWorkflow();

  // Auto-derive prior year inputs from uploaded prior return
  const autoValues = useMemo(() => {
    const priorReturn = documents.find(d => d.type === 'prior_return' && d.taxYear === currentYear);
    if (!priorReturn) return null;
    const a = priorReturn.parsedData?.amounts ?? {};
    return {
      priorYearAGI: Number(a['adjustedGrossIncome'] ?? 0),
      priorYearTaxLiability: Number(a['totalTax'] ?? 0),
      projectedW2Withholding: Number(a['w2Withholding'] ?? 0),
    };
  }, [documents, currentYear]);

  const [inputs, setInputs] = useState<Omit<EstimatedTaxInput, 'taxYear'>>(EMPTY_INPUT);
  const [result, setResult] = useState<EstimatedTaxResult | null>(null);
  const [residenceState, setResidenceState] = useState(
    yearConfig?.states[0]?.stateCode ?? 'CA'
  );
  const [showVouchers, setShowVouchers] = useState(false);

  const setField = <K extends keyof typeof EMPTY_INPUT>(key: K, val: number) => {
    setInputs(prev => ({ ...prev, [key]: val }));
    setResult(null);
  };

  const handleFillFromPrior = () => {
    if (autoValues) {
      setInputs(prev => ({ ...prev, ...autoValues }));
      setResult(null);
    }
  };

  const handleCompute = () => {
    if (!currentYear) return;
    setResult(computeEstimatedTax({ ...inputs, taxYear: Number(currentYear) }));
  };

  const vouchers = useMemo(() => {
    if (!result) return [];
    return buildVouchers(result, residenceState);
  }, [result, residenceState]);

  if (!isYearSelected) {
    return (
      <div className="p-6">
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-status-warning mx-auto mb-4" />
            <h3 className="text-lg font-medium">Tax Year Required</h3>
            <p className="text-sm text-muted-foreground mt-2">Please select a tax year from the Dashboard first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Estimated Tax Payments</h1>
        <p className="text-muted-foreground mt-1">
          Form 1040-ES safe harbor calculator for tax year {currentYear}
        </p>
      </div>

      {/* Explainer */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Self-employed taxpayers and those with significant non-wage income must pay taxes quarterly to avoid underpayment penalties (IRC §6654). The IRS requires estimated payments if you expect to owe at least $1,000 after withholding. The safe harbor method ensures no penalty regardless of actual liability.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Input form */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Income &amp; Tax Figures</CardTitle>
              <CardDescription>Enter projected current-year amounts and prior-year actuals.</CardDescription>
            </div>
            {autoValues && (
              <Button variant="outline" size="sm" onClick={handleFillFromPrior}>
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Fill from prior return
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Current year */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Current Year Projections ({currentYear})
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <CurrencyInput
                label="Projected AGI"
                hint="Total gross income before deductions"
                value={inputs.projectedAGI}
                onChange={v => setField('projectedAGI', v)}
              />
              <CurrencyInput
                label="Projected Tax Liability"
                hint="Total tax expected (before payments)"
                value={inputs.projectedTaxLiability}
                onChange={v => setField('projectedTaxLiability', v)}
              />
              <CurrencyInput
                label="W-2 Withholding (current year)"
                hint="Federal withholding from all W-2s"
                value={inputs.projectedW2Withholding}
                onChange={v => setField('projectedW2Withholding', v)}
              />
              <CurrencyInput
                label="Net Self-Employment Income"
                hint="Schedule C net profit (for SE tax note)"
                value={inputs.projectedSelfEmploymentIncome}
                onChange={v => setField('projectedSelfEmploymentIncome', v)}
              />
            </div>
          </div>

          <Separator />

          {/* Prior year */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Prior Year Actuals ({Number(currentYear) - 1})
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <CurrencyInput
                label="Prior Year AGI"
                hint="Form 1040 line 11 — determines 100% vs 110% rule"
                value={inputs.priorYearAGI}
                onChange={v => setField('priorYearAGI', v)}
              />
              <CurrencyInput
                label="Prior Year Total Tax"
                hint="Form 1040 line 24 — base for safe harbor A"
                value={inputs.priorYearTaxLiability}
                onChange={v => setField('priorYearTaxLiability', v)}
              />
            </div>
          </div>

          <Separator />

          {/* Payments already made */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Estimated Payments Already Made This Year
            </h4>
            <div className="grid grid-cols-4 gap-3">
              {([1, 2, 3, 4] as const).map(q => (
                <CurrencyInput
                  key={q}
                  label={`Q${q} Paid`}
                  value={inputs[`q${q}PaidAlready` as keyof typeof EMPTY_INPUT] as number}
                  onChange={v => setField(`q${q}PaidAlready` as keyof typeof EMPTY_INPUT, v)}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={handleCompute} size="sm">
              <Calculator className="w-4 h-4 mr-2" />
              Calculate Estimated Payments
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Summary banner */}
          <Card className={cn(
            'border-2',
            result.requiredFromEstimatedPayments === 0
              ? 'border-status-success/40 bg-status-success/5'
              : 'border-primary/30 bg-primary/5'
          )}>
            <CardContent className="py-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Required Annual ES Payment</p>
                  <p className="text-xl font-bold font-mono mt-1">{fmt(result.requiredFromEstimatedPayments)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">safe harbor minimum</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Per Quarter</p>
                  <p className="text-xl font-bold font-mono mt-1">
                    {fmt(Math.ceil(result.requiredFromEstimatedPayments / 4))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">equal installments</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Projected Year-End</p>
                  <p className={cn(
                    'text-xl font-bold font-mono mt-1',
                    result.projectedRefundOrOwed >= 0 ? 'text-status-success' : 'text-status-error'
                  )}>
                    {result.projectedRefundOrOwed >= 0 ? '+' : '-'}{fmt(result.projectedRefundOrOwed)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {result.projectedRefundOrOwed >= 0 ? 'refund' : 'owe'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quarter cards */}
          <div>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Quarterly Payment Schedule
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {result.quarters.map(q => (
                <QuarterCard key={q.quarter} q={q} taxYear={result.taxYear} />
              ))}
            </div>
          </div>

          {/* Safe harbor breakdown */}
          <SafeHarborCard result={result} />

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-2">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm p-3 rounded border border-status-warning/30 bg-status-warning/5">
                  <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {result.notes.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {result.notes.map((n, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                    <span>{n}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Vouchers */}
          {vouchers.length > 0 && (
            <Card>
              <CardHeader
                className="py-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg"
                onClick={() => setShowVouchers(v => !v)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    Mailing Vouchers ({vouchers.length} remaining)
                  </CardTitle>
                  {showVouchers ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </CardHeader>
              {showVouchers && (
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 mb-2">
                    <Label className="text-xs">Residence State for mailing address:</Label>
                    <Input
                      className="h-7 w-16 text-xs"
                      maxLength={2}
                      value={residenceState}
                      onChange={e => setResidenceState(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {vouchers.map(v => (
                      <div
                        key={v.quarter}
                        className="p-4 border rounded font-mono text-xs space-y-1 bg-muted/20"
                      >
                        <div className="font-semibold text-sm not-font-mono">{v.note}</div>
                        <div className="text-muted-foreground">Due: {v.dueDate}</div>
                        <div className="text-lg font-bold">{fmt(v.amount)}</div>
                        <Separator className="my-2" />
                        <div className="whitespace-pre-line text-muted-foreground">{v.mailingAddress}</div>
                        <p className="text-xs text-muted-foreground mt-2 not-font-mono">
                          Make check payable to "United States Treasury". Include SSN and "2025 Form 1040-ES" on the check.
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </>
      )}

      {!result && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <DollarSign className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Enter the income figures above and click <strong>Calculate Estimated Payments</strong>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
