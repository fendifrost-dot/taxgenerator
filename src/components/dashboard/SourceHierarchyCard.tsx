import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const hierarchy = [
  {
    level: 1,
    source: 'IRS-issued forms',
    examples: 'W-2, 1099',
    priority: 'Highest',
  },
  {
    level: 2,
    source: 'Annual payer/processor summaries',
    examples: 'Year-end statements',
    priority: 'High',
  },
  {
    level: 3,
    source: 'Bank statements',
    examples: 'Monthly statements',
    priority: 'Medium',
  },
  {
    level: 4,
    source: 'Transaction-level exports',
    examples: 'CSV, transaction history',
    priority: 'Lowest',
  },
];

export function SourceHierarchyCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Source-of-Truth Hierarchy</CardTitle>
        <CardDescription className="text-xs">
          When discrepancies exist, sources are prioritized in this order
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {hierarchy.map((item, idx) => (
            <div
              key={item.level}
              className={cn(
                'flex items-center gap-3 p-2 rounded border-l-2',
                idx === 0 && 'border-l-status-success bg-status-success/5',
                idx === 1 && 'border-l-accent bg-accent/5',
                idx === 2 && 'border-l-muted-foreground bg-muted/30',
                idx === 3 && 'border-l-border bg-muted/10'
              )}
            >
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-semibold">
                {item.level}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.source}</div>
                <div className="text-xs text-muted-foreground">{item.examples}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 italic">
          Conflicts must be flagged for review. Automatic resolution is forbidden.
        </p>
      </CardContent>
    </Card>
  );
}
