import { useState } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle,
  Mail,
  Download,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Info,
  Send,
  Sparkles,
  Star,
  DollarSign,
  Zap,
  ShieldCheck,
  ThumbsUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { buildTxf, buildTurboTaxCheatSheet, TxfExportInput } from '@/lib/txfExport';
import {
  ClientFilingProfile,
  recommendFilingPath,
  FilingRecommendation,
  RecommendationResult,
  FilingPath,
  stateHasIncomeTax,
} from '@/lib/filingRecommendation';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ─── IRS Form Catalog ────────────────────────────────────────────────────────

interface IRSForm {
  formId: string;
  name: string;
  description: string;
  url: string;
  required: boolean;
  condition?: string;
}

function getRequiredForms(
  hasScheduleC: boolean,
  hasDividends: boolean,
  hasInterest: boolean,
  hasCapGains: boolean,
  hasRetirement: boolean,
  hasEducationCredit: boolean,
  hasQBI: boolean,
  hasForeignIncome: boolean,
  stateCode?: string
): IRSForm[] {
  const forms: IRSForm[] = [
    {
      formId: '1040',
      name: 'Form 1040',
      description: 'U.S. Individual Income Tax Return — main federal return',
      url: 'https://www.irs.gov/pub/irs-pdf/f1040.pdf',
      required: true,
    },
    {
      formId: '1040-instructions',
      name: 'Form 1040 Instructions',
      description: 'Line-by-line filing instructions',
      url: 'https://www.irs.gov/pub/irs-pdf/i1040gi.pdf',
      required: true,
    },
  ];

  if (hasScheduleC) {
    forms.push({
      formId: 'sch-c',
      name: 'Schedule C',
      description: 'Profit or Loss from Business (Sole Proprietorship)',
      url: 'https://www.irs.gov/pub/irs-pdf/f1040sc.pdf',
      required: true,
      condition: 'Self-employment / freelance income present',
    });
    forms.push({
      formId: 'sch-se',
      name: 'Schedule SE',
      description: 'Self-Employment Tax',
      url: 'https://www.irs.gov/pub/irs-pdf/f1040sse.pdf',
      required: true,
      condition: 'Net profit on Schedule C > $400',
    });
  }

  if (hasDividends || hasInterest) {
    forms.push({
      formId: 'sch-b',
      name: 'Schedule B',
      description: 'Interest and Ordinary Dividends (required if interest/dividends > $1,500)',
      url: 'https://www.irs.gov/pub/irs-pdf/f1040sb.pdf',
      required: hasDividends || hasInterest,
      condition: 'Interest or dividend income present',
    });
  }

  if (hasCapGains) {
    forms.push({
      formId: 'sch-d',
      name: 'Schedule D + Form 8949',
      description: 'Capital Gains and Losses; Sales and Other Dispositions',
      url: 'https://www.irs.gov/pub/irs-pdf/f1040sd.pdf',
      required: true,
      condition: 'Investment sales / capital gains present',
    });
    forms.push({
      formId: 'f8949',
      name: 'Form 8949',
      description: 'Sales and Other Dispositions of Capital Assets',
      url: 'https://www.irs.gov/pub/irs-pdf/f8949.pdf',
      required: true,
      condition: 'Investment sales present',
    });
  }

  if (hasRetirement) {
    forms.push({
      formId: 'f5329',
      name: 'Form 5329',
      description: 'Additional Taxes on Qualified Plans — required if early distribution (Code 1)',
      url: 'https://www.irs.gov/pub/irs-pdf/f5329.pdf',
      required: false,
      condition: 'Only if early distribution penalty applies',
    });
  }

  if (hasEducationCredit) {
    forms.push({
      formId: 'f8863',
      name: 'Form 8863',
      description: 'Education Credits (American Opportunity and Lifetime Learning)',
      url: 'https://www.irs.gov/pub/irs-pdf/f8863.pdf',
      required: true,
      condition: 'Education tax credit claimed',
    });
  }

  if (hasQBI) {
    forms.push({
      formId: 'f8995',
      name: 'Form 8995',
      description: 'Qualified Business Income (QBI) Deduction — Section 199A',
      url: 'https://www.irs.gov/pub/irs-pdf/f8995.pdf',
      required: true,
      condition: 'Self-employment / pass-through business income present',
    });
  }

  if (hasForeignIncome) {
    forms.push({
      formId: 'f2555',
      name: 'Form 2555',
      description: 'Foreign Earned Income Exclusion',
      url: 'https://www.irs.gov/pub/irs-pdf/f2555.pdf',
      required: false,
      condition: 'Foreign earned income exclusion claimed',
    });
  }

  // Always include Schedule 1 and 3 as they are common add-ons
  forms.push({
    formId: 'sch-1',
    name: 'Schedule 1',
    description: 'Additional Income and Adjustments (above-the-line deductions)',
    url: 'https://www.irs.gov/pub/irs-pdf/f1040s1.pdf',
    required: hasScheduleC || hasQBI,
    condition: 'Self-employment or above-the-line adjustments present',
  });

  forms.push({
    formId: 'sch-3',
    name: 'Schedule 3',
    description: 'Additional Credits and Payments',
    url: 'https://www.irs.gov/pub/irs-pdf/f1040s3.pdf',
    required: hasEducationCredit,
    condition: 'Non-refundable credits or foreign taxes present',
  });

  return forms;
}

