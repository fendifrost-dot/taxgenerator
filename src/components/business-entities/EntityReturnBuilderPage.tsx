/**
 * EntityReturnBuilderPage.tsx
 *
 * Full workflow for preparing business entity returns:
 *  - Step 1: Select entity type (S Corp, Partnership/LLLP, C Corp, etc.)
 *  - Step 2: Enter entity info and financial data
 *  - Step 3: Claude generates the complete return with K-1 summaries
 *
 * Supports: Form 1120-S, Form 1065, Form 1120
 */

import { useState } from 'react';
import {
  Building2, ChevronRight, Loader2, AlertTriangle, CheckCircle2,
  Plus, Trash2, Users, FileText, Info, ArrowLeft, Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  EntityType,
  EntityReturnInput,
  EntityReturnSummary,
  EntityOwner,
  EntityDeductionItem,
  ENTITY_LABELS,
  ENTITY_FORMS,
  PASS_THROUGH_ENTITIES,
} from '@/types/businessEntity';
import { buildEntityReturn, emptyEntityInput } from '@/lib/businessEntityBuilder';
import { useTaxYear } from '@/contexts/TaxYearContext';

// ─── Entity type picker ───────────────────────────────────────────────────────

const ENTITY_GROUPS: { label: string; types: EntityType[] }[] = [
  {
    label: 'Pass-Through Entities (Schedule K-1 to Owners)',
    types: ['s_corp', 'llc_s_corp', 'partnership', 'llc_partnership', 'llp', 'lllp'],
  },
  {
    label: 'Entity-Level Tax',
    types: ['c_corp'],
  },
];

const ENTITY_DESCRIPTIONS: Record<EntityType, string> = {
  schedule_c:      'Single owner, no separate entity filing',
  s_corp:          'Form 1120-S · Max 100 shareholders · Reasonable comp required',
  llc_s_corp:      'Form 1120-S · LLC with valid Form 2553 S election on file',
  partnership:     'Form 1065 · General and/or limited partners · GP subject to SE tax',
  llc_partnership: 'Form 1065 · Multi-member LLC taxed as partnership by default',
  llp:             'Form 1065 · LLP partners generally limited for SE tax purposes',
  lllp:            'Form 1065 · GP subject to SE tax · LP only on guaranteed payments',
  c_corp:          'Form 1120 · 21% flat rate · Double taxation on dividends',
};

interface EntityPickerProps {
  onSelect: (type: EntityType) => void;
}

