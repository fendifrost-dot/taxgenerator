/**
 * PriorYearBuilderPage.tsx
 *
 * 3-step flow for completing backdated returns up to 5 prior years:
 *
 *  Step 1 — Select year + pre-populate questions from current year data
 *  Step 2 — Answer differential questions + add notes/comments
 *  Step 3 — Claude generates completed return summary with line-by-line breakdown
 *
 * The generated summary shows every 1040 line with an "estimated" badge on any
 * value that came from a client estimate (vs. a source document).
 */

import { useState } from 'react';
import {
  History, ChevronRight, ChevronLeft, Sparkles, Loader2, AlertCircle,
  CheckCircle2, DollarSign, FileText, Info, RefreshCw, Printer,
  ClipboardList, Calendar, TriangleAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PriorYearDifferential,
  PriorYearReturnSummary,
  PriorYearReturnLine,
  PRIOR_YEAR_QUESTIONS,
  buildPriorYearReturn,
  buildCurrentYearSnapshot,
  CurrentYearSnapshot,
} from '@/lib/priorYearBuilder';
import { getRulesForYear, getAvailablePriorYears } from '@/lib/priorYearRules';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { useTaxYear } from '@/contexts/TaxYearContext';

type Step = 'pick_year' | 'interview' | 'generating' | 'result' | 'error';

const FILING_STATUSES = [
  'Single',
  'Married Filing Jointly',
  'Married Filing Separately',
  'Head of Household',
  'Qualifying Widow(er)',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyDifferential(snap: CurrentYearSnapshot): PriorYearDifferential {
  return {
    filingStatus:              snap.filingStatus ?? 'Single',
    stateOfResidence:          snap.stateOfResidence ?? '',
    w2Changes:                 snap.w2Employers.length > 0 ? `Same employers: ${snap.w2Employers.join(', ')}` : '',
    estimatedW2Wages:          snap.totalW2Wages || null,
    businessChanges:           '',
    businessIncomeEstimates:   snap.businesses.map(b => ({ businessName: b.name, estimatedGross: b.grossIncome })),
    other1099Income:           '',
    estimated1099Amount:       snap.total1099Income || null,
    hasDependents:             null,
    numberOfDependents:        null,
    dependentChildrenUnder17:  null,
    ownedHome:                 null,
    mortgageInterestPaid:      null,
    propertyTaxPaid:           null,
    hadHomeOffice:             null,
    homeOfficeSquareFeet:      null,
    totalHomeSqFt:             null,
    businessMilesDriven:       null,
    madeIRAContribution:       null,
    iraContributionAmount:     null,
    made401kContribution:      null,
    k401ContributionAmount:    null,
    madeSEPContribution:       null,
    sepContributionAmount:     null,
    selfEmployedHealthInsurance: null,
    hsaContributions:          null,
    studentLoanInterest:       null,
    charitableCashDonations:   null,
    charitableNonCashDonations: null,
    significantEvents:         '',
  };
}

function formatCurrency(n: number): string {
  return n < 0
    ? `(${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })})`
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// ─── Return summary display ───────────────────────────────────────────────────

function ReturnLine({ line }: { line: PriorYearReturnLine }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground">{line.lineRef}</span>
          <span className="text-sm">{line.description}</span>
          {line.isEstimated && (
            <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50">
              estimated
            </Badge>
          )}
        </div>
        {line.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            {line.notes}
          </p>
        )}
      </div>
      <span className={`text-sm font-mono whitespace-nowrap ${line.amount < 0 ? 'text-destructive' : ''}`}>
        {formatCurrency(line.amount)}
      </span>
    </div>
  );
}

