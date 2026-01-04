import { cn } from '@/lib/utils';

interface DataAmountProps {
  value: number;
  showSign?: boolean;
  currency?: boolean;
  className?: string;
}

export function DataAmount({ value, showSign = false, currency = true, className }: DataAmountProps) {
  const isNegative = value < 0;
  const isPositive = value > 0;
  const absValue = Math.abs(value);

  const formatted = currency
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(absValue)
    : new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(absValue);

  const signPrefix = showSign
    ? isNegative
      ? '−'
      : isPositive
      ? '+'
      : ''
    : isNegative
    ? '−'
    : '';

  return (
    <span
      className={cn(
        'data-amount',
        isNegative && 'data-negative',
        isPositive && showSign && 'data-positive',
        className
      )}
    >
      {signPrefix}
      {formatted}
    </span>
  );
}
