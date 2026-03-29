import { useState, useCallback } from 'react';
import { useTaxYear } from '@/contexts/TaxYearContext';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Trash2,
  XCircle,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import { Document, DocumentType, BlankForm, FormType } from '@/types/tax';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  blank_form: { icon: FileCheck, label: 'Blank Form', description: 'Blank tax forms for filling' },
};

export function DocumentsPage() {
  const { currentYear, isYearSelected, yearConfig } = useTaxYear();
  const { documents, addDocument, removeDocument, updateDocument, blankForms, addBlankForm, requiredForms } = useWorkflow();
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [formUploadOpen, setFormUploadOpen] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<{
    fileName: string;
    type: DocumentType;
    detectedYear?: number;
  } | null>(null);
  const [formUpload, setFormUpload] = useState<{
    formType: FormType;
    jurisdiction: string;
    residencyVersion?: string;
  }>({
    formType: '1040',
    jurisdiction: 'federal',
  });

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
    // Simulate file selection
    setUploadingDoc({
      fileName: `sample_${type}_${Date.now()}.pdf`,
      type,
      detectedYear: currentYear, // In real implementation, would parse document
    });
    setUploadDialogOpen(true);
  };

  const handleConfirmUpload = (yearMismatchConfirmed: boolean = false) => {
    if (!uploadingDoc || !currentYear) return;

    const newDoc: Document = {
      id: `doc_${Date.now()}`,
      type: uploadingDoc.type,
      fileName: uploadingDoc.fileName,
      uploadedAt: new Date(),
      taxYear: currentYear,
      detectedTaxYear: uploadingDoc.detectedYear,
      yearMismatchConfirmed,
      sourceReference: `Uploaded ${new Date().toISOString()}`,
      verificationStatus: uploadingDoc.detectedYear === currentYear ? 'verified' : 
                         yearMismatchConfirmed ? 'verified' : 'mismatch',
    };

    addDocument(newDoc);
    setUploadDialogOpen(false);
    setUploadingDoc(null);
  };

  const handleFormUpload = () => {
    if (!currentYear) return;

    const newForm: BlankForm = {
      id: `form_${Date.now()}`,
      formType: formUpload.formType,
      formName: formUpload.formType === '1040' ? 'Form 1040' : 
               formUpload.formType === 'schedule_c' ? 'Schedule C' :
               formUpload.formType === 'schedule_se' ? 'Schedule SE' :
               `${formUpload.jurisdiction} State Return`,
      taxYear: currentYear,
      jurisdiction: formUpload.jurisdiction,
      residencyVersion: formUpload.residencyVersion as any,
      uploadedAt: new Date(),
      verified: true, // In real implementation, would verify form details
    };

    addBlankForm(newForm);
    setFormUploadOpen(false);
  };

  const yearDocs = documents.filter(d => d.taxYear === currentYear);
  const yearForms = blankForms.filter(f => f.taxYear === currentYear);

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

      <Tabs defaultValue="source" className="space-y-4">
        <TabsList>
          <TabsTrigger value="source">Source Documents</TabsTrigger>
          <TabsTrigger value="forms">
            Blank Forms
            {requiredForms.filter(f => !f.isVerified).length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {requiredForms.filter(f => !f.isVerified).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="source" className="space-y-6">
          {/* Upload Grid */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Upload Source Documents</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Object.entries(documentTypeConfig) as [DocumentType, typeof documentTypeConfig[DocumentType]][])
                .filter(([type]) => type !== 'blank_form')
                .map(([type, config]) => {
                  const typeDocCount = yearDocs.filter(d => d.type === type).length;
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
                })}
            </div>
          </div>

          <Separator />

          {/* Document Handling Rules */}
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
                <span>Year mismatch documents require explicit confirmation before use</span>
              </div>
            </CardContent>
          </Card>

          {/* Uploaded Documents List */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Uploaded Documents ({yearDocs.length})</h2>
            {yearDocs.length === 0 ? (
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
                {yearDocs.map(doc => {
                  const config = documentTypeConfig[doc.type];
                  const Icon = config.icon;
                  const hasMismatch = doc.detectedTaxYear && doc.detectedTaxYear !== currentYear;
                  
                  return (
                    <div
                      key={doc.id}
                      className={cn(
                        "flex items-center justify-between p-4 border rounded-lg bg-card",
                        hasMismatch && !doc.yearMismatchConfirmed && "border-status-warning"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-secondary rounded">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">{doc.fileName}</div>
                          <div className="text-xs text-muted-foreground">
                            {config.label} \u2022 Uploaded {doc.uploadedAt.toLocaleDateString()}
                          </div>
                          {hasMismatch && (
                            <div className="text-xs text-status-warning mt-1">
                              \u26A0 Detected year: {doc.detectedTaxYear}
                              {doc.yearMismatchConfirmed && ' (confirmed)'}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.verificationStatus === 'verified' && (
                          <Badge variant="outline" className="status-badge-success">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                        {doc.verificationStatus === 'pending' && (
                          <Badge variant="outline" className="status-badge-pending">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                        {doc.verificationStatus === 'mismatch' && (
                          <Badge variant="outline" className="status-badge-warning">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Year Mismatch
                          </Badge>
                        )}
                        {doc.verificationStatus === 'failed' && (
                          <Badge variant="outline" className="status-badge-error">
                            <XCircle className="w-3 h-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                        <Button variant="ghost" size="icon">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive"
                          onClick={() => removeDocument(doc.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="forms" className="space-y-6">
          {/* Required Forms */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Required Blank Forms</h2>
              <Button onClick={() => setFormUploadOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Blank Form
              </Button>
            </div>
            
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  You must upload blank forms before the system can fill them. Verification confirms correct year and jurisdiction.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {requiredForms.map((form, idx) => (
                    <div 
                      key={idx}
                      className={cn(
                        "flex items-center justify-between p-3 border rounded-lg",
                        !form.isVerified && "border-status-warning bg-status-warning/5"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded",
                          form.isVerified ? "bg-status-success/10" : "bg-status-warning/10"
                        )}>
                          {form.isVerified ? (
                            <CheckCircle className="w-4 h-4 text-status-success" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-status-warning" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{form.formName}</div>
                          <div className="text-xs text-muted-foreground">
                            {form.jurisdiction === 'federal' ? 'Federal' : form.jurisdiction} \u2022 {form.reason}
                          </div>
                        </div>
                      </div>
                      <div>
                        {form.isVerified ? (
                          <Badge variant="outline" className="status-badge-success">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="status-badge-warning">
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {requiredForms.length === 0 && (
                    <div className="text-sm text-muted-foreground py-4 text-center">
                      No forms required yet. Upload income documents to determine required forms.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Uploaded Forms */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Uploaded Forms ({yearForms.length})</h2>
            {yearForms.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <FileCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground">No Blank Forms Yet</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload required blank forms so the system can fill them
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {yearForms.map(form => (
                  <div
                    key={form.id}
                    className="flex items-center justify-between p-4 border rounded-lg bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-secondary rounded">
                        <FileCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{form.formName}</div>
                        <div className="text-xs text-muted-foreground">
                          {form.jurisdiction === 'federal' ? 'Federal' : form.jurisdiction} \u2022 
                          Year {form.taxYear} \u2022 
                          Uploaded {form.uploadedAt.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {form.verified ? (
                        <Badge variant="outline" className="status-badge-success">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="status-badge-error">
                          <XCircle className="w-3 h-3 mr-1" />
                          Invalid
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Confirm document details before adding to tax year {currentYear}
            </DialogDescription>
          </DialogHeader>
          
          {uploadingDoc && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                <FileText className="w-6 h-6" />
                <div>
                  <div className="font-medium">{uploadingDoc.fileName}</div>
                  <div className="text-sm text-muted-foreground">
                    {documentTypeConfig[uploadingDoc.type].label}
                  </div>
                </div>
              </div>

              {uploadingDoc.detectedYear !== currentYear && (
                <Card className="border-status-warning bg-status-warning/5">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-status-warning mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">Year Mismatch Detected</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          This document appears to be for tax year <strong>{uploadingDoc.detectedYear}</strong>, 
                          but you are working on tax year <strong>{currentYear}</strong>.
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          You may continue, but you must explicitly confirm this is intentional.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            {uploadingDoc?.detectedYear !== currentYear ? (
              <Button 
                variant="destructive"
                onClick={() => handleConfirmUpload(true)}
              >
                Confirm Despite Mismatch
              </Button>
            ) : (
              <Button onClick={() => handleConfirmUpload(false)}>
                Upload Document
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form Upload Dialog */}
      <Dialog open={formUploadOpen} onOpenChange={setFormUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Blank Form</DialogTitle>
            <DialogDescription>
              Upload a blank tax form for tax year {currentYear}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Form Type</Label>
              <Select 
                value={formUpload.formType} 
                onValueChange={(v) => setFormUpload(prev => ({ ...prev, formType: v as FormType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1040">Form 1040</SelectItem>
                  <SelectItem value="schedule_c">Schedule C</SelectItem>
                  <SelectItem value="schedule_se">Schedule SE</SelectItem>
                  <SelectItem value="schedule_1">Schedule 1</SelectItem>
                  <SelectItem value="schedule_2">Schedule 2</SelectItem>
                  <SelectItem value="schedule_3">Schedule 3</SelectItem>
                  <SelectItem value="state_return">State Return</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Jurisdiction</Label>
              <Select 
                value={formUpload.jurisdiction} 
                onValueChange={(v) => setFormUpload(prev => ({ ...prev, jurisdiction: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="federal">Federal</SelectItem>
                  {yearConfig?.states.map(state => (
                    <SelectItem key={state.stateCode} value={state.stateCode}>
                      {state.stateName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formUpload.jurisdiction !== 'federal' && (
              <div className="space-y-2">
                <Label>Residency Version</Label>
                <Select
                  value={formUpload.residencyVersion || undefined}
                  onValueChange={(v) => setFormUpload(prev => ({ ...prev, residencyVersion: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resident">Resident</SelectItem>
                    <SelectItem value="part_year">Part-Year Resident</SelectItem>
                    <SelectItem value="nonresident">Nonresident</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleFormUpload}>
              Upload Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
