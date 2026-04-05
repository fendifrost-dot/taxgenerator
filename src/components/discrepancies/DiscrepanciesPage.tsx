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
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Star,
  ExternalLink,
  Clock,
  ShieldAlert,
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
import { generateCureOptions, CureOption, RISK_CONFIG } from '@/lib/cureOptions';

const severityConfig: Record<DiscrepancySeverity, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: 'text-status-error', bg: 'bg-status-error/10' },
  material: { label: 'Material', color: 'text-status-warning', bg: 'bg-status-warning/10' },
  minor: { label: 'Minor', color: 'text-muted-foreground', bg: 'bg-muted' },
  informational: { label: 'Informational', color: 'text-blue-600', bg: 'bg-blue-50' },
};

// ─── Cure Options Panel ──────────────────────────────────────────────────────

function CureOptionCard({ opt, index }: { opt: CureOption; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const risk = RISK_CONFIG[opt.risk];

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden',
      risk.border,
      opt.recommended && 'ring-1 ring-sidebar-primary/40'
    )}>
      <button
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={cn('mt-0.5 text-xs font-mono w-5 h-5 rounded flex items-center justify-center shrink-0', risk.bg, risk.color)}>
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{opt.title}</span>
            <Badge variant="outline" className={cn('text-xs', risk.color, risk.bg)}>
              {risk.label}
            </Badge>
            {opt.recommended && (
              <Badge variant="outline" className="text-xs text-sidebar-primary border-sidebar-primary/40 bg-sidebar-primary/10">
                <Star className="w-2.5 h-2.5 mr-1" />
                Recommended
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{opt.summary}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
          {/* Steps */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Steps</div>
            <ol className="space-y-2">
              {opt.steps.map(step => (
                <li key={step.order} className="flex gap-2 text-sm">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-mono">
                    {step.order}
                  </span>
                  <div>
                    <div>{step.action}</div>
                    {step.detail && (
                      <div className="text-xs text-muted-foreground mt-0.5">{step.detail}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {opt.estimatedTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {opt.estimatedTime}
              </div>
            )}
            {opt.irsAuthority && (
              <div className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                <span className="font-mono">{opt.irsAuthority}</span>
              </div>
            )}
          </div>

          {/* Caveats */}
          {opt.caveats && opt.caveats.length > 0 && (
            <div className="space-y-1">
              {opt.caveats.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-status-warning/10 border border-status-warning/20">
                  <ShieldAlert className="w-3 h-3 text-status-warning shrink-0 mt-0.5" />
                  <span className="text-status-warning">{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CureOptionsPanel({ disc }: { disc: Discrepancy }) {
  const opts = generateCureOptions(disc);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Lightbulb className="w-3 h-3" />
        Cure Options ({opts.length})
      </div>
      {opts.map((opt, i) => (
        <CureOptionCard key={opt.id} opt={opt} index={i} />
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function DiscrepanciesPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const { discrepancies, resolveDiscrepancy } = useWorkflow();
  const [expandedCures, setExpandedCures] = useState<Set<string>>(new Set());

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

  const toggleCures = (id: string) => {
    setExpandedCures(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleResolve = (id: string, resolution: Discrepancy['resolution']) => {
    resolveDiscrepancy(id, resolution);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Discrepancy Resolution</h1>
        <p className="text-muted-foreground mt-1">
          Review anomalies, explore cure options, and resolve conflicts for tax year {currentYear}
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
                  Expand each item below to view step-by-step cure options.
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
          <div className="space-y-4">
            {yearDiscrepancies.map(disc => {
              const sevConfig = severityConfig[disc.severity];
              const showCures = expandedCures.has(disc.id);
              return (
                <Card key={disc.id} className={cn(disc.resolution && 'opacity-60')}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={cn('p-2 rounded shrink-0', sevConfig.bg)}>
                          <AlertCircle className={cn('w-4 h-4', sevConfig.color)} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
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

                          {/* Cure options (unresolved only) */}
                          {!disc.resolution && (
                            <div className="mt-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7 px-2 gap-1"
                                onClick={() => toggleCures(disc.id)}
                              >
                                <Lightbulb className="w-3 h-3" />
                                {showCures ? 'Hide' : 'Show'} Cure Options
                                {showCures ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </Button>
                              {showCures && <CureOptionsPanel disc={disc} />}
                            </div>
                          )}
                        </div>
                      </div>
                      {!disc.resolution && (
                        <Select onValueChange={(v) => handleResolve(disc.id, v as Discrepancy['resolution'])}>
                          <SelectTrigger className="w-[140px] shrink-0">
                            <SelectValue placeholder="Resolve..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="source1">Use Source 1</SelectItem>
                            {disc.source2 && <SelectItem value="source2">Use Source 2</SelectItem>}
                            <SelectItem value="manual">Manual Entry</SelectItem>
                            <SelectItem value="excluded">Exclude</SelectItem>
                            <SelectItem value="confirmed">Confirmed OK</SelectItem>
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
