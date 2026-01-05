import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle,
  Calculator,
  Check,
  XCircle,
  FileText,
  Lock,
  ChevronRight,
  AlertCircle,
  Printer
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function FederalReturnPage() {
  const { currentYear, isYearSelected, yearConfig } = useTaxYear();
  const { 
    workflowState, 
    canGenerateFederalReturn, 
    transactions, 
    incomeReconciliations,
    requiredForms,
    categories
  } = useWorkflow();

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

  const { gates, blockedReasons, federalStatus } = workflowState;
  
  // Calculate totals
  const yearTransactions = transactions.filter(t => t.taxYear === currentYear);
  const deductibleWithEvidence = yearTransactions.filter(t => 
    t.state === 'deductible' && t.evidenceStatus === 'present'
  );
  const yearIncome = incomeReconciliations.filter(r => r.taxYear === currentYear);
  
  const totalGrossIncome = yearIncome.reduce((sum, r) => sum + r.grossAmount, 0);
  const totalDeductions = deductibleWithEvidence.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  // Group deductions by Schedule C line
  const deductionsByLine: Record<string, { line: string; name: string; amount: number; count: number }> = {};
  deductibleWithEvidence.forEach(t => {
    const line = t.scheduleCLine || 'other';
    const category = categories.find(c => c.id === t.categoryId);
    if (!deductionsByLine[line]) {
      deductionsByLine[line] = { line, name: category?.name || 'Other', amount: 0, count: 0 };
    }
    deductionsByLine[line].amount += Math.abs(t.amount);
    deductionsByLine[line].count += 1;
  });

  const federalFormsRequired = requiredForms.filter(f => f.jurisdiction === 'federal');
  const allFormsReady = federalFormsRequired.every(f => f.isVerified);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Federal Return</h1>
          <p className="text-muted-foreground mt-1">
            Form 1040 and associated schedules for tax year {currentYear}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(
            'text-sm',
            federalStatus === 'ready' && 'text-status-success border-status-success',
            federalStatus === 'blocked' && 'text-status-error border-status-error',
            federalStatus === 'finalized' && 'text-primary border-primary',
            federalStatus === 'locked' && 'text-primary border-primary'
          )}>
            {federalStatus === 'locked' && <Lock className="w-3 h-3 mr-1" />}
            {federalStatus.charAt(0).toUpperCase() + federalStatus.slice(1)}
          </Badge>
        </div>
      </div>

      {/* Gate Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Generation Prerequisites</CardTitle>
          <CardDescription>All gates must pass before generating the return</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: 'taxYearSelected', label: 'Tax year selected', passed: gates.taxYearSelected },
            { key: 'statesConfigured', label: 'States configured', passed: gates.statesConfigured },
            { key: 'requiredFormsUploaded', label: 'Required blank forms uploaded', passed: gates.requiredFormsUploaded },
            { key: 'noUnresolvedTransactions', label: 'All transactions classified', passed: gates.noUnresolvedTransactions },
            { key: 'noMaterialDiscrepancies', label: 'No material discrepancies', passed: gates.noMaterialDiscrepancies },
            { key: 'incomeReconciled', label: 'Income reconciled', passed: gates.incomeReconciled },
            { key: 'evidenceComplete', label: 'Evidence attached to deductions', passed: gates.evidenceComplete },
          ].map(gate => (
            <div key={gate.key} className="flex items-center gap-3">
              {gate.passed ? (
                <Check className="w-4 h-4 text-status-success" />
              ) : (
                <XCircle className="w-4 h-4 text-status-error" />
              )}
              <span className={cn('text-sm', !gate.passed && 'text-muted-foreground')}>
                {gate.label}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {blockedReasons.length > 0 && (
        <Card className="border-status-error/50 bg-status-error/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-status-error flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Return Generation Blocked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {blockedReasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-1.5 shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Required Forms */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Required Forms</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {federalFormsRequired.map((form, idx) => (
            <Card key={idx} className={cn(
              !form.isVerified && 'border-status-warning/30'
            )}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded',
                    form.isVerified ? 'bg-status-success/10' : 'bg-status-warning/10'
                  )}>
                    {form.isVerified ? (
                      <Check className="w-4 h-4 text-status-success" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-status-warning" />
                    )}
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
      </div>

      <Separator />

      {/* Summary Preview */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Return Summary Preview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Income */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Gross Income</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-mono font-semibold text-status-success">
                ${totalGrossIncome.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                From {yearIncome.length} reconciled source(s)
              </div>
            </CardContent>
          </Card>

          {/* Deductions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Deductions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-mono font-semibold text-status-error">
                ${totalDeductions.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                From {deductibleWithEvidence.length} substantiated expense(s)
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedule C Preview */}
      {Object.keys(deductionsByLine).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Schedule C Expense Summary</CardTitle>
            <CardDescription>Deductions by line (only includes expenses with evidence)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.values(deductionsByLine)
                .sort((a, b) => parseInt(a.line) - parseInt(b.line))
                .map(item => (
                  <div key={item.line} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <span className="font-mono text-sm">Line {item.line}:</span>
                      <span className="ml-2 text-sm">{item.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">({item.count} items)</span>
                    </div>
                    <div className="font-mono font-medium">
                      ${item.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              <div className="flex items-center justify-between py-2 border-t-2 font-semibold">
                <div>Total Expenses</div>
                <div className="font-mono">${totalDeductions.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Traceability Notice */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Calculator className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">Traceability Guarantee</p>
              <p className="text-sm text-muted-foreground mt-1">
                Every line item in the generated return will include its source document reference 
                or calculation path. AI performs extraction only—no invented numbers or elections.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generate Button */}
      <div className="flex justify-end gap-4">
        <Button 
          size="lg"
          disabled={!canGenerateFederalReturn}
          className="gap-2"
        >
          <Printer className="w-4 h-4" />
          Generate Federal Return
        </Button>
      </div>

      {!canGenerateFederalReturn && (
        <p className="text-xs text-status-warning text-right">
          Resolve all blocking issues before generating
        </p>
      )}
    </div>
  );
}
