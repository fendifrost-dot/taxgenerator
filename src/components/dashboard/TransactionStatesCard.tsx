import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, HelpCircle, X, ArrowLeftRight } from 'lucide-react';

const states = [
  {
    icon: Check,
    label: 'Deductible Business Expense',
    description: 'Confirmed deductible with evidence',
    color: 'text-status-success',
    bgColor: 'bg-status-success/10',
  },
  {
    icon: HelpCircle,
    label: 'Requires User Decision',
    description: 'Needs classification or rationale',
    color: 'text-status-warning',
    bgColor: 'bg-status-warning/10',
  },
  {
    icon: X,
    label: 'Non-Deductible / Personal',
    description: 'Not a business expense',
    color: 'text-status-error',
    bgColor: 'bg-status-error/10',
  },
  {
    icon: ArrowLeftRight,
    label: 'Not an Expense',
    description: 'Transfer, refund, loan, CC payment',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
];

export function TransactionStatesCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Transaction Terminal States</CardTitle>
        <CardDescription className="text-xs">
          Every transaction must terminate in exactly one of these states
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {states.map((state) => (
            <div
              key={state.label}
              className={`flex items-center gap-3 p-2 rounded ${state.bgColor}`}
            >
              <state.icon className={`w-4 h-4 ${state.color}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{state.label}</div>
                <div className="text-xs text-muted-foreground">{state.description}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 italic">
          No "miscellaneous" category is allowed
        </p>
      </CardContent>
    </Card>
  );
}
