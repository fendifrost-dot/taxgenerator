/**
 * businessEntityBuilder.ts
 *
 * Uses the Claude API to generate complete business entity returns for:
 *  - S Corporations (Form 1120-S)
 *  - Partnerships / LLPs / LLLPs / Multi-member LLCs (Form 1065)
 *  - C Corporations (Form 1120)
 *
 * The builder:
 *  1. Formats all entity input data into a structured prompt
 *  2. Injects the correct form lines and compliance rules for the entity type
 *  3. Returns a structured EntityReturnSummary with line-by-line amounts
 *  4. Computes K-1 allocations per owner/partner/shareholder
 */

import {
  EntityReturnInput,
  EntityReturnSummary,
  EntityReturnSection,
  EntityReturnLineItem,
  EntityK1Summary,
  EntityType,
  PASS_THROUGH_ENTITIES,
  ENTITY_FORMS,
  ENTITY_LABELS,
} from '@/types/businessEntity';
import {
  getFormLines,
  getScheduleKLines,
  ENTITY_COMPLIANCE_NOTES,
  REASONABLE_COMP_GUIDANCE,
  PARTNERSHIP_SE_GUIDANCE,
  C_CORP_TAX_RATE,
} from '@/lib/businessEntityForms';
import { callClaudeMessages, extractText, AnthropicProxyError, CLAUDE_MODEL } from '@/lib/anthropicProxy';

// ─── API call ──────────────────────────────────────────────────────────────────

const MAX_TOKENS   = 8192;

export interface EntityBuilderResult {
  summary: EntityReturnSummary | null;
  elapsedMs: number;
  error?: string;
}

// ─── Prompt construction ──────────────────────────────────────────────────────

function formatOtherIncome(input: EntityReturnInput): string {
  if (!input.otherIncome.length) return '  None';
  return input.otherIncome.map(i => `  • ${i.description}: $${i.amount.toLocaleString()}`).join('\n');
}

function formatOtherDeductions(input: EntityReturnInput): string {
  if (!input.otherDeductions.length) return '  None';
  return input.otherDeductions.map(d =>
    `  • ${d.category} — ${d.description}: $${d.amount.toLocaleString()}${d.formLine ? ` (${d.formLine})` : ''}`
  ).join('\n');
}

function formatOwners(input: EntityReturnInput): string {
  return input.owners.map(o => {
    const role = o.isGeneralPartner ? 'General Partner' : o.isShareholder ? 'Shareholder' : 'Owner';
    return `  • ${o.name} — ${o.ownershipPct}% (${role})`;
  }).join('\n');
}

function formatAssets(input: EntityReturnInput): string {
  if (!input.assets.length) return '  None provided';
  return input.assets.map(a =>
    `  • ${a.description}: cost $${a.cost.toLocaleString()}, prior depreciation $${a.priorDepreciation.toLocaleString()}, method ${a.method}, life ${a.life}yr`
  ).join('\n');
}

