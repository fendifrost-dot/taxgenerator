/**
 * ClientDetailPage.tsx
 *
 * Shows a client's returns by year. For each return the preparer can:
 *  - Generate + send an upload link (client uploads docs via browser)
 *  - Generate + send a questionnaire link (client answers optimization Qs)
 *  - Open the return in the main workflow
 *  - Run optimization interview directly in-app
 */

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Plus, Link2, ClipboardCopy, CheckCheck, Loader2,
  Upload, FileQuestion, Calendar, ChevronRight, AlertCircle,
  Trash2, RotateCcw, Mail,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Client, ClientReturn, PortalToken } from '@/types/client';
import { getClient, listReturns, getOrCreateReturn } from '@/lib/clientStorage';
import {
  createPortalToken, listActiveTokens, revokePortalToken, getPortalUrl,
} from '@/lib/portalLinks';

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 - i);

const STATUS_STYLES: Record<ClientReturn['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft:                { label: 'Draft',                 variant: 'secondary' },
  documents_requested:  { label: 'Docs Requested',        variant: 'outline'   },
  questionnaire_sent:   { label: 'Questionnaire Sent',    variant: 'outline'   },
  in_progress:          { label: 'In Progress',           variant: 'default'   },
  under_review:         { label: 'Under Review',          variant: 'default'   },
  complete:             { label: 'Complete',              variant: 'default'   },
};

interface Props {
  clientId: string;
  onBack: () => void;
  onOpenReturn?: (clientId: string, taxYear: number) => void;
  onRunOptimizer?: (returnId: string) => void;
}

