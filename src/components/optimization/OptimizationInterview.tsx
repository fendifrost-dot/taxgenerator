/**
 * OptimizationInterview.tsx
 *
 * Drives the tax optimization interview flow.
 *
 * Preparer-side:
 *  1. Snapshot the current WorkflowContext state
 *  2. Call Claude to generate targeted questions (via taxOptimizer.ts)
 *  3. Display questions grouped by category
 *  4. Preparer can answer on behalf of client, OR save+send questionnaire link
 *
 * Client-side (portal):
 *  The same <QuestionForm> component is reused in ClientQuestionnairePortal.tsx
 *  to render questions fetched from a portal token.
 */

import { useState } from 'react';
import {
  Sparkles, Loader2, ChevronDown, ChevronUp, AlertCircle,
  DollarSign, CheckCircle2, Info, Save,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { OptimizationQuestion, OptimizationResponse, OptimizationCategory } from '@/types/client';
import {
  generateOptimizationQuestions,
  buildOptimizerInput,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from '@/lib/taxOptimizer';
import { saveOptimizationQuestions, saveOptimizationResponses } from '@/lib/clientStorage';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { useTaxYear } from '@/contexts/TaxYearContext';

interface Props {
  returnId: string;
  /** Called when the user navigates away */
  onBack?: () => void;
  /** Initial questions (used when pre-loaded from portal/stored return) */
  initialQuestions?: OptimizationQuestion[];
  /** Initial responses */
  initialResponses?: Record<string, OptimizationResponse>;
}

// ─── Single question input ────────────────────────────────────────────────────

interface QuestionInputProps {
  question: OptimizationQuestion;
  response: OptimizationResponse | undefined;
  onChange: (qId: string, answer: string | number | boolean | null) => void;
}

function QuestionInput({ question, response, onChange }: QuestionInputProps) {
  const current = response?.answer;

  if (question.answerType === 'yes_no') {
    return (
      <div className="flex gap-2 mt-2">
        {['Yes', 'No'].map(opt => (
          <Button
            key={opt}
            variant={current === (opt === 'Yes') ? 'default' : 'outline'}
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
          value={typeof current === 'number' ? String(current) : ''}
          onChange={e => onChange(question.id, e.target.value === '' ? null : Number(e.target.value))}
          placeholder="0.00"
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
          step={1}
          value={typeof current === 'number' ? String(current) : ''}
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
            variant={current === opt ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(question.id, opt)}
          >
            {opt}
          </Button>
        ))}
      </div>
    );
  }

  // text
  return (
    <Input
      className="mt-2"
      value={typeof current === 'string' ? current : ''}
      onChange={e => onChange(question.id, e.target.value || null)}
      placeholder="Type your answer…"
    />
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: OptimizationCategory;
  questions: OptimizationQuestion[];
  responses: Record<string, OptimizationResponse>;
  onChange: (qId: string, answer: string | number | boolean | null) => void;
}

function CategorySection({ category, questions, responses, onChange }: CategorySectionProps) {
  const [open, setOpen] = useState(true);
  const answered = questions.filter(q => responses[q.id]?.answer !== undefined && responses[q.id]?.answer !== null).length;

  return (
    <Card>
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">
              {CATEGORY_LABELS[category] ?? category}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {answered}/{questions.length}
            </Badge>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5 pt-0">
          {questions.map((q, idx) => {
            const answered = responses[q.id]?.answer !== undefined && responses[q.id]?.answer !== null;
            return (
              <div key={q.id}>
                {idx > 0 && <Separator className="mb-5" />}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Label className="text-sm leading-snug">
                      {answered && <CheckCircle2 className="inline w-3.5 h-3.5 mr-1.5 text-green-600 shrink-0" />}
                      {q.question}
                    </Label>
                    {(q.potentialSavingsMin != null || q.potentialSavingsMax != null) && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Up to ${(q.potentialSavingsMax ?? q.potentialSavingsMin ?? 0).toLocaleString()} savings
                      </span>
                    )}
                  </div>

                  {q.helpText && (
                    <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {q.helpText}
                    </div>
                  )}

                  {q.formReference && (
                    <p className="text-xs text-primary/70 mt-1">📋 {q.formReference}</p>
                  )}

                  <QuestionInput question={q} response={responses[q.id]} onChange={onChange} />
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

export function OptimizationInterview({
  returnId,
  onBack,
  initialQuestions,
  initialResponses = {},
}: Props) {
  const { currentYear } = useTaxYear();
  const workflow        = useWorkflow();
  const apiKey          = (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined) ?? '';

  const [questions,  setQuestions]  = useState<OptimizationQuestion[]>(initialQuestions ?? []);
  const [responses,  setResponses]  = useState<Record<string, OptimizationResponse>>(initialResponses);
  const [generating, setGenerating] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [saved,      setSaved]      = useState(false);

  // Build context snapshot from WorkflowContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contextSnap: Record<string, any> = {
    documents:    workflow.documents,
    transactions: workflow.transactions,
  };

  const handleGenerate = async () => {
    if (!apiKey) { setError('VITE_ANTHROPIC_API_KEY is not set.'); return; }
    if (!currentYear) { setError('No tax year selected.'); return; }
    setGenerating(true);
    setError(null);
    try {
      const input  = buildOptimizerInput(contextSnap, currentYear);
      const result = await generateOptimizationQuestions(input, apiKey);
      if (result.error) { setError(result.error); return; }
      setQuestions(result.questions);
      setResponses({});
      setSaved(false);
    } finally {
      setGenerating(false);
    }
  };

  const handleChange = (qId: string, answer: string | number | boolean | null) => {
    setResponses(prev => ({
      ...prev,
      [qId]: { questionId: qId, answer, answeredAt: new Date().toISOString() },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveOptimizationQuestions(returnId, questions);
      await saveOptimizationResponses(returnId, responses);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // Group questions by category, respecting CATEGORY_ORDER
  const grouped = CATEGORY_ORDER.reduce<Record<string, OptimizationQuestion[]>>((acc, cat) => {
    const qs = questions.filter(q => q.category === cat);
    if (qs.length) acc[cat] = qs;
    return acc;
  }, {});

  const totalAnswered = questions.filter(q =>
    responses[q.id]?.answer !== undefined && responses[q.id]?.answer !== null,
  ).length;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Optimization Review</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Claude analyzes the uploaded documents and generates targeted questions to maximize this return.
          </p>
        </div>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Generate button / progress */}
      {questions.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <Sparkles className="w-10 h-10 text-primary/40" />
            <p className="text-sm text-center text-muted-foreground max-w-sm">
              Claude will review all uploaded documents and generate a personalized list of deductions,
              credits, and tax strategies specific to this client.
            </p>
            <Button onClick={handleGenerate} disabled={generating || !apiKey}>
              {generating
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Sparkles className="w-4 h-4 mr-2" />
              }
              {generating ? 'Analyzing return…' : 'Generate Optimization Questions'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Questions */}
      {questions.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {questions.length} question{questions.length !== 1 ? 's' : ''} generated
              {totalAnswered > 0 && ` · ${totalAnswered} answered`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Regenerate'}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : saved
                  ? <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                  : <Save className="w-4 h-4 mr-2" />
                }
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save Responses'}
              </Button>
            </div>
          </div>

          {Object.entries(grouped).map(([cat, qs]) => (
            <CategorySection
              key={cat}
              category={cat as OptimizationCategory}
              questions={qs}
              responses={responses}
              onChange={handleChange}
            />
          ))}

          <div className="flex justify-end pb-6">
            <Button onClick={handleSave} disabled={saving || totalAnswered === 0}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? 'Saving…' : 'Save All Responses'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
