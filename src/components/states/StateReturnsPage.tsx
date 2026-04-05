import { useState, useMemo } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Building2,
  Check,
  XCircle,
  Lock,
  Calculator,
  ChevronDown,
  ChevronUp,
  Info,
  DollarSign,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  computeStateReturn,
  StateReturnResult,
  FilingStatusKey,
} from '@/lib/stateReturnRules';
import { StateConfig } from '@/types/tax';

// ─── Federal income inputs (derived + overridable) ───────────────────────────

interface FederalInputs {
  federalAGI: number;
  federalTaxableIncome: number;
  w2Wages: number;
  selfEmploymentIncome: number;
  k1Income: number;
  capitalGains: number;
  interestAndDividends: number;
  retirementIncome: number;
  filingStatus: FilingStatusKey;
  numDependents: number;
}

function fmt(n: number): string {
  if (n === 0) return '—';
  return n < 0
    ? `(${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(n: number): string {
  return (n * 100).toFixed(2) + '%';
}

// ─── State result panel ───────────────────────────────────────────────────────

function StateResultPanel({
  state,
  result,
  stateWithholding,
}: {
  state: StateConfig;
  result: StateReturnResult;
  stateWithholding: number;
}) {
  const [expanded, setExpanded] = useState(true);

  const refundOrOwed = stateWithholding - result.estimatedStateTax;
  const isNoTaxState = result.stateTaxBeforeCredits === 0 && result.estimatedStateTax === 0 && result.stateTaxableIncome === 0;

  return (
    <Card className="border-border">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary rounded-md flex items-center justify-center font-mono font-semibold text-sm">
              {state.stateCode}
            </div>
            <div>
              <CardTitle className="text-base">{result.stateName}</CardTitle>
              <CardDescription className="text-xs capitalize">
                {state.residencyStatus.replace('_', ' ')} • {state.stateCode}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isNoTaxState ? (
              <Badge variant="outline" className="text-status-success border-status-success text-xs">
                No Income Tax
              </Badge>
            ) : (
              <div className="text-right">
                <div className={cn(
                  'text-sm font-semibold',
                  result.estimatedStateTax > 0 ? 'text-status-error' : 'text-status-success'
                )}>
                  Tax: ${result.estimatedStateTax.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                </div>
                {stateWithholding > 0 && (
                  <div className={cn(
                    'text-xs',
                    refundOrOwed >= 0 ? 'text-status-success' : 'text-status-error'
                  )}>
                    {refundOrOwed >= 0 ? `Refund: $${refundOrOwed.toFixed(0)}` : `Owe: $${Math.abs(refundOrOwed).toFixed(0)}`}
                  </div>
                )}
              </div>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {isNoTaxState ? (
            <div className="p-3 bg-status-success/5 rounded border border-status-success/20">
              <p className="text-sm text-status-success font-medium">No state income tax return required.</p>
              {result.notes.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{result.notes[0]}</p>
              )}
            </div>
          ) : (
            <>
              {/* Federal → State Reconciliation Schedule */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Federal → State Reconciliation
                </h4>
                <div className="space-y-1 font-mono text-xs">
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Federal AGI (starting point)</span>
                    <span>${result.federalAGI.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">State Additions</span>
                    <span className={result.stateAdditions > 0 ? 'text-status-error' : ''}>
                      +{fmt(result.stateAdditions)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">State Subtractions</span>
                    <span className={result.stateSubtractions > 0 ? 'text-status-success' : ''}>
                      -{fmt(result.stateSubtractions)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between py-1 font-semibold">
                    <span>State AGI</span>
                    <span>${result.stateAGI.toLocaleString('en-US', { minimumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">State Standard Deduction / Exemptions</span>
                    <span>-${result.stateDeduction.toLocaleString()}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between py-1 font-semibold">
                    <span>State Taxable Income</span>
                    <span>${result.stateTaxableIncome.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Tax Computation */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Tax Computation
                </h4>
                <div className="space-y-1 font-mono text-xs">
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Tax Before Credits</span>
                    <span>${result.stateTaxBeforeCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Estimated Credits</span>
                    <span>-${result.estimatedStateCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Estimated State Payments</span>
                    <span>-$0.00</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between py-1 font-semibold text-sm">
                    <span>Estimated State Tax Due</span>
                    <span className={result.estimatedStateTax > 0 ? 'text-status-error' : 'text-status-success'}>
                      ${result.estimatedStateTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Effective State Rate</span>
                    <span>{pct(result.effectiveStateRate)}</span>
                  </div>
                </div>
              </div>

              {/* Withholding vs Tax Owed */}
              {stateWithholding > 0 && (
                <div className={cn(
                  'p-3 rounded border text-sm',
                  refundOrOwed >= 0
                    ? 'bg-status-success/5 border-status-success/30'
                    : 'bg-status-error/5 border-status-error/30'
                )}>
                  <div className="flex justify-between font-medium">
                    <span>State Withholding Paid (from W-2 / docs)</span>
                    <span>${stateWithholding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-semibold mt-1">
                    <span>{refundOrOwed >= 0 ? 'Estimated Refund' : 'Estimated Amount Owed'}</span>
                    <span className={refundOrOwed >= 0 ? 'text-status-success' : 'text-status-error'}>
                      ${Math.abs(refundOrOwed).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-status-warning p-2 bg-status-warning/5 rounded">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              {result.notes.length > 0 && (
                <div className="space-y-1">
                  {result.notes.map((n, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground p-2 bg-muted/30 rounded">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function StateReturnsPage() {
  const { currentYear, isYearSelected, yearConfig } = useTaxYear();
  const { workflowState, incomeReconciliations, documents } = useWorkflow();

  // ── Auto-derive federal income from workflow ──────────────────────────────
  const derivedInputs = useMemo((): FederalInputs => {
    const yearDocs = documents.filter(d => d.taxYear === currentYear);
    const yearRecs = incomeReconciliations.filter(r => r.taxYear === currentYear);

    // W-2 wages
    const w2Wages = yearDocs
      .filter(d => d.type === 'w2')
      .reduce((s, d) => s + (d.parsedData?.amounts?.box1_wages ?? 0), 0);

    // Self-employment (NEC + business income)
    const selfEmploymentIncome = yearRecs
      .filter(r => r.sourceDescription?.includes('NEC') || r.sourceDescription?.includes('Business') || r.sourceDescription?.includes('Schedule C'))
      .reduce((s, r) => s + r.netAmount, 0);

    // K-1 income
    const k1Income = yearRecs
      .filter(r => r.sourceDescription?.includes('K-1') || r.sourceDescription?.includes('Partnership') || r.sourceDescription?.includes('S Corp'))
      .reduce((s, r) => s + r.netAmount, 0);

    // Capital gains (1099-B)
    const capitalGains = yearRecs
      .filter(r => r.sourceType === 'capital_gains')
      .reduce((s, r) => s + r.netAmount, 0);

    // Interest and dividends (1099-INT / DIV)
    const interestAndDividends = yearRecs
      .filter(r => r.sourceDescription?.includes('INT') || r.sourceDescription?.includes('DIV') || r.sourceDescription?.includes('Interest') || r.sourceDescription?.includes('Dividend'))
      .reduce((s, r) => s + r.netAmount, 0);

    // Retirement income (1099-R)
    const retirementIncome = yearRecs
      .filter(r => r.sourceDescription?.includes('1099-R') || r.sourceDescription?.includes('IRA') || r.sourceDescription?.includes('Pension'))
      .reduce((s, r) => s + r.netAmount, 0);

    // Total AGI (simplified — doesn't account for above-the-line deductions)
    const federalAGI = w2Wages + selfEmploymentIncome + k1Income + capitalGains + interestAndDividends + retirementIncome;

    return {
      federalAGI: Math.max(0, federalAGI),
      federalTaxableIncome: Math.max(0, federalAGI), // simplified
      w2Wages: Math.max(0, w2Wages),
      selfEmploymentIncome: Math.max(0, selfEmploymentIncome),
      k1Income: Math.max(0, k1Income),
      capitalGains,
      interestAndDividends: Math.max(0, interestAndDividends),
      retirementIncome: Math.max(0, retirementIncome),
      filingStatus: 'single',
      numDependents: 0,
    };
  }, [incomeReconciliations, documents, currentYear]);

  // ── Editable override inputs ──────────────────────────────────────────────
  const [inputs, setInputs] = useState<FederalInputs | null>(null);
  const [computed, setComputed] = useState(false);
  const [stateResults, setStateResults] = useState<Map<string, StateReturnResult>>(new Map());

  const effectiveInputs = inputs ?? derivedInputs;

  const setField = <K extends keyof FederalInputs>(key: K, val: FederalInputs[K]) => {
    setInputs(prev => ({ ...(prev ?? derivedInputs), [key]: val }));
    setComputed(false);
  };

  // ── State withholding from documents ─────────────────────────────────────
  const stateWithholding = useMemo(() => {
    const result: Record<string, number> = {};
    documents
      .filter(d => d.taxYear === currentYear)
      .forEach(d => {
        const amounts = d.parsedData?.amounts ?? {};
        // W-2 state withholding — mapper writes state code as boxFields.box15_stateCode
        if (d.type === 'w2') {
          const code = (d.parsedData?.boxFields?.box15_stateCode ?? d.parsedData?.boxFields?.stateCode) as string | undefined;
          if (code && amounts.box17_stateTax) {
            result[code] = (result[code] ?? 0) + Number(amounts.box17_stateTax);
          }
        }
        // 1099-R state withholding — mapper writes state code as boxFields.box12_stateCode (IRS Box 12)
        if (d.type === '1099_r' && amounts.box14_stateTaxWithheld) {
          const code = (d.parsedData?.boxFields?.box12_stateCode ?? d.parsedData?.boxFields?.stateCode) as string | undefined;
          if (code) result[code] = (result[code] ?? 0) + Number(amounts.box14_stateTaxWithheld);
        }
      });
    return result;
  }, [documents, currentYear]);

  // ── Run computations ──────────────────────────────────────────────────────
  const handleCompute = () => {
    if (!currentYear || !yearConfig) return;
    const results = new Map<string, StateReturnResult>();
    yearConfig.states.forEach(state => {
      const result = computeStateReturn({
        stateCode: state.stateCode,
        taxYear: Number(currentYear),
        residencyStatus: state.residencyStatus === 'full_year' ? 'full_year'
          : state.residencyStatus === 'part_year' ? 'part_year' : 'nonresident',
        incomeAllocationPct: state.residencyStatus === 'full_year' ? 100
          : state.residencyStatus === 'nonresident' ? 0 : 50, // user should adjust part-year
        federalAGI: effectiveInputs.federalAGI,
        federalTaxableIncome: effectiveInputs.federalTaxableIncome,
        w2Wages: effectiveInputs.w2Wages,
        selfEmploymentIncome: effectiveInputs.selfEmploymentIncome,
        k1Income: effectiveInputs.k1Income,
        capitalGains: effectiveInputs.capitalGains,
        interestAndDividends: effectiveInputs.interestAndDividends,
        retirementIncome: effectiveInputs.retirementIncome,
        numDependents: effectiveInputs.numDependents,
        filingStatus: effectiveInputs.filingStatus,
        estimatedStatePayments: 0,
      });
      results.set(state.stateCode, result);
    });
    setStateResults(results);
    setComputed(true);
  };

  // ─── Guard: no year selected ──────────────────────────────────────────────
  if (!isYearSelected) {
    return (
      <div className="p-6">
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-status-warning mx-auto mb-4" />
            <h3 className="text-lg font-medium">Tax Year Required</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Please select a tax year from the Dashboard first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { gates } = workflowState;
  const states = yearConfig?.states || [];

  if (states.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">State Returns</h1>
          <p className="text-muted-foreground mt-1">State income tax returns for tax year {currentYear}</p>
        </div>
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-8 text-center">
            <Building2 className="w-12 h-12 text-status-warning/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium">No States Configured</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Configure states in Year Configuration before preparing state returns
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">State Returns</h1>
        <p className="text-muted-foreground mt-1">
          State income tax returns derived from federal data for tax year {currentYear}
        </p>
      </div>

      {/* Federal requirement banner */}
      <Card className={cn(
        gates.federalFinalized
          ? 'border-status-success/30 bg-status-success/5'
          : 'border-status-warning/30 bg-status-warning/5'
      )}>
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            {gates.federalFinalized ? (
              <Check className="w-5 h-5 text-status-success mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-status-warning mt-0.5" />
            )}
            <div>
              <p className="font-medium text-sm">
                {gates.federalFinalized
                  ? 'Federal Return Finalized — state returns ready'
                  : 'Federal return not yet finalized — estimates only'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {gates.federalFinalized
                  ? 'Federal AGI and income figures are confirmed. State returns below are derived from finalized data.'
                  : 'You can still compute state estimates now. Final numbers require a finalized federal return.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Federal inputs section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Federal Income Inputs
          </CardTitle>
          <CardDescription>
            Auto-derived from uploaded documents. Adjust as needed before computing state returns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Federal AGI ($)</Label>
              <Input
                type="number"
                value={effectiveInputs.federalAGI}
                onChange={e => setField('federalAGI', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">W-2 Wages ($)</Label>
              <Input
                type="number"
                value={effectiveInputs.w2Wages}
                onChange={e => setField('w2Wages', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Self-Employment ($)</Label>
              <Input
                type="number"
                value={effectiveInputs.selfEmploymentIncome}
                onChange={e => setField('selfEmploymentIncome', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Capital Gains ($)</Label>
              <Input
                type="number"
                value={effectiveInputs.capitalGains}
                onChange={e => setField('capitalGains', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">K-1 Income ($)</Label>
              <Input
                type="number"
                value={effectiveInputs.k1Income}
                onChange={e => setField('k1Income', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Interest & Dividends ($)</Label>
              <Input
                type="number"
                value={effectiveInputs.interestAndDividends}
                onChange={e => setField('interestAndDividends', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Retirement Income ($)</Label>
              <Input
                type="number"
                value={effectiveInputs.retirementIncome}
                onChange={e => setField('retirementIncome', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dependents (#)</Label>
              <Input
                type="number"
                min={0}
                max={20}
                value={effectiveInputs.numDependents}
                onChange={e => setField('numDependents', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Filing Status</Label>
              <Select
                value={effectiveInputs.filingStatus}
                onValueChange={v => setField('filingStatus', v as FilingStatusKey)}
              >
                <SelectTrigger className="h-8 text-sm w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married_filing_jointly">Married Filing Jointly</SelectItem>
                  <SelectItem value="head_of_household">Head of Household</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <Button
              onClick={handleCompute}
              className="self-end"
              size="sm"
            >
              <Calculator className="w-4 h-4 mr-2" />
              Compute State Returns
            </Button>
          </div>

          {effectiveInputs.federalAGI === 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="w-3.5 h-3.5" />
              No income found from uploaded documents. Enter Federal AGI manually above.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {computed && stateResults.size > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              State Return Computations ({states.length} {states.length === 1 ? 'state' : 'states'})
            </h2>

            {/* Summary row */}
            {states.length > 1 && (
              <Card className="mb-4 bg-secondary/30">
                <CardContent className="py-3">
                  <div className="flex flex-wrap gap-4 text-sm">
                    {states.map(state => {
                      const r = stateResults.get(state.stateCode);
                      if (!r) return null;
                      const wh = stateWithholding[state.stateCode] ?? 0;
                      const diff = wh - r.estimatedStateTax;
                      return (
                        <div key={state.stateCode} className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-xs bg-secondary px-1.5 py-0.5 rounded">
                            {state.stateCode}
                          </span>
                          {r.estimatedStateTax === 0 && r.stateTaxableIncome === 0 ? (
                            <span className="text-muted-foreground text-xs">No tax</span>
                          ) : (
                            <span className={diff >= 0 ? 'text-status-success text-xs' : 'text-status-error text-xs'}>
                              {diff >= 0 ? `Refund $${diff.toFixed(0)}` : `Owe $${Math.abs(diff).toFixed(0)}`}
                              {wh === 0 && ` (tax: $${r.estimatedStateTax.toFixed(0)})`}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-4">
              {states.map(state => {
                const result = stateResults.get(state.stateCode);
                if (!result) return null;
                return (
                  <StateResultPanel
                    key={state.stateCode}
                    state={state}
                    result={result}
                    stateWithholding={stateWithholding[state.stateCode] ?? 0}
                  />
                );
              })}
            </div>
          </div>

          {/* Caveats */}
          <Card className="border-muted bg-muted/20">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Important Notes</p>
                  <p>State add-backs and subtractions are shown as $0 where state-specific inputs (e.g. bonus depreciation recapture, state retirement exclusions) require additional detail. Review each state's notes for applicable adjustments.</p>
                  <p>Part-year allocations default to 50% — adjust by entering a specific income allocation percentage in your state configuration.</p>
                  <p>These computations are estimates. Final state tax returns should be verified against the state's official instructions and forms.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!computed && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Calculator className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Review the federal income inputs above, then click <strong>Compute State Returns</strong> to calculate
              {states.length === 1 ? ' your state return' : ` all ${states.length} state returns`}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
