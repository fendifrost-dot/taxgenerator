import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkflowDot } from '@/components/ui/WorkflowDot';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LucideIcon } from 'lucide-react';
import { WorkflowStatus } from '@/types/tax';
import { cn } from '@/lib/utils';

interface WorkflowStatusCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  status: WorkflowStatus;
  stats?: {
    label: string;
    value: string | number;
    type?: 'default' | 'warning' | 'error';
  }[];
  onClick?: () => void;
}

const statusLabels: Record<WorkflowStatus, string> = {
  unresolved: 'In Progress',
  confirmed: 'Complete',
  flagged: 'Needs Review',
  locked: 'Locked',
};

const statusTypes: Record<WorkflowStatus, 'success' | 'warning' | 'error' | 'pending' | 'locked'> = {
  unresolved: 'pending',
  confirmed: 'success',
  flagged: 'error',
  locked: 'locked',
};

export function WorkflowStatusCard({
  title,
  description,
  icon: Icon,
  status,
  stats,
  onClick,
}: WorkflowStatusCardProps) {
  return (
    <Card
      className={cn(
        'transition-all cursor-pointer hover:shadow-md hover:border-accent/50',
        status === 'flagged' && 'border-status-error/30',
        status === 'confirmed' && 'border-status-success/30',
        status === 'locked' && 'border-primary/30 bg-muted/30'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary rounded-md">
              <Icon className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
          <StatusBadge status={statusTypes[status]} label={statusLabels[status]} size="sm" />
        </div>
      </CardHeader>
      {stats && stats.length > 0 && (
        <CardContent className="pt-2">
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat, idx) => (
              <div key={idx} className="text-center p-2 bg-muted/50 rounded">
                <div
                  className={cn(
                    'text-lg font-mono font-semibold',
                    stat.type === 'warning' && 'text-status-warning',
                    stat.type === 'error' && 'text-status-error'
                  )}
                >
                  {stat.value}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
