import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileCheck2, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Document, DocumentType, ParsedDocumentData, Transaction } from '@/types/tax';

type POCDocType = 'bank_statement' | 'prior_return' | 'w2' | '1099';
type ExtractStatus = 'idle' | 'uploading' | 'extracting' | 'reviewing' | 'accepted' | 'error';

const DOC_TYPE_META: Record<POCDocType, { label: string; icon: string; prompt: string }> = {
  bank_statement: {
    label: 'Bank Statement',
    icon: '🏦',
    prompt:
      'Extract every transaction from this bank statement as strict JSON. Include statement period and credit/debit transaction rows with confidence.',
  },
  prior_return: {
    label: 'Prior Year Return',
    icon: '📋',
    prompt:
      'Extract key fields from IRS Form 1040 and schedules as strict JSON. Include Schedule C detail and carryforwards if present.',
  },
  w2: {
    label: 'W-2',
    icon: '📄',
    prompt:
      'Extract all W-2 boxes and entity fields as strict JSON. Use null for unknown text and 0.00 for blank numeric fields.',
  },
  '1099': {
    label: '1099 (NEC/INT/DIV)',
    icon: '💰',
    prompt:
      'Identify 1099 variant and extract all box values as strict JSON, including payer/recipient and amounts.',
  },
};

const STATUS_LABEL: Record<ExtractStatus, string> = {
  idle: 'Ready to upload',
  uploading: 'Reading file',
  extracting: 'Extracting with Claude',
  reviewing: 'Review extracted data',
  accepted: 'Imported into workflow',
  error: 'Extraction error',
};

type UnknownRecord = Record<string, unknown>;

