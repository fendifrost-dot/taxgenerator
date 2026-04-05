/**
 * ReconciliationPage.tsx
 *
 * Income reconciliation with two resolution paths:
 *
 *   1. Bank match  — user links income to one or more bank deposit transactions.
 *   2. Accept as stated — no bank statement available; income is accepted based
 *      on the source document (1099, processor summary, etc.) alone.
 *
 * Bank statements are OPTIONAL. A return can be generated from W-2s, 1099s,
 * and business income summaries without any bank statement on file.
 * The workflow gate only blocks when there are *unresolved* reconciliation entries.
 */

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
  Link as LinkIcon,
  Plus,
  DollarSign,
  AlertCircle,
  FileCheck,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { IncomeReconciliation, ReconciliationMethod } from '@/types/tax';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Reconciliation method badge ──────────────────────────────────────────────

function MethodBadge({ method }: { method?: ReconciliationMethod }) {
  if (!method) return null;
  if (method === 'bank_match') {
    return (
      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
        <LinkIcon className="w-3 h-3 mr-1" />
        Bank matched
      </Badge>
    );
  }
  if (method === 'accepted_without_bank') {
    return (
      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
        <FileCheck className="w-3 h-3 mr-1" />
        Accepted — no bank stmt
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600">
      Direct entry
    </Badge>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReconciliationPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const {
    incomeReconciliations,
    addReconciliation,
    updateReconciliation,
    documents,
    transactions,
  } = useWorkflow();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [acceptTargetId, setAcceptTargetId] = useState<string>('');
  const [acceptNote, setAcceptNote] = useState('');

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

  const yearRecs = incomeReconciliations.filter((r) => r.taxYear === currentYear);
  const reconciled = yearRecs.filter((r) => r.isReconciled);
  const unreconciled = yearRecs.filter((r) => !r.isReconciled);

  const incomeDocuments = documents.filter(
    (d) =>
      d.taxYear === currentYear &&
      (d.type === '1099_nec' ||
        d.type === '1099_int' ||
        d.type === '1099_div' ||
        d.type === 'payment_processor'),
  );

  const deposits = transactions.filter((t) => t.taxYear === currentYear && t.amount > 0);

  const totalGross = yearRecs.reduce((sum, r) => sum + r.grossAmount, 0);
  const totalFees = yearRecs.reduce((sum, r) => sum + r.fees, 0);
  const totalNet = yearRecs.reduce((sum, r) => sum + r.netAmount, 0);

  // ── Handlers ────────────────────────────────────────────────────────────────

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
      fees,
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
    toast.success('Income source added');
  };

  /** Bank-match path: mark reconciled with method = bank_match */
  const handleMarkBankMatched = (id: string) => {
    const rec = incomeReconciliations.find((r) => r.id === id);
    if (!rec) return;
    const hasMatch = rec.matchedDepositIds.length > 0 || rec.matchedTransactionIds.length > 0;
    const hasVarianceNote =
      Boolean(rec.discrepancyNote?.trim()) &&
      rec.discrepancyAmount !== undefined &&
      !Number.isNaN(rec.discrepancyAmount);

    if (!hasMatch && !hasVarianceNote) {
      toast.error(
        'Link to at least one deposit or record a discrepancy amount before marking as bank-matched.',
      );
      return;
    }
    updateReconciliation(id, { isReconciled: true, reconciliationMethod: 'bank_match' });
    toast.success('Income source marked as bank-matched');
  };

  /** Accept-without-bank path: opens the confirmation dialog */
  const openAcceptDialog = (id: string) => {
    setAcceptTargetId(id);
    setAcceptNote('');
    setAcceptDialogOpen(true);
  };

  const handleAcceptWithoutBank = () => {
    if (!acceptTargetId) return;
    updateReconciliation(acceptTargetId, {
      isReconciled: true,
      reconciliationMethod: 'accepted_without_bank',
      acceptanceNote: acceptNote.trim() || 'Accepted as stated — no bank statement on file.',
    });
    toast.success('Income accepted as stated without bank statement');
    setAcceptDialogOpen(false);
    setAcceptTargetId('');
    setAcceptNote('');
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Income Reconciliation</h1>
          <p className="text-muted-foreground mt-1">
            Confirm income sources for tax year {currentYear} — bank statements optional
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Income Source
        </Button>
      </div>

      {/* Bank-optional notice */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800">
              <strong>Bank statements are optional.</strong> Each income source can be confirmed via
              bank deposit matching <em>or</em> accepted as stated from its source document (1099,
              processor summary, business record). Use whichever documentation is available.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
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
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Confirmed</div>
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
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Net Amount</div>
          </CardContent>
        </Card>
      </div>

      {/* Unresolved warning */}
      {unreconciled.length > 0 && (
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-status-warning mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">
                  {unreconciled.length} source(s) need confirmation before return generation
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Match each to a bank deposit <strong>or</strong> use{' '}
                  <strong>Accept Without Bank Statement</strong> to confirm from the source
                  document alone. Either path clears this gate.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Process reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resolution Paths</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="flex items-start gap-2">
            <LinkIcon className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            <span>
              <strong>Bank match</strong> — Link income to one or more deposit transactions, account
              for fees and refunds, explain any variance
            </span>
          </div>
          <div className="flex items-start gap-2">
            <FileCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <span>
              <strong>Accept as stated</strong> — No bank statement available; income confirmed from
              source document (1099, processor export, business record) with optional note
            </span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
            <span>All discrepancies between documents and deposits require a written explanation</span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Income source list */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Income Sources ({yearRecs.length})</h2>
        {yearRecs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <DollarSign className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No Income Sources</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload 1099s or payment processor exports via the Document Parser, or add manually.
                If income is only from W-2 wages, no entries are needed here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {yearRecs.map((rec) => (
              <Card key={rec.id} className={cn(!rec.isReconciled && 'border-status-warning/30')}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Status icon + info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className={cn(
                          'p-2 rounded shrink-0',
                          rec.isReconciled ? 'bg-status-success/10' : 'bg-status-warning/10',
                        )}
                      >
                        {rec.isReconciled ? (
                          <CheckCircle2 className="w-4 h-4 text-status-success" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-status-warning" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium truncate">{rec.sourceDescription}</span>
                          <Badge variant="outline" className="text-xs capitalize shrink-0">
                            {rec.sourceType.replace('_', ' ')}
                          </Badge>
                          {rec.isReconciled ? (
                            <Badge variant="outline" className="text-xs text-status-success shrink-0">
                              Confirmed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-status-warning shrink-0">
                              Pending
                            </Badge>
                          )}
                          <MethodBadge method={rec.reconciliationMethod} />
                        </div>

                        {/* Amounts row */}
                        <div className="text-sm text-muted-foreground mt-2 grid grid-cols-4 gap-4">
                          <div>
                            <span className="text-xs uppercase tracking-wider">Gross</span>
                            <div className="font-mono">${rec.grossAmount.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wider">Fees</span>
                            <div className="font-mono text-status-error">
                              -${rec.fees.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wider">Refunds</span>
                            <div className="font-mono text-status-error">
                              -${rec.refundsChargebacks.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wider">Net</span>
                            <div className="font-mono font-semibold">
                              ${rec.netAmount.toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {/* Acceptance note */}
                        {rec.acceptanceNote && (
                          <div className="text-xs text-blue-700 mt-2 p-2 bg-blue-50 rounded">
                            📄 {rec.acceptanceNote}
                          </div>
                        )}

                        {/* Discrepancy note */}
                        {rec.discrepancyNote && (
                          <div className="text-xs text-status-warning mt-2 p-2 bg-status-warning/10 rounded">
                            ⚠ Discrepancy (${rec.discrepancyAmount?.toFixed(2)}): {rec.discrepancyNote}
                          </div>
                        )}

                        {/* Available deposits for matching (shown when unreconciled) */}
                        {!rec.isReconciled && deposits.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {deposits.length} deposit transaction(s) available to match
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    {!rec.isReconciled && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkBankMatched(rec.id)}
                          className="text-xs whitespace-nowrap"
                        >
                          <LinkIcon className="w-3 h-3 mr-1" />
                          Mark Bank Matched
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openAcceptDialog(rec.id)}
                          className="text-xs whitespace-nowrap"
                        >
                          <FileCheck className="w-3 h-3 mr-1" />
                          Accept Without Bank Stmt
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Create dialog ── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Income Source</DialogTitle>
            <DialogDescription>
              Add an income source for tax year {currentYear}. Bank statements are not required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select
                value={formData.sourceType}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, sourceType: v as IncomeReconciliation['sourceType'] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1099">1099 Form (NEC / INT / DIV)</SelectItem>
                  <SelectItem value="processor_summary">Processor / Business Summary</SelectItem>
                  <SelectItem value="bank_deposit">Bank Deposit Record</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source Document (optional)</Label>
              <Select
                value={formData.sourceDocumentId}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, sourceDocumentId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select document or leave blank..." />
                </SelectTrigger>
                <SelectContent>
                  {incomeDocuments.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.fileName}
                    </SelectItem>
                  ))}
                  <SelectItem value="manual">Manual Entry (no document)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.sourceDescription}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, sourceDescription: e.target.value }))
                }
                placeholder="e.g., Stripe 2025 Annual Summary, Client ABC 1099-NEC"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Gross Amount</Label>
                <Input
                  type="number"
                  value={formData.grossAmount}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, grossAmount: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Fees</Label>
                <Input
                  type="number"
                  value={formData.fees}
                  onChange={(e) => setFormData((prev) => ({ ...prev, fees: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Refunds / Chargebacks</Label>
                <Input
                  type="number"
                  value={formData.refundsChargebacks}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      refundsChargebacks: e.target.value,
                    }))
                  }
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

      {/* ── Accept without bank statement dialog ── */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Without Bank Statement</DialogTitle>
            <DialogDescription>
              Confirm this income source based on the source document alone. No bank statement is
              required. An optional note will be recorded for audit transparency.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const rec = incomeReconciliations.find((r) => r.id === acceptTargetId);
            if (!rec) return null;
            return (
              <div className="space-y-4 py-2">
                <Card className="bg-secondary/40">
                  <CardContent className="py-3 px-4 space-y-1 text-sm">
                    <p className="font-medium">{rec.sourceDescription}</p>
                    <p className="text-muted-foreground">
                      Gross: <span className="font-mono">${rec.grossAmount.toLocaleString()}</span>
                      {rec.fees > 0 && (
                        <> &nbsp;· Fees: <span className="font-mono">-${rec.fees.toLocaleString()}</span></>
                      )}
                      &nbsp;· Net: <span className="font-mono font-semibold">${rec.netAmount.toLocaleString()}</span>
                    </p>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Label>Acceptance Note (optional)</Label>
                  <Textarea
                    value={acceptNote}
                    onChange={(e) => setAcceptNote(e.target.value)}
                    placeholder="e.g., 1099-NEC received from payer — no bank statement on file. Amount matches document."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    This note is recorded on the reconciliation entry for audit trail purposes.
                  </p>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAcceptWithoutBank}>
              <FileCheck className="w-4 h-4 mr-2" />
              Confirm — Accept as Stated
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
