import { useState } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Upload, 
  FileText, 
  FileSpreadsheet, 
  Receipt, 
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Trash2
} from 'lucide-react';
import { Document, DocumentType } from '@/types/tax';
import { cn } from '@/lib/utils';

const documentTypeConfig: Record<DocumentType, { icon: typeof FileText; label: string; description: string }> = {
  prior_return: { icon: FileText, label: 'Prior Year Return', description: 'Previous tax returns for carryforward reference' },
  w2: { icon: FileSpreadsheet, label: 'W-2', description: 'Wage and Tax Statement' },
  '1099_nec': { icon: FileSpreadsheet, label: '1099-NEC', description: 'Nonemployee Compensation' },
  '1099_int': { icon: FileSpreadsheet, label: '1099-INT', description: 'Interest Income' },
  '1099_div': { icon: FileSpreadsheet, label: '1099-DIV', description: 'Dividend Income' },
  bank_statement: { icon: CreditCard, label: 'Bank Statement', description: 'Monthly bank statements' },
  payment_processor: { icon: Receipt, label: 'Payment Processor', description: 'Stripe, PayPal, Square, etc.' },
  invoice: { icon: FileText, label: 'Invoice', description: 'Invoices sent to clients' },
  receipt: { icon: Receipt, label: 'Receipt', description: 'Expense receipts' },
  identification: { icon: FileText, label: 'Identification', description: 'ID/SS for autofill verification' },
};

// Mock documents for demonstration
const mockDocuments: Document[] = [];

export function DocumentsPage() {
  const { currentYear, isYearSelected } = useTaxYear();
  const [documents, setDocuments] = useState<Document[]>(mockDocuments);
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);

  if (!isYearSelected) {
    return (
      <div className="p-6">
        <Card className="border-status-warning/50 bg-status-warning/5">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-status-warning mx-auto mb-4" />
            <h3 className="text-lg font-medium">Tax Year Required</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Please select a tax year from the Dashboard before uploading documents.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleUploadClick = (type: DocumentType) => {
    setSelectedType(type);
    // In a real implementation, this would open a file picker
    // For now, we'll show the upload area
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Document Ingestion
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload and parse source documents for tax year {currentYear}
        </p>
      </div>

      {/* Upload Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Upload Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.entries(documentTypeConfig) as [DocumentType, typeof documentTypeConfig[DocumentType]][]).map(
            ([type, config]) => {
              const typeDocCount = documents.filter(d => d.type === type).length;
              const Icon = config.icon;
              
              return (
                <Card
                  key={type}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md hover:border-accent/50',
                    selectedType === type && 'ring-2 ring-accent'
                  )}
                  onClick={() => handleUploadClick(type)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-secondary rounded-md">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{config.label}</span>
                          {typeDocCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {typeDocCount}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {config.description}
                        </p>
                        <div className="mt-3 flex items-center gap-2 text-xs text-accent">
                          <Upload className="w-3 h-3" />
                          <span>Click to upload</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }
          )}
        </div>
      </div>

      <Separator />

      {/* Document Rules */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Document Handling Rules</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>All extracted data retains document source references with page/box/line metadata</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>Raw originals are never overwritten</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-status-success mt-0.5 shrink-0" />
            <span>All documents are bound to tax year {currentYear}</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
            <span>Mixing tax years across documents is forbidden</span>
          </div>
        </CardContent>
      </Card>

      {/* Uploaded Documents List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Uploaded Documents ({documents.length})</h2>
        {documents.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No Documents Yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Click on a document type above to upload your first document
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => {
              const config = documentTypeConfig[doc.type];
              const Icon = config.icon;
              
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-secondary rounded">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{doc.fileName}</div>
                      <div className="text-xs text-muted-foreground">
                        {config.label} • Uploaded {doc.uploadedAt.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.parsedData ? (
                      <Badge variant="outline" className="status-badge-success">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Parsed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="status-badge-pending">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                    <Button variant="ghost" size="icon">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