function asNumber(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const n = Number(input.replace(/[$,]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseResponseJson(text: string): UnknownRecord {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned) as UnknownRecord;
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse JSON from model response');
    return JSON.parse(jsonMatch[0]) as UnknownRecord;
  }
}

function inferDocType(type: POCDocType): DocumentType {
  if (type === '1099') return '1099_nec';
  return type;
}

export function DocumentExtractionPoc() {
  const { currentYear } = useTaxYear();
  const { addDocument, addTransaction } = useWorkflow();
  const [docType, setDocType] = useState<POCDocType>('bank_statement');
  const [status, setStatus] = useState<ExtractStatus>('idle');
  const [fileName, setFileName] = useState('');
  const [rawResponse, setRawResponse] = useState('');
  const [extractedData, setExtractedData] = useState<UnknownRecord | null>(null);
  const [error, setError] = useState('');
  const [elapsedS, setElapsedS] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  const transactions = useMemo(() => {
    const rows = (extractedData?.transactions as UnknownRecord[] | undefined) ?? [];
    return rows.map((t) => ({
      date: String(t.date ?? ''),
      description: String(t.description ?? ''),
      amount: asNumber(t.amount),
      type: String(t.type ?? ''),
      confidence: asNumber(t.confidence),
    }));
  }, [extractedData]);

  const reset = () => {
    setStatus('idle');
    setFileName('');
    setRawResponse('');
    setExtractedData(null);
    setError('');
    setElapsedS(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onSelectFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!apiKey) {
      setStatus('error');
      setError('Missing VITE_ANTHROPIC_API_KEY environment variable');
      return;
    }
    if (!currentYear) {
      setStatus('error');
      setError('Select a tax year before running extraction');
      return;
    }

    setStatus('uploading');
    setError('');
    setFileName(file.name);
    setExtractedData(null);
    setRawResponse('');

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const isImage = file.type.startsWith('image/');
      const mediaType = file.type === 'application/pdf' ? 'application/pdf' : file.type;
      const contentBlock = isImage
        ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
        : { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } };

      setStatus('extracting');
      const t0 = Date.now();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          messages: [
            {
              role: 'user',
              content: [contentBlock, { type: 'text', text: DOC_TYPE_META[docType].prompt }],
            },
          ],
        }),
      });

      const payload = (await response.json()) as UnknownRecord;
      if (!response.ok || payload.error) {
        throw new Error(String((payload.error as UnknownRecord | undefined)?.message ?? 'API error'));
      }
      const text = String(
        ((payload.content as UnknownRecord[] | undefined) ?? []).find((x) => x.type === 'text')?.text ?? ''
      );

      setElapsedS(Number(((Date.now() - t0) / 1000).toFixed(1)));
      setRawResponse(text);
      setExtractedData(parseResponseJson(text));
      setStatus('reviewing');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Extraction failed');
    }
  };

  const acceptAndImport = () => {
    if (!currentYear || !extractedData) return;

    const newDoc: Document = {
      id: `doc_extract_${Date.now()}`,
      type: inferDocType(docType),
      fileName: fileName || `extracted_${docType}.json`,
      uploadedAt: new Date(),
      taxYear: currentYear,
      sourceReference: `Claude extraction (${DOC_TYPE_META[docType].label})`,
      parsedData: {
        documentType: inferDocType(docType),
        taxYear: currentYear,
        amounts: {},
        extractedAt: new Date(),
        confidence: Math.min(
          1,
          Math.max(0, transactions.length > 0 ? transactions.reduce((s, t) => s + t.confidence, 0) / transactions.length : 1)
        ),
      } as ParsedDocumentData,
      rawContent: rawResponse,
      verificationStatus: 'pending',
    };
    addDocument(newDoc);

    if (docType === 'bank_statement' && transactions.length > 0) {
      transactions.forEach((txn, idx) => {
        const date = new Date(txn.date);
        const safeDate = Number.isNaN(date.getTime()) ? new Date(`${currentYear}-01-01`) : date;
        const signedAmount = txn.type === 'credit' ? Math.abs(txn.amount) : -Math.abs(txn.amount);
        const imported: Transaction = {
          id: `txn_extract_${Date.now()}_${idx}`,
          date: safeDate,
          description: txn.description || 'Imported bank transaction',
          amount: signedAmount,
          source: `Extracted from ${fileName}`,
          sourceDocumentId: newDoc.id,
          state: 'requires_decision',
          evidenceStatus: 'pending',
          requiresBusinessPurpose: false,
          taxYear: currentYear,
        };
        addTransaction(imported);
      });
      toast.success(`Imported ${transactions.length} transactions for review`);
    } else {
      toast.success('Extraction accepted and document added');
    }

    setStatus('accepted');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI Document Extraction (POC)</CardTitle>
          <CardDescription>
            Upload a PDF/image and extract structured JSON via Claude. Use this for live parser quality checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={docType} onValueChange={(v) => setDocType(v as POCDocType)}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOC_TYPE_META).map(([k, cfg]) => (
                  <SelectItem key={k} value={k}>
                    {cfg.icon} {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={onSelectFile}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={status === 'extracting'}>
              <Upload className="w-4 h-4 mr-2" />
              Upload File
            </Button>
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
            {elapsedS > 0 && <Badge variant="secondary">{elapsedS}s</Badge>}
          </div>

          {!!fileName && (
            <p className="text-sm text-muted-foreground">
              File: <span className="font-medium text-foreground">{fileName}</span>
            </p>
          )}

          {!apiKey && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>API key missing</AlertTitle>
              <AlertDescription>
                Set <code>VITE_ANTHROPIC_API_KEY</code> in your environment to run browser extraction.
              </AlertDescription>
            </Alert>
          )}

          {status === 'error' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Extraction failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {(status === 'reviewing' || status === 'accepted') && extractedData && (
        <Card>
          <CardHeader>
            <CardTitle>Extracted Data</CardTitle>
            <CardDescription>
              Review structured output before importing into workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {docType === 'bank_statement' && transactions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Transactions ({transactions.length})</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Conf.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((txn, idx) => (
                      <TableRow key={`${txn.date}-${idx}`}>
                        <TableCell className="font-mono text-xs">{txn.date}</TableCell>
                        <TableCell>{txn.description}</TableCell>
                        <TableCell className="text-right font-mono">
                          ${Math.abs(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>{txn.type}</TableCell>
                        <TableCell>{Math.round(txn.confidence * 100)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <pre className="rounded-md bg-slate-950 text-slate-100 p-4 text-xs overflow-auto max-h-[420px]">
              {JSON.stringify(extractedData, null, 2)}
            </pre>

            {status === 'reviewing' && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={reset}>
                  Discard
                </Button>
                <Button onClick={acceptAndImport}>
                  <FileCheck2 className="w-4 h-4 mr-2" />
                  Accept & Import
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
