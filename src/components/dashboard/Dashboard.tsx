import { useTaxYear } from '@/contexts/TaxYearContext';
import { TaxYearSelector } from '@/components/dashboard/TaxYearSelector';
import { WorkflowStatusCard } from '@/components/dashboard/WorkflowStatusCard';
import { SourceHierarchyCard } from '@/components/dashboard/SourceHierarchyCard';
import { TransactionStatesCard } from '@/components/dashboard/TransactionStatesCard';
import { AiRoleBoundaryCard } from '@/components/dashboard/AiRoleBoundaryCard';
import { 
  FileText, 
  Receipt, 
  FolderArchive, 
  Calculator, 
  Building2,
  AlertTriangle,
  Shield,
  FileWarning
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export function Dashboard() {
  const { currentYear, isYearSelected, yearConfig } = useTaxYear();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Tax Preparation Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Personal forensic bookkeeping system • Print-and-mail only • No e-file
        </p>
      </div>

      {/* Tax Year Selector - Always Visible */}
      <TaxYearSelector />

      {isYearSelected && (
        <>
          {/* Core Principle Banner */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Core Design Principle
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Federal tax data is the canonical source of truth. State tax returns are derived layers, never co-equal.
                    Federal calculations finalize first; state logic consumes federal outputs but may never alter federal numbers.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Workflow Status Grid */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Workflow Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <WorkflowStatusCard
                title="Documents"
                description="Source documents and forms"
                icon={FileText}
                status="unresolved"
                stats={[
                  { label: 'Uploaded', value: 0 },
                  { label: 'Parsed', value: 0 },
                ]}
              />
              <WorkflowStatusCard
                title="Transactions"
                description="Bank & processor transactions"
                icon={Receipt}
                status="unresolved"
                stats={[
                  { label: 'Total', value: 0 },
                  { label: 'Unresolved', value: 0, type: 'warning' },
                ]}
              />
              <WorkflowStatusCard
                title="Evidence Locker"
                description="Receipts and substantiation"
                icon={FolderArchive}
                status="unresolved"
                stats={[
                  { label: 'Attached', value: 0 },
                  { label: 'Missing', value: 0, type: 'error' },
                ]}
              />
              <WorkflowStatusCard
                title="Federal Return"
                description="Form 1040 and schedules"
                icon={Calculator}
                status="unresolved"
                stats={[
                  { label: 'Forms', value: 0 },
                  { label: 'Complete', value: '0%' },
                ]}
              />
              <WorkflowStatusCard
                title="State Returns"
                description="State income tax returns"
                icon={Building2}
                status={yearConfig?.states.length === 0 ? 'flagged' : 'unresolved'}
                stats={[
                  { label: 'States', value: yearConfig?.states.length || 0 },
                  { label: 'Configured', value: yearConfig?.states.length === 0 ? 'None' : 'Yes' },
                ]}
              />
              <WorkflowStatusCard
                title="Discrepancies"
                description="Conflicts requiring resolution"
                icon={AlertTriangle}
                status="unresolved"
                stats={[
                  { label: 'Open', value: 0 },
                  { label: 'Resolved', value: 0 },
                ]}
              />
            </div>
          </div>

          <Separator />

          {/* Reference Cards */}
          <div>
            <h2 className="text-lg font-semibold mb-4">System Reference</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SourceHierarchyCard />
              <TransactionStatesCard />
              <AiRoleBoundaryCard />
            </div>
          </div>

          {/* No State Configuration Warning */}
          {yearConfig?.states.length === 0 && (
            <Card className="border-status-warning/50 bg-status-warning/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <FileWarning className="w-5 h-5 text-status-warning mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      State Configuration Required
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      No states have been configured for tax year {currentYear}. Navigate to Year Configuration to specify 
                      state(s), residency status, and business nexus before proceeding with state returns.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Immutability Notice */}
          <div className="text-center py-6 border-t">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Precision over convenience</span> • 
              <span className="mx-2">Determinism over intuition</span> • 
              <span className="font-medium">Zero assumptions</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              All decisions are explainable, sourced, confirmed, and reversible until final lock
            </p>
          </div>
        </>
      )}
    </div>
  );
}