function buildPrompt(input: EntityReturnInput): string {
  const formName = ENTITY_FORMS[input.entityType];
  const entityLabel = ENTITY_LABELS[input.entityType];
  const formLines = getFormLines(input.entityType);
  const scheduleKLines = getScheduleKLines(input.entityType);
  const complianceNotes = ENTITY_COMPLIANCE_NOTES[input.entityType];
  const isPassThrough = PASS_THROUGH_ENTITIES.includes(input.entityType);
  const isCCorp = input.entityType === 'c_corp';

  const formLinesText = formLines
    .map(l => `  Line ${l.line}: ${l.description}${l.isCalculated ? ' [CALCULATED]' : ''}`)
    .join('\n');

  const scheduleKText = scheduleKLines.length > 0
    ? `\n${scheduleKLines.map(l => `  ${l.line}: ${l.description}`).join('\n')}`
    : '  N/A for this entity type';

  const specialNotes = complianceNotes.length > 0
    ? complianceNotes.map(n => `  ⚠ ${n}`).join('\n')
    : '  None';

  const sCropSpecific = (input.entityType === 's_corp' || input.entityType === 'llc_s_corp')
    ? `\nS CORP SPECIFIC DATA:
- Reasonable compensation (W-2 to shareholders): $${(input.reasonableCompensation ?? 0).toLocaleString()}
- Distributions to shareholders: $${(input.distributionsToShareholders ?? 0).toLocaleString()}
- Shareholder loans: $${(input.shareholderLoans ?? 0).toLocaleString()}

REASONABLE COMPENSATION RULES:
${REASONABLE_COMP_GUIDANCE}` : '';

  const partnershipSpecific = isPassThrough && input.entityType !== 's_corp' && input.entityType !== 'llc_s_corp'
    ? `\nPARTNERSHIP SPECIFIC DATA:
- Guaranteed payments to partners: $${(input.guaranteedPayments ?? 0).toLocaleString()}
- Partner distributions: $${(input.partnerDistributions ?? 0).toLocaleString()}
- Self-rental income: $${(input.selfRentals ?? 0).toLocaleString()}

SE TAX RULES FOR PARTNERS:
${PARTNERSHIP_SE_GUIDANCE}` : '';

  const cCorpSpecific = isCCorp
    ? `\nC CORP SPECIFIC DATA:
- Corporate tax rate: ${(C_CORP_TAX_RATE * 100).toFixed(0)}% flat (TCJA 2017)
- Dividends paid to shareholders: $${(input.dividendsPaid ?? 0).toLocaleString()}
- Note: dividends are NOT deductible — double taxation applies` : '';

  const balanceSheet = (input.totalAssets !== undefined)
    ? `\nBALANCE SHEET (Schedule L):
- Total assets: $${input.totalAssets.toLocaleString()}
- Total liabilities: $${input.totalLiabilities?.toLocaleString() ?? 'not provided'}
- Partners/shareholders equity: $${input.partnersCapital?.toLocaleString() ?? 'not provided'}` : '';

  return `You are an expert CPA preparing a ${entityLabel} business tax return for tax year ${input.taxYear}.
Your task is to produce a complete, accurate ${formName} return with line-by-line amounts, Schedule K totals, and per-owner K-1 summaries.

═══════════════════════════════════════════════════════
ENTITY INFORMATION
═══════════════════════════════════════════════════════
Entity name: ${input.entityName}
EIN: ${input.ein}
Entity type: ${entityLabel}
Tax form: ${formName}
State of formation: ${input.stateOfFormation}
Tax year: ${input.taxYear}
Accounting method: ${input.accountingMethod}
Initial return: ${input.isInitialReturn ? 'Yes' : 'No'}
Final return: ${input.isFinalReturn ? 'Yes' : 'No'}

OWNERS / PARTNERS / SHAREHOLDERS:
${formatOwners(input)}

═══════════════════════════════════════════════════════
FINANCIAL DATA
═══════════════════════════════════════════════════════
INCOME:
- Gross receipts / sales: $${input.grossReceipts.toLocaleString()}
- Returns and allowances: $${input.returnsAndAllowances.toLocaleString()}
- Cost of goods sold: $${input.costOfGoodsSold.toLocaleString()}
- Other income:
${formatOtherIncome(input)}

DEDUCTIONS:
- Compensation of officers/partners: $${input.compensation.toLocaleString()}
- Salaries and wages (employees): $${input.salariesAndWages.toLocaleString()}
- Repairs: $${input.repairs.toLocaleString()}
- Bad debts: $${input.badDebts.toLocaleString()}
- Rents: $${input.rents.toLocaleString()}
- Taxes and licenses: $${input.taxesAndLicenses.toLocaleString()}
- Interest: $${input.interest.toLocaleString()}
- Depreciation: $${input.depreciation.toLocaleString()}
- Depletion: $${input.depletion.toLocaleString()}
- Advertising: $${input.advertising.toLocaleString()}
- Pension/profit-sharing plans: $${input.pensionAndProfitSharing.toLocaleString()}
- Employee benefit programs: $${input.benefitPrograms.toLocaleString()}
- Other deductions:
${formatOtherDeductions(input)}

DEPRECIATION SCHEDULE:
${formatAssets(input)}
${sCropSpecific}${partnershipSpecific}${cCorpSpecific}${balanceSheet}

PREPARER NOTES:
${input.preparerNotes || 'None'}

═══════════════════════════════════════════════════════
FORM ${formName} LINE STRUCTURE
═══════════════════════════════════════════════════════
${formLinesText}

SCHEDULE K LINES (pass-through items):
${scheduleKText}

═══════════════════════════════════════════════════════
COMPLIANCE NOTES FOR THIS ENTITY TYPE
═══════════════════════════════════════════════════════
${specialNotes}

═══════════════════════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════════════════════
Generate a complete ${formName} return. Your response MUST be valid JSON matching this exact structure:

{
  "grossIncome": number,
  "totalDeductions": number,
  "ordinaryBusinessIncome": number,
  "entityTaxLiability": number_or_null,
  "sections": [
    {
      "title": "section name",
      "subtotal": number,
      "lines": [
        {
          "lineNumber": "line identifier",
          "description": "line description",
          "amount": number,
          "isEstimated": boolean,
          "note": "optional explanation"
        }
      ]
    }
  ],
  "k1Summaries": [
    {
      "ownerName": "string",
      "ownershipPct": number,
      "k1Items": [
        { "box": "box identifier", "description": "description", "amount": number }
      ],
      "ordinaryIncome": number,
      "guaranteedPayments": number_or_null,
      "selfEmploymentIncome": number_or_null,
      "distributions": number,
      "basisImpact": number
    }
  ],
  "preparerSummary": "plain-English summary of the return",
  "warningFlags": ["array of compliance warnings"],
  "missingDocuments": ["list of missing items"],
  "recommendedActions": ["list of recommended next steps"],
  "estimatedValuesNote": "string if any values are estimated, null otherwise"
}

RULES:
1. Calculate all [CALCULATED] lines from the provided data
2. Allocate K-1 items to each owner according to their ownership percentage (or per partnership agreement if GP/LP split indicated)
3. For S Corps: identify if reasonable compensation appears insufficient and flag it
4. For partnerships: calculate SE income correctly — general partners on full share, limited partners on guaranteed payments only
5. For C Corps: compute entity-level tax at 21% on taxable income; set entityTaxLiability
6. Mark any line as isEstimated: true if the amount was derived/estimated rather than directly provided
7. Flag missing documents, unreasonable amounts, or compliance risks in warningFlags
8. Provide specific, actionable recommendedActions (e.g., "File Form 2553 to confirm S election", "Increase officer compensation to at least $X")
9. Return ONLY the JSON object — no markdown, no explanation outside the JSON`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseResponse(
  raw: string,
  input: EntityReturnInput,
): EntityReturnSummary {
  // Strip markdown fences if Claude wrapped it
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: any = JSON.parse(cleaned);

  return {
    entityName:             input.entityName,
    entityType:             input.entityType,
    formName:               ENTITY_FORMS[input.entityType],
    taxYear:                input.taxYear,
    ein:                    input.ein,
    grossIncome:            parsed.grossIncome            ?? 0,
    totalDeductions:        parsed.totalDeductions        ?? 0,
    ordinaryBusinessIncome: parsed.ordinaryBusinessIncome ?? 0,
    entityTaxLiability:     parsed.entityTaxLiability     ?? undefined,
    sections:               (parsed.sections              ?? []) as EntityReturnSection[],
    k1Summaries:            parsed.k1Summaries            ?? undefined,
    preparerSummary:        parsed.preparerSummary        ?? '',
    warningFlags:           parsed.warningFlags           ?? [],
    missingDocuments:       parsed.missingDocuments       ?? [],
    recommendedActions:     parsed.recommendedActions     ?? [],
    estimatedValuesNote:    parsed.estimatedValuesNote    ?? undefined,
    generatedAt:            new Date().toISOString(),
    claudeModel:            CLAUDE_MODEL,
  };
}

// ─── Main builder function ────────────────────────────────────────────────────

export async function buildEntityReturn(
  input: EntityReturnInput,
): Promise<EntityBuilderResult> {
  const start = Date.now();

  try {
    const prompt = buildPrompt(input);

    let data;
    try {
      data = await callClaudeMessages({
        model:      CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role:    'user',
            content: prompt,
          },
        ],
      });
    } catch (err) {
      const message = err instanceof AnthropicProxyError
        ? `Claude API error ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'Network error';
      return {
        summary:   null,
        elapsedMs: Date.now() - start,
        error:     message,
      };
    }

    const raw: string = extractText(data);

    if (!raw) {
      return {
        summary:   null,
        elapsedMs: Date.now() - start,
        error:     'Empty response from Claude API',
      };
    }

    const summary = parseResponse(raw, input);

    return {
      summary,
      elapsedMs: Date.now() - start,
    };
  } catch (e) {
    return {
      summary:   null,
      elapsedMs: Date.now() - start,
      error:     e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

// ─── Helpers for the UI ───────────────────────────────────────────────────────

/** Build an empty EntityReturnInput shell for a given entity type */
export function emptyEntityInput(entityType: EntityType, taxYear: number): EntityReturnInput {
  return {
    entityType,
    entityName:              '',
    ein:                     '',
    stateOfFormation:        '',
    taxYear,
    isInitialReturn:         false,
    isFinalReturn:           false,
    accountingMethod:        'cash',
    owners:                  [],
    grossReceipts:           0,
    returnsAndAllowances:    0,
    costOfGoodsSold:         0,
    otherIncome:             [],
    compensation:            0,
    salariesAndWages:        0,
    repairs:                 0,
    badDebts:                0,
    rents:                   0,
    taxesAndLicenses:        0,
    interest:                0,
    depreciation:            0,
    depletion:               0,
    advertising:             0,
    pensionAndProfitSharing: 0,
    benefitPrograms:         0,
    otherDeductions:         [],
    assets:                  [],
    preparerNotes:           '',
  };
}
