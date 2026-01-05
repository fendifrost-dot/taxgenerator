import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { 
  AlertTriangle, 
  Check, 
  Lock, 
  XCircle,
  Clock,
  ChevronDown,
  FileText,
  Receipt,
  AlertCircle,
  FileCheck
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FederalStatus, StateStatus } from '@/types/tax';

const statusConfig: Record<FederalStatus | StateStatus, { 
  icon: typeof Check; 
  label: string; 
  color: string;
  bg: string;
}> = {
  draft: { icon: Clock, label: 'Draft', color: 'text-muted-foreground', bg: 'bg-muted' },
  blocked: { icon: XCircle, label: 'Blocked', color: 'text-status-error', bg: 'bg-status-error/10' },
  ready: { icon: Check, label: 'Ready', color: 'text-status-success', bg: 'bg-status-success/10' },
  finalized: { icon: FileCheck, label: 'Finalized', color: 'text-primary', bg: 'bg-primary/10' },
  locked: { icon: Lock, label: 'Locked', color: 'text-primary', bg: 'bg-primary/10' },
  not_started: { icon: Clock, label: 'Not Started', color: 'text-muted-foreground', bg: 'bg-muted' },
};

export function WorkflowHeader() {
  const { currentYear, yearConfig } = useTaxYear();
  const { workflowState } = useWorkflow();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!currentYear) {
    return null;
  }

  const { federalStatus, stateStatuses, unresolvedCounts, blockedReasons } = workflowState;
  const federalConfig = statusConfig[federalStatus];
  const FederalIcon = federalConfig.icon;

  const totalUnresolved = 
    unresolvedCounts.missingBlankForms +
    unresolvedCounts.unresolvedTransactions +
    unresolvedCounts.unreconciledDeposits +
    unresolvedCounts.missingEvidence +
    unresolvedCounts.unresolvedDiscrepancies;

  return (
    <TooltipProvider>
      <div className="bg-card border-b px-4 py-2 sticky top-0 z-40">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <div className="flex items-center justify-between">
            {/* Left: Year and Status */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Tax Year</span>
                <span className="font-mono font-semibold text-lg">{currentYear}</span>
                {yearConfig?.isLocked && <Lock className="w-4 h-4 text-muted-foreground" />}
                {yearConfig?.status === 'finalized' && !yearConfig.isLocked && (
                  <Badge variant="outline" className="text-xs">v{yearConfig.version}</Badge>
                )}
              </div>

              <div className="h-6 w-px bg-border" />

              {/* Federal Status */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium',
                    federalConfig.bg, federalConfig.color
                  )}>
                    <FederalIcon className="w-3.5 h-3.5" />
                    <span>Federal: {federalConfig.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Federal return status</p>
                </TooltipContent>
              </Tooltip>

              {/* State Statuses */}
              {Object.entries(stateStatuses).map(([code, status]) => {
                const config = statusConfig[status];
                const StateIcon = config.icon;
                return (
                  <Tooltip key={code}>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium',
                        config.bg, config.color
                      )}>
                        <StateIcon className="w-3.5 h-3.5" />
                        <span>{code}: {config.label}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{code} state return status</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Right: Unresolved Counts */}
            <div className="flex items-center gap-3">
              {totalUnresolved > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  {unresolvedCounts.missingBlankForms > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-status-error">
                          <FileText className="w-3.5 h-3.5" />
                          <span>{unresolvedCounts.missingBlankForms}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{unresolvedCounts.missingBlankForms} required form(s) missing</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {unresolvedCounts.unresolvedTransactions > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-status-warning">
                          <Receipt className="w-3.5 h-3.5" />
                          <span>{unresolvedCounts.unresolvedTransactions}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{unresolvedCounts.unresolvedTransactions} transaction(s) require decision</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {unresolvedCounts.unresolvedDiscrepancies > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-status-error">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{unresolvedCounts.unresolvedDiscrepancies}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{unresolvedCounts.unresolvedDiscrepancies} discrepancy(ies) unresolved</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {unresolvedCounts.missingEvidence > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 text-status-warning">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{unresolvedCounts.missingEvidence}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{unresolvedCounts.missingEvidence} expense(s) missing evidence</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}

              {blockedReasons.length > 0 && (
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1 text-xs text-status-error hover:underline">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{blockedReasons.length} blocker(s)</span>
                    <ChevronDown className={cn(
                      'w-3.5 h-3.5 transition-transform',
                      isExpanded && 'rotate-180'
                    )} />
                  </button>
                </CollapsibleTrigger>
              )}

              {blockedReasons.length === 0 && totalUnresolved === 0 && (
                <div className="flex items-center gap-1 text-xs text-status-success">
                  <Check className="w-3.5 h-3.5" />
                  <span>All clear</span>
                </div>
              )}
            </div>
          </div>

          {/* Expanded Blockers */}
          <CollapsibleContent>
            {blockedReasons.length > 0 && (
              <div className="mt-2 pt-2 border-t space-y-1">
                <div className="text-xs font-medium text-status-error">Blocking Issues:</div>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {blockedReasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircle className="w-3 h-3 text-status-error mt-0.5 shrink-0" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </TooltipProvider>
  );
}
