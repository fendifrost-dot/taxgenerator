import { useState } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { 
  AlertTriangle, 
  Check, 
  HelpCircle, 
  X, 
  ArrowLeftRight,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Split,
  AlertCircle,
  Paperclip
} from 'lucide-react';
import { Transaction, TransactionState, SplitAllocation, EvidenceStatus } from '@/types/tax';
import { DataAmount } from '@/components/ui/DataAmount';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { analyzeOtherExpenses, suggestCategoryReassignment } from '@/lib/otherExpenseGuard';

const stateConfig: Record<TransactionState, { icon: typeof Check; label: string; color: string; bg: string }> = {
  deductible: { icon: Check, label: 'Deductible', color: 'text-status-success', bg: 'bg-status-success/10' },
  requires_decision: { icon: HelpCircle, label: 'Requires Decision', color: 'text-status-warning', bg: 'bg-status-warning/10' },
  non_deductible: { icon: X, label: 'Non-Deductible', color: 'text-status-error', bg: 'bg-status-error/10' },
  not_expense: { icon: ArrowLeftRight, label: 'Not an Expense', color: 'text-muted-foreground', bg: 'bg-muted' },
};

const evidenceStatusConfig: Record<EvidenceStatus, { label: string; color: string }> = {
  present: { label: 'Present', color: 'text-status-success' },
  missing: { label: 'Missing', color: 'text-status-error' },
  pending: { label: 'Pending', color: 'text-status-warning' },
  not_required: { label: 'Not Required', color: 'text-muted-foreground' },
};

