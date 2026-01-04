import { cn } from '@/lib/utils';
import { Check, AlertTriangle, Clock, Lock, XCircle } from 'lucide-react';

type StatusType = 'success' | 'warning' | 'error' | 'pending' | 'locked';

interface StatusBadgeProps {
  status: StatusType;
  label: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

const statusConfig: Record<StatusType, { icon: typeof Check; className: string }> = {
  success: { 
    icon: Check, 
    className: 'status-badge-success' 
  },
  warning: { 
    icon: AlertTriangle, 
    className: 'status-badge-warning' 
  },
  error: { 
    icon: XCircle, 
    className: 'status-badge-error' 
  },
  pending: { 
    icon: Clock, 
    className: 'status-badge-pending' 
  },
  locked: { 
    icon: Lock, 
    className: 'bg-primary/10 text-primary' 
  },
};

export function StatusBadge({ status, label, showIcon = true, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'status-badge',
        config.className,
        size === 'sm' && 'text-[10px] px-1.5 py-0.5'
      )}
    >
      {showIcon && <Icon className={cn('mr-1', size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3')} />}
      {label}
    </span>
  );
}
