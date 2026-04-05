import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileEdit,
  ChevronRight,
  ChevronLeft,
  Clock,
  ExternalLink,
  Download,
  Info,
} from 'lucide-react';
import {
  AmendmentYear,
  AmendedReturn,
  AmendmentChange,
  AmendmentChangeType,
  FilingStatus,
  CHANGE_TEMPLATES,
  ChangeTemplate,
  getAmendmentEligibility,
  getEligibleYears,
  createAmendedReturn,
  addChange,
  recalcTotals,
  generateExplanationStatement,
  generateFilingInstructions,
  getStateAmendmentInfo,
} from '@/lib/amendmentEngine';
import { cn } from '@/lib/utils';

// ─── Step 1: Year & Eligibility ──────────────────────────────────────────────

function Step1YearSelect({
  onNext,
}: {
  onNext: (year: AmendmentYear, taxpayerName: string, ssn4: string, filingDate: string, filingStatus: FilingStatus, state: string) => void;
}) {
  const [year, setYear] = useState<AmendmentYear | null>(null);
  const [taxpayerName, setTaxpayerName] = useState('');
  const [ssn4, setSsn4] = useState('');
  const [filingDate, setFilingDate] = useState('');
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [stateCode, setStateCode] = useState('');

  const eligibility = year ? getAmendmentEligibility(year) : null;

  const canProceed = year && taxpayerName.trim() && ssn4.length === 4 && filingDate && eligibility?.eligible;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Step 1: Select Year & Verify Eligibility</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the tax year to amend and confirm the original return information.
        </p>
      </div>

      {/* Year selector */}
      <div className="grid grid-cols-5 gap-2">
        {getEligibleYears().map(y => {
          const elig = getAmendmentEligibility(y);
          const isSelected = year === y;
          return (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                'p-3 rounded-lg border text-center transition-all',
                isSelected
                  ? 'border-sidebar-primary bg-sidebar-primary/10 ring-1 ring-sidebar-primary'
                  : 'border-border hover:border-sidebar-primary/50 hover:bg-muted/50',
              )}
            >
              <div className="font-mono font-semibold">{y}</div>
              <div className={cn(
                'text-xs mt-0.5',
                elig.refundStatuteOpen ? 'text-status-success' : 'text-status-error'
              )}>
                {elig.refundStatuteOpen ? 'Refund OK' : 'No Refund'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Eligibility details */}
      {eligibility && (
        <Card className={cn(
          'border',
          eligibility.refundStatuteOpen ? 'border-status-success/30 bg-status-success/5' : 'border-status-warning/30 bg-status-warning/5'
        )}>
          <CardContent className="py-4 space-y-2">
            {eligibility.notes.map((note, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>{note}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Taxpayer info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Taxpayer Name (as on original return)</label>
          <Input
            placeholder="John Smith"
            value={taxpayerName}
            onChange={e => setTaxpayerName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">SSN Last 4 Digits</label>
          <Input
            placeholder="1234"
            maxLength={4}
            value={ssn4}
            onChange={e => setSsn4(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Original Filing Date</label>
          <Input
            type="date"
            value={filingDate}
            onChange={e => setFilingDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Original Filing Status</label>
          <Select value={filingStatus} onValueChange={v => setFilingStatus(v as FilingStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="married_filing_jointly">Married Filing Jointly</SelectItem>
              <SelectItem value="married_filing_separately">Married Filing Separately</SelectItem>
              <SelectItem value="head_of_household">Head of Household</SelectItem>
              <SelectItem value="qualifying_surviving_spouse">Qualifying Surviving Spouse</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">State of Residence</label>
          <Input
            placeholder="IL"
            maxLength={2}
            value={stateCode}
            onChange={e => setStateCode(e.target.value.toUpperCase())}
          />
        </div>
      </div>

      <Button
        disabled={!canProceed}
        onClick={() => {
          if (year && canProceed) {
            onNext(year, taxpayerName.trim(), ssn4, filingDate, filingStatus, stateCode);
          }
        }}
        className="gap-2"
      >
        Continue to Changes
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Step 2: Add Changes ─────────────────────────────────────────────────────

function ChangeForm({
  onAdd,
  onCancel,
}: {
  onAdd: (change: Omit<AmendmentChange, 'id' | 'difference'>) => void;
  onCancel: () => void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<ChangeTemplate | null>(null);
  const [changeType, setChangeType] = useState<AmendmentChangeType>('income_addition');
  const [formLine, setFormLine] = useState('');
  const [description, setDescription] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [amendedValue, setAmendedValue] = useState('');
  const [reason, setReason] = useState('');
  const [supportingDocs, setSupportingDocs] = useState('');

  const applyTemplate = (t: ChangeTemplate) => {
    setSelectedTemplate(t);
    setChangeType(t.changeType);
    setFormLine(t.suggestedFormLine);
    setDescription(t.label);
    setReason(t.commonReasons[0] ?? '');
  };

  const canSubmit = description && formLine && originalValue && amendedValue && reason;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onAdd({
      changeType,
      formLine,
      description,
      originalValue: parseFloat(originalValue) || 0,
      amendedValue: parseFloat(amendedValue) || 0,
      reason,
      supportingDocs: supportingDocs.split(',').map(s => s.trim()).filter(Boolean),
    });
  };

  return (
    <Card className="border-sidebar-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Add a Change</CardTitle>
        <CardDescription>Start from a template or enter details manually.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Templates */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Quick-Start Templates
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {CHANGE_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className={cn(
                  'text-left text-xs p-2 rounded border transition-colors',
                  selectedTemplate?.id === t.id
                    ? 'border-sidebar-primary bg-sidebar-primary/10'
                    : 'border-border hover:border-sidebar-primary/40 hover:bg-muted/50'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Manual form */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium mb-1 block">Description of Change</label>
            <Input
              placeholder="e.g. W-2 wages from Employer X not included on original return"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium mb-1 block">Form / Line Reference</label>
            <Input
              placeholder="e.g. 1040 Line 1z (Total Wages)"
              value={formLine}
              onChange={e => setFormLine(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Original Amount ($)</label>
            <Input
              type="number"
              placeholder="0.00"
              value={originalValue}
              onChange={e => setOriginalValue(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Corrected Amount ($)</label>
            <Input
              type="number"
              placeholder="0.00"
              value={amendedValue}
              onChange={e => setAmendedValue(e.target.value)}
            />
          </div>
          {originalValue && amendedValue && (
            <div className="col-span-2">
              <div className={cn(
                'text-sm font-mono px-3 py-1.5 rounded',
                parseFloat(amendedValue) > parseFloat(originalValue)
                  ? 'bg-status-error/10 text-status-error'
                  : 'bg-status-success/10 text-status-success'
              )}>
                Change: {parseFloat(amendedValue) > parseFloat(originalValue) ? '+' : ''}
                ${(parseFloat(amendedValue) - parseFloat(originalValue)).toFixed(2)}
                {parseFloat(amendedValue) > parseFloat(originalValue) ? ' (increases tax)' : ' (decreases tax / increases refund)'}
              </div>
            </div>
          )}
          <div className="col-span-2">
            <label className="text-xs font-medium mb-1 block">Reason for Change</label>
            <Textarea
              placeholder="Explain why this change is being made (this goes into the Form 1040-X explanation statement)"
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium mb-1 block">Supporting Documents (comma-separated)</label>
            <Input
              placeholder="e.g. Corrected W-2 from ABC Corp, Bank statement March 2024"
              value={supportingDocs}
              onChange={e => setSupportingDocs(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={!canSubmit} size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Change
          </Button>
          <Button onClick={onCancel} variant="ghost" size="sm">Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Step2Changes({
  amendment,
  onAddChange,
  onRemoveChange,
  onSetOriginals,
  onNext,
  onBack,
}: {
  amendment: AmendedReturn;
  onAddChange: (change: Omit<AmendmentChange, 'id' | 'difference'>) => void;
  onRemoveChange: (id: string) => void;
  onSetOriginals: (o: { agi: number; taxableIncome: number; taxLiability: number; withholding: number; refundOrOwed: number }) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [origAGI, setOrigAGI] = useState('');
  const [origTaxable, setOrigTaxable] = useState('');
  const [origTax, setOrigTax] = useState('');
  const [origWithholding, setOrigWithholding] = useState('');
  const [origRefund, setOrigRefund] = useState('');

  const handleApplyOriginals = () => {
    onSetOriginals({
      agi: parseFloat(origAGI) || 0,
      taxableIncome: parseFloat(origTaxable) || 0,
      taxLiability: parseFloat(origTax) || 0,
      withholding: parseFloat(origWithholding) || 0,
      refundOrOwed: parseFloat(origRefund) || 0,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Step 2: Original Return Figures & Changes</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter numbers from the original return, then add each change being made.
        </p>
      </div>

      {/* Original return figures */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Original Return Amounts</CardTitle>
          <CardDescription>From the original Form 1040 as filed. These populate Form 1040-X Column A.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Adjusted Gross Income (Line 11)', value: origAGI, setter: setOrigAGI },
              { label: 'Taxable Income (Line 15)', value: origTaxable, setter: setOrigTaxable },
              { label: 'Total Tax (Line 24)', value: origTax, setter: setOrigTax },
              { label: 'Total Withholding (Line 25d)', value: origWithholding, setter: setOrigWithholding },
              { label: 'Refund (+) or Owed (−) Amount', value: origRefund, setter: setOrigRefund },
            ].map(field => (
              <div key={field.label}>
                <label className="text-xs font-medium mb-1 block">{field.label}</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={field.value}
                  onChange={e => field.setter(e.target.value)}
                />
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={handleApplyOriginals}
          >
            Apply Originals
          </Button>
        </CardContent>
      </Card>

      {/* Current net change summary */}
      {amendment.changes.length > 0 && (
        <Card className={cn(
          'border',
          amendment.netChangeRefundOrOwed > 0
            ? 'border-status-success/30 bg-status-success/5'
            : amendment.netChangeRefundOrOwed < 0
            ? 'border-status-error/30 bg-status-error/5'
            : 'border-border'
        )}>
          <CardContent className="py-3">
            <div className="grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <div className="text-xs text-muted-foreground">AGI Change</div>
                <div className="font-mono font-semibold">${(amendment.amendedAGI - amendment.originalAGI).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Tax Change</div>
                <div className="font-mono font-semibold">${(amendment.amendedTaxLiability - amendment.originalTaxLiability).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {amendment.netChangeRefundOrOwed >= 0 ? '✓ Additional Refund' : '⚠ Additional Tax Due'}
                </div>
                <div className={cn(
                  'font-mono font-semibold',
                  amendment.netChangeRefundOrOwed > 0 ? 'text-status-success' : 'text-status-error'
                )}>
                  ${Math.abs(amendment.netChangeRefundOrOwed).toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Change list */}
      {amendment.changes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Changes ({amendment.changes.length})
          </div>
          {amendment.changes.map(c => (
            <Card key={c.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{c.description}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.formLine}</div>
                    <div className="flex gap-4 mt-1.5 text-xs font-mono">
                      <span>Was: ${c.originalValue.toLocaleString()}</span>
                      <span>→</span>
                      <span>Now: ${c.amendedValue.toLocaleString()}</span>
                      <span className={cn(c.difference >= 0 ? 'text-status-error' : 'text-status-success')}>
                        ({c.difference >= 0 ? '+' : ''}${c.difference.toLocaleString()})
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 italic">{c.reason}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-status-error"
                    onClick={() => onRemoveChange(c.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add change form */}
      {showAddForm ? (
        <ChangeForm
          onAdd={change => {
            onAddChange(change);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="w-4 h-4" />
          Add a Change
        </Button>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={amendment.changes.length === 0}
          className="gap-2"
        >
          Review & Generate
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Review & Export ─────────────────────────────────────────────────

function Step3Review({
  amendment,
  stateCode,
  onBack,
  onStartNew,
}: {
  amendment: AmendedReturn;
  stateCode: string;
  onBack: () => void;
  onStartNew: () => void;
}) {
  const explanation = generateExplanationStatement(amendment);
  const instructions = generateFilingInstructions(amendment, stateCode);
  const stateInfo = getStateAmendmentInfo(stateCode);

  const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Step 3: Review & Generate Amendment Package</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review the summary, then download your amendment documents.
        </p>
      </div>

      {/* Net change summary */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Tax Year', value: String(amendment.taxYear) },
          { label: 'Taxpayer', value: amendment.taxpayerName },
          { label: 'Original AGI', value: `$${amendment.originalAGI.toLocaleString()}` },
          { label: 'Amended AGI', value: `$${amendment.amendedAGI.toLocaleString()}` },
          { label: 'Original Tax', value: `$${amendment.originalTaxLiability.toLocaleString()}` },
          { label: 'Amended Tax', value: `$${amendment.amendedTaxLiability.toLocaleString()}` },
          { label: 'Original Refund / (Owed)', value: `$${amendment.originalRefundOrOwed.toLocaleString()}` },
          { label: 'Amended Refund / (Owed)', value: `$${amendment.amendedRefundOrOwed.toLocaleString()}` },
        ].map(row => (
          <div key={row.label} className="flex justify-between text-sm border-b pb-1.5">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-mono font-medium">{row.value}</span>
          </div>
        ))}
      </div>

      <Card className={cn(
        'border-2',
        amendment.netChangeRefundOrOwed > 0
          ? 'border-status-success bg-status-success/5'
          : amendment.netChangeRefundOrOwed < 0
          ? 'border-status-error bg-status-error/5'
          : 'border-border'
      )}>
        <CardContent className="py-4 text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Net Result</div>
          <div className={cn(
            'text-3xl font-mono font-bold mt-1',
            amendment.netChangeRefundOrOwed > 0 ? 'text-status-success' : 'text-status-error'
          )}>
            {amendment.netChangeRefundOrOwed > 0 ? '+' : ''}${amendment.netChangeRefundOrOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {amendment.netChangeRefundOrOwed > 0
              ? 'Additional refund expected'
              : amendment.netChangeRefundOrOwed < 0
              ? 'Additional tax owed — include payment with Form 1040-X'
              : 'No change in refund or balance due'}
          </div>
        </CardContent>
      </Card>

      {/* IRS 1040-X Download */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Required Forms</h3>
        <div className="space-y-2">
          <Card className="border-sidebar-primary/20">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Form 1040-X</div>
                <div className="text-xs text-muted-foreground">Amended U.S. Individual Income Tax Return</div>
              </div>
              <a
                href="https://www.irs.gov/pub/irs-pdf/f1040x.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sidebar-primary text-sidebar-primary-foreground rounded hover:bg-sidebar-primary/90"
              >
                <Download className="w-3 h-3" />
                Download from IRS.gov
              </a>
            </CardContent>
          </Card>
          {stateInfo && stateInfo.formName !== 'No state income tax' && (
            <Card className="border-dashed">
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{stateInfo.formName} — {stateInfo.stateName}</div>
                  <div className="text-xs text-muted-foreground">{stateInfo.notes} Deadline: {stateInfo.deadline}</div>
                </div>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${stateInfo.stateName} ${stateInfo.formName} amended tax return download`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded hover:bg-accent"
                >
                  <ExternalLink className="w-3 h-3" />
                  Find State Form
                </a>
              </CardContent>
            </Card>
          )}
          {stateInfo && stateInfo.formName === 'No state income tax' && (
            <Card className="border-dashed opacity-60">
              <CardContent className="py-3 px-4">
                <div className="text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-status-success inline mr-1" />
                  {stateInfo.stateName} has no individual income tax — no state amendment required.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Generated documents */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Generated Amendment Documents
        </h3>
        <div className="space-y-2">
          <Card>
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Explanation Statement (Part III)</div>
                <div className="text-xs text-muted-foreground">Copy this into Form 1040-X Part III, or attach as a separate statement</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => downloadText(explanation, `1040X_Explanation_${amendment.taxYear}.txt`)}
              >
                <Download className="w-3 h-3" />
                Download
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Filing Instructions</div>
                <div className="text-xs text-muted-foreground">Step-by-step mailing guide with addresses and tracking info</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => downloadText(instructions.join('\n'), `1040X_Filing_Instructions_${amendment.taxYear}.txt`)}
              >
                <Download className="w-3 h-3" />
                Download
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Explanation preview */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Explanation Statement Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground leading-relaxed">
            {explanation}
          </pre>
        </CardContent>
      </Card>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Changes
        </Button>
        <Button onClick={onStartNew} variant="outline" className="gap-2">
          <FileEdit className="w-4 h-4" />
          Start New Amendment
        </Button>
      </div>
    </div>
  );
}

// ─── Main Amendment Page ─────────────────────────────────────────────────────

export function AmendmentPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amendment, setAmendment] = useState<AmendedReturn | null>(null);
  const [stateCode, setStateCode] = useState('');

  const handleStep1Next = (
    year: AmendmentYear,
    taxpayerName: string,
    ssn4: string,
    filingDate: string,
    filingStatus: FilingStatus,
    state: string
  ) => {
    const newAmendment = createAmendedReturn(year, taxpayerName, ssn4, filingDate, filingStatus);
    setAmendment(newAmendment);
    setStateCode(state);
    setStep(2);
  };

  const handleAddChange = (change: Omit<AmendmentChange, 'id' | 'difference'>) => {
    if (!amendment) return;
    setAmendment(prev => prev ? addChange(prev, change) : prev);
  };

  const handleRemoveChange = (id: string) => {
    if (!amendment) return;
    setAmendment(prev => prev ? { ...prev, changes: prev.changes.filter(c => c.id !== id) } : prev);
  };

  const handleSetOriginals = (o: { agi: number; taxableIncome: number; taxLiability: number; withholding: number; refundOrOwed: number }) => {
    if (!amendment) return;
    setAmendment(prev => prev ? recalcTotals(prev, o) : prev);
  };

  const handleReset = () => {
    setAmendment(null);
    setStateCode('');
    setStep(1);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Amendment Center</h1>
        <p className="text-muted-foreground mt-1">
          Amend any return from 2020–2024. AI-assisted Form 1040-X preparation with state amendment guidance.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: 'Year & Eligibility' },
          { n: 2, label: 'Changes' },
          { n: 3, label: 'Review & Generate' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-border" />}
            <div className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              step === s.n ? 'text-sidebar-primary' : step > s.n ? 'text-status-success' : 'text-muted-foreground'
            )}>
              <div className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono',
                step === s.n ? 'bg-sidebar-primary text-sidebar-primary-foreground' :
                step > s.n ? 'bg-status-success text-white' : 'bg-muted'
              )}>
                {step > s.n ? <CheckCircle2 className="w-3 h-3" /> : s.n}
              </div>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <Separator />

      {step === 1 && <Step1YearSelect onNext={handleStep1Next} />}
      {step === 2 && amendment && (
        <Step2Changes
          amendment={amendment}
          onAddChange={handleAddChange}
          onRemoveChange={handleRemoveChange}
          onSetOriginals={handleSetOriginals}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && amendment && (
        <Step3Review
          amendment={amendment}
          stateCode={stateCode}
          onBack={() => setStep(2)}
          onStartNew={handleReset}
        />
      )}
    </div>
  );
}