export function TransactionsPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const { transactions, addTransaction, updateTransaction, categories, evidence, addEvidence, addCustomCategory } = useWorkflow();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<TransactionState | 'all'>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [classifyDialogOpen, setClassifyDialogOpen] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomLine, setNewCustomLine] = useState('27a');
  
  // Form states for classification
  const [newState, setNewState] = useState<TransactionState>('requires_decision');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [businessPurpose, setBusinessPurpose] = useState('');
  const [rationale, setRationale] = useState('');

  // Form state for adding transaction
  const [newTransaction, setNewTransaction] = useState({
    date: '',
    description: '',
    amount: '',
    source: '',
  });

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

  const yearTransactions = transactions.filter(t => t.taxYear === currentYear);
  
  const filteredTransactions = yearTransactions.filter(t => {
    const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterState === 'all' || t.state === filterState;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: yearTransactions.length,
    deductible: yearTransactions.filter(t => t.state === 'deductible').length,
    requiresDecision: yearTransactions.filter(t => t.state === 'requires_decision').length,
    nonDeductible: yearTransactions.filter(t => t.state === 'non_deductible').length,
    notExpense: yearTransactions.filter(t => t.state === 'not_expense').length,
    missingEvidence: yearTransactions.filter(t => t.state === 'deductible' && t.evidenceStatus === 'missing').length,
  };

  const totalDeductible = yearTransactions
    .filter(t => t.state === 'deductible')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const otherExpenseWarnings = analyzeOtherExpenses(yearTransactions, categories, currentYear!);

  const handleCreateCustomCategory = () => {
    const name = newCustomName.trim();
    if (!name) {
      toast.error('Enter a category name');
      return;
    }
    const id = `custom_${Date.now()}`;
    addCustomCategory({
      id,
      name,
      scheduleCLine: newCustomLine.trim() || '27a',
      deductibilityRules: `User-defined: ${name}`,
      evidenceExpectations: 'Receipt or invoice with business context',
      evidenceRequired: true,
      requiresBusinessPurpose: true,
    });
    setSelectedCategory(id);
    setCreateCategoryOpen(false);
    setNewCustomName('');
    setNewCustomLine('27a');
    toast.success('Category created');
  };

  const handleClassify = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setNewState(txn.state === 'requires_decision' ? 'deductible' : txn.state);
    setSelectedCategory(txn.categoryId || '');
    setBusinessPurpose(txn.businessPurpose || '');
    setRationale(txn.rationale || '');
    setClassifyDialogOpen(true);
  };

  const handleConfirmClassification = () => {
    if (!selectedTransaction) return;

    if (newState === 'requires_decision') {
      toast.error('Choose a terminal classification (deductible, non-deductible, or not an expense).');
      return;
    }

    const category = categories.find(c => c.id === selectedCategory);
    const requiresEvidence = category?.evidenceRequired ?? true;
    const requiresPurpose = category?.requiresBusinessPurpose ?? false;

    // Validate business purpose if required
    if (newState === 'deductible' && requiresPurpose && !businessPurpose.trim()) {
      toast.error('Business purpose is required for this category');
      return;
    }

    // Validate rationale
    if (!rationale.trim()) {
      toast.error('Rationale is required for all classifications');
      return;
    }

    updateTransaction(selectedTransaction.id, {
      state: newState,
      categoryId: selectedCategory || undefined,
      scheduleCLine: category?.scheduleCLine,
      businessPurpose: businessPurpose || undefined,
      rationale,
      evidenceStatus: newState === 'deductible' && requiresEvidence ? 'missing' : 'not_required',
      requiresBusinessPurpose: requiresPurpose,
      confirmedAt: new Date(),
    });

    setClassifyDialogOpen(false);
    setSelectedTransaction(null);
  };

  const handleAddTransaction = () => {
    if (!currentYear) return;

    const txnDate = new Date(newTransaction.date);
    if (Number.isNaN(txnDate.getTime()) || txnDate.getFullYear() !== currentYear) {
      toast.error(`Transaction date must fall within tax year ${currentYear} (Jan 1 – Dec 31).`);
      return;
    }

    const txn: Transaction = {
      id: `txn_${Date.now()}`,
      date: txnDate,
      description: newTransaction.description,
      amount: parseFloat(newTransaction.amount),
      source: newTransaction.source,
      state: 'requires_decision',
      evidenceStatus: 'pending',
      requiresBusinessPurpose: false,
      taxYear: currentYear,
    };

    addTransaction(txn);
    setAddDialogOpen(false);
    setNewTransaction({ date: '', description: '', amount: '', source: '' });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Transaction Engine
          </h1>
          <p className="text-muted-foreground mt-1">
            Categorize and resolve all transactions for tax year {currentYear}
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Transaction
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
        <Card className="border-accent/50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-accent">
              ${totalDeductible.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Deductible $</div>
          </CardContent>
        </Card>
      </div>

      {/* Missing Evidence Warning */}
      {stats.missingEvidence > 0 && (
        <Card className="border-status-error/50 bg-status-error/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-status-error mt-0.5" />
              <div>
                <p className="font-medium text-sm">Evidence Required</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats.missingEvidence} deductible expense(s) are missing required evidence. 
                  These will be excluded from totals until evidence is attached.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {otherExpenseWarnings.length > 0 && (
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-status-warning mt-0.5" />
              <div>
                <p className="font-medium text-sm">Other Expenses Review</p>
                {otherExpenseWarnings.map((w, i) => (
                  <p key={i} className="text-sm text-muted-foreground mt-1">{w.message}</p>
                ))}
                <p className="text-xs text-muted-foreground mt-2">
                  Use the Classify button to reassign transactions to specific categories or create a new expense group.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                const count = state === 'deductible' ? stats.deductible :
                              state === 'requires_decision' ? stats.requiresDecision :
                              state === 'non_deductible' ? stats.nonDeductible : stats.notExpense;
                return (
                  <div
                    key={state}
                    className={cn(
                      'flex items-center justify-between p-2 rounded border cursor-pointer transition-colors',
                      filterState === state && 'ring-2 ring-accent',
                      config.bg
                    )}
                    onClick={() => setFilterState(filterState === state ? 'all' : state)}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn('w-4 h-4', config.color)} />
                      <span className="text-sm">{config.label}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">{count}</Badge>
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
          {filterState !== 'all' && (
            <Button variant="ghost" size="sm" onClick={() => setFilterState('all')}>
              Clear filter
              <X className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        {filteredTransactions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <ArrowLeftRight className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No Transactions</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload bank statements or payment processor exports from the Documents section, or add manually
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
                  <TableHead className="w-[160px]">State</TableHead>
                  <TableHead className="w-[120px]">Category</TableHead>
                  <TableHead className="w-[80px]">Evidence</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((txn) => {
                  const config = stateConfig[txn.state];
                  const Icon = config.icon;
                  const category = categories.find(c => c.id === txn.categoryId);
                  const evConfig = evidenceStatusConfig[txn.evidenceStatus];
                  
                  return (
                    <TableRow key={txn.id}>
                      <TableCell className="cell-date">
                        {txn.date.toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{txn.description}</div>
                        {txn.businessPurpose && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Purpose: {txn.businessPurpose}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{txn.source}</TableCell>
                      <TableCell>
                        <DataAmount value={txn.amount} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', config.color, config.bg)}>
                          <Icon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {category ? (
                          <span className="text-xs text-muted-foreground">
                            Line {category.scheduleCLine}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {txn.state === 'deductible' && (
                          <span className={cn('text-xs', evConfig.color)}>
                            {txn.evidenceStatus === 'present' && (
                              <Paperclip className="w-3 h-3 inline mr-1" />
                            )}
                            {evConfig.label}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleClassify(txn)}
                          >
                            Classify
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
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
          <p>• Evidence must be attached before expense can be included in totals</p>
          <p>• Business purpose is required for meals, travel, and gifts categories</p>
        </CardContent>
      </Card>

      {/* Classification Dialog */}
      <Dialog open={classifyDialogOpen} onOpenChange={setClassifyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Classify Transaction</DialogTitle>
            <DialogDescription>
              Assign a terminal state to this transaction. This action requires rationale.
            </DialogDescription>
          </DialogHeader>
          
          {selectedTransaction && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-secondary rounded-lg">
                <div className="font-medium">{selectedTransaction.description}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {selectedTransaction.date.toLocaleDateString()} • <DataAmount value={selectedTransaction.amount} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Terminal State</Label>
                <Select value={newState} onValueChange={(v) => setNewState(v as TransactionState)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deductible">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-status-success" />
                        Deductible Business Expense
                      </div>
                    </SelectItem>
                    <SelectItem value="non_deductible">
                      <div className="flex items-center gap-2">
                        <X className="w-4 h-4 text-status-error" />
                        Non-Deductible / Personal
                      </div>
                    </SelectItem>
                    <SelectItem value="not_expense">
                      <div className="flex items-center gap-2">
                        <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                        Not an Expense (Transfer/Refund)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newState === 'deductible' && (
                <>
                  <div className="space-y-2">
                    <Label>Schedule C Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            Line {cat.scheduleCLine}: {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full mt-1"
                      onClick={() => setCreateCategoryOpen(true)}
                    >
                      Create new category…
                    </Button>
                    {selectedTransaction?.scheduleCLine === '27a' && selectedCategory === 'other_expenses' && (
                      (() => {
                        const suggestions = suggestCategoryReassignment(selectedTransaction, categories);
                        return suggestions.length > 0 ? (
                          <div className="p-2 bg-status-warning/10 rounded text-xs">
                            <p className="font-medium text-status-warning">Suggested reassignment:</p>
                            {suggestions.map(s => (
                              <Button
                                key={s.id}
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs mt-1 block h-auto py-1"
                                onClick={() => setSelectedCategory(s.id)}
                              >
                                → Line {s.scheduleCLine}: {s.name}
                              </Button>
                            ))}
                          </div>
                        ) : null;
                      })()
                    )}
                    {selectedCategory && (
                      <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                        {categories.find(c => c.id === selectedCategory)?.deductibilityRules}
                      </div>
                    )}
                  </div>

                  {categories.find(c => c.id === selectedCategory)?.requiresBusinessPurpose && (
                    <div className="space-y-2">
                      <Label>Business Purpose (Required)</Label>
                      <Textarea
                        value={businessPurpose}
                        onChange={(e) => setBusinessPurpose(e.target.value)}
                        placeholder="Describe the business purpose..."
                        rows={2}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label>Rationale (Required)</Label>
                <Textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Explain why this classification is correct..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setClassifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmClassification}
              disabled={!rationale.trim() || (newState === 'deductible' && !selectedCategory)}
            >
              Confirm Classification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New expense category</DialogTitle>
            <DialogDescription>
              Define a custom Schedule C group (often Line 27a) instead of using the generic Other bucket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newCustomName}
                onChange={e => setNewCustomName(e.target.value)}
                placeholder="e.g., Software subscriptions"
              />
            </div>
            <div className="space-y-2">
              <Label>Schedule C line</Label>
              <Input
                value={newCustomLine}
                onChange={e => setNewCustomLine(e.target.value)}
                placeholder="27a"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCategoryOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCustomCategory}>Create and use</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Transaction Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>
              Manually add a transaction for tax year {currentYear}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={newTransaction.date}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={newTransaction.description}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Transaction description..."
              />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                value={newTransaction.amount}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Input
                value={newTransaction.source}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, source: e.target.value }))}
                placeholder="e.g., Chase Checking, PayPal..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddTransaction}
              disabled={!newTransaction.date || !newTransaction.description || !newTransaction.amount}
            >
              Add Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
