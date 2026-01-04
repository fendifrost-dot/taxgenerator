import { useTaxYear } from '@/contexts/TaxYearContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TaxYearSelector() {
  const { currentYear, setCurrentYear, availableYears, isYearSelected } = useTaxYear();

  return (
    <Card className="border-2 border-dashed border-accent/50">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          {!isYearSelected ? (
            <AlertTriangle className="w-5 h-5 text-accent mt-0.5" />
          ) : (
            <CheckCircle className="w-5 h-5 text-status-success mt-0.5" />
          )}
          <div>
            <CardTitle className="text-lg">Tax Year Selection</CardTitle>
            <CardDescription className="mt-1">
              {isYearSelected
                ? `Working on tax year ${currentYear}. All rules, forms, and calculations will reference this year only.`
                : 'Select a tax year to begin. All workflow steps are bound to this year.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {availableYears.map((year) => (
            <Button
              key={year}
              variant={currentYear === year ? 'default' : 'outline'}
              size="lg"
              onClick={() => setCurrentYear(year)}
              className={cn(
                'font-mono text-lg px-6',
                currentYear === year && 'ring-2 ring-offset-2 ring-primary'
              )}
            >
              {year}
            </Button>
          ))}
        </div>
        {!isYearSelected && (
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" />
            Navigation is disabled until a tax year is selected
          </p>
        )}
      </CardContent>
    </Card>
  );
}
