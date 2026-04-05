/**
 * ClientQuestionnairePortal.tsx
 *
 * Public-facing page at /portal/questionnaire/:token
 * Clients open this link (no login), answer their optimization questions,
 * and submit. Responses are saved back to the return record.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle2, AlertCircle, Loader2, Calculator,
  Send, ChevronDown, ChevronUp, DollarSign, Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PortalTokenWithReturn, OptimizationQuestion, OptimizationResponse, OptimizationCategory } from '@/types/client';
import { validatePortalToken, markTokenUsed } from '@/lib/portalLinks';
import { saveOptimizationResponses } from '@/lib/clientStorage';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/taxOptimizer';

type Step = 'loading' | 'invalid' | 'expired' | 'no_questions' | 'form' | 'submitting' | 'done' | 'error';

// ─── Question input (same logic as OptimizationInterview, no context deps) ─────

interface QInputProps {
  question: OptimizationQuestion;
  response: OptimizationResponse | undefined;
  onChange: (qId: string, answer: string | number | boolean | null) => void;
}

function QInput({ question, response, onChange }: QInputProps) {
  const cur = response?.answer;

  if (question.answerType === 'yes_no') {
    return (
      <div className="flex gap-2 mt-2">
        {(['Yes', 'No'] as const).map(opt => (
          <Button
            key={opt}
            variant={cur === (opt === 'Yes') ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(question.id, opt === 'Yes')}
          >
            {opt}
          </Button>
        ))}
      </div>
    );
  }

  if (question.answerType === 'dollar_amount') {
    return (
      <div className="relative mt-2 max-w-xs">
        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="number"
          min={0}
          step={1}
          value={typeof cur === 'number' ? String(cur) : ''}
          onChange={e => onChange(question.id, e.target.value === '' ? null : Number(e.target.value))}
          placeholder="0"
          className="pl-9"
        />
      </div>
    );
  }

  if (question.answerType === 'percentage') {
    return (
      <div className="relative mt-2 max-w-xs">
        <Input
          type="number"
          min={0}
          max={100}
          value={typeof cur === 'number' ? String(cur) : ''}
          onChange={e => onChange(question.id, e.target.value === '' ? null : Number(e.target.value))}
          placeholder="0"
          className="pr-8"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
      </div>
    );
  }

  if (question.answerType === 'multiple_choice' && question.choices) {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {question.choices.map(opt => (
          <Button
            key={opt}
            variant={cur === opt ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(question.id, opt)}
          >
            {opt}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <Input
      className="mt-2"
      value={typeof cur === 'string' ? cur : ''}
      onChange={e => onChange(question.id, e.target.value || null)}
      placeholder="Type your answer…"
    />
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

interface CatSectionProps {
  category: OptimizationCategory;
  questions: OptimizationQuestion[];
  responses: Record<string, OptimizationResponse>;
  onChange: (qId: string, answer: string | number | boolean | null) => void;
}

function CatSection({ category, questions, responses, onChange }: CatSectionProps) {
  const [open, setOpen] = useState(true);
  const answered = questions.filter(q => responses[q.id]?.answer != null).length;

  return (
    <Card>
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">
              {CATEGORY_LABELS[category] ?? category}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">{answered}/{questions.length}</Badge>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-5 pt-0">
          {questions.map((q, idx) => {
            const isAnswered = responses[q.id]?.answer != null;
            return (
              <div key={q.id}>
                {idx > 0 && <Separator className="mb-5" />}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Label className="text-sm leading-snug">
                      {isAnswered && <CheckCircle2 className="inline w-3.5 h-3.5 mr-1.5 text-green-600" />}
                      {q.question}
                    </Label>
                    {q.potentialSavingsMax != null && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        Up to ${q.potentialSavingsMax.toLocaleString()} savings
                      </span>
                    )}
                  </div>
                  {q.helpText && (
                    <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {q.helpText}
                    </div>
                  )}
                  <QInput question={q} response={responses[q.id]} onChange={onChange} />
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClientQuestionnairePortal() {
  const { token } = useParams<{ token: string }>();
  const [step,       setStep]       = useState<Step>('loading');
  const [portalData, setPortalData] = useState<PortalTokenWithReturn | null>(null);
  const [responses,  setResponses]  = useState<Record<string, OptimizationResponse>>({});
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setStep('invalid'); return; }
    validatePortalToken(token, 'questionnaire').then(data => {
      if (!data)                                         { setStep('invalid');      return; }
      if (new Date(data.expiresAt) <= new Date())        { setStep('expired');      return; }
      if (!data.optimizationQuestions?.length)           { setStep('no_questions'); return; }
      setPortalData(data);
      setStep('form');
      markTokenUsed(data.id).catch(() => {});
    }).catch(() => setStep('error'));
  }, [token]);

  const handleChange = (qId: string, answer: string | number | boolean | null) => {
    setResponses(prev => ({
      ...prev,
      [qId]: { questionId: qId, answer, answeredAt: new Date().toISOString() },
    }));
  };

  const handleSubmit = async () => {
    if (!portalData) return;
    setError(null);
    setStep('submitting');
    try {
      await saveOptimizationResponses(portalData.returnId, responses);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed. Please try again.');
      setStep('form');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (step === 'loading') {
    return <Shell><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Verifying link…</div></Shell>;
  }

  if (step === 'invalid' || step === 'error') {
    return (
      <Shell>
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="w-10 h-10 text-destructive" />
            <h3 className="font-semibold">Invalid Link</h3>
            <p className="text-sm text-muted-foreground">This link is invalid or has been revoked. Please contact your tax preparer.</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (step === 'expired') {
    return (
      <Shell>
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="w-10 h-10 text-amber-500" />
            <h3 className="font-semibold">Link Expired</h3>
            <p className="text-sm text-muted-foreground">This link has expired. Please ask your tax preparer for a new one.</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (step === 'no_questions') {
    return (
      <Shell>
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="w-10 h-10 text-amber-500" />
            <h3 className="font-semibold">Not Ready Yet</h3>
            <p className="text-sm text-muted-foreground">Your tax preparer is still preparing your questions. Check back soon or contact them directly.</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (step === 'done') {
    return (
      <Shell>
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
            <h3 className="text-lg font-semibold">Thank you!</h3>
            <p className="text-sm text-muted-foreground">
              Your responses have been submitted. Your tax preparer will review them and
              incorporate the findings into your {portalData?.taxYear} return.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (!portalData?.optimizationQuestions?.length) return null;

  const questions = portalData.optimizationQuestions;
  const grouped = CATEGORY_ORDER.reduce<Record<string, OptimizationQuestion[]>>((acc, cat) => {
    const qs = questions.filter(q => q.category === cat);
    if (qs.length) acc[cat] = qs;
    return acc;
  }, {});

  const totalAnswered = questions.filter(q => responses[q.id]?.answer != null).length;

  return (
    <Shell>
      <div className="w-full max-w-2xl space-y-6 pb-12">
        {/* Welcome */}
        <Card>
          <CardHeader>
            <CardTitle>{portalData.taxYear} Tax Questionnaire</CardTitle>
            <CardDescription>
              Hi {portalData.clientFirstName}, your tax preparer has put together these questions
              to identify potential deductions and credits for your {portalData.taxYear} return.
              Answer as many as you can — skip any that don&apos;t apply.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${questions.length > 0 ? (totalAnswered / questions.length) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {totalAnswered}/{questions.length} answered
              </span>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Questions by category */}
        {Object.entries(grouped).map(([cat, qs]) => (
          <CatSection
            key={cat}
            category={cat as OptimizationCategory}
            questions={qs}
            responses={responses}
            onChange={handleChange}
          />
        ))}

        {/* Submit */}
        <Card>
          <CardContent className="pt-6">
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={step === 'submitting' || totalAnswered === 0}
            >
              {step === 'submitting'
                ? <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                : <Send className="w-5 h-5 mr-2" />
              }
              {step === 'submitting' ? 'Submitting…' : 'Submit My Answers'}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-3">
              You can change your answers before submitting. Once submitted, contact your preparer to make changes.
            </p>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          This link expires on {new Date(portalData.expiresAt).toLocaleDateString()}.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card px-6 py-3 flex items-center gap-2">
        <div className="w-7 h-7 bg-primary rounded flex items-center justify-center">
          <Calculator className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm">Tax Forensics</span>
        <span className="text-xs text-muted-foreground ml-1">Client Portal</span>
      </header>
      <main className="flex-1 flex justify-center p-6">
        {children}
      </main>
    </div>
  );
}
