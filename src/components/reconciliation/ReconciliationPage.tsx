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
  XCircle,
  Link as LinkIcon,
  Plus,
  ArrowRight,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { IncomeReconciliation } from '@/types/tax';
import { DataAmount } from '@/components/ui/DataAmount';
import { cn } from '@/lib/utils';

export function ReconciliationPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const { 
    incomeReconciliations, 
    addReconciliation, 
    updateReconciliation,
    documents,
    transactions 
  } = useWorkflow();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [selectedRecId, setSelectedRecId] = useState<string>('');
  
  const [formData, setFormData] = useState({
    sourceType: '1099' as IncomeReconciliation['sourceType'],
    sourceDocumentId: '',
    sourceDescription: '',
    grossAmount: '',
    fees: '',
    refundsChargebacks: '',
  });

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

  const yearRecs = incomeReconciliations.filter(r => r.taxYear === currentYear);
  const reconciled = yearRecs.filter(r => r.isReconciled);
  const unreconciled = yearRecs.filter(r => !r.isReconciled);

  // Get income documents (1099s, processor exports)
  const incomeDocuments = documents.filter(d => 
    d.taxYear === currentYear && 
    (d.type === '1099_nec' || d.type === '1099_int' || d.type === '1099_div' || d.type === 'payment_processor')
  );

  // Get deposits (positive transactions)
  const deposits = transactions.filter(t => 
    t.taxYear === currentYear && t.amount > 0
  );

  const totalGross = yearRecs.reduce((sum, r) => sum + r.grossAmount, 0);
  const totalFees = yearRecs.reduce((sum, r) => sum + r.fees, 0);
  const totalNet = yearRecs.reduce((sum, r) => sum + r.netAmount, 0);

  const handleCreateReconciliation = () => {
    if (!currentYear) return;

    const gross = parseFloat(formData.grossAmount) || 0;
    const fees = parseFloat(formData.fees) || 0;
    const refunds = parseFloat(formData.refundsChargebacks) || 0;

    const newRec: IncomeReconciliation = {
      id: `rec_${Date.now()}`,
      sourceType: formData.sourceType,
      sourceDocumentId: formData.sourceDocumentId,
      sourceDescription: formData.sourceDescription,
      grossAmount: gross,
      fees: fees,
      refundsChargebacks: refunds,
      netAmount: gross - fees - refunds,
      matchedDepositIds: [],
      matchedTransactionIds: [],
      isReconciled: false,
      taxYear: currentYear,
    };

    addReconciliation(newRec);
    setCreateDialogOpen(false);
    setFormData({
      sourceType: '1099',
      sourceDocumentId: '',
      sourceDescription: '',
      grossAmount: '',
      fees: '',
      refundsChargebacks: '',
    });
  };

  const handleMarkReconciled = (id: string) => {
    updateReconciliation(id, { isReconciled: true });
  };

  const handleAddDiscrepancyNote = (id: string, note: string, amount: number) => {
    updateReconciliation(id, { 
      isReconciled: true,
      discrepancyNote: note,
      discrepancyAmount: amount,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Income Reconciliation</h1>
          <p className="text-muted-foreground mt-1">
            Match income documents to bank deposits for tax year {currentYear}
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Income Source
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold">{yearRecs.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Sources</div>
          </CardContent>
        </Card>
        <Card className="border-status-success/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-success">{reconciled.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Reconciled</div>
          </CardContent>
        </Card>
        <Card className="border-status-warning/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-warning">{unreconciled.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-lg font-mono font-semibold text-accent">
              ${totalGross.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Gross Income</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-lg font-mono font-semibold">
              ${totalNet.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Net Deposits</div>
          </CardContent>
        </Card>
      </div>

      {/* Unreconciled Warning */}
      {unreconciled.length > 0 && (
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-status-warning mt-0.5" />
              <div>
                <p className="font-medium text-sm">Reconciliation Required</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {unreconciled.length} income source(s) have not been reconciled to bank deposits.
                  All income must be reconciled before return generation.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reconciliation Process */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Reconciliation Process</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Match each income document (1099, processor summary) to bank deposits</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Account for fees, refunds, and chargebacks</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Flag and explain any discrepancies</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
            <span>No automatic resolution - all discrepancies require manual review</span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Income Sources */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Income Sources ({yearRecs.length})</h2>
        {yearRecs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <DollarSign className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No Income Sources</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Add income sources from 1099s, processor exports, or manual entry
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {yearRecs.map(rec => (
              <Card key={rec.id} className={cn(
                !rec.isReconciled && 'border-status-warning/30'
              )}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'p-2 rounded',
                        rec.isReconciled ? 'bg-status-success/10' : 'bg-status-warning/10'
                      )}>
                        {rec.isReconciled ? (
                          <Check className="w-4 h-4 text-status-success" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-status-warning" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rec.sourceDescription}</span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {rec.sourceType.replace('_', ' ')}
                          </Badge>
                          {rec.isReconciled ? (
                            <Badge variant="outline" className="text-xs text-status-success">
                              Reconciled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-status-warning">
                              Pending
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-2 grid grid-cols-4 gap-4">
                          <div>
                            <span className="text-xs uppercase tracking-wider">Gross</span>
                            <div className="font-mono">${rec.grossAmount.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wider">Fees</span>
                            <div className="font-mono text-status-error">-${rec.fees.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wider">Refunds</span>
                            <div className="font-mono text-status-error">-${rec.refundsChargebacks.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wider">Net</span>
                            <div className="font-mono font-semibold">${rec.netAmount.toLocaleString()}</div>
                          </div>
                        </div>
                        {rec.discrepancyNote && (
                          <div className="text-xs text-status-warning mt-2 p-2 bg-status-warning/10 rounded">
                            Discrepancy (${rec.discrepancyAmount?.toFixed(2)}): {rec.discrepancyNote}
                          </div>
                        )}
                      </div>
                    </div>
                    {!rec.isReconciled && (
                      <Button size="sm" onClick={() => handleMarkReconciled(rec.id)}>
                        Mark Reconciled
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Income Source</DialogTitle>
            <DialogDescription>
              Add an income source to reconcile for tax year {currentYear}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select 
                value={formData.sourceType} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, sourceType: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1099">1099 Form</SelectItem>
                  <SelectItem value="processor_summary">Processor Summary</SelectItem>
                  <SelectItem value="bank_deposit">Bank Deposit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source Document</Label>
              <Select
                value={formData.sourceDocumentId || undefined}
                onValueChange={(v) => setFormData(prev => ({ ...prev, sourceDocumentId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select document..." />
                </SelectTrigger>
                <SelectContent>
                  {incomeDocuments.map(doc => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.fileName}
                    </SelectItem>
                  ))}
                  <SelectItem value="manual">Manual Entry</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.sourceDescription}
                onChange={(e) => setFormData(prev => ({ ...prev, sourceDescription: e.target.value }))}
                placeholder="e.g., PayPal 2024 Annual Summary"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Gross Amount</Label>
                <Input
                  type="number"
                  value={formData.grossAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, grossAmount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Fees</Label>
                <Input
                  type="number"
                  value={formData.fees}
                  onChange={(e) => setFormData(prev => ({ ...prev, fees: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Refunds/Chargebacks</Label>
                <Input
                  type="number"
                  value={formData.refundsChargebacks}
                  onChange={(e) => setFormData(prev => ({ ...prev, refundsChargebacks: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateReconciliation}
              disabled={!formData.sourceDescription || !formData.grossAmount}
            >
              Add Income Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
