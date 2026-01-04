import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Construction } from 'lucide-react';
import { useTaxYear } from '@/contexts/TaxYearContext';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  const { isYearSelected } = useTaxYear();

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <Construction className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            Module Coming Soon
          </h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            This section is part of the comprehensive tax preparation system and will be 
            implemented following the authoritative specification.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