// ─── Mail Filing Tab ─────────────────────────────────────────────────────────

function MailFilingTab() {
  const { documents } = useWorkflow();
  const { currentYear } = useTaxYear();

  const yearDocs = documents.filter(d => d.taxYear === currentYear);
  const hasScheduleC = yearDocs.some(d => d.type === '1099_nec');
  const hasDividends = yearDocs.some(d => d.type === '1099_div');
  const hasInterest = yearDocs.some(d => d.type === '1099_int');
  const hasCapGains = yearDocs.some(d => ['1099_b', 'schedule_d'].includes(d.type));
  const hasRetirement = yearDocs.some(d => d.type === '1099_r');
  // Education credit and QBI are heuristic — user can always download extras
  const hasEducationCredit = false;
  const hasQBI = hasScheduleC;

  const forms = getRequiredForms(
    hasScheduleC, hasDividends, hasInterest,
    hasCapGains, hasRetirement, hasEducationCredit, hasQBI, false
  );
  const required = forms.filter(f => f.required);
  const optional = forms.filter(f => !f.required);

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">About Mail Filing</p>
              <p className="text-blue-700 mt-1">
                Paper filing is accepted for all tax years and is required for amended returns older than 2 years.
                Download each IRS form below, print, complete using your tax data, sign, and mail to the IRS using
                certified mail with return receipt. Always keep a copy of everything you mail.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Required Forms */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Required Forms for Tax Year {currentYear}
        </h3>
        <div className="space-y-2">
          {required.map(form => (
            <Card key={form.formId} className="border-sidebar-primary/20">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <FileText className="w-4 h-4 text-sidebar-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-sm">{form.name}</div>
                      <div className="text-xs text-muted-foreground">{form.description}</div>
                      {form.condition && (
                        <div className="text-xs text-muted-foreground italic mt-0.5">
                          Applies because: {form.condition}
                        </div>
                      )}
                    </div>
                  </div>
                  <a
                    href={form.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sidebar-primary text-sidebar-primary-foreground rounded hover:bg-sidebar-primary/90 transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3 h-3" />
                    Download PDF
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Optional Forms */}
      {optional.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Optional / Situational Forms
          </h3>
          <div className="space-y-2">
            {optional.map(form => (
              <Card key={form.formId} className="border-dashed">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium text-sm text-muted-foreground">{form.name}</div>
                        <div className="text-xs text-muted-foreground">{form.description}</div>
                        {form.condition && (
                          <div className="text-xs text-muted-foreground italic mt-0.5">
                            {form.condition}
                          </div>
                        )}
                      </div>
                    </div>
                    <a
                      href={form.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-input rounded hover:bg-accent transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Download
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Mailing Instructions */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Mailing Instructions
        </h3>
        <Card>
          <CardContent className="py-4 space-y-3 text-sm">
            {[
              { n: 1, text: 'Download and print all required forms above. Use the current-year versions.' },
              { n: 2, text: 'Complete each form using the data in your preparer audit trail document.' },
              { n: 3, text: 'Sign and date Form 1040 (and spouse, if MFJ). Include your daytime phone number.' },
              { n: 4, text: 'Attach W-2s and 1099s that show withholding BEHIND the first page of Form 1040.' },
              { n: 5, text: 'Include a check payable to "United States Treasury" if you owe tax. Write tax year and SSN on the memo line.' },
              { n: 6, text: 'Do NOT staple — use a paper clip or binder clip.' },
              { n: 7, text: 'Mail to the address in the Form 1040 instructions for your state → IRS.gov/filing/where-to-file' },
              { n: 8, text: 'Use Certified Mail, Return Receipt Requested (USPS Form 3811) — this is your legal filing date proof.' },
              { n: 9, text: 'Make a complete copy of everything before mailing. Retain for 7 years.' },
            ].map(step => (
              <div key={step.n} className="flex gap-3">
                <div className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-mono">
                  {step.n}
                </div>
                <p className="flex-1">{step.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="mt-3">
          <a
            href="https://www.irs.gov/filing/where-to-file-tax-returns-addresses-for-taxpayers-and-tax-professionals-filing-form-1040"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-sidebar-primary hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Find your IRS mailing address by state → IRS.gov
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── TurboTax Export Tab ─────────────────────────────────────────────────────

function TurboTaxTab() {
  const { documents, incomeReconciliations } = useWorkflow();
  const { currentYear } = useTaxYear();
  const [result, setResult] = useState<{ content: string; cheatSheet: string; recordCount: number; warnings: string[]; supportedItems: string[]; unsupportedItems: string[] } | null>(null);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = () => {
    const input: TxfExportInput = {
      taxYear: currentYear!,
      taxpayerName: 'Taxpayer', // could be pulled from client context
      documents,
      incomeReconciliations,
    };
    const txfResult = buildTxf(input);
    const cheatSheet = buildTurboTaxCheatSheet(input);
    setResult({ ...txfResult, cheatSheet });
    setGenerated(true);
  };

  const downloadFile = (content: string, filename: string, mimeType = 'text/plain') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Explainer */}
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-green-900">TXF Export — Tax Exchange Format</p>
              <p className="text-green-700 mt-1">
                TXF is the industry-standard import format supported by TurboTax, H&R Block, TaxAct, Drake,
                and most other tax software. The export file carries W-2 wages, 1099 income, and withholding data.
                A companion Interview Guide document maps every remaining item to the correct TurboTax screen
                for manual entry. Items that TXF cannot carry (Schedule C expenses, K-1s, Schedule D transactions)
                are clearly listed with entry instructions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supported formats note */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { name: 'TurboTax', action: 'File → Import → From TXF' },
          { name: 'H&R Block', action: 'Import → Tax File → TXF' },
          { name: 'TaxAct', action: 'Import → From TXF File' },
        ].map(sw => (
          <Card key={sw.name} className="border-dashed">
            <CardContent className="p-3 text-center">
              <div className="font-medium text-sm">{sw.name}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono">{sw.action}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={handleGenerate} className="gap-2">
        <RefreshCw className="w-4 h-4" />
        Generate TXF Export
      </Button>

      {generated && result && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-status-success/30">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-mono font-semibold text-status-success">{result.recordCount}</div>
                <div className="text-xs text-muted-foreground">TXF Records</div>
              </CardContent>
            </Card>
            <Card className="border-sidebar-primary/30">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-mono font-semibold text-sidebar-primary">{result.supportedItems.length}</div>
                <div className="text-xs text-muted-foreground">Items Exported</div>
              </CardContent>
            </Card>
            <Card className={cn(result.unsupportedItems.length > 0 ? 'border-status-warning/30' : 'border-muted')}>
              <CardContent className="p-3 text-center">
                <div className={cn('text-2xl font-mono font-semibold', result.unsupportedItems.length > 0 ? 'text-status-warning' : 'text-muted-foreground')}>
                  {result.unsupportedItems.length}
                </div>
                <div className="text-xs text-muted-foreground">Manual Entry Required</div>
              </CardContent>
            </Card>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <Card className="border-status-warning/30 bg-status-warning/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-status-warning">Notices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="w-3 h-3 text-status-warning mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{w}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Exported items */}
          {result.supportedItems.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Exported via TXF</div>
              <div className="space-y-1">
                {result.supportedItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unsupported items */}
          {result.unsupportedItems.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Requires Manual Entry</div>
              <div className="space-y-1">
                {result.unsupportedItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <XCircle className="w-3.5 h-3.5 text-status-warning" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Downloads */}
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={() => downloadFile(result.content, `TaxForensics_${currentYear}_TurboTax.txf`)}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Download .txf Import File
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadFile(result.cheatSheet, `TaxForensics_${currentYear}_TurboTax_Guide.txt`)}
              className="gap-2"
            >
              <FileText className="w-4 h-4" />
              Download Interview Guide (.txt)
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Import the .txf file first, then use the Interview Guide to complete all remaining sections manually.
            Verify every imported amount in TurboTax before filing.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Filing Recommendation Tab ───────────────────────────────────────────────

const TIER_CONFIG = {
  best:            { label: 'Best Match',      color: 'text-status-success',  bg: 'bg-status-success/10',  border: 'border-status-success/40' },
  good:            { label: 'Good Option',     color: 'text-sidebar-primary', bg: 'bg-sidebar-primary/10', border: 'border-sidebar-primary/30' },
  acceptable:      { label: 'Acceptable',      color: 'text-status-warning',  bg: 'bg-status-warning/10',  border: 'border-status-warning/30' },
  not_recommended: { label: 'Not Recommended', color: 'text-muted-foreground',bg: 'bg-muted',              border: 'border-border' },
};

function PathCard({ rec, primary }: { rec: FilingRecommendation; primary?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const tier = TIER_CONFIG[rec.tier];

  return (
    <Card className={cn('border', tier.border, primary && 'ring-2 ring-sidebar-primary/30')}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {primary && <Star className="w-4 h-4 text-sidebar-primary fill-sidebar-primary shrink-0" />}
              <span className="font-semibold text-sm">{rec.path.name}</span>
              <Badge variant="outline" className={cn('text-xs', tier.color, tier.bg)}>
                {tier.label}
              </Badge>
              {rec.path.irsPartnered && (
                <Badge variant="outline" className="text-xs text-blue-600 bg-blue-50 border-blue-200">
                  <ShieldCheck className="w-2.5 h-2.5 mr-1" />
                  IRS Partner
                </Badge>
              )}
            </div>

            {/* Cost summary */}
            <div className="flex items-center gap-1.5 mt-1.5">
              <DollarSign className="w-3.5 h-3.5 text-status-success" />
              <span className={cn(
                'text-sm font-medium',
                rec.path.federalFree ? 'text-status-success' : 'text-foreground'
              )}>
                {rec.costSummary}
              </span>
            </div>

            <p className="text-xs text-muted-foreground mt-1.5">{rec.path.bestFor}</p>

            {/* Quick reasons */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {rec.reasons.slice(0, 3).map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-2.5 h-2.5 text-status-success" />
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <a
              href={rec.path.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sidebar-primary text-sidebar-primary-foreground rounded hover:bg-sidebar-primary/90 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3 h-3" />
              Open
            </a>
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            >
              Details {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {/* Form support grid */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Form Support</div>
              <div className="grid grid-cols-3 gap-1 text-xs">
                {[
                  { label: 'Schedule C', val: rec.path.supportsScheduleC },
                  { label: 'Schedule D', val: rec.path.supportsScheduleD },
                  { label: 'Schedule E', val: rec.path.supportsScheduleE },
                  { label: 'K-1', val: rec.path.supportsK1 },
                  { label: 'AMT', val: rec.path.supportsAMT },
                  { label: 'Foreign', val: rec.path.supportsForeignIncome },
                  { label: 'Multi-State', val: rec.path.supportsMultipleStates },
                  { label: 'TXF Import', val: rec.path.hasImportTxf },
                  { label: 'Audit Support', val: rec.path.hasAuditSupport },
                ].map(item => (
                  <div key={item.label} className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded',
                    item.val ? 'bg-status-success/10 text-status-success' : 'bg-muted text-muted-foreground'
                  )}>
                    {item.val
                      ? <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                      : <XCircle className="w-2.5 h-2.5 shrink-0" />}
                    {item.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Warnings */}
            {rec.warnings.length > 0 && (
              <div className="space-y-1">
                {rec.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-status-warning">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            {/* Limitations */}
            {rec.path.limitations.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Limitations</div>
                {rec.path.limitations.map((l, i) => (
                  <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-muted-foreground mt-0.5">•</span>{l}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationTab() {
  const { currentYear } = useTaxYear();
  const { documents } = useWorkflow();

  // Pre-fill from workflow where possible
  const yearDocs = documents.filter(d => d.taxYear === currentYear);
  const detectedSelfEmp = yearDocs.some(d => d.type === '1099_nec');
  const detectedDivs = yearDocs.some(d => ['1099_div', '1099_int'].includes(d.type));
  const detectedCapGains = yearDocs.some(d => ['1099_b', 'schedule_d'].includes(d.type));
  const detectedRetirement = yearDocs.some(d => d.type === '1099_r');
  const detectedK1 = yearDocs.some(d => ['k1_1065', 'k1_1120s', 'k1_1041'].includes(d.type));

  const [agi, setAgi] = useState('');
  const [filingStatus, setFilingStatus] = useState<ClientFilingProfile['filingStatus']>('single');
  const [age, setAge] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [numStates, setNumStates] = useState('1');

  // Income checkboxes — pre-fill from uploaded docs
  const [hasW2, setHasW2] = useState(yearDocs.some(d => d.type === 'w2'));
  const [hasSelfEmp, setHasSelfEmp] = useState(detectedSelfEmp);
  const [hasDivs, setHasDivs] = useState(detectedDivs);
  const [hasCapGains, setHasCapGains] = useState(detectedCapGains);
  const [hasRental, setHasRental] = useState(false);
  const [hasRetirement, setHasRetirement] = useState(detectedRetirement);
  const [hasK1, setHasK1] = useState(detectedK1);
  const [hasForeign, setHasForeign] = useState(false);
  const [hasFBAR, setHasFBAR] = useState(false);

  // Deduction / credit flags
  const [itemizes, setItemizes] = useState(false);
  const [hasEduCredit, setHasEduCredit] = useState(false);
  const [hasPTC, setHasPTC] = useState(false);
  const [hasAMT, setHasAMT] = useState(false);
  const [hasCarryforwards, setHasCarryforwards] = useState(false);
  const [isMilitary, setIsMilitary] = useState(false);
  const [hasCrypto, setHasCrypto] = useState(false);

  const [result, setResult] = useState<RecommendationResult | null>(null);

  const canRun = agi && age && stateCode;

  const handleRun = () => {
    const profile: ClientFilingProfile = {
      taxYear: currentYear ?? new Date().getFullYear() - 1,
      filingStatus,
      age: parseInt(age) || 30,
      agi: parseFloat(agi.replace(/,/g, '')) || 0,
      stateCode,
      numberOfStates: parseInt(numStates) || 1,
      hasW2,
      hasSelfEmployment: hasSelfEmp,
      hasDividendsOrInterest: hasDivs,
      hasCapitalGains: hasCapGains,
      hasRentalIncome: hasRental,
      hasRetirementIncome: hasRetirement,
      hasFarmIncome: false,
      hasForeignIncome: hasForeign,
      hasK1Income: hasK1,
      hasAlimonyReceived: false,
      hasGamblingIncome: false,
      itemizes,
      hasMortgageInterest: itemizes,
      hasCharitableContributions: itemizes,
      hasStudentLoanInterest: false,
      hasEducatorExpenses: false,
      hasHSAContribution: false,
      hasSEPOrIRADeduction: hasSelfEmp,
      hasChildrenOrDependents: false,
      hasEIC: false,
      hasChildTaxCredit: false,
      hasEducationCredits: hasEduCredit,
      hasPremiumTaxCredit: hasPTC,
      hasAMTExposure: hasAMT,
      hasQBIDeduction: hasSelfEmp || hasK1,
      hasCarryforwards,
      hasNonResidentSpouse: false,
      isMilitary,
      hasVirtualCurrency: hasCrypto,
      hasFBARRequirement: hasFBAR,
    };
    setResult(recommendFilingPath(profile));
  };

  const stateNoTax = stateCode && !stateHasIncomeTax(stateCode);

  return (
    <div className="space-y-6">
      <Card className="border-sidebar-primary/20 bg-sidebar-primary/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-sidebar-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Smart Filing Path Recommender</p>
              <p className="text-muted-foreground mt-0.5">
                Enter the client's profile below. Checkboxes pre-filled from uploaded documents where possible.
                The engine scores every free and paid option and explains exactly why one beats another for this specific situation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Input form */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium mb-1.5 block">Adjusted Gross Income (AGI)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              className="pl-6"
              placeholder="46,470"
              value={agi}
              onChange={e => setAgi(e.target.value)}
            />
          </div>
          {agi && (
            <p className={cn(
              'text-xs mt-1',
              parseFloat(agi.replace(/,/g, '')) <= 89000 ? 'text-status-success' : 'text-status-warning'
            )}>
              {parseFloat(agi.replace(/,/g, '')) <= 89000
                ? '✓ Qualifies for IRS Free File (AGI ≤ $89,000)'
                : '⚠ Above Free File limit — FreeTaxUSA Direct recommended'}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium mb-1.5 block">Filing Status</label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filingStatus}
            onChange={e => setFilingStatus(e.target.value as ClientFilingProfile['filingStatus'])}
          >
            <option value="single">Single</option>
            <option value="mfj">Married Filing Jointly</option>
            <option value="mfs">Married Filing Separately</option>
            <option value="hoh">Head of Household</option>
            <option value="qss">Qualifying Surviving Spouse</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1.5 block">Taxpayer Age</label>
          <Input
            type="number"
            placeholder="35"
            value={age}
            onChange={e => setAge(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1.5 block">
            State of Residence
            {stateNoTax && <span className="ml-2 text-status-success font-normal">✓ No state income tax</span>}
          </label>
          <Input
            maxLength={2}
            placeholder="IL"
            value={stateCode}
            onChange={e => setStateCode(e.target.value.toUpperCase())}
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1.5 block">Number of State Returns</label>
          <Input
            type="number"
            min="1"
            max="10"
            placeholder="1"
            value={numStates}
            onChange={e => setNumStates(e.target.value)}
          />
        </div>
      </div>

      {/* Income checkboxes */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Income Sources (pre-filled from uploaded documents)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'W-2 wages', val: hasW2, set: setHasW2, detected: yearDocs.some(d => d.type === 'w2') },
            { label: 'Self-employment / 1099-NEC (Schedule C)', val: hasSelfEmp, set: setHasSelfEmp, detected: detectedSelfEmp },
            { label: 'Dividends or interest (1099-DIV / INT)', val: hasDivs, set: setHasDivs, detected: detectedDivs },
            { label: 'Capital gains / investment sales (Schedule D)', val: hasCapGains, set: setHasCapGains, detected: detectedCapGains },
            { label: 'Rental income (Schedule E)', val: hasRental, set: setHasRental, detected: false },
            { label: 'Retirement distributions (1099-R)', val: hasRetirement, set: setHasRetirement, detected: detectedRetirement },
            { label: 'K-1 pass-through income (partnership / S-Corp)', val: hasK1, set: setHasK1, detected: detectedK1 },
            { label: 'Foreign income / FBAR', val: hasForeign, set: setHasForeign, detected: false },
            { label: 'FinCEN 114 / foreign accounts > $10K', val: hasFBAR, set: setHasFBAR, detected: false },
            { label: 'Cryptocurrency / virtual currency', val: hasCrypto, set: setHasCrypto, detected: false },
          ].map(item => (
            <label key={item.label} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={item.val}
                onChange={e => item.set(e.target.checked)}
                className="rounded"
              />
              <span>{item.label}</span>
              {item.detected && (
                <span className="text-xs text-status-success font-mono">detected</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Special situations */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Special Situations
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Itemizes deductions (Schedule A)', val: itemizes, set: setItemizes },
            { label: 'Education credits (Form 8863)', val: hasEduCredit, set: setHasEduCredit },
            { label: 'ACA Premium Tax Credit (Form 8962)', val: hasPTC, set: setHasPTC },
            { label: 'Alternative Minimum Tax exposure', val: hasAMT, set: setHasAMT },
            { label: 'Carryforward items (NOL / cap loss)', val: hasCarryforwards, set: setHasCarryforwards },
            { label: 'Active military / veteran', val: isMilitary, set: setIsMilitary },
          ].map(item => (
            <label key={item.label} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={item.val}
                onChange={e => item.set(e.target.checked)}
                className="rounded"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      <Button
        onClick={handleRun}
        disabled={!canRun}
        className="gap-2"
        size="lg"
      >
        <Zap className="w-4 h-4" />
        Get Filing Recommendation
      </Button>

      {/* ── Results ── */}
      {result && (
        <div className="space-y-6 pt-2">
          <Separator />

          {/* Complexity badge + key insights */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold',
                result.complexityLabel === 'Simple' ? 'bg-status-success/10 text-status-success' :
                result.complexityLabel === 'Moderate' ? 'bg-blue-100 text-blue-700' :
                result.complexityLabel === 'Complex' ? 'bg-status-warning/10 text-status-warning' :
                'bg-status-error/10 text-status-error'
              )}>
                Return Complexity: {result.complexityLabel} ({result.complexityScore}/100)
              </div>
              {result.freeFileEligible && (
                <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-status-success/10 text-status-success">
                  ✓ Free File Eligible — saves ~${result.freeFileSavings}+
                </div>
              )}
            </div>

            {/* Key insights */}
            <div className="space-y-2">
              {result.keyInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 text-sm p-3 bg-muted/50 rounded-lg">
                  <ThumbsUp className="w-4 h-4 text-sidebar-primary mt-0.5 shrink-0" />
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Primary recommendation */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-sidebar-primary fill-sidebar-primary" />
              Primary Recommendation
            </div>
            <PathCard rec={result.primaryRecommendation} primary />
          </div>

          {/* Alternatives */}
          {result.alternativeRecommendations.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Alternative Options
              </div>
              <div className="space-y-3">
                {result.alternativeRecommendations.map(rec => (
                  <PathCard key={rec.path.id} rec={rec} />
                ))}
              </div>
            </div>
          )}

          {/* Ineligible paths summary */}
          {result.ineligiblePaths.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Not Available for This Return
              </div>
              <div className="space-y-1">
                {result.ineligiblePaths.map(({ path, reason }) => (
                  <div key={path.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <XCircle className="w-3 h-3 shrink-0" />
                    <span className="font-medium">{path.name}:</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TXF reminder */}
          {result.primaryRecommendation.path.hasImportTxf && (
            <Card className="border-sidebar-primary/20 bg-sidebar-primary/5">
              <CardContent className="py-3 px-4 flex items-center gap-3 text-sm">
                <Zap className="w-4 h-4 text-sidebar-primary shrink-0" />
                <span>
                  <strong>{result.primaryRecommendation.path.name}</strong> supports TXF import.
                  Generate your TXF file on the <strong>E-File Import</strong> tab to pre-populate income data automatically.
                </span>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Filing Center ──────────────────────────────────────────────────────

export function FilingCenterPage() {
  const { currentYear, isYearSelected } = useTaxYear();

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Filing Center</h1>
        <p className="text-muted-foreground mt-1">
          Smart filing path recommendation, mail filing forms, and TXF e-file import for tax year {currentYear}
        </p>
      </div>

      <Tabs defaultValue="recommend">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="recommend" className="gap-2">
            <Sparkles className="w-4 h-4" />
            Filing Recommendation
          </TabsTrigger>
          <TabsTrigger value="mail" className="gap-2">
            <Mail className="w-4 h-4" />
            Mail Filing (IRS Forms)
          </TabsTrigger>
          <TabsTrigger value="turbotax" className="gap-2">
            <Send className="w-4 h-4" />
            E-File Import (TXF)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="recommend" className="mt-6">
          <RecommendationTab />
        </TabsContent>
        <TabsContent value="mail" className="mt-6">
          <MailFilingTab />
        </TabsContent>
        <TabsContent value="turbotax" className="mt-6">
          <TurboTaxTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
