import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Construction, XCircle, ArrowRight } from 'lucide-react';
import { useTaxYear } from '@/contexts/TaxYearContext';

interface NotImplementedPageProps {
  title: string;
  description: string;
  blocksDownstream?: string[];
  requiredGates?: string[];
}

export function NotImplementedPage({ title, description, blocksDownstream, requiredGates }: NotImplementedPageProps) {
  const { isYearSelected, currentYear } = useTaxYear();

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
        <p className="text-muted-foreground mt-1">{description} • Tax Year {currentYear}</p>
      </div>
      
      <Card className="border-status-warning/50 bg-status-warning/5">
        <CardContent className="py-8">
          <div className="flex items-start gap-4">
            <Construction className="w-8 h-8 text-status-warning shrink-0" />
            <div>
              <h3 className="text-lg font-medium">Not Implemented</h3>
              <p className="text-sm text-muted-foreground mt-2">
                This module is part of the comprehensive tax preparation system and is not yet implemented.
                All downstream actions that depend on this module are blocked.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {blocksDownstream && blocksDownstream.length > 0 && (
        <Card className="border-status-error/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4 text-status-error" />
              Blocks Downstream Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {blocksDownstream.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <ArrowRight className="w-3 h-3" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {requiredGates && requiredGates.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Required Gates (Before Implementation)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {requiredGates.map((gate, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                  {gate}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
