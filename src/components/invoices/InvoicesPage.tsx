import { useState } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  FileText,
  Plus,
  Link as LinkIcon,
  AlertCircle,
  Check,
  FileCheck,
  Clock
} from 'lucide-react';
import { Invoice, InvoiceType } from '@/types/tax';
import { DataAmount } from '@/components/ui/DataAmount';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function InvoicesPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const { invoices, addInvoice, transactions, incomeReconciliations } = useWorkflow();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('formal');
  
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    clientName: '',
    clientIdentifier: '',
    platform: '',
    amount: '',
    description: '',
    serviceTimeframe: '',
    agreementType: 'verbal' as const,
    linkedDepositId: '',
  });

  if (!isYearSelected) {
    return (
      <div className="p-6">
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-status-warning mx-auto mb-4" />
            <h3 className="text-lg font-medium">Tax Year Required</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Please select a tax year from the Dashboard before managing invoices.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get deposits (positive transactions) that could be linked
  const availableDeposits = transactions.filter(t => 
    t.taxYear === currentYear && 
    t.amount > 0 &&
    !invoices.some(inv => inv.linkedTransactionId === t.id)
  );

  const yearInvoices = invoices.filter(inv => inv.taxYear === currentYear);
  const formalInvoices = yearInvoices.filter(inv => inv.type === 'formal');
  const memorializedInvoices = yearInvoices.filter(inv => inv.type === 'memorialized');

  const handleCreateInvoice = () => {
    if (!currentYear) return;

    // For memorialized invoices, must have a linked deposit
    if (invoiceType === 'memorialized' && !formData.linkedDepositId) {
      toast.error('Memorialized invoices must be linked to an actual deposit');
      return;
    }

    const linkedTxn = transactions.find(t => t.id === formData.linkedDepositId);

    const newInvoice: Invoice = {
      id: `inv_${Date.now()}`,
      type: invoiceType,
      invoiceNumber: formData.invoiceNumber || `INV-${Date.now()}`,
      createdAt: new Date(),
      linkedTransactionId: formData.linkedDepositId || undefined,
      clientName: formData.clientName,
      clientIdentifier: formData.clientIdentifier || undefined,
      platform: formData.platform || undefined,
      amount: linkedTxn ? linkedTxn.amount : parseFloat(formData.amount),
      description: formData.description,
      serviceTimeframe: formData.serviceTimeframe || undefined,
      agreementType: invoiceType === 'memorialized' ? formData.agreementType : undefined,
      disclosureText: invoiceType === 'memorialized' 
        ? 'This document memorializes a completed transaction for which no formal invoice was issued at the time of payment.'
        : undefined,
      isPostPayment: invoiceType === 'memorialized',
      taxYear: currentYear,
    };

    addInvoice(newInvoice);
    setCreateDialogOpen(false);
    setFormData({
      invoiceNumber: '',
      clientName: '',
      clientIdentifier: '',
      platform: '',
      amount: '',
      description: '',
      serviceTimeframe: '',
      agreementType: 'verbal',
      linkedDepositId: '',
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Invoice System
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage formal and memorialized invoices for tax year {currentYear}
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      {/* Invoice Type Explanation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Formal Invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Standard invoices created before or at time of payment.</p>
            <div className="mt-2 font-mono text-lg text-foreground">{formalInvoices.length}</div>
          </CardContent>
        </Card>

        <Card className="border-status-warning/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-status-warning" />
              Memorialized Invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Post-payment records. Must link to actual deposit.</p>
            <div className="mt-2 font-mono text-lg text-foreground">{memorializedInvoices.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Memorialized Invoice Rules */}
      <Card className="bg-status-warning/5 border-status-warning/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Memorialized Invoice Rules (Non-Negotiable)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Must link to an actual deposit/transaction ID (bank or processor)</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Must display "Created after payment" flag</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Must include disclosure line about post-payment creation</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Must document: payer identity, platform, date, amount, description, agreement type</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-status-error mt-0.5 shrink-0" />
            <span className="text-status-error">Fabrication, backdating, or creation without a linked payment is strictly prohibited</span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Invoices List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">All Invoices ({yearInvoices.length})</h2>
        {yearInvoices.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No Invoices Yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create formal or memorialized invoices for income substantiation
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {yearInvoices.map(inv => (
              <Card key={inv.id} className={cn(
                inv.type === 'memorialized' && 'border-status-warning/30'
              )}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded",
                        inv.type === 'formal' ? 'bg-secondary' : 'bg-status-warning/10'
                      )}>
                        <FileText className={cn(
                          "w-4 h-4",
                          inv.type === 'memorialized' && 'text-status-warning'
                        )} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{inv.invoiceNumber}</span>
                          <Badge variant={inv.type === 'formal' ? 'secondary' : 'outline'} className={cn(
                            'text-xs',
                            inv.type === 'memorialized' && 'border-status-warning text-status-warning'
                          )}>
                            {inv.type === 'formal' ? 'Formal' : 'Memorialized'}
                          </Badge>
                          {inv.isPostPayment && (
                            <Badge variant="outline" className="text-xs border-status-warning text-status-warning">
                              <Clock className="w-3 h-3 mr-1" />
                              Post-Payment
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {inv.clientName} • {inv.description}
                        </div>
                        {inv.linkedTransactionId && (
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <LinkIcon className="w-3 h-3" />
                            Linked to deposit {inv.linkedTransactionId}
                          </div>
                        )}
                        {inv.disclosureText && (
                          <div className="text-xs text-status-warning mt-2 p-2 bg-status-warning/10 rounded">
                            {inv.disclosureText}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <DataAmount value={inv.amount} />
                      <div className="text-xs text-muted-foreground mt-1">
                        {inv.createdAt.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>
              Create a formal or memorialized invoice for tax year {currentYear}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Invoice Type</Label>
              <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v as InvoiceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Formal Invoice
                    </div>
                  </SelectItem>
                  <SelectItem value="memorialized">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-status-warning" />
                      Memorialized Invoice (Post-Payment)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {invoiceType === 'memorialized' && (
              <Card className="border-status-warning/50 bg-status-warning/5">
                <CardContent className="py-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5" />
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">Memorialized invoices must be linked to an actual deposit.</p>
                      <p className="mt-1">This invoice will include a disclosure stating it was created after payment was received.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {invoiceType === 'memorialized' && (
              <div className="space-y-2">
                <Label>Linked Deposit (Required)</Label>
                <Select 
                  value={formData.linkedDepositId} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, linkedDepositId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a deposit..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDeposits.length === 0 ? (
                      <SelectItem value="" disabled>No unlinked deposits available</SelectItem>
                    ) : (
                      availableDeposits.map(dep => (
                        <SelectItem key={dep.id} value={dep.id}>
                          {dep.date.toLocaleDateString()} - {dep.description} (${dep.amount.toFixed(2)})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Number</Label>
                <Input
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                  placeholder="INV-001"
                />
              </div>
              {invoiceType === 'formal' && (
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Client Name</Label>
              <Input
                value={formData.clientName}
                onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                placeholder="Client or payer name"
              />
            </div>

            {invoiceType === 'memorialized' && (
              <>
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Input
                    value={formData.platform}
                    onChange={(e) => setFormData(prev => ({ ...prev, platform: e.target.value }))}
                    placeholder="e.g., PayPal, Cash App, Zelle..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Agreement Type</Label>
                  <Select 
                    value={formData.agreementType} 
                    onValueChange={(v: any) => setFormData(prev => ({ ...prev, agreementType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verbal">Verbal Agreement</SelectItem>
                      <SelectItem value="informal">Informal Agreement</SelectItem>
                      <SelectItem value="implied">Implied Agreement</SelectItem>
                      <SelectItem value="written">Written Agreement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Service Timeframe</Label>
                  <Input
                    value={formData.serviceTimeframe}
                    onChange={(e) => setFormData(prev => ({ ...prev, serviceTimeframe: e.target.value }))}
                    placeholder="e.g., January 2024, Q1 2024..."
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Description of Services/Goods</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what was provided..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateInvoice}
              disabled={
                !formData.clientName || 
                !formData.description ||
                (invoiceType === 'memorialized' && !formData.linkedDepositId) ||
                (invoiceType === 'formal' && !formData.amount)
              }
            >
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
