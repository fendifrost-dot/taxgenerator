import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle,
  BarChart3,
  Download,
  FileText,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Archive
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function ReportsPage() {
  const { currentYear, isYearSelected, yearConfig } = useTaxYear();
  const { transactions, incomeReconciliations, categories, evidence } = useWorkflow();

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

  const yearTransactions = transactions.filter(t => t.taxYear === currentYear);
  const yearIncome = incomeReconciliations.filter(r => r.taxYear === currentYear);
  const yearEvidence = evidence.filter(e => e.taxYear === currentYear);
  
  const deductible = yearTransactions.filter(t => t.state === 'deductible' && t.evidenceStatus === 'present');
  
  const totalGrossIncome = yearIncome.reduce((sum, r) => sum + r.grossAmount, 0);
  const totalFees = yearIncome.reduce((sum, r) => sum + r.fees, 0);
  const totalExpenses = deductible.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const netProfit = totalGrossIncome - totalFees - totalExpenses;

  // Group by category
  const categoryTotals = categories.map(cat => {
    const catTxns = deductible.filter(t => t.categoryId === cat.id);
    return {
      ...cat,
      total: catTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0),
      count: catTxns.length,
    };
  }).filter(c => c.count > 0).sort((a, b) => b.total - a.total);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports & P&L</h1>
          <p className="text-muted-foreground mt-1">
            Financial reports and audit pack for tax year {currentYear}
          </p>
        </div>
      </div>

      <Tabs defaultValue="pl" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="categories">Category Breakdown</TabsTrigger>
          <TabsTrigger value="audit">Audit Pack</TabsTrigger>
        </TabsList>

        <TabsContent value="pl" className="space-y-6">
          {/* P&L Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-status-success mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Gross Income</span>
                </div>
                <div className="text-2xl font-mono font-semibold">
                  ${totalGrossIncome.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Fees</span>
                </div>
                <div className="text-2xl font-mono font-semibold text-muted-foreground">
                  -${totalFees.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-status-error mb-2">
                  <TrendingDown className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Expenses</span>
                </div>
                <div className="text-2xl font-mono font-semibold text-status-error">
                  -${totalExpenses.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="border-accent/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-accent mb-2">
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Net Profit</span>
                </div>
                <div className={cn(
                  'text-2xl font-mono font-semibold',
                  netProfit >= 0 ? 'text-status-success' : 'text-status-error'
                )}>
                  ${netProfit.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* P&L Statement */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Profit & Loss Statement</CardTitle>
              <CardDescription>Tax Year {currentYear} • Annual</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-b pb-4">
                  <div className="text-sm font-semibold text-muted-foreground mb-2">INCOME</div>
                  <div className="flex justify-between py-1">
                    <span>Gross Revenue ({yearIncome.length} sources)</span>
                    <span className="font-mono">${totalGrossIncome.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1 text-muted-foreground">
                    <span>Less: Fees</span>
                    <span className="font-mono">-${totalFees.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1 font-semibold border-t mt-2 pt-2">
                    <span>Net Revenue</span>
                    <span className="font-mono">${(totalGrossIncome - totalFees).toLocaleString()}</span>
                  </div>
                </div>

                <div className="border-b pb-4">
                  <div className="text-sm font-semibold text-muted-foreground mb-2">EXPENSES</div>
                  {categoryTotals.slice(0, 8).map(cat => (
                    <div key={cat.id} className="flex justify-between py-1">
                      <span>Line {cat.scheduleCLine}: {cat.name}</span>
                      <span className="font-mono">-${cat.total.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1 font-semibold border-t mt-2 pt-2">
                    <span>Total Expenses</span>
                    <span className="font-mono">-${totalExpenses.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex justify-between py-2 text-lg font-semibold">
                  <span>NET PROFIT (LOSS)</span>
                  <span className={cn(
                    'font-mono',
                    netProfit >= 0 ? 'text-status-success' : 'text-status-error'
                  )}>
                    ${netProfit.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export P&L (PDF)
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export Ledger (CSV)
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="categories" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Expense Categories (Schedule C Mapping)</CardTitle>
              <CardDescription>Only includes substantiated expenses with evidence</CardDescription>
            </CardHeader>
            <CardContent>
              {categoryTotals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No categorized expenses yet
                </div>
              ) : (
                <div className="space-y-3">
                  {categoryTotals.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">
                          <span className="font-mono text-sm">Line {cat.scheduleCLine}:</span> {cat.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {cat.count} transaction(s) • {cat.deductibilityRules}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-semibold">${cat.total.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {((cat.total / totalExpenses) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Audit Pack Contents
              </CardTitle>
              <CardDescription>
                Complete audit-ready package reconciled to tax returns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium">Federal Return Package</span>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Form 1040</li>
                    <li>• Schedule C (if applicable)</li>
                    <li>• Schedule SE (if applicable)</li>
                    <li>• Supporting schedules</li>
                  </ul>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium">State Return Packages</span>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {yearConfig?.states.map(s => (
                      <li key={s.stateCode}>• {s.stateName} Return</li>
                    ))}
                    {!yearConfig?.states.length && <li>No states configured</li>}
                  </ul>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium">Reconciliation Schedules</span>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Federal→State reconciliation</li>
                    <li>• Income reconciliation</li>
                    <li>• Expense reconciliation</li>
                  </ul>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium">Substantiation Index</span>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Evidence index ({yearEvidence.length} files)</li>
                    <li>• Transaction ledger ({yearTransactions.length} items)</li>
                    <li>• Invoice register</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button disabled={yearConfig?.status !== 'finalized'}>
            <Download className="w-4 h-4 mr-2" />
            Generate Audit Pack (PDF)
          </Button>
          {yearConfig?.status !== 'finalized' && (
            <p className="text-xs text-status-warning">
              Year must be finalized before generating audit pack
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
