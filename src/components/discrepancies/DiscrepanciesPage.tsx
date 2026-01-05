import { useState } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle,
  Check,
  XCircle,
  AlertCircle,
  FileText,
  DollarSign,
  Calendar
} from 'lucide-react';
import { Discrepancy, DiscrepancySeverity } from '@/types/tax';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const severityConfig: Record<DiscrepancySeverity, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: 'text-status-error', bg: 'bg-status-error/10' },
  material: { label: 'Material', color: 'text-status-warning', bg: 'bg-status-warning/10' },
  minor: { label: 'Minor', color: 'text-muted-foreground', bg: 'bg-muted' },
};

export function DiscrepanciesPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const { discrepancies, resolveDiscrepancy } = useWorkflow();

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

  const yearDiscrepancies = discrepancies.filter(d => d.taxYear === currentYear);
  const unresolved = yearDiscrepancies.filter(d => !d.resolution);
  const critical = unresolved.filter(d => d.severity === 'critical');
  const material = unresolved.filter(d => d.severity === 'material');

  const handleResolve = (id: string, resolution: Discrepancy['resolution']) => {
    resolveDiscrepancy(id, resolution);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Discrepancy Resolution</h1>
        <p className="text-muted-foreground mt-1">
          Review and resolve conflicts between data sources for tax year {currentYear}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold">{yearDiscrepancies.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
          </CardContent>
        </Card>
        <Card className="border-status-error/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-error">{critical.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Critical</div>
          </CardContent>
        </Card>
        <Card className="border-status-warning/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-warning">{material.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Material</div>
          </CardContent>
        </Card>
        <Card className="border-status-success/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-success">
              {yearDiscrepancies.filter(d => d.resolution).length}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Resolved</div>
          </CardContent>
        </Card>
      </div>

      {(critical.length > 0 || material.length > 0) && (
        <Card className="border-status-error/50 bg-status-error/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-status-error mt-0.5" />
              <div>
                <p className="font-medium text-sm">Return Generation Blocked</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {critical.length + material.length} material discrepancy(ies) must be resolved before generating returns.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      <div>
        <h2 className="text-lg font-semibold mb-4">All Discrepancies ({yearDiscrepancies.length})</h2>
        {yearDiscrepancies.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Check className="w-12 h-12 text-status-success/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No Discrepancies</h3>
              <p className="text-sm text-muted-foreground mt-1">
                All data sources are consistent
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {yearDiscrepancies.map(disc => {
              const sevConfig = severityConfig[disc.severity];
              return (
                <Card key={disc.id} className={cn(
                  disc.resolution && 'opacity-60'
                )}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={cn('p-2 rounded', sevConfig.bg)}>
                          <AlertCircle className={cn('w-4 h-4', sevConfig.color)} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{disc.description}</span>
                            <Badge variant="outline" className={cn('text-xs', sevConfig.color)}>
                              {sevConfig.label}
                            </Badge>
                            {disc.resolution && (
                              <Badge variant="outline" className="text-xs text-status-success">
                                <Check className="w-3 h-3 mr-1" />
                                Resolved
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-2 grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-xs uppercase tracking-wider">Source 1: {disc.source1}</span>
                              <div className="font-mono">{disc.source1Value}</div>
                            </div>
                            {disc.source2 && (
                              <div>
                                <span className="text-xs uppercase tracking-wider">Source 2: {disc.source2}</span>
                                <div className="font-mono">{disc.source2Value}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {!disc.resolution && (
                        <Select onValueChange={(v) => handleResolve(disc.id, v as any)}>
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Resolve..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="source1">Use Source 1</SelectItem>
                            {disc.source2 && <SelectItem value="source2">Use Source 2</SelectItem>}
                            <SelectItem value="manual">Manual Entry</SelectItem>
                            <SelectItem value="excluded">Exclude</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