function ReturnSummaryView({ summary, onRegenerate }: { summary: PriorYearReturnSummary; onRegenerate: () => void }) {
  const outcome = summary.estimatedRefundOrOwed;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className={`border-2 ${outcome >= 0 ? 'border-green-400' : 'border-amber-400'}`}>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-muted-foreground">{summary.taxYear} Return · {summary.filingStatus}</p>
              <p className="text-3xl font-bold font-mono mt-1">
                {outcome >= 0 ? '+' : ''}{formatCurrency(outcome)}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {outcome >= 0 ? 'Estimated Refund' : 'Estimated Amount Owed'}
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-muted-foreground">AGI: <span className="font-mono">{formatCurrency(summary.adjustedGrossIncome)}</span></p>
              <p className="text-xs text-muted-foreground">Taxable Income: <span className="font-mono">{formatCurrency(summary.taxableIncome)}</span></p>
              <p className="text-xs text-muted-foreground">Tax Liability: <span className="font-mono">{formatCurrency(summary.estimatedTaxLiability)}</span></p>
              <p className="text-xs text-muted-foreground">Credits: <span className="font-mono text-green-600">({formatCurrency(summary.totalCredits)})</span></p>
              <Badge variant="secondary" className="text-xs">{summary.deductionType === 'standard' ? 'Standard Deduction' : 'Itemized Deductions'}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preparer summary */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm">{summary.preparerSummary}</p>
          </div>
        </CardContent>
      </Card>

      {/* Year-specific notes */}
      {summary.yearSpecificNotes && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-800 mb-1">{summary.taxYear} Special Provisions Applied</p>
                <p className="text-sm text-blue-900">{summary.yearSpecificNotes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estimated values warning */}
      {summary.hasEstimatedValues && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                This return contains estimated values. Lines marked <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50 inline-flex">estimated</Badge> should be verified against source documents before filing.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Line sections */}
      {summary.sections.map(section => (
        section.lines.length > 0 && (
          <Card key={section.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 divide-y divide-border">
              {section.lines.map((line, i) => (
                <ReturnLine key={i} line={line} />
              ))}
              {section.subtotal !== undefined && (
                <div className="flex justify-between pt-2 font-semibold text-sm">
                  <span>Subtotal</span>
                  <span className={`font-mono ${section.subtotal < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(section.subtotal)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )
      ))}

      {/* Missing documents */}
      {summary.missingDocuments.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-destructive" />
              Documents Needed to Finalize
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {summary.missingDocuments.map((doc, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                {doc}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommended actions */}
      {summary.recommendedActions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Recommended Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {summary.recommendedActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                {action}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3 pb-6">
        <Button variant="outline" onClick={onRegenerate}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Regenerate
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" />
          Print Summary
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PriorYearBuilderPage() {
  const { currentYear } = useTaxYear();
  const workflow = useWorkflow();

  const availableYears = getAvailablePriorYears(currentYear ?? new Date().getFullYear());

  const [step,          setStep]          = useState<Step>('pick_year');
  const [targetYear,    setTargetYear]     = useState<number | null>(availableYears[0] ?? null);
  const [snapshot,      setSnapshot]       = useState<CurrentYearSnapshot | null>(null);
  const [differential,  setDifferential]   = useState<PriorYearDifferential | null>(null);
  const [preparerNotes, setPreparerNotes]  = useState('');
  const [summary,       setSummary]        = useState<PriorYearReturnSummary | null>(null);
  const [error,         setError]          = useState<string | null>(null);

  // ── Step 1: pick year ────────────────────────────────────────────────────────

  const handleStartInterview = () => {
    if (!targetYear) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contextSnap: Record<string, any> = {
      documents:    workflow.documents,
      transactions: workflow.transactions,
    };
    const snap = buildCurrentYearSnapshot(contextSnap, currentYear ?? new Date().getFullYear());
    setSnapshot(snap);
    setDifferential(emptyDifferential(snap));
    setStep('interview');
  };

  // ── Step 2: interview ─────────────────────────────────────────────────────────

  const updateField = <K extends keyof PriorYearDifferential>(
    key: K,
    value: PriorYearDifferential[K],
  ) => {
    setDifferential(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const updateBizEstimate = (idx: number, field: 'businessName' | 'estimatedGross', value: string | number) => {
    if (!differential) return;
    const updated = [...differential.businessIncomeEstimates];
    updated[idx] = { ...updated[idx], [field]: value };
    updateField('businessIncomeEstimates', updated);
  };

  const addBizEstimate = () => {
    if (!differential) return;
    updateField('businessIncomeEstimates', [
      ...differential.businessIncomeEstimates,
      { businessName: '', estimatedGross: 0 },
    ]);
  };

  const handleGenerate = async () => {
    if (!targetYear || !differential || !snapshot) return;
    const rules = getRulesForYear(targetYear);
    if (!rules) { setError(`No tax rules found for ${targetYear}.`); return; }

    setError(null);
    setStep('generating');

    const result = await buildPriorYearReturn(
      { targetYear, rules, currentYearSnapshot: snapshot, differential, preparerNotes },
    );

    if (result.error || !result.summary) {
      setError(result.error ?? 'Failed to generate return.');
      setStep('error');
      return;
    }

    setSummary(result.summary);
    setStep('result');
  };

  const handleRegenerate = () => {
    setSummary(null);
    setStep('interview');
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <History className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">Prior Year Return Builder</h2>
          <p className="text-sm text-muted-foreground">
            Complete backdated returns using current year data as a baseline. Claude applies
            the correct tax rules for each year.
          </p>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {(['pick_year', 'interview', 'result'] as const).map((s, i) => {
          const labels = ['Select Year', 'Answer Questions', 'Generated Return'];
          const active = step === s || (step === 'generating' && s === 'result') || (step === 'error' && s === 'interview');
          const done   = (step === 'interview' && i === 0) ||
                         ((step === 'generating' || step === 'result') && i <= 1);
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              <span className={`font-medium ${done ? 'text-green-600' : active ? 'text-primary' : ''}`}>
                {done && <CheckCircle2 className="inline w-3 h-3 mr-1" />}
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>

      <Separator />

      {/* ── Step 1: Year picker ───────────────────────────────────────────────── */}
      {step === 'pick_year' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Which year would you like to complete?
              </CardTitle>
              <CardDescription>
                Select a prior tax year. The system will use your {currentYear} data as a starting
                point and ask what was different in the selected year.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availableYears.map(year => {
                  const rules = getRulesForYear(year);
                  return (
                    <button
                      key={year}
                      onClick={() => setTargetYear(year)}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        targetYear === year
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="text-2xl font-bold font-mono">{year}</div>
                      {rules?.specialProvisions[0] && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {rules.specialProvisions[0].split(':')[0]}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {targetYear && (
                <Card className="bg-muted/40">
                  <CardContent className="pt-4 pb-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {targetYear} Standard Deductions
                    </p>
                    {(() => {
                      const r = getRulesForYear(targetYear);
                      if (!r) return null;
                      return (
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div><span className="text-muted-foreground text-xs">Single</span><br />${r.standardDeduction.single.toLocaleString()}</div>
                          <div><span className="text-muted-foreground text-xs">MFJ</span><br />${r.standardDeduction.marriedFilingJointly.toLocaleString()}</div>
                          <div><span className="text-muted-foreground text-xs">HoH</span><br />${r.standardDeduction.headOfHousehold.toLocaleString()}</div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              <Button
                className="w-full"
                disabled={!targetYear}
                onClick={handleStartInterview}
              >
                Continue to Questions
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 2: Interview ─────────────────────────────────────────────────── */}
      {(step === 'interview' || step === 'error') && differential && snapshot && targetYear && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep('pick_year')}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Badge variant="outline">{targetYear} Return</Badge>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Questions */}
          {PRIOR_YEAR_QUESTIONS.filter(q =>
            !q.showIf || q.showIf(differential)
          ).map(q => {
            const label = q.label.replace(/{year}/g, String(targetYear));
            const helpText = q.helpText?.replace(/{year}/g, String(targetYear));

            return (
              <Card key={String(q.id)}>
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div>
                    <Label className="text-sm font-medium">{label}</Label>
                    {helpText && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                        <Info className="w-3 h-3 shrink-0 mt-0.5" />
                        {helpText}
                      </p>
                    )}
                  </div>

                  {/* yesno */}
                  {q.type === 'yesno' && (
                    <div className="flex gap-2">
                      {[true, false].map(v => (
                        <Button
                          key={String(v)}
                          variant={differential[q.id] === v ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateField(q.id, v as never)}
                        >
                          {v ? 'Yes' : 'No'}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* filing status select */}
                  {q.type === 'text' && q.id === 'filingStatus' && (
                    <Select
                      value={String(differential[q.id] ?? '')}
                      onValueChange={v => updateField(q.id, v as never)}
                    >
                      <SelectTrigger className="max-w-xs">
                        <SelectValue placeholder="Select filing status…" />
                      </SelectTrigger>
                      <SelectContent>
                        {FILING_STATUSES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* generic text */}
                  {q.type === 'text' && q.id !== 'filingStatus' && (
                    <Textarea
                      value={String(differential[q.id] ?? '')}
                      onChange={e => updateField(q.id, e.target.value as never)}
                      rows={2}
                      className="resize-none"
                    />
                  )}

                  {/* currency */}
                  {q.type === 'currency' && (
                    <div className="relative max-w-xs">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        className="pl-9"
                        value={typeof differential[q.id] === 'number' ? String(differential[q.id]) : ''}
                        onChange={e => updateField(q.id, (e.target.value === '' ? null : Number(e.target.value)) as never)}
                        placeholder="0"
                      />
                    </div>
                  )}

                  {/* number */}
                  {q.type === 'number' && (
                    <Input
                      type="number"
                      min={0}
                      className="max-w-xs"
                      value={typeof differential[q.id] === 'number' ? String(differential[q.id]) : ''}
                      onChange={e => updateField(q.id, (e.target.value === '' ? null : Number(e.target.value)) as never)}
                      placeholder="0"
                    />
                  )}

                  {/* business income list */}
                  {q.type === 'business_income_list' && (
                    <div className="space-y-3">
                      {differential.businessIncomeEstimates.map((biz, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            placeholder="Business name"
                            value={biz.businessName}
                            onChange={e => updateBizEstimate(idx, 'businessName', e.target.value)}
                            className="flex-1"
                          />
                          <div className="relative w-36">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              type="number"
                              min={0}
                              step={100}
                              className="pl-9"
                              value={biz.estimatedGross || ''}
                              onChange={e => updateBizEstimate(idx, 'estimatedGross', Number(e.target.value) || 0)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={addBizEstimate}>
                        + Add business
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Preparer notes / comments */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Additional Notes &amp; Context
              </CardTitle>
              <CardDescription>
                Add anything else Claude should know — changes in circumstances, known deductions,
                notes from the client, or instructions for how to handle ambiguous items.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={preparerNotes}
                onChange={e => setPreparerNotes(e.target.value)}
                placeholder={`Example: "Client sold investment property in ${targetYear} for approximately $180,000. They believe the basis was around $120,000. Need to account for capital gains."`}
                rows={4}
                className="resize-none"
              />
            </CardContent>
          </Card>

          <Button className="w-full" size="lg" onClick={handleGenerate}>
            <Sparkles className="w-5 h-5 mr-2" />
            Generate {targetYear} Return
          </Button>

        </div>
      )}

      {/* ── Generating ────────────────────────────────────────────────────────── */}
      {step === 'generating' && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-medium">Generating {targetYear} Return…</p>
              <p className="text-sm text-muted-foreground mt-1">
                Claude is applying {targetYear} tax rules to your data. This may take 20–30 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Result ────────────────────────────────────────────────────────────── */}
      {step === 'result' && summary && (
        <>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handleRegenerate}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Edit Answers
            </Button>
            <Badge>{targetYear} Return — Generated</Badge>
          </div>
          <ReturnSummaryView summary={summary} onRegenerate={handleRegenerate} />
        </>
      )}
    </div>
  );
}
