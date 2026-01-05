import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle,
  Building2,
  Check,
  XCircle,
  Lock,
  ArrowRight,
  FileText,
  Calculator
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function StateReturnsPage() {
  const { currentYear, isYearSelected, yearConfig } = useTaxYear();
  const { workflowState, canGenerateStateReturn } = useWorkflow();

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

  const { stateStatuses, gates } = workflowState;
  const states = yearConfig?.states || [];

  if (states.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">State Returns</h1>
          <p className="text-muted-foreground mt-1">
            State income tax returns for tax year {currentYear}
          </p>
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

      {/* Federal First Requirement */}
      <Card className={cn(
        gates.federalFinalized 
          ? 'border-status-success/30 bg-status-success/5' 
          : 'border-status-error/50 bg-status-error/5'
      )}>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            {gates.federalFinalized ? (
              <Check className="w-5 h-5 text-status-success mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-status-error mt-0.5" />
            )}
            <div>
              <p className="font-medium text-sm">
                {gates.federalFinalized ? 'Federal Return Finalized' : 'Federal Return Required First'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {gates.federalFinalized 
                  ? 'State returns can now be prepared using finalized federal data'
                  : 'Federal return must be finalized before state returns can be prepared. State logic consumes federal outputs but never alters them.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Core Principle */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Calculator className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">Federal → State Derivation</p>
              <p className="text-sm text-muted-foreground mt-1">
                State returns consume federal outputs and apply state-specific additions, subtractions, 
                and allocations. Federal numbers are never altered. Multi-state apportionment is deterministic.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* State Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Configured States ({states.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {states.map(state => {
            const status = stateStatuses[state.stateCode] || 'not_started';
            const canGenerate = canGenerateStateReturn(state.stateCode);
            
            return (
              <Card key={state.stateCode} className={cn(
                status === 'blocked' && 'border-status-error/30',
                status === 'ready' && 'border-status-success/30',
                status === 'finalized' && 'border-primary/30'
              )}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-10 h-10 bg-secondary rounded-md flex items-center justify-center font-mono font-semibold">
                        {state.stateCode}
                      </div>
                      {state.stateName}
                    </CardTitle>
                    <Badge variant="outline" className={cn(
                      'text-xs capitalize',
                      status === 'blocked' && 'text-status-error border-status-error',
                      status === 'ready' && 'text-status-success border-status-success',
                      status === 'finalized' && 'text-primary border-primary',
                      status === 'locked' && 'text-primary border-primary'
                    )}>
                      {status === 'locked' && <Lock className="w-3 h-3 mr-1" />}
                      {status.replace('_', ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Residency:</span>
                      <div className="font-medium capitalize">
                        {state.residencyStatus.replace('_', ' ')}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Business Nexus:</span>
                      <div className="font-medium">
                        {state.hasBusinessNexus ? 'Yes' : 'No'}
                      </div>
                    </div>
                  </div>

                  {/* State-specific info */}
                  <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/50 rounded">
                    <p>• Requires federal→state reconciliation schedule</p>
                    <p>• Additions/subtractions applied per state law</p>
                    {state.hasBusinessNexus && states.length > 1 && (
                      <p>• Multi-state apportionment worksheet required</p>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      size="sm"
                      disabled={!canGenerate}
                    >
                      {canGenerate ? 'Generate Return' : 'Blocked'}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>

                  {!canGenerate && (
                    <p className="text-xs text-status-warning">
                      Federal return must be finalized first
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Reconciliation Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">State Return Components</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <FileText className="w-4 h-4 mt-1 shrink-0" />
            <div>
              <p className="font-medium text-sm">Federal→State Reconciliation Schedule</p>
              <p className="text-xs text-muted-foreground">
                Documents how federal AGI converts to state taxable income
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="w-4 h-4 mt-1 shrink-0" />
            <div>
              <p className="font-medium text-sm">Additions & Subtractions Worksheet</p>
              <p className="text-xs text-muted-foreground">
                State-specific adjustments to federal amounts
              </p>
            </div>
          </div>
          {states.length > 1 && (
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 mt-1 shrink-0" />
              <div>
                <p className="font-medium text-sm">Allocation & Apportionment Worksheets</p>
                <p className="text-xs text-muted-foreground">
                  Deterministic allocation of income across states
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
