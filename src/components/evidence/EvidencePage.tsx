import { useState } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
  FolderArchive,
  Upload,
  Paperclip,
  FileText,
  Check,
  XCircle,
  Link as LinkIcon,
  Eye,
  Trash2
} from 'lucide-react';
import { Evidence } from '@/types/tax';
import { DataAmount } from '@/components/ui/DataAmount';

export function EvidencePage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const { transactions, updateTransaction, evidence, addEvidence, categories } = useWorkflow();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>('');
  const [evidenceType, setEvidenceType] = useState<Evidence['type']>('receipt');
  const [businessPurposeNote, setBusinessPurposeNote] = useState('');
  const [fileName, setFileName] = useState('');

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

  // Get deductible transactions that need evidence
  const deductibleTxns = transactions.filter(t => 
    t.taxYear === currentYear && t.state === 'deductible'
  );
  
  const missingEvidence = deductibleTxns.filter(t => t.evidenceStatus === 'missing');
  const withEvidence = deductibleTxns.filter(t => t.evidenceStatus === 'present');
  const notRequired = deductibleTxns.filter(t => t.evidenceStatus === 'not_required');

  const yearEvidence = evidence.filter(e => e.taxYear === currentYear);

  const handleAttachEvidence = async () => {
    if (!selectedTransactionId || !fileName) return;

    const newEvidence: Evidence = {
      id: `ev_${Date.now()}`,
      transactionId: selectedTransactionId,
      type: evidenceType,
      fileName: fileName,
      uploadedAt: new Date(),
      businessPurposeNote: businessPurposeNote || undefined,
      taxYear: currentYear!,
    };

    const created = await addEvidence(newEvidence);
    if (!created) return;

    await updateTransaction(created.transactionId, { evidenceStatus: 'present' });

    setUploadDialogOpen(false);
    setSelectedTransactionId('');
    setEvidenceType('receipt');
    setBusinessPurposeNote('');
    setFileName('');
  };

  const openUploadDialog = (transactionId?: string) => {
    if (transactionId) {
      setSelectedTransactionId(transactionId);
    }
    setUploadDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Evidence Locker</h1>
          <p className="text-muted-foreground mt-1">
            Attach receipts, invoices, and supporting documentation for tax year {currentYear}
          </p>
        </div>
        <Button
          onClick={() => openUploadDialog()}
          disabled={deductibleTxns.length === 0}
          title={
            deductibleTxns.length === 0
              ? 'No deductible transactions to attach evidence to'
              : undefined
          }
        >
          <Upload className="w-4 h-4 mr-2" />
          Attach Evidence
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold">{deductibleTxns.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Deductible</div>
          </CardContent>
        </Card>
        <Card className="border-status-success/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-success">{withEvidence.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">With Evidence</div>
          </CardContent>
        </Card>
        <Card className="border-status-error/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-status-error">{missingEvidence.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Missing</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-mono font-semibold text-muted-foreground">{notRequired.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Not Required</div>
          </CardContent>
        </Card>
      </div>

      {/* Missing Evidence Warning */}
      {missingEvidence.length > 0 && (
        <Card className="border-status-error/50 bg-status-error/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-status-error mt-0.5" />
              <div>
                <p className="font-medium text-sm">Evidence Required for Deductions</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {missingEvidence.length} deductible expense(s) are missing required evidence. 
                  These expenses will be excluded from return totals until evidence is attached.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evidence Rules */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Evidence Requirements</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Every deductible expense requires substantiation (receipt, invoice, or documentation)</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Meals, travel, and entertainment require business purpose notes</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Missing evidence = excluded from totals (not included in return)</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
            <span>AI cannot infer or assume evidence exists</span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Expenses Needing Evidence */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Expenses Requiring Evidence ({missingEvidence.length})</h2>
        {missingEvidence.length === 0 ? (
          <Card className="border-dashed border-status-success/50">
            <CardContent className="py-8 text-center">
              <Check className="w-12 h-12 text-status-success/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">All Evidence Attached</h3>
              <p className="text-sm text-muted-foreground mt-1">
                All deductible expenses have required evidence
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {missingEvidence.map(txn => {
              const category = categories.find(c => c.id === txn.categoryId);
              return (
                <Card key={txn.id} className="border-status-error/30">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-status-error/10">
                          <XCircle className="w-4 h-4 text-status-error" />
                        </div>
                        <div>
                          <div className="font-medium">{txn.description}</div>
                          <div className="text-sm text-muted-foreground">
                            {txn.date.toLocaleDateString()} \u2022 
                            {category && ` Line ${category.scheduleCLine}: ${category.name}`}
                          </div>
                          {txn.requiresBusinessPurpose && !txn.businessPurpose && (
                            <div className="text-xs text-status-warning mt-1">
                              \u26A0 Business purpose also required
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <DataAmount value={txn.amount} />
                        <Button size="sm" onClick={() => openUploadDialog(txn.id)}>
                          <Paperclip className="w-4 h-4 mr-1" />
                          Attach
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* All Evidence */}
      <div>
        <h2 className="text-lg font-semibold mb-4">All Evidence ({yearEvidence.length})</h2>
        {yearEvidence.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <FolderArchive className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No Evidence Yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Attach evidence to deductible expenses
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {yearEvidence.map(ev => {
              const linkedTxn = transactions.find(t => t.id === ev.transactionId);
              return (
                <Card key={ev.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-secondary">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-medium">{ev.fileName}</div>
                          <div className="text-sm text-muted-foreground">
                            {ev.type} \u2022 Uploaded {ev.uploadedAt.toLocaleDateString()}
                          </div>
                          {linkedTxn && (
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <LinkIcon className="w-3 h-3" />
                              Linked to: {linkedTxn.description}
                            </div>
                          )}
                          {ev.businessPurposeNote && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Purpose: {ev.businessPurposeNote}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{ev.type}</Badge>
                        <Button variant="ghost" size="icon">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach Evidence</DialogTitle>
            <DialogDescription>
              Upload substantiation for a deductible expense
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Transaction</Label>
              {deductibleTxns.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                  There are no deductible transactions for this year. Classify expenses as deductible in
                  the Transaction Engine first.
                </p>
              ) : (
                <Select
                  value={selectedTransactionId || undefined}
                  onValueChange={setSelectedTransactionId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a transaction..." />
                  </SelectTrigger>
                  <SelectContent>
                    {deductibleTxns.map((txn) => (
                      <SelectItem key={txn.id} value={txn.id}>
                        {txn.date.toLocaleDateString()} - {txn.description} ($
                        {Math.abs(txn.amount).toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Evidence Type</Label>
              <Select value={evidenceType} onValueChange={(v) => setEvidenceType(v as Evidence['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="screenshot">Screenshot</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File Name</Label>
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="receipt_2024_01_15.pdf"
              />
              <p className="text-xs text-muted-foreground">
                In production, this would be a file upload
              </p>
            </div>

            {selectedTransactionId && transactions.find(t => t.id === selectedTransactionId)?.requiresBusinessPurpose && (
              <div className="space-y-2">
                <Label>Business Purpose Note (Required)</Label>
                <Textarea
                  value={businessPurposeNote}
                  onChange={(e) => setBusinessPurposeNote(e.target.value)}
                  placeholder="Describe the business purpose of this expense..."
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleAttachEvidence()}
              disabled={
                deductibleTxns.length === 0 || !selectedTransactionId || !fileName
              }
            >
              Attach Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
