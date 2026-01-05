import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle,
  Lock,
  Check,
  XCircle,
  FileCheck,
  Archive,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function FinalizationPage() {
  const { currentYear, isYearSelected, yearConfig, finalizeYear, lockYear, canFinalize, canLock } = useTaxYear();
  const { workflowState, canGenerateFederalReturn } = useWorkflow();

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

  const { gates, blockedReasons } = workflowState;

  const handleFinalize = () => {
    if (finalizeYear()) {
      // Success
    }
  };

  const handleLock = () => {
    if (lockYear()) {
      // Success
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Finalization & Locking</h1>
        <p className="text-muted-foreground mt-1">
          Finalize and lock tax year {currentYear} for immutable, reproducible output
        </p>
      </div>

      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Current Year Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className={cn(
              'p-3 rounded-lg',
              yearConfig?.status === 'locked' ? 'bg-primary/10' :
              yearConfig?.status === 'finalized' ? 'bg-status-success/10' : 'bg-muted'
            )}>
              {yearConfig?.status === 'locked' ? (
                <Lock className="w-6 h-6 text-primary" />
              ) : yearConfig?.status === 'finalized' ? (
                <FileCheck className="w-6 h-6 text-status-success" />
              ) : (
                <Clock className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="font-semibold text-lg capitalize">{yearConfig?.status || 'Draft'}</div>
              <div className="text-sm text-muted-foreground">
                Version {yearConfig?.version || 1}
                {yearConfig?.finalizedAt && ` • Finalized ${yearConfig.finalizedAt.toLocaleDateString()}`}
                {yearConfig?.lockedAt && ` • Locked ${yearConfig.lockedAt.toLocaleDateString()}`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gate Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Finalization Gates</CardTitle>
          <CardDescription>All gates must pass before finalization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: 'taxYearSelected', label: 'Tax year selected', passed: gates.taxYearSelected },
            { key: 'statesConfigured', label: 'States configured', passed: gates.statesConfigured },
            { key: 'requiredFormsUploaded', label: 'Required forms uploaded', passed: gates.requiredFormsUploaded },
            { key: 'noUnresolvedTransactions', label: 'All transactions resolved', passed: gates.noUnresolvedTransactions },
            { key: 'noMaterialDiscrepancies', label: 'No material discrepancies', passed: gates.noMaterialDiscrepancies },
            { key: 'evidenceComplete', label: 'Evidence complete', passed: gates.evidenceComplete },
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
            <CardTitle className="text-sm text-status-error">Blocking Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {blockedReasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2">
                  <XCircle className="w-3 h-3 text-status-error mt-1 shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Actions */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileCheck className="w-4 h-4" />
              Finalize Year
            </CardTitle>
            <CardDescription>
              Creates a version snapshot. Changes after finalization create new versions with change logs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleFinalize}
              disabled={!canFinalize || !canGenerateFederalReturn}
            >
              Finalize Tax Year {currentYear}
            </Button>
            {!canGenerateFederalReturn && (
              <p className="text-xs text-status-warning mt-2">
                Resolve all blocking issues before finalizing
              </p>
            )}
          </CardContent>
        </Card>

        <Card className={cn(yearConfig?.status !== 'finalized' && 'opacity-50')}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Lock Year (Immutable)
            </CardTitle>
            <CardDescription>
              After locking, all edits are disabled. Only exports are allowed. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="destructive"
              onClick={handleLock}
              disabled={!canLock}
            >
              <Lock className="w-4 h-4 mr-2" />
              Lock Tax Year {currentYear}
            </Button>
            {yearConfig?.status !== 'finalized' && (
              <p className="text-xs text-muted-foreground mt-2">
                Finalize the year before locking
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