function EntityPicker({ onSelect }: EntityPickerProps) {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">Business Entity Return</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Select the type of business entity to prepare the correct IRS return.
      </p>

      {ENTITY_GROUPS.map(group => (
        <div key={group.label}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {group.label}
          </h3>
          <div className="grid gap-2">
            {group.types.map(type => (
              <button
                key={type}
                onClick={() => onSelect(type)}
                className="w-full text-left p-4 rounded-lg border border-border hover:border-primary hover:bg-accent transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-sm group-hover:text-primary transition-colors">
                      {ENTITY_LABELS[type]}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {ENTITY_DESCRIPTIONS[type]}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Currency input helper ────────────────────────────────────────────────────

function CurrencyInput({
  label, value, onChange, placeholder,
}: { label: string; value: number; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          type="number"
          min={0}
          step={1}
          value={value === 0 ? '' : String(value)}
          onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          placeholder={placeholder ?? '0'}
          className="pl-7"
        />
      </div>
    </div>
  );
}

// ─── Owners editor ────────────────────────────────────────────────────────────

interface OwnersEditorProps {
  owners: EntityOwner[];
  entityType: EntityType;
  onChange: (owners: EntityOwner[]) => void;
}

function OwnersEditor({ owners, entityType, onChange }: OwnersEditorProps) {
  const isPartnership = ['partnership', 'llp', 'lllp', 'llc_partnership'].includes(entityType);
  const totalPct = owners.reduce((s, o) => s + o.ownershipPct, 0);

  const addOwner = () => {
    onChange([...owners, {
      id: `o_${Date.now()}`,
      name: '',
      ownershipPct: 0,
      isGeneralPartner: isPartnership ? false : undefined,
      isShareholder: !isPartnership ? true : undefined,
    }]);
  };

  const updateOwner = (idx: number, patch: Partial<EntityOwner>) => {
    const next = [...owners];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeOwner = (idx: number) => {
    onChange(owners.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{isPartnership ? 'Partners' : 'Shareholders'}</Label>
        {totalPct !== 100 && owners.length > 0 && (
          <span className="text-xs text-amber-600">
            Total: {totalPct}% (must equal 100%)
          </span>
        )}
        {totalPct === 100 && owners.length > 0 && (
          <span className="text-xs text-green-600">✓ 100%</span>
        )}
      </div>

      {owners.map((owner, idx) => (
        <div key={owner.id} className="flex gap-2 items-start p-3 rounded-lg border bg-muted/30">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={owner.name}
                onChange={e => updateOwner(idx, { name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Ownership %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                className="mt-1 h-8 text-sm"
                value={owner.ownershipPct === 0 ? '' : String(owner.ownershipPct)}
                onChange={e => updateOwner(idx, { ownershipPct: Number(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>
          </div>
          {isPartnership && (
            <div className="flex flex-col gap-1 pt-5">
              <button
                type="button"
                onClick={() => updateOwner(idx, { isGeneralPartner: !owner.isGeneralPartner })}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  owner.isGeneralPartner
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary'
                }`}
              >
                {owner.isGeneralPartner ? 'GP' : 'LP'}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => removeOwner(idx)}
            className="mt-5 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addOwner}>
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Add {isPartnership ? 'Partner' : 'Shareholder'}
      </Button>
    </div>
  );
}

// ─── Other deductions editor ─────────────────────────────────────────────────

interface DeductionsEditorProps {
  items: EntityDeductionItem[];
  onChange: (items: EntityDeductionItem[]) => void;
}

function OtherDeductionsEditor({ items, onChange }: DeductionsEditorProps) {
  const add = () => {
    onChange([...items, { category: '', description: '', amount: 0, formLine: '' }]);
  };

  const update = (idx: number, patch: Partial<EntityDeductionItem>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
          <Input
            className="h-8 text-sm"
            value={item.description}
            onChange={e => update(idx, { description: e.target.value })}
            placeholder="Description"
          />
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <Input
              type="number"
              min={0}
              className="h-8 text-sm pl-7"
              value={item.amount === 0 ? '' : String(item.amount)}
              onChange={e => update(idx, { amount: Number(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>
          <Input
            className="h-8 text-sm w-24"
            value={item.formLine ?? ''}
            onChange={e => update(idx, { formLine: e.target.value })}
            placeholder="Line ref"
          />
          <button onClick={() => remove(idx)} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Add Deduction
      </Button>
    </div>
  );
}

// ─── Data entry form ──────────────────────────────────────────────────────────

interface DataFormProps {
  input: EntityReturnInput;
  onChange: (patch: Partial<EntityReturnInput>) => void;
  onGenerate: () => void;
  generating: boolean;
}

function DataEntryForm({ input, onChange, onGenerate, generating }: DataFormProps) {
  const isPassThrough = PASS_THROUGH_ENTITIES.includes(input.entityType);
  const isSCorp = input.entityType === 's_corp' || input.entityType === 'llc_s_corp';
  const isPartnership = ['partnership', 'llp', 'lllp', 'llc_partnership'].includes(input.entityType);

  const netIncome = input.grossReceipts
    - input.returnsAndAllowances
    - input.costOfGoodsSold
    - input.compensation
    - input.salariesAndWages
    - input.repairs
    - input.badDebts
    - input.rents
    - input.taxesAndLicenses
    - input.interest
    - input.depreciation
    - input.advertising
    - input.pensionAndProfitSharing
    - input.benefitPrograms
    - input.otherDeductions.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Entity info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Entity Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Entity / Business Name</Label>
              <Input
                className="mt-1"
                value={input.entityName}
                onChange={e => onChange({ entityName: e.target.value })}
                placeholder="ABC Corporation"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">EIN (XX-XXXXXXX)</Label>
              <Input
                className="mt-1"
                value={input.ein}
                onChange={e => onChange({ ein: e.target.value })}
                placeholder="12-3456789"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">State of Formation</Label>
              <Input
                className="mt-1"
                value={input.stateOfFormation}
                onChange={e => onChange({ stateOfFormation: e.target.value })}
                placeholder="e.g. Delaware, Florida"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Accounting Method</Label>
              <div className="flex gap-2 mt-1">
                {(['cash', 'accrual'] as const).map(m => (
                  <Button
                    key={m}
                    type="button"
                    variant={input.accountingMethod === m ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onChange({ accountingMethod: m })}
                    className="capitalize"
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={input.isInitialReturn}
                onChange={e => onChange({ isInitialReturn: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Initial return</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={input.isFinalReturn}
                onChange={e => onChange({ isFinalReturn: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Final return</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Owners */}
      {isPassThrough && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              {isPartnership ? 'Partners' : 'Shareholders'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OwnersEditor
              owners={input.owners}
              entityType={input.entityType}
              onChange={owners => onChange({ owners })}
            />
          </CardContent>
        </Card>
      )}

      {/* Income */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Income</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <CurrencyInput
            label="Gross Receipts / Sales"
            value={input.grossReceipts}
            onChange={v => onChange({ grossReceipts: v })}
          />
          <CurrencyInput
            label="Returns & Allowances"
            value={input.returnsAndAllowances}
            onChange={v => onChange({ returnsAndAllowances: v })}
          />
          <CurrencyInput
            label="Cost of Goods Sold"
            value={input.costOfGoodsSold}
            onChange={v => onChange({ costOfGoodsSold: v })}
          />
        </CardContent>
      </Card>

      {/* Deductions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Deductions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <CurrencyInput
              label={isSCorp ? 'Officer Compensation (W-2)' : isPartnership ? 'Guaranteed Payments' : 'Compensation'}
              value={input.compensation}
              onChange={v => onChange({ compensation: v })}
            />
            <CurrencyInput
              label="Salaries & Wages (Employees)"
              value={input.salariesAndWages}
              onChange={v => onChange({ salariesAndWages: v })}
            />
            <CurrencyInput label="Repairs & Maintenance" value={input.repairs} onChange={v => onChange({ repairs: v })} />
            <CurrencyInput label="Bad Debts" value={input.badDebts} onChange={v => onChange({ badDebts: v })} />
            <CurrencyInput label="Rents" value={input.rents} onChange={v => onChange({ rents: v })} />
            <CurrencyInput label="Taxes & Licenses" value={input.taxesAndLicenses} onChange={v => onChange({ taxesAndLicenses: v })} />
            <CurrencyInput label="Interest" value={input.interest} onChange={v => onChange({ interest: v })} />
            <CurrencyInput label="Depreciation" value={input.depreciation} onChange={v => onChange({ depreciation: v })} />
            <CurrencyInput label="Advertising" value={input.advertising} onChange={v => onChange({ advertising: v })} />
            <CurrencyInput label="Pension / Profit-Sharing Plans" value={input.pensionAndProfitSharing} onChange={v => onChange({ pensionAndProfitSharing: v })} />
            <CurrencyInput label="Employee Benefit Programs" value={input.benefitPrograms} onChange={v => onChange({ benefitPrograms: v })} />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Other Deductions</Label>
            <OtherDeductionsEditor
              items={input.otherDeductions}
              onChange={items => onChange({ otherDeductions: items })}
            />
          </div>
        </CardContent>
      </Card>

      {/* S Corp specific */}
      {isSCorp && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-600" />
              S Corporation — Additional Data
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <CurrencyInput
              label="Reasonable Compensation (W-2 total to shareholders)"
              value={input.reasonableCompensation ?? 0}
              onChange={v => onChange({ reasonableCompensation: v })}
            />
            <CurrencyInput
              label="Distributions to Shareholders"
              value={input.distributionsToShareholders ?? 0}
              onChange={v => onChange({ distributionsToShareholders: v })}
            />
            <CurrencyInput
              label="Shareholder Loans to Corp"
              value={input.shareholderLoans ?? 0}
              onChange={v => onChange({ shareholderLoans: v })}
            />
          </CardContent>
        </Card>
      )}

      {/* Partnership specific */}
      {isPartnership && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600" />
              Partnership — Additional Data
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <CurrencyInput
              label="Guaranteed Payments to Partners"
              value={input.guaranteedPayments ?? 0}
              onChange={v => onChange({ guaranteedPayments: v })}
            />
            <CurrencyInput
              label="Partner Distributions"
              value={input.partnerDistributions ?? 0}
              onChange={v => onChange({ partnerDistributions: v })}
            />
            <CurrencyInput
              label="Self-Rental Income"
              value={input.selfRentals ?? 0}
              onChange={v => onChange({ selfRentals: v })}
            />
          </CardContent>
        </Card>
      )}

      {/* C Corp specific */}
      {input.entityType === 'c_corp' && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-purple-600" />
              C Corporation — Additional Data
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <CurrencyInput
              label="Dividends Paid to Shareholders (not deductible)"
              value={input.dividendsPaid ?? 0}
              onChange={v => onChange({ dividendsPaid: v })}
            />
          </CardContent>
        </Card>
      )}

      {/* Net income preview */}
      <div className="rounded-lg bg-muted/40 border p-4 flex justify-between items-center">
        <span className="text-sm font-medium">Estimated Ordinary Business Income</span>
        <span className={`text-lg font-mono font-semibold ${netIncome < 0 ? 'text-destructive' : 'text-green-700'}`}>
          {netIncome < 0 ? '-' : ''}${Math.abs(netIncome).toLocaleString()}
        </span>
      </div>

      {/* Preparer notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Preparer Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            value={input.preparerNotes}
            onChange={e => onChange({ preparerNotes: e.target.value })}
            placeholder="Special elections, notes on specific items, prior-year adjustments, Section 754 election status, etc."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={onGenerate}
          disabled={generating || !input.entityName || !input.ein}
        >
          {generating
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating Return…</>
            : <><Sparkles className="w-4 h-4 mr-2" />Generate {ENTITY_FORMS[input.entityType]} Return</>
          }
        </Button>
      </div>
    </div>
  );
}

// ─── Return summary view ──────────────────────────────────────────────────────

interface SummaryViewProps {
  summary: EntityReturnSummary;
  onReset: () => void;
}

function ReturnSummaryView({ summary, onReset }: SummaryViewProps) {
  const isPassThrough = PASS_THROUGH_ENTITIES.includes(summary.entityType);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold">{summary.formName} — {summary.taxYear}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {summary.entityName} · EIN {summary.ein}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          New Return
        </Button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Gross Income</div>
          <div className="text-2xl font-mono font-semibold">${summary.grossIncome.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Deductions</div>
          <div className="text-2xl font-mono font-semibold">${summary.totalDeductions.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            {summary.entityTaxLiability !== undefined ? 'Entity Tax Due' : 'Ordinary Income'}
          </div>
          <div className={`text-2xl font-mono font-semibold ${
            summary.ordinaryBusinessIncome < 0 ? 'text-destructive' : 'text-green-700'
          }`}>
            {summary.ordinaryBusinessIncome < 0 ? '(' : ''}
            ${Math.abs(summary.entityTaxLiability ?? summary.ordinaryBusinessIncome).toLocaleString()}
            {summary.ordinaryBusinessIncome < 0 ? ')' : ''}
          </div>
        </div>
      </div>

      {/* Estimated values warning */}
      {summary.estimatedValuesNote && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span><strong>Estimated values:</strong> {summary.estimatedValuesNote}</span>
        </div>
      )}

      {/* Warning flags */}
      {summary.warningFlags.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" />
              Compliance Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {summary.warningFlags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-red-700">
                <span className="shrink-0 mt-0.5">⚠</span>
                {flag}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Preparer summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Preparer Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">{summary.preparerSummary}</p>
        </CardContent>
      </Card>

      {/* Line sections */}
      {summary.sections.map(section => (
        <Card key={section.title}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{section.title}</CardTitle>
              {section.subtotal !== undefined && (
                <span className="text-sm font-mono font-semibold">${section.subtotal.toLocaleString()}</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {section.lines.map((line, idx) => (
                <div key={idx} className="flex items-start justify-between gap-4 py-1">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-xs text-muted-foreground shrink-0 w-10">{line.lineNumber}</span>
                    <div className="min-w-0">
                      <span className="text-sm">{line.description}</span>
                      {line.isEstimated && (
                        <Badge variant="secondary" className="ml-2 text-xs">est.</Badge>
                      )}
                      {line.note && (
                        <p className="text-xs text-muted-foreground mt-0.5">{line.note}</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-sm font-mono shrink-0 ${line.amount < 0 ? 'text-destructive' : ''}`}>
                    {line.amount < 0 ? `(${Math.abs(line.amount).toLocaleString()})` : `$${line.amount.toLocaleString()}`}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* K-1 summaries */}
      {isPassThrough && summary.k1Summaries && summary.k1Summaries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Schedule K-1 — Owner Allocations
          </h3>
          <div className="space-y-3">
            {summary.k1Summaries.map((k1, idx) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{k1.ownerName}</CardTitle>
                    <Badge variant="outline">{k1.ownershipPct}% ownership</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Ordinary Income:</span>
                      <span className={`ml-2 font-mono ${k1.ordinaryIncome < 0 ? 'text-destructive' : ''}`}>
                        ${k1.ordinaryIncome.toLocaleString()}
                      </span>
                    </div>
                    {k1.guaranteedPayments !== undefined && k1.guaranteedPayments !== null && (
                      <div>
                        <span className="text-muted-foreground">Guaranteed Payments:</span>
                        <span className="ml-2 font-mono">${k1.guaranteedPayments.toLocaleString()}</span>
                      </div>
                    )}
                    {k1.selfEmploymentIncome !== undefined && k1.selfEmploymentIncome !== null && (
                      <div>
                        <span className="text-muted-foreground">SE Income:</span>
                        <span className="ml-2 font-mono">${k1.selfEmploymentIncome.toLocaleString()}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Distributions:</span>
                      <span className="ml-2 font-mono">${k1.distributions.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Basis Impact:</span>
                      <span className={`ml-2 font-mono ${k1.basisImpact < 0 ? 'text-destructive' : 'text-green-700'}`}>
                        {k1.basisImpact >= 0 ? '+' : ''}${k1.basisImpact.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {k1.k1Items.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-0.5">
                        {k1.k1Items.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{item.box}: {item.description}</span>
                            <span className="font-mono">${item.amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Missing documents */}
      {summary.missingDocuments.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-700">Missing Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {summary.missingDocuments.map((doc, i) => (
              <div key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span>•</span>{doc}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommended actions */}
      {summary.recommendedActions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recommended Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {summary.recommendedActions.map((action, i) => (
              <div key={i} className="text-sm flex items-start gap-2">
                <span className="text-primary shrink-0">→</span>
                {action}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground text-center pb-4">
        Generated by {summary.claudeModel} · {new Date(summary.generatedAt).toLocaleString()}
        · For preparer review only — not for e-file
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Step = 'pick_entity' | 'data_entry' | 'generating' | 'result';

export function EntityReturnBuilderPage() {
  const { currentYear } = useTaxYear();

  const [step,       setStep]       = useState<Step>('pick_entity');
  const [entityType, setEntityType] = useState<EntityType | null>(null);
  const [input,      setInput]      = useState<EntityReturnInput | null>(null);
  const [summary,    setSummary]    = useState<EntityReturnSummary | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const handlePickEntity = (type: EntityType) => {
    setEntityType(type);
    setInput(emptyEntityInput(type, currentYear ?? new Date().getFullYear()));
    setStep('data_entry');
  };

  const handlePatch = (patch: Partial<EntityReturnInput>) => {
    setInput(prev => prev ? { ...prev, ...patch } : prev);
  };

  const handleGenerate = async () => {
    if (!input) return;
    setError(null);
    setStep('generating');

    const result = await buildEntityReturn(input);

    if (result.error || !result.summary) {
      setError(result.error ?? 'Unknown error generating return');
      setStep('data_entry');
      return;
    }

    setSummary(result.summary);
    setStep('result');
  };

  const handleReset = () => {
    setStep('pick_entity');
    setEntityType(null);
    setInput(null);
    setSummary(null);
    setError(null);
  };

  return (
    <div className="min-h-screen">
      {/* Breadcrumb */}
      <div className="border-b px-6 py-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="w-4 h-4" />
        <span>Business Entity Returns</span>
        {entityType && (
          <>
            <ChevronRight className="w-3 h-3" />
            <span>{ENTITY_LABELS[entityType]}</span>
          </>
        )}
        {step === 'result' && (
          <>
            <ChevronRight className="w-3 h-3" />
            <span>Return Summary</span>
          </>
        )}
        {step !== 'pick_entity' && (
          <button
            onClick={handleReset}
            className="ml-auto text-xs hover:text-foreground transition-colors"
          >
            ← Start over
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Steps */}
      {step === 'pick_entity' && (
        <EntityPicker onSelect={handlePickEntity} />
      )}

      {step === 'data_entry' && input && (
        <DataEntryForm
          input={input}
          onChange={handlePatch}
          onGenerate={handleGenerate}
          generating={false}
        />
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center gap-4 min-h-[60vh]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            Claude is preparing your {entityType ? ENTITY_FORMS[entityType] : 'business'} return…
          </p>
          <p className="text-xs text-muted-foreground">This may take 20–40 seconds</p>
        </div>
      )}

      {step === 'result' && summary && (
        <ReturnSummaryView summary={summary} onReset={handleReset} />
      )}
    </div>
  );
}