export function ClientDetailPage({ clientId, onBack, onOpenReturn, onRunOptimizer }: Props) {
  const [client,       setClient]       = useState<Client | null>(null);
  const [returns,      setReturns]      = useState<ClientReturn[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // Link generation dialog
  const [linkDialog,   setLinkDialog]   = useState<{ returnId: string; type: 'upload' | 'questionnaire' } | null>(null);
  const [tokens,       setTokens]       = useState<PortalToken[]>([]);
  const [genLoading,   setGenLoading]   = useState(false);
  const [copiedId,     setCopiedId]     = useState<string | null>(null);

  // New return dialog
  const [yearDialog,   setYearDialog]   = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>(String(CURRENT_YEAR - 1));

  useEffect(() => {
    Promise.all([getClient(clientId), listReturns(clientId)])
      .then(([c, r]) => { setClient(c); setReturns(r); })
      .catch(() => setError('Failed to load client data.'))
      .finally(() => setLoading(false));
  }, [clientId]);

  // Load active tokens when link dialog opens
  useEffect(() => {
    if (!linkDialog) return;
    listActiveTokens(linkDialog.returnId).then(setTokens).catch(() => {});
  }, [linkDialog]);

  const handleAddReturn = async () => {
    const year = Number(selectedYear);
    try {
      const ret = await getOrCreateReturn(clientId, year);
      setReturns(prev => {
        const exists = prev.find(r => r.id === ret.id);
        if (exists) return prev;
        return [ret, ...prev].sort((a, b) => b.taxYear - a.taxYear);
      });
      setYearDialog(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create return.');
    }
  };

  const handleGenerateLink = async () => {
    if (!linkDialog) return;
    setGenLoading(true);
    try {
      const token = await createPortalToken(linkDialog.returnId, linkDialog.type);
      setTokens(prev => [token, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate link.');
    } finally {
      setGenLoading(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    await revokePortalToken(tokenId).catch(() => {});
    setTokens(prev => prev.filter(t => t.id !== tokenId));
  };

  const handleCopy = async (token: PortalToken) => {
    const url = getPortalUrl(token.token, token.tokenType);
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(token.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleMailto = (token: PortalToken) => {
    if (!client?.email) return;
    const url  = getPortalUrl(token.token, token.tokenType);
    const type = token.tokenType === 'upload' ? 'document upload' : 'tax questionnaire';
    const subj = encodeURIComponent(`Tax Forensics — ${type} link`);
    const body = encodeURIComponent(
      `Hi ${client.firstName},\n\nPlease use the link below to ${type === 'document upload' ? 'upload your tax documents' : 'complete your tax questionnaire'}:\n\n${url}\n\nThis link expires in 7 days.\n\nThank you.`
    );
    window.open(`mailto:${client.email}?subject=${subj}&body=${body}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading client…
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 text-muted-foreground">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
        <p className="mt-4">Client not found.</p>
      </div>
    );
  }

  const typeLabel = linkDialog?.type === 'upload' ? 'Upload Link' : 'Questionnaire Link';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Clients
        </Button>
      </div>

      {/* Client info */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold">
            {client.firstName[0]}{client.lastName[0]}
          </div>
          <div>
            <h2 className="text-xl font-semibold">{client.firstName} {client.lastName}</h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              {client.email && <span>{client.email}</span>}
              {client.phone && <span>{client.phone}</span>}
              {client.ssnLast4 && <span>SSN ***-**-{client.ssnLast4}</span>}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setYearDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Year
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Returns */}
      {returns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground gap-3">
            <Calendar className="w-8 h-8" />
            <p>No returns yet. Add a tax year to get started.</p>
            <Button variant="outline" onClick={() => setYearDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Return
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {returns.map(ret => {
            const statusInfo = STATUS_STYLES[ret.status] ?? { label: ret.status, variant: 'secondary' as const };
            const qCount = ret.optimizationQuestions.length;
            const aCount = Object.keys(ret.optimizationResponses).length;

            return (
              <Card key={ret.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">{ret.taxYear} Return</CardTitle>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                    {onOpenReturn && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenReturn(clientId, ret.taxYear)}
                      >
                        Open Workflow
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {qCount > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {qCount} optimization question{qCount !== 1 ? 's' : ''} generated
                      {aCount > 0 && ` · ${aCount} answered`}
                    </p>
                  )}

                  <Separator />

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLinkDialog({ returnId: ret.id, type: 'upload' })}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Send Upload Link
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLinkDialog({ returnId: ret.id, type: 'questionnaire' })}
                    >
                      <Link2 className="w-4 h-4 mr-2" />
                      Send Questionnaire Link
                    </Button>

                    {onRunOptimizer && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRunOptimizer(ret.id)}
                      >
                        <FileQuestion className="w-4 h-4 mr-2" />
                        Run Optimization Review
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Return Dialog */}
      <Dialog open={yearDialog} onOpenChange={setYearDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Tax Year</DialogTitle>
            <DialogDescription>Select the tax year to open a return for {client.firstName}.</DialogDescription>
          </DialogHeader>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_YEARS.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYearDialog(false)}>Cancel</Button>
            <Button onClick={handleAddReturn}>
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal Link Dialog */}
      {linkDialog && (
        <Dialog open={true} onOpenChange={() => setLinkDialog(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {typeLabel} — {returns.find(r => r.id === linkDialog.returnId)?.taxYear} Return
              </DialogTitle>
              <DialogDescription>
                {linkDialog.type === 'upload'
                  ? 'Send this link to your client. They can upload documents directly without needing an account.'
                  : 'Send this link to your client. They will see the optimization questions and can submit their answers.'}
                {' '}Links expire after 7 days.
              </DialogDescription>
            </DialogHeader>

            {/* Existing active tokens */}
            {tokens.length > 0 && (
              <div className="space-y-2">
                {tokens.map(token => {
                  const url    = getPortalUrl(token.token, token.tokenType);
                  const copied = copiedId === token.id;
                  const exp    = new Date(token.expiresAt);
                  const daysLeft = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86_400_000));

                  return (
                    <div key={token.id} className="flex items-center gap-2 p-3 bg-muted rounded-md">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono truncate text-muted-foreground">{url}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                          {token.usedAt && ' · Opened'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {client.email && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMailto(token)} title="Open in mail client">
                            <Mail className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopy(token)}>
                          {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-600" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRevoke(token.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tokens.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active links. Generate one below.
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkDialog(null)}>Close</Button>
              <Button onClick={handleGenerateLink} disabled={genLoading}>
                {genLoading
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <RotateCcw className="w-4 h-4 mr-2" />
                }
                {genLoading ? 'Generating…' : 'Generate New Link'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
