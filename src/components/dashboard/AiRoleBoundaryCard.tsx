import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X } from 'lucide-react';

const allowed = [
  'Extract data from documents',
  'Classify transactions',
  'Suggest deductions',
  'Explain rules and calculations',
];

const forbidden = [
  'Invent strategies',
  'Make elections',
  'Override rules',
  'Assume facts',
];

export function AiRoleBoundaryCard() {
  return (
    <Card className="border-accent/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">AI Role Boundaries</CardTitle>
        <CardDescription className="text-xs">
          All subjective decisions require explicit user confirmation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-status-success mb-2 flex items-center gap-1">
              <Check className="w-3 h-3" /> AI May
            </div>
            <ul className="space-y-1.5">
              {allowed.map((item) => (
                <li key={item} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-status-success mt-1.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium text-status-error mb-2 flex items-center gap-1">
              <X className="w-3 h-3" /> AI May NOT
            </div>
            <ul className="space-y-1.5">
              {forbidden.map((item) => (
                <li key={item} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-status-error mt-1.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
