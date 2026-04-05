/**
 * FederalReturnPage.tsx
 *
 * Complete Form 1040 preparation workflow:
 *  - Tab 1: Prerequisites (workflow gates)
 *  - Tab 2: 1040 Inputs  (filing status, dependents, adjustments, etc.)
 *  - Tab 3: Full Return  (computed 1040 with all lines and schedules)
 *  - Tab 4: State Returns (derivative state calculations)
 */

import { useState, useMemo } from 'react';
import {
  AlertTriangle, Calculator, Check, XCircle, Lock, ChevronRight,
  AlertCircle, Printer, Sparkles, Users, DollarSign, Building2,
  FileText, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { calculateScheduleC, getLineResult } from '@/lib/calculationEngine';
import { computeForm1040 } from '@/lib/form1040Engine';
import { computeStateReturn, hasStateIncomeTax } from '@/lib/stateReturnRules';
import {
  Form1040Input, emptyForm1040Input, FilingStatus, FILING_STATUS_LABELS,
  QualifyingChild, QualifyingDependent, CapitalTransaction,
} from '@/types/form1040';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { W2ParseResult, K1_1065_ParseResult, K1_1120S_ParseResult } from '@/lib/documentParser';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString()}`;

function CurrencyInput({
  label, value, onChange, hint,
}: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground/70 mb-1">{hint}</p>}
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

// ─── 1040 Section display ─────────────────────────────────────────────────────

function ReturnSection({
  title, lines, subtotal, defaultOpen = false,
}: { title: string; lines: Array<{ lineNumber: string; description: string; amount: number; path: string; isEstimated: boolean }>; subtotal?: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const nonZeroLines = lines.filter(l => l.amount !== 0);
  if (nonZeroLines.length === 0) return null;

  return (
    <Card>
      <CardHeader
        className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          <div className="flex items-center gap-3">
            {subtotal !== undefined && (
              <span className={cn('text-sm font-mono font-semibold', subtotal < 0 ? 'text-destructive' : '')}>
                {subtotal < 0 ? `(${fmt(subtotal)})` : fmt(subtotal)}
              </span>
            )}
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          <div className="space-y-0.5">
            {nonZeroLines.map((l, idx) => (
              <div key={idx} className="flex justify-between items-start py-1.5 border-b last:border-0 gap-4">
                <div className="min-w-0 flex-1">
                  <span className="text-xs text-muted-foreground w-8 inline-block shrink-0">{l.lineNumber}</span>
                  <span className="text-sm">{l.description}</span>
                  {l.isEstimated && <Badge variant="secondary" className="ml-2 text-xs">est.</Badge>}
                  <p className="text-xs text-muted-foreground/70 pl-8 mt-0.5 leading-relaxed">{l.path}</p>
                </div>
                <span className={cn('text-sm font-mono shrink-0', l.amount < 0 ? 'text-destructive' : '')}>
                  {l.amount < 0 ? `(${fmt(l.amount)})` : fmt(l.amount)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Tab: Prerequisites ───────────────────────────────────────────────────────

function PrerequisitesTab({
  gates, blockedReasons, requiredForms, federalStatus,
}: {
  gates: Record<string, boolean>;
  blockedReasons: string[];
  requiredForms: Array<{ formName: string; jurisdiction: string; reason: string; isVerified: boolean }>;
  federalStatus: string;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Generation Prerequisites</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: 'taxYearSelected',          label: 'Tax year selected' },
            { key: 'statesConfigured',          label: 'States configured' },
            { key: 'noUnresolvedTransactions',  label: 'All transactions classified' },
            { key: 'noMaterialDiscrepancies',   label: 'No material discrepancies' },
            { key: 'incomeReconciled',           label: 'Income reconciled' },
            { key: 'evidenceComplete',           label: 'Evidence attached to deductions' },
          ].map(gate => (
            <div key={gate.key} className="flex items-center gap-3">
              {(gates as Record<string, boolean>)[gate.key]
                ? <Check className="w-4 h-4 text-green-600" />
                : <XCircle className="w-4 h-4 text-destructive" />}
              <span className={cn('text-sm', !(gates as Record<string, boolean>)[gate.key] && 'text-muted-foreground')}>
                {gate.label}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {blockedReasons.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive flex items-center gap-2">
              <XCircle className="w-4 h-4" />Return Generation Blocked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {blockedReasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2"><ChevronRight className="w-3 h-3 mt-1 shrink-0" />{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {requiredForms.filter(f => f.jurisdiction === 'federal').map((form, idx) => (
        <Card key={idx} className={cn(!form.isVerified && 'border-amber-200')}>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded', form.isVerified ? 'bg-green-100' : 'bg-amber-50')}>
                {form.isVerified
                  ? <Check className="w-4 h-4 text-green-600" />
                  : <AlertCircle className="w-4 h-4 text-amber-600" />}
              </div>
              <div>
                <div className="font-medium text-sm">{form.formName}</div>
                <div className="text-xs text-muted-foreground">{form.reason}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Tab: 1040 Inputs ─────────────────────────────────────────────────────────

function InputsTab({ input, onChange }: { input: Form1040Input; onChange: (p: Partial<Form1040Input>) => void }) {
  const [showItemized, setShowItemized] = useState(false);

  return (
    <div className="space-y-5">
      {/* Filing Status */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Filing Status & Taxpayer Info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Filing Status</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(FILING_STATUS_LABELS) as [FilingStatus, string][]).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => onChange({ filingStatus: k })}
                  className={cn('text-left text-sm p-2 rounded border transition-colors', input.filingStatus === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50')}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Taxpayer Age at Year-End</Label>
              <Input
                type="number" min={0} max={120}
                value={String(input.taxpayerAge)}
                onChange={e => onChange({ taxpayerAge: Number(e.target.value) || 0 })}
                className="mt-1 h-8 text-sm"
              />
            </div>
            {(input.filingStatus === 'married_filing_jointly' || input.filingStatus === 'married_filing_separately') && (
              <div>
                <Label className="text-xs text-muted-foreground">Spouse Age at Year-End</Label>
                <Input
                  type="number" min={0} max={120}
                  value={String(input.spouseAge ?? '')}
                  onChange={e => onChange({ spouseAge: Number(e.target.value) || undefined })}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={input.taxpayerBlind} onChange={e => onChange({ taxpayerBlind: e.target.checked })} className="rounded" />
              Taxpayer is blind
            </label>
            {(input.filingStatus === 'married_filing_jointly') && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={input.spouseBlind ?? false} onChange={e => onChange({ spouseBlind: e.target.checked })} className="rounded" />
                Spouse is blind
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dependents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />Dependents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Qualifying Children (under 17)</span>
            <div className="flex gap-2 items-center">
              <Button variant="outline" size="sm" className="h-7 px-2"
                onClick={() => {
                  const prev = input.qualifyingChildren;
                  if (prev.length === 0) return onChange({ qualifyingChildren: [] });
                  onChange({ qualifyingChildren: prev.slice(0, -1) });
                }}
                disabled={input.qualifyingChildren.length === 0}
              >-</Button>
              <span className="w-6 text-center font-mono">{input.qualifyingChildren.length}</span>
              <Button variant="outline" size="sm" className="h-7 px-2"
                onClick={() => {
                  const child: QualifyingChild = { id: `c_${Date.now()}`, name: '', age: 5, isUnder6: true, monthsInHome: 12 };
                  onChange({ qualifyingChildren: [...input.qualifyingChildren, child] });
                }}
              >+</Button>
            </div>
          </div>
          {input.qualifyingChildren.map((child, idx) => (
            <div key={child.id} className="flex gap-2 items-center p-2 bg-muted/30 rounded">
              <Input
                className="h-7 text-sm flex-1"
                value={child.name}
                onChange={e => {
                  const updated = [...input.qualifyingChildren];
                  updated[idx] = { ...child, name: e.target.value };
                  onChange({ qualifyingChildren: updated });
                }}
                placeholder={`Child ${idx + 1} name`}
              />
              <Input
                type="number" min={0} max={16}
                className="h-7 text-sm w-16"
                value={String(child.age)}
                onChange={e => {
                  const age = Number(e.target.value) || 0;
                  const updated = [...input.qualifyingChildren];
                  updated[idx] = { ...child, age, isUnder6: age < 6 };
                  onChange({ qualifyingChildren: updated });
                }}
              />
              <span className="text-xs text-muted-foreground">age</span>
            </div>
          ))}

          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-muted-foreground">Other Dependents ($500 credit each)</span>
            <div className="flex gap-2 items-center">
              <Button variant="outline" size="sm" className="h-7 px-2"
                onClick={() => onChange({ otherDependents: input.otherDependents.slice(0, -1) })}
                disabled={input.otherDependents.length === 0}
              >-</Button>
              <span className="w-6 text-center font-mono">{input.otherDependents.length}</span>
              <Button variant="outline" size="sm" className="h-7 px-2"
                onClick={() => {
                  const dep: QualifyingDependent = { id: `d_${Date.now()}`, name: '', relationship: '', isQualifyingChild: false, creditForOtherDependents: true };
                  onChange({ otherDependents: [...input.otherDependents, dep] });
                }}
              >+</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* W-2 / Auto-populated income notice */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
            <Info className="w-4 h-4" />Auto-Populated from Parsed Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-blue-700">
            W-2 wages, federal withholding, 1099-INT interest, 1099-DIV dividends, and K-1 income
            are automatically pulled from your uploaded documents. Review and adjust if needed.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <CurrencyInput label="W-2 Wages (Box 1 total)" value={input.w2WagesTotal} onChange={v => onChange({ w2WagesTotal: v })} />
            <CurrencyInput label="Federal Withholding (Box 2 total)" value={input.w2WithholdingTotal} onChange={v => onChange({ w2WithholdingTotal: v })} />
            <CurrencyInput label="Taxable Interest (1099-INT)" value={input.taxableInterest} onChange={v => onChange({ taxableInterest: v })} />
            <CurrencyInput label="Ordinary Dividends (1099-DIV 1a)" value={input.ordinaryDividends} onChange={v => onChange({ ordinaryDividends: v })} />
            <CurrencyInput label="Qualified Dividends (1099-DIV 1b)" value={input.qualifiedDividends} onChange={v => onChange({ qualifiedDividends: v })} />
            <CurrencyInput label="K-1 Ordinary Income" value={input.k1OrdinaryIncome} onChange={v => onChange({ k1OrdinaryIncome: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Other income */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Other Income</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <CurrencyInput label="IRA / Pension Distributions (1099-R)" value={input.iRADistributions} onChange={v => onChange({ iRADistributions: v })} />
          <CurrencyInput label="Social Security Benefits (SSA-1099 Box 5)" value={input.socialSecurityBenefits} onChange={v => onChange({ socialSecurityBenefits: v })} />
          <CurrencyInput label="Unemployment Compensation (1099-G)" value={input.unemploymentCompensation} onChange={v => onChange({ unemploymentCompensation: v })} />
          <CurrencyInput label="Gambling Winnings (W-2G)" value={input.gamblingWinnings} onChange={v => onChange({ gamblingWinnings: v })} />
          <CurrencyInput label="Alimony Received (pre-2019 agreements only)" value={input.alimonyReceived} onChange={v => onChange({ alimonyReceived: v })} />
          <CurrencyInput label="Other Income" value={input.otherIncome} onChange={v => onChange({ otherIncome: v })} />
        </CardContent>
      </Card>

      {/* Adjustments */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Above-the-Line Adjustments (Schedule 1)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <CurrencyInput label="SE Health Insurance Premiums" value={input.selfEmployedHealthInsurance} hint="Limited to Schedule C net profit" onChange={v => onChange({ selfEmployedHealthInsurance: v })} />
          <CurrencyInput label="SEP-IRA / SIMPLE Contribution" value={input.sepSimpleContribution} onChange={v => onChange({ sepSimpleContribution: v })} />
          <CurrencyInput label="Traditional IRA Deduction" value={input.iraDeduction} hint="Subject to income phase-out if covered by workplace plan" onChange={v => onChange({ iraDeduction: v })} />
          <CurrencyInput label="HSA Deduction (Form 8889)" value={input.hsaDeduction} onChange={v => onChange({ hsaDeduction: v })} />
          <CurrencyInput label="Student Loan Interest" value={input.studentLoanInterest} hint="Up to $2,500; phases out with AGI" onChange={v => onChange({ studentLoanInterest: v })} />
          <CurrencyInput label="Educator Expenses" value={input.educatorExpenses} hint="Cap: $300 (2022+), $250 prior years" onChange={v => onChange({ educatorExpenses: v })} />
          <CurrencyInput label="Alimony Paid (pre-2019 agreement)" value={input.alimonyPaid} onChange={v => onChange({ alimonyPaid: v })} />
        </CardContent>
      </Card>

      {/* Capital gains */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Capital Gains & Losses (Schedule D)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <CurrencyInput label="Prior Year Capital Loss Carryover" value={input.priorYearCapLossCarryover} onChange={v => onChange({ priorYearCapLossCarryover: v })} />
          <p className="text-xs text-muted-foreground">
            For brokerage transactions, enter them below. Short-term = held ≤1 year; Long-term = held &gt;1 year.
          </p>
          {input.capitalTransactions.map((t, idx) => (
            <div key={t.id} className="grid grid-cols-4 gap-2 p-2 bg-muted/30 rounded text-sm">
              <Input className="h-7 text-xs" placeholder="Description" value={t.description} onChange={e => {
                const upd = [...input.capitalTransactions]; upd[idx] = { ...t, description: e.target.value };
                onChange({ capitalTransactions: upd });
              }} />
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input type="number" className="h-7 text-xs pl-5" placeholder="Proceeds" value={t.proceeds || ''} onChange={e => {
                  const upd = [...input.capitalTransactions]; upd[idx] = { ...t, proceeds: Number(e.target.value) || 0, gainLoss: (Number(e.target.value) || 0) - t.costBasis };
                  onChange({ capitalTransactions: upd });
                }} />
              </div>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input type="number" className="h-7 text-xs pl-5" placeholder="Cost basis" value={t.costBasis || ''} onChange={e => {
                  const upd = [...input.capitalTransactions]; upd[idx] = { ...t, costBasis: Number(e.target.value) || 0, gainLoss: t.proceeds - (Number(e.target.value) || 0) };
                  onChange({ capitalTransactions: upd });
                }} />
              </div>
              <select
                className="h-7 text-xs border rounded px-1 bg-background"
                value={t.holdingPeriod}
                onChange={e => {
                  const upd = [...input.capitalTransactions]; upd[idx] = { ...t, holdingPeriod: e.target.value as 'short' | 'long' };
                  onChange({ capitalTransactions: upd });
                }}
              >
                <option value="short">Short-term</option>
                <option value="long">Long-term</option>
              </select>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => {
            const txn: CapitalTransaction = { id: `ct_${Date.now()}`, description: '', dateSold: '', dateAcquired: '', proceeds: 0, costBasis: 0, gainLoss: 0, holdingPeriod: 'long', isReported1099B: true, taxYear: input.taxYear };
            onChange({ capitalTransactions: [...input.capitalTransactions, txn] });
          }}>
            + Add Transaction
          </Button>
        </CardContent>
      </Card>

      {/* Home Office */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Home Office (Form 8829)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <CurrencyInput label="Home Office Sq Ft" value={input.homeOfficeSqFt} onChange={v => onChange({ homeOfficeSqFt: v })} />
            <CurrencyInput label="Total Home Sq Ft" value={input.totalHomeSqFt} onChange={v => onChange({ totalHomeSqFt: v })} />
          </div>
          <div className="flex gap-4 mt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="homeOfficeMethod" checked={input.useSimplifiedHomeOffice} onChange={() => onChange({ useSimplifiedHomeOffice: true })} />
              Simplified ($5/sqft, max 300 sqft)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="homeOfficeMethod" checked={!input.useSimplifiedHomeOffice} onChange={() => onChange({ useSimplifiedHomeOffice: false })} />
              Actual expense method
            </label>
          </div>
          {!input.useSimplifiedHomeOffice && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <CurrencyInput label="Mortgage Interest (allocated to office)" value={input.homeOfficeMortgageInterest} onChange={v => onChange({ homeOfficeMortgageInterest: v })} />
              <CurrencyInput label="Rent" value={input.homeOfficeRent} onChange={v => onChange({ homeOfficeRent: v })} />
              <CurrencyInput label="Utilities" value={input.homeOfficeUtilities} onChange={v => onChange({ homeOfficeUtilities: v })} />
              <CurrencyInput label="Insurance" value={input.homeOfficeInsurance} onChange={v => onChange({ homeOfficeInsurance: v })} />
              <CurrencyInput label="Repairs (direct)" value={input.homeOfficeRepairs} onChange={v => onChange({ homeOfficeRepairs: v })} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deduction type */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Deductions (Schedule A)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="deductionType" checked={!input.useItemizedDeductions} onChange={() => { onChange({ useItemizedDeductions: false }); setShowItemized(false); }} />
              Standard Deduction
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="deductionType" checked={input.useItemizedDeductions} onChange={() => { onChange({ useItemizedDeductions: true }); setShowItemized(true); }} />
              Itemize (Schedule A)
            </label>
          </div>
          {showItemized && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <CurrencyInput label="Mortgage Interest (Form 1098)" value={input.itemizedDeductions.mortgageInterest} onChange={v => onChange({ itemizedDeductions: { ...input.itemizedDeductions, mortgageInterest: v } })} />
              <CurrencyInput label="Real Estate Property Taxes" value={input.itemizedDeductions.propertyTax_real} onChange={v => onChange({ itemizedDeductions: { ...input.itemizedDeductions, propertyTax_real: v } })} />
              <CurrencyInput label="State Income Tax Paid" value={input.itemizedDeductions.stateIncomeTaxPaid} onChange={v => onChange({ itemizedDeductions: { ...input.itemizedDeductions, stateIncomeTaxPaid: v } })} hint="SALT cap: $10,000" />
              <CurrencyInput label="Cash Charitable Contributions" value={input.itemizedDeductions.cashCharitable} onChange={v => onChange({ itemizedDeductions: { ...input.itemizedDeductions, cashCharitable: v } })} />
              <CurrencyInput label="Non-Cash Charitable (FMV)" value={input.itemizedDeductions.nonCashCharitable} onChange={v => onChange({ itemizedDeductions: { ...input.itemizedDeductions, nonCashCharitable: v } })} />
              <CurrencyInput label="Medical Expenses Paid" value={input.itemizedDeductions.medicalExpenses} onChange={v => onChange({ itemizedDeductions: { ...input.itemizedDeductions, medicalExpenses: v } })} hint="Only excess above 7.5% AGI is deductible" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Estimated Tax Payments</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <CurrencyInput label="Estimated Tax Payments (all 4 quarters)" value={input.estimatedTaxPayments} onChange={v => onChange({ estimatedTaxPayments: v })} />
          <CurrencyInput label="Prior Year Overpayment Applied" value={input.priorYearOverpaymentApplied} onChange={v => onChange({ priorYearOverpaymentApplied: v })} />
          <CurrencyInput label="NOL Carryforward (from prior year)" value={input.nolCarryforward} onChange={v => onChange({ nolCarryforward: v })} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Full Return ─────────────────────────────────────────────────────────

function FullReturnTab({ input }: { input: Form1040Input }) {
  const result = useMemo(() => computeForm1040(input), [input]);

  return (
    <div className="space-y-4">
      {/* Top-line summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'AGI', value: result.agi.agi },
          { label: 'Taxable Income', value: result.taxableIncome },
          { label: 'Total Tax', value: result.totalTax },
          { label: result.isRefund ? 'Refund' : 'Amount Due', value: Math.abs(result.refundOrAmountDue), highlight: true, isRefund: result.isRefund },
        ].map(item => (
          <div key={item.label} className={cn('rounded-lg border p-3', item.highlight && (item.isRefund ? 'border-green-300 bg-green-50/40' : 'border-red-300 bg-red-50/40'))}>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{item.label}</div>
            <div className={cn('text-xl font-mono font-semibold', item.highlight && item.isRefund ? 'text-green-700' : item.highlight ? 'text-red-700' : '')}>
              {item.highlight && item.isRefund ? '+' : ''}{fmt(item.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Effective vs marginal rate */}
      <div className="flex gap-4 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
        <span>Effective rate: <strong className="text-foreground">{(result.taxComp.effectiveRate * 100).toFixed(1)}%</strong></span>
        <span>Marginal rate: <strong className="text-foreground">{(result.taxComp.marginalRate * 100).toFixed(0)}%</strong></span>
        <span>SE tax: <strong className="text-foreground">{fmt(result.scheduleSE.selfEmploymentTax)}</strong></span>
        <span>Deduction: <strong className="text-foreground capitalize">{result.deduction.deductionType}</strong> ({fmt(result.deduction.chosenDeduction)})</span>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />Preparer Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {result.warnings.map((w, i) => (
              <p key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="shrink-0">⚠</span>{w}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Line sections */}
      {result.sections.map(section => (
        <ReturnSection
          key={section.title}
          title={section.title}
          lines={section.lines}
          subtotal={section.subtotal}
          defaultOpen={section.title.includes('Tax') || section.title.includes('Refund') || section.title.includes('Due')}
        />
      ))}

      {/* Schedule D summary */}
      {(result.scheduleD.combinedNetGainLoss !== 0 || input.capitalTransactions.length > 0) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Schedule D Summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            <div><span className="text-muted-foreground">Net Short-Term:</span> <span className="font-mono ml-1">{fmt(result.scheduleD.netShortTerm)}</span></div>
            <div><span className="text-muted-foreground">Net Long-Term:</span> <span className="font-mono ml-1">{fmt(result.scheduleD.netLongTerm)}</span></div>
            <div><span className="text-muted-foreground">Combined:</span> <span className="font-mono ml-1">{fmt(result.scheduleD.combinedNetGainLoss)}</span></div>
            {result.scheduleD.capitalLossCarryover > 0 && (
              <div className="col-span-3 text-amber-700 text-xs">
                Capital loss carryover to {input.taxYear + 1}: {fmt(result.scheduleD.capitalLossCarryover)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Form 8829 summary */}
      {result.form8829.allowableDeduction > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Form 8829 — Home Office</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Method: <strong>{result.form8829.method === 'simplified' ? 'Simplified ($5/sqft)' : 'Actual Expenses'}</strong></div>
            <div>Business use %: <strong>{(result.form8829.businessPercentage * 100).toFixed(1)}%</strong></div>
            <div>Allowable deduction: <strong>{fmt(result.form8829.allowableDeduction)}</strong></div>
            {result.form8829.carryoverToNextYear > 0 && (
              <div className="text-amber-700">Carryover to next year: {fmt(result.form8829.carryoverToNextYear)}</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: State Returns ───────────────────────────────────────────────────────

function StateReturnsTab({ input, stateConfigs }: {
  input: Form1040Input;
  stateConfigs: Array<{ stateCode: string; residencyStatus: 'full_year' | 'part_year' | 'nonresident'; incomeAllocationPct: number }>;
}) {
  const result1040 = useMemo(() => computeForm1040(input), [input]);

  if (stateConfigs.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No states configured. Add states in Year Configuration.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stateConfigs.map(sc => {
        const stateResult = computeStateReturn({
          stateCode: sc.stateCode,
          taxYear: input.taxYear,
          residencyStatus: sc.residencyStatus,
          incomeAllocationPct: sc.incomeAllocationPct,
          federalAGI: result1040.agi.agi,
          federalTaxableIncome: result1040.taxableIncome,
          w2Wages: input.w2WagesTotal,
          selfEmploymentIncome: input.scheduleCNetProfit,
          k1Income: input.k1OrdinaryIncome,
          capitalGains: Math.max(0, result1040.scheduleD.combinedNetGainLoss),
          interestAndDividends: input.taxableInterest + input.ordinaryDividends,
          retirementIncome: input.iRADistributions + input.pensionAnnuity,
          numDependents: input.qualifyingChildren.length + input.otherDependents.length,
          filingStatus: input.filingStatus === 'married_filing_jointly' ? 'married_filing_jointly'
            : input.filingStatus === 'head_of_household' ? 'head_of_household'
            : 'single',
          estimatedStatePayments: 0,
        });

        return (
          <Card key={sc.stateCode}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{stateResult.stateName} ({sc.stateCode})</CardTitle>
                <Badge variant="outline">{sc.residencyStatus.replace('_', ' ')}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {!hasStateIncomeTax(sc.stateCode) ? (
                <p className="text-sm text-green-700 flex items-center gap-2">
                  <Check className="w-4 h-4" />No state income tax
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">State AGI</div>
                    <div className="font-mono">{fmt(stateResult.stateAGI)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">State Taxable</div>
                    <div className="font-mono">{fmt(stateResult.stateTaxableIncome)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Est. State Tax</div>
                    <div className="font-mono font-semibold">{fmt(stateResult.estimatedStateTax)}</div>
                  </div>
                </div>
              )}

              {stateResult.warnings.map((w, i) => (
                <div key={i} className="text-xs text-amber-700 bg-amber-50 p-2 rounded flex gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{w}
                </div>
              ))}
              {stateResult.notes.map((n, i) => (
                <div key={i} className="text-xs text-muted-foreground flex gap-1">
                  <Info className="w-3 h-3 shrink-0 mt-0.5" />{n}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type TabKey = 'prerequisites' | 'inputs' | 'return' | 'states';

export function FederalReturnPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const {
    workflowState,
    canGenerateFederalReturn,
    transactions,
    incomeReconciliations,
    requiredForms,
    categories,
    documents,
  } = useWorkflow();

  const [tab, setTab]       = useState<TabKey>('prerequisites');
  const [form1040Input, setForm1040Input] = useState<Form1040Input | null>(null);

  // Auto-populate 1040 input from workflow data when tab is first opened
  const getOrInitInput = (): Form1040Input => {
    if (form1040Input) return form1040Input;
    const base = emptyForm1040Input(currentYear ?? new Date().getFullYear());

    // Pull Schedule C net profit from calculation engine
    const calcEngine = calculateScheduleC(transactions, categories, incomeReconciliations, currentYear!);
    const netProfitResult = getLineResult(calcEngine, '31');
    base.scheduleCNetProfit = netProfitResult?.value ?? 0;
    base.qbiIncome = base.scheduleCNetProfit;

    // Pull W-2 data from parsed documents
    const w2Docs = documents.filter(d => d.parsedData?.documentType === 'w2');
    base.w2WagesTotal = w2Docs.reduce((s, d) => s + ((d.parsedData?.amounts?.box1_wages ?? 0)), 0);
    base.w2WithholdingTotal = w2Docs.reduce((s, d) => s + ((d.parsedData?.amounts?.box2_federalWithholding ?? 0)), 0);

    // Pull 1099-INT
    const intDocs = documents.filter(d => d.parsedData?.documentType === '1099_int');
    base.taxableInterest = intDocs.reduce((s, d) => s + ((d.parsedData?.amounts?.box1 ?? 0)), 0);

    // Pull 1099-DIV
    const divDocs = documents.filter(d => d.parsedData?.documentType === '1099_div');
    base.ordinaryDividends = divDocs.reduce((s, d) => s + ((d.parsedData?.amounts?.box1a ?? 0)), 0);
    base.qualifiedDividends = divDocs.reduce((s, d) => s + ((d.parsedData?.amounts?.box1b ?? 0)), 0);

    return base;
  };

  const handleTabChange = (t: TabKey) => {
    if (t !== 'prerequisites' && !form1040Input) {
      setForm1040Input(getOrInitInput());
    }
    setTab(t);
  };

  if (!isYearSelected) {
    return (
      <div className="p-6">
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Tax Year Required</h3>
            <p className="text-sm text-muted-foreground mt-2">Please select a tax year from the Dashboard first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { gates, blockedReasons, federalStatus } = workflowState;
  const stateConfigs = (workflowState.stateStatuses ? Object.keys(workflowState.stateStatuses) : []).map(code => ({
    stateCode: code,
    residencyStatus: 'full_year' as const,
    incomeAllocationPct: 100,
  }));

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'prerequisites', label: 'Prerequisites',  icon: Check },
    { key: 'inputs',        label: '1040 Inputs',    icon: DollarSign },
    { key: 'return',        label: 'Full Return',    icon: FileText },
    { key: 'states',        label: 'State Returns',  icon: Building2 },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Federal Return</h1>
          <p className="text-muted-foreground mt-1 text-sm">Form 1040 and associated schedules for tax year {currentYear}</p>
        </div>
        <Badge variant="outline" className={cn('text-sm',
          federalStatus === 'ready'     && 'text-green-700 border-green-600',
          federalStatus === 'blocked'   && 'text-destructive border-destructive',
          federalStatus === 'finalized' && 'text-primary border-primary',
          federalStatus === 'locked'    && 'text-primary border-primary',
        )}>
          {federalStatus === 'locked' && <Lock className="w-3 h-3 mr-1" />}
          {federalStatus.charAt(0).toUpperCase() + federalStatus.slice(1)}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors',
                tab === t.key
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'prerequisites' && (
        <PrerequisitesTab
          gates={gates as unknown as Record<string, boolean>}
          blockedReasons={blockedReasons}
          requiredForms={requiredForms as Array<{ formName: string; jurisdiction: string; reason: string; isVerified: boolean }>}
          federalStatus={federalStatus}
        />
      )}

      {tab === 'inputs' && form1040Input && (
        <InputsTab
          input={form1040Input}
          onChange={patch => setForm1040Input(prev => prev ? { ...prev, ...patch } : prev)}
        />
      )}

      {tab === 'return' && (
        <>
          {!form1040Input && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Calculator className="w-8 h-8 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">Enter your return details on the 1040 Inputs tab first.</p>
              <Button variant="outline" onClick={() => handleTabChange('inputs')}>Go to 1040 Inputs</Button>
            </div>
          )}
          {form1040Input && <FullReturnTab input={form1040Input} />}
        </>
      )}

      {tab === 'states' && form1040Input && (
        <StateReturnsTab input={form1040Input} stateConfigs={stateConfigs} />
      )}

      {/* Generate button */}
      <div className="flex justify-end gap-4 pt-2 border-t">
        <Button
          size="lg"
          disabled={!canGenerateFederalReturn || !form1040Input}
          className="gap-2"
          onClick={() => handleTabChange('return')}
        >
          <Printer className="w-4 h-4" />
          {form1040Input ? 'View Full Return' : 'Generate Federal Return'}
        </Button>
      </div>

      {!canGenerateFederalReturn && (
        <p className="text-xs text-amber-600 text-right">Resolve all prerequisite issues before generating</p>
      )}

      {/* Traceability notice */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <Calculator className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Every line in the return includes its source document reference or calculation path.
              AI performs extraction only — no invented numbers or elections. For review and
              preparation purposes only. Not for direct e-file.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
