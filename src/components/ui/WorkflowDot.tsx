import { cn } from '@/lib/utils';
import { WorkflowStatus } from '@/types/tax';

interface WorkflowDotProps {
  status: WorkflowStatus;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3',
};

export function WorkflowDot({ status, size = 'md' }: WorkflowDotProps) {
  return (
    <span
      className={cn(
        'rounded-full inline-block',
        sizeClasses[size],
        status === 'unresolved' && 'workflow-dot-unresolved',
        status === 'confirmed' && 'workflow-dot-confirmed',
        status === 'flagged' && 'workflow-dot-flagged',
        status === 'locked' && 'workflow-dot-locked'
      )}
    />
  );
}
