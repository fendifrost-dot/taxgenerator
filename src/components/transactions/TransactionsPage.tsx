import { useState } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  AlertTriangle, 
  Check, 
  HelpCircle, 
  X, 
  ArrowLeftRight,
  Search,
  Filter,
  ChevronDown,
  FileText,
  Link as LinkIcon
} from 'lucide-react';
import { Transaction, TransactionState } from '@/types/tax';
import { DataAmount } from '@/components/ui/DataAmount';
import { cn } from '@/lib/utils';

const stateConfig: Record<TransactionState, { icon: typeof Check; label: string; color: string }> = {
  deductible: { icon: Check, label: 'Deductible', color: 'text-status-success' },
  requires_decision: { icon: HelpCircle, label: 'Requires Decision', color: 'text-status-warning' },
  non_deductible: { icon: X, label: 'Non-Deductible', color: 'text-status-error' },
  not_expense: { icon: ArrowLeftRight, label: 'Not an Expense', color: 'text-muted-foreground' },
};

// Mock transactions for demonstration
const mockTransactions: Transaction[] = [];

export function TransactionsPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<TransactionState | 'all'>('all');

  if (!isYearSelected) {
    return (
      <div className="p-6">
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-status-warning mx-auto mb-4" />
            <h3 className="text-lg font-medium">Tax Year Required</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Please select a tax year from the Dashboard before managing transactions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterState === 'all' || t.state === filterState;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: transactions.length,
    deductible: transactions.filter(t => t.state === 'deductible').length,
    requiresDecision: transactions.filter(t => t.state === 'requires_decision').length,
    nonDeductible: transactions.filter(t => t.state === 'non_deductible').length,
    notExpense: transactions.filter(t => t.state === 'not_expense').length,
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Transaction Engine
        </h1>
        <p className="text-muted-foreground mt-1">
          Categorize and resolve all transactions for tax year {currentYear}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold">{stats.total}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
          </CardContent>
        </Card>
        <Card className="border-status-success/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-success">{stats.deductible}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Deductible</div>
          </CardContent>
        </Card>
        <Card className="border-status-warning/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-warning">{stats.requiresDecision}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Pending</div>
          </CardContent>
        </Card>
        <Card className="border-status-error/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-error">{stats.nonDeductible}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Personal</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-muted-foreground">{stats.notExpense}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Transfers</div>
          </CardContent>
        </Card>
      </div>

      {/* Terminal States Reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Transaction Terminal States (Mandatory)</CardTitle>
          <CardDescription className="text-xs">
            Every transaction must terminate in exactly one of these four states. No "miscellaneous" allowed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.entries(stateConfig) as [TransactionState, typeof stateConfig[TransactionState]][]).map(
              ([state, config]) => {
                const Icon = config.icon;
                return (
                  <div
                    key={state}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors',
                      filterState === state && 'ring-2 ring-accent'
                    )}
                    onClick={() => setFilterState(filterState === state ? 'all' : state)}
                  >
                    <Icon className={cn('w-4 h-4', config.color)} />
                    <span className="text-sm">{config.label}</span>
                  </div>
                );
              }
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Transactions Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Filters
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {filteredTransactions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <ArrowLeftRight className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No Transactions</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload bank statements or payment processor exports from the Documents section
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[140px]">State</TableHead>
                  <TableHead className="w-[80px]">Evidence</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((txn) => {
                  const config = stateConfig[txn.state];
                  const Icon = config.icon;
                  
                  return (
                    <TableRow key={txn.id}>
                      <TableCell className="cell-date">
                        {txn.date.toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">{txn.description}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{txn.source}</TableCell>
                      <TableCell>
                        <DataAmount value={txn.amount} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', config.color)}>
                          <Icon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {txn.evidenceStatus === 'present' && (
                          <span className="evidence-indicator evidence-present inline-block" />
                        )}
                        {txn.evidenceStatus === 'missing' && (
                          <span className="evidence-indicator evidence-missing inline-block" />
                        )}
                        {txn.evidenceStatus === 'pending' && (
                          <span className="evidence-indicator evidence-pending inline-block" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Categorization Rules */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Categorization Rules</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <p>• Every expense must map directly to Schedule C lines</p>
          <p>• Transaction splitting and percentage allocations require rationale and confirmation</p>
          <p>• AI may suggest categories but may not auto-claim fact-dependent deductions</p>
          <p>• Evidence must be attached before expense can be marked deductible</p>
        </CardContent>
      </Card>
    </div>
  );
}
