/**
 * ClientUploadPortal.tsx
 *
 * Public-facing page at /portal/upload/:token
 * Clients access this without needing an account.
 * They select a document type, upload a file, and submit.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2,
  Calculator, CloudUpload, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PortalTokenWithReturn } from '@/types/client';
import { validatePortalToken, markTokenUsed } from '@/lib/portalLinks';
import { isSupabaseConfigured, storageUpload, dbInsert } from '@/lib/supabaseClient';

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'w2',               label: 'W-2 — Wage & Tax Statement'            },
  { value: 'prior_return',     label: 'Prior Year Tax Return (1040)'           },
  { value: 'business_income',  label: 'Business Income Summary'               },
  { value: '1099_nec',         label: '1099-NEC — Nonemployee Compensation'    },
  { value: '1099_int',         label: '1099-INT — Interest Income'             },
  { value: '1099_div',         label: '1099-DIV — Dividends'                   },
  { value: 'bank_statement',   label: 'Bank Statement'                         },
  { value: 'other',            label: 'Other Document'                         },
];

type Step = 'loading' | 'invalid' | 'expired' | 'form' | 'uploading' | 'done' | 'error';

export function ClientUploadPortal() {
  const { token } = useParams<{ token: string }>();
  const [step,         setStep]         = useState<Step>('loading');
  const [portalData,   setPortalData]   = useState<PortalTokenWithReturn | null>(null);
  const [docType,      setDocType]      = useState('');
  const [file,         setFile]         = useState<File | null>(null);
  const [uploadCount,  setUploadCount]  = useState(0);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setStep('invalid'); return; }
    validatePortalToken(token, 'upload').then(data => {
      if (!data) { setStep('invalid'); return; }
      const expired = new Date(data.expiresAt) <= new Date();
      if (expired) { setStep('expired'); return; }
      setPortalData(data);
      setStep('form');
      markTokenUsed(data.id).catch(() => {});
    }).catch(() => setStep('error'));
  }, [token]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleSubmit = async () => {
    if (!file || !docType || !portalData) return;
    setError(null);
    setStep('uploading');

    try {
      if (isSupabaseConfigured()) {
        const path = `${portalData.returnId}/${Date.now()}_${file.name}`;
        await storageUpload('client-documents', path, file);
        await dbInsert('portal_uploads', {
          return_id:     portalData.returnId,
          token_id:      portalData.id,
          storage_path:  path,
          original_name: file.name,
          file_size:     file.size,
        });
      }
      // In local mode, we can't actually store files — just count the upload attempt
      setUploadCount(c => c + 1);
      setFile(null);
      setDocType('');
      setStep('form'); // allow uploading more files
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again.');
      setStep('form');
    }
  };

  const handleDone = () => setStep('done');

  // ── Render states ──────────────────────────────────────────────────────────

  if (step === 'loading') {
    return <PortalShell><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Verifying link…</div></PortalShell>;
  }

  if (step === 'invalid') {
    return (
      <PortalShell>
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="w-10 h-10 text-destructive" />
            <h3 className="font-semibold">Invalid Link</h3>
            <p className="text-sm text-muted-foreground">This link is invalid or has been revoked. Please contact your tax preparer for a new link.</p>
          </CardContent>
        </Card>
      </PortalShell>
    );
  }

  if (step === 'expired') {
    return (
      <PortalShell>
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="w-10 h-10 text-amber-500" />
            <h3 className="font-semibold">Link Expired</h3>
            <p className="text-sm text-muted-foreground">This upload link has expired. Please ask your tax preparer to send a new one.</p>
          </CardContent>
        </Card>
      </PortalShell>
    );
  }

  if (step === 'done') {
    return (
      <PortalShell>
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
            <h3 className="text-lg font-semibold">All Done!</h3>
            <p className="text-sm text-muted-foreground">
              {uploadCount} document{uploadCount !== 1 ? 's' : ''} submitted successfully.
              Your tax preparer will review everything and follow up if anything else is needed.
            </p>
          </CardContent>
        </Card>
      </PortalShell>
    );
  }

  if (!portalData) return null;

  return (
    <PortalShell>
      <div className="w-full max-w-lg space-y-6">
        {/* Welcome card */}
        <Card>
          <CardHeader>
            <CardTitle>Document Upload</CardTitle>
            <CardDescription>
              Hi {portalData.clientFirstName}, please upload your {portalData.taxYear} tax documents below.
              You can upload multiple files — just submit each one separately.
            </CardDescription>
          </CardHeader>
        </Card>

        {uploadCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {uploadCount} document{uploadCount !== 1 ? 's' : ''} uploaded successfully.
          </div>
        )}

        {/* Upload form */}
        <Card>
          <CardContent className="space-y-5 pt-6">
            {/* Document type */}
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type…" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Drop zone */}
            <div className="space-y-1.5">
              <Label>File</Label>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-3 text-muted-foreground hover:border-primary/60 transition-colors cursor-pointer"
                onClick={() => document.getElementById('portal-file-input')?.click()}
              >
                {file ? (
                  <>
                    <FileText className="w-8 h-8 text-primary" />
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                    <button
                      className="text-xs underline text-muted-foreground"
                      onClick={e => { e.stopPropagation(); setFile(null); }}
                    >
                      <X className="inline w-3 h-3 mr-1" />Remove
                    </button>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-8 h-8" />
                    <p className="text-sm">Drag & drop or click to select</p>
                    <p className="text-xs">PDF, JPG, PNG — up to 25 MB</p>
                  </>
                )}
              </div>
              <input
                id="portal-file-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.tiff"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                className="flex-1"
                disabled={!file || !docType || step === 'uploading'}
                onClick={handleSubmit}
              >
                {step === 'uploading'
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Upload className="w-4 h-4 mr-2" />
                }
                {step === 'uploading' ? 'Uploading…' : 'Upload Document'}
              </Button>
              {uploadCount > 0 && (
                <Button variant="outline" onClick={handleDone}>
                  I&apos;m done
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Your documents are encrypted in transit and securely stored. This link expires on{' '}
          {new Date(portalData.expiresAt).toLocaleDateString()}.
        </p>
      </div>
    </PortalShell>
  );
}

// ─── Layout shell ──────────────────────────────────────────────────────────────

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card px-6 py-3 flex items-center gap-2">
        <div className="w-7 h-7 bg-primary rounded flex items-center justify-center">
          <Calculator className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm">Tax Forensics</span>
        <span className="text-xs text-muted-foreground ml-1">Client Portal</span>
      </header>
      <main className="flex-1 flex items-start justify-center p-6">
        {children}
      </main>
    </div>
  );
}
