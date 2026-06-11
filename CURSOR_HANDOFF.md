# Taxgenerator — Cursor Handoff: Complete the Schedule C / Form 1040 Federal Packet

## Goal

Make the taxgenerator produce a **mail-ready** federal filing packet for a single-member-LLC / Schedule C filer. Today the tool only emits Schedule C and Schedule SE for that path; we need it to emit the full Form 1040 packet so the client can print it, sign three pages, and mail it to the IRS.

The pipeline architecture (`src/lib/irsForms/`) is already built and proven against IRS forms (the 1120-S path was used for a real April 2026 filing). We're extending the same pattern to the 1040 family and adding multi-year support.

**State filing is out of scope. Federal only.**

---

## Acceptance criteria

When done, calling `generateIrsPdfPacket(input, summary, {taxYear: 2024})` for an entity of type `schedule_c` produces a single PDF containing, in IRS filing order:

1. Form 1040 (2024 IRS template, populated, flattened)
2. Schedule 1 (2024)
3. Schedule 2 (2024)
4. Schedule C (2024)
5. Schedule SE (2024)
6. Form 8959 (2024)

And the same call with `{taxYear: 2025}` produces the same set in 2025 templates.

Every form must be the **official IRS PDF for that tax year** — not substitutes, not 2025 forms relabeled as 2024.

---

## What's already in place (don't rewrite)


| Module                                          | Purpose                                                                 | Status                             |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| `src/lib/irsForms/types.ts`                     | `FieldDefinition`, `FormDefinition`, `FormFieldValues` types            | ✅ stable, do not change            |
| `src/lib/irsForms/loadForms.ts`                 | Loads PDF + fields.json from `/public/irs-forms/`                       | needs **year parameter** added     |
| `src/lib/irsForms/pdfFiller.ts`                 | Draws values onto pages, removes widget annotations, strips XFA, merges | ✅ stable, proven against IRS forms |
| `src/lib/irsForms/entityReturnMapper.ts`        | Per-form value mappers                                                  | partial — needs new mappers added  |
| `src/lib/irsForms/index.ts`                     | `planFormSet` + `generateIrsPdfPacket` orchestrator                     | needs `schedule_c` branch expanded |
| `public/irs-forms/1040sc.pdf` + `.fields.json`  | 2025 Schedule C                                                         | exists, becomes `1040sc_2025.`*    |
| `public/irs-forms/1040sse.pdf` + `.fields.json` | 2025 Schedule SE                                                        | exists, becomes `1040sse_2025.*`   |


---

## The gap

The orchestrator (`index.ts` line 90-93) explicitly notes:

```ts
} else if (entityType === 'schedule_c') {
  // ─── Schedule C packet — attaches to taxpayer's Form 1040 (not a standalone return) ───
  set.push({ id: '1040sc', values: values1040SC(input, summary) });
  set.push({ id: '1040sse', values: values1040SSE(input, summary) });
}
```

This was always a stub. To produce a complete 1040 filing, we need to also emit Form 1040, Schedule 1, Schedule 2, and Form 8959. None of those exist as bundled templates or as mappers.

`EntityReturnInput` doesn't carry the data needed for Form 1040 (filing status, dependents, AGI from non-business sources, etc.). We need a sibling input type for individual filers.

The pipeline is also year-blind: `loadForm('1040sc')` always loads `/irs-forms/1040sc.pdf`. There's no way to ask for the 2024 vs 2025 version.

---

## Required PDF templates (download these first)

Drop these into `/public/irs-forms/` before running. All are free downloads from IRS.

### 2024 forms (irs.gov/pub/irs-prior/)


| Source URL                                             | Save as            |
| ------------------------------------------------------ | ------------------ |
| `https://www.irs.gov/pub/irs-prior/f1040--2024.pdf`    | `1040_2024.pdf`    |
| `https://www.irs.gov/pub/irs-prior/f1040s1--2024.pdf`  | `1040s1_2024.pdf`  |
| `https://www.irs.gov/pub/irs-prior/f1040s2--2024.pdf`  | `1040s2_2024.pdf`  |
| `https://www.irs.gov/pub/irs-prior/f1040sc--2024.pdf`  | `1040sc_2024.pdf`  |
| `https://www.irs.gov/pub/irs-prior/f1040sse--2024.pdf` | `1040sse_2024.pdf` |
| `https://www.irs.gov/pub/irs-prior/f8959--2024.pdf`    | `8959_2024.pdf`    |


### 2025 forms (irs.gov/pub/irs-pdf/ — current year)


| Source URL                                    | Save as           |
| --------------------------------------------- | ----------------- |
| `https://www.irs.gov/pub/irs-pdf/f1040.pdf`   | `1040_2025.pdf`   |
| `https://www.irs.gov/pub/irs-pdf/f1040s1.pdf` | `1040s1_2025.pdf` |
| `https://www.irs.gov/pub/irs-pdf/f1040s2.pdf` | `1040s2_2025.pdf` |
| `https://www.irs.gov/pub/irs-pdf/f8959.pdf`   | `8959_2025.pdf`   |


### Existing files to rename (preserve year clarity)

```bash
cd public/irs-forms
git mv 1040sc.pdf 1040sc_2025.pdf
git mv 1040sc.fields.json 1040sc_2025.fields.json
git mv 1040sse.pdf 1040sse_2025.pdf
git mv 1040sse.fields.json 1040sse_2025.fields.json
```

---

## Tasks for Cursor — in order

### Task 1: Add year-aware form loading

**File:** `src/lib/irsForms/loadForms.ts`

Replace the current `SUPPORTED_FORMS` constant + `loadForm` function with a year-aware version:

```ts
export const SUPPORTED_FORMS = [
  // S-corporation family
  '1120s', '1125a', '1125e', '1120ssk', '2553',
  // Partnership family
  '1065', '1065sk1',
  // C-corporation family
  '1120',
  // Schedule C / individual filer family
  '1040', '1040s1', '1040s2', '1040sc', '1040sse', '8959',
] as const;
export type SupportedFormId = (typeof SUPPORTED_FORMS)[number];

export type TaxYear = 2024 | 2025;

const BASE_PATH = '/irs-forms';

/** Resolve a form ID + year to the actual filename. Tries year-specific
 *  first ({formId}_{year}.pdf), falls back to legacy {formId}.pdf. */
async function resolveFilename(formId: SupportedFormId, year: TaxYear, ext: 'pdf' | 'fields.json'): Promise<string> {
  const yearSpecific = `${formId}_${year}.${ext}`;
  const legacy = `${formId}.${ext}`;
  // Probe year-specific first
  const probe = await fetch(`${BASE_PATH}/${yearSpecific}`, { method: 'HEAD' });
  if (probe.ok) return yearSpecific;
  return legacy;
}

export async function loadFormDefinition(formId: SupportedFormId, year: TaxYear): Promise<FormDefinition> {
  const filename = await resolveFilename(formId, year, 'fields.json');
  const res = await fetch(`${BASE_PATH}/${filename}`);
  if (!res.ok) throw new Error(`Failed to load field definitions for ${formId} ${year}: ${res.status}`);
  return (await res.json()) as FormDefinition;
}

export async function loadFormPdfBytes(formId: SupportedFormId, year: TaxYear): Promise<Uint8Array> {
  const filename = await resolveFilename(formId, year, 'pdf');
  const res = await fetch(`${BASE_PATH}/${filename}`);
  if (!res.ok) throw new Error(`Failed to load PDF for ${formId} ${year}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadForm(formId: SupportedFormId, year: TaxYear) {
  const [definition, pdfBytes] = await Promise.all([
    loadFormDefinition(formId, year),
    loadFormPdfBytes(formId, year),
  ]);
  return { definition, pdfBytes };
}
```

### Task 2: Add `IndividualReturnInput` type

**New file:** `src/types/individualReturn.ts`

```ts
import type { EntityReturnInput, EntityReturnSummary } from './businessEntity';

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';

export interface IndividualReturnInput {
  // Identity
  taxpayerName: string;
  taxpayerSSN: string;            // "XXX-XX-XXXX" — pipeline will strip dashes for combs
  spouseName?: string;
  spouseSSN?: string;
  filingStatus: FilingStatus;
  homeAddress: string;
  homeCityStateZip: string;
  occupation?: string;
  dependents?: number;

  // Schedule C / SE filer's business — drives the federal forms
  scheduleC?: EntityReturnInput;
  scheduleCSummary?: EntityReturnSummary;

  // Other 1040 inputs (none for Pasta Pals; keep for future)
  w2Wages?: number;
  taxableInterest?: number;
  ordinaryDividends?: number;
  estimatedPaymentsMade?: number;

  // Tax year
  taxYear: 2024 | 2025;
}

/** Computed federal tax outcomes — produced by computeIndividualReturn(). */
export interface IndividualReturnSummary {
  /** Schedule C net profit — flows to Schedule 1 line 3 */
  scheduleCNetProfit: number;
  /** SE earnings = net × 92.35% */
  seEarnings: number;
  /** Schedule SE line 10 — Social Security portion */
  ssTax: number;
  /** Schedule SE line 11 — Medicare portion */
  medicareTax: number;
  /** Schedule SE line 12 — total SE tax */
  seTotalTax: number;
  /** Schedule SE line 13 — half-SE deduction (above the line) */
  halfSEDeduction: number;
  /** Form 8959 line 18 — additional Medicare tax */
  additionalMedicareTax: number;
  /** Form 1040 line 11 — AGI */
  agi: number;
  /** Form 1040 line 12 — standard deduction */
  standardDeduction: number;
  /** Form 1040 line 13 — QBI deduction */
  qbiDeduction: number;
  /** Form 1040 line 15 — taxable income */
  taxableIncome: number;
  /** Form 1040 line 16 — federal income tax from brackets */
  federalIncomeTax: number;
  /** Schedule 2 line 21 — total other taxes */
  schedule2Total: number;
  /** Form 1040 line 24 — total tax */
  totalTax: number;
  /** Form 1040 line 33 — total payments */
  totalPayments: number;
  /** Form 1040 line 37 — amount owed (or negative = refund) */
  amountOwed: number;
}
```

### Task 3: Add tax computation engine

**New file:** `src/lib/irsForms/individualReturnCompute.ts`

```ts
import type { IndividualReturnInput, IndividualReturnSummary } from '@/types/individualReturn';

const SS_WAGE_BASE = { 2024: 168_600, 2025: 176_100 } as const;
const STD_DEDUCTION = {
  2024: { single: 14_600, mfj: 29_200, mfs: 14_600, hoh: 21_900, qss: 29_200 },
  2025: { single: 15_000, mfj: 30_000, mfs: 15_000, hoh: 22_500, qss: 30_000 },
} as const;
const ADDL_MEDICARE_THRESHOLD = {
  single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000, qss: 200_000,
} as const;
const BRACKETS = {
  2024: {
    single: [[0,0.10],[11600,0.12],[47150,0.22],[100525,0.24],[191950,0.32],[243725,0.35],[609350,0.37]],
    // add other filing statuses as needed
  },
  2025: {
    single: [[0,0.10],[11925,0.12],[48475,0.22],[103350,0.24],[197300,0.32],[250525,0.35],[626350,0.37]],
  },
} as const;

function bracketTax(taxableIncome: number, brackets: readonly (readonly [number, number])[]): number {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [thr, rate] = brackets[i];
    const nextThr = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    if (taxableIncome > thr) {
      tax += (Math.min(taxableIncome, nextThr) - thr) * rate;
    }
  }
  return Math.round(tax);
}

export function computeIndividualReturn(input: IndividualReturnInput): IndividualReturnSummary {
  const { taxYear, filingStatus } = input;
  const ssBase = SS_WAGE_BASE[taxYear];
  const stdDed = STD_DEDUCTION[taxYear][filingStatus];
  const threshold = ADDL_MEDICARE_THRESHOLD[filingStatus];

  // Schedule C net (assume scheduleCSummary.ordinaryBusinessIncome is the net profit)
  const scNet = input.scheduleCSummary?.ordinaryBusinessIncome ?? 0;

  // Schedule SE
  const seEarn = Math.round(scNet * 0.9235);
  const ssTax = Math.round(Math.min(seEarn, ssBase) * 0.124);
  const medTax = Math.round(seEarn * 0.029);
  const seTotal = ssTax + medTax;
  const halfSE = Math.round(seTotal / 2);

  // Form 8959
  const addlMed = Math.round(Math.max(0, seEarn - threshold) * 0.009);

  // Form 1040 chain
  const otherIncome = (input.w2Wages ?? 0) + (input.taxableInterest ?? 0) + (input.ordinaryDividends ?? 0);
  const totalIncome = otherIncome + scNet;
  const adjustments = halfSE;  // Schedule 1 line 26 → 1040 line 10
  const agi = totalIncome - adjustments;
  const qbiDed = 0;  // Pasta Pals: above thresholds, no W-2 wages → $0
  const taxableIncome = Math.max(0, agi - stdDed - qbiDed);
  const fedTax = bracketTax(taxableIncome, BRACKETS[taxYear][filingStatus] ?? BRACKETS[taxYear].single);
  const sch2Total = seTotal + addlMed;
  const totalTax = fedTax + sch2Total;
  const totalPayments = input.estimatedPaymentsMade ?? 0;
  const amountOwed = totalTax - totalPayments;

  return {
    scheduleCNetProfit: scNet,
    seEarnings: seEarn, ssTax, medicareTax: medTax, seTotalTax: seTotal,
    halfSEDeduction: halfSE,
    additionalMedicareTax: addlMed,
    agi, standardDeduction: stdDed, qbiDeduction: qbiDed,
    taxableIncome, federalIncomeTax: fedTax,
    schedule2Total: sch2Total, totalTax, totalPayments, amountOwed,
  };
}
```

### Task 4: Add the missing form mappers

**File:** `src/lib/irsForms/entityReturnMapper.ts` — append to the bottom.

For each new mapper, the pattern is identical to the existing `values1120S`: take the input + computed summary, return a `FormFieldValues` map keyed by semantic name.

**The semantic names depend on the auto-generated `.fields.json` files.** Use Cursor's filesystem tools to inspect each PDF's field map after the fields-extractor script (Task 6) runs. Then add per-form value mappers like:

```ts
export function values1040(
  input: IndividualReturnInput,
  summary: IndividualReturnSummary,
): FormFieldValues {
  const ssn = input.taxpayerSSN.replace(/\D/g, '');  // strip dashes for combs
  return {
    // Header
    name_taxpayer: input.taxpayerName,
    ssn_taxpayer: ssn,
    // Filing status
    filing_status_single: input.filingStatus === 'single' ? '/Yes' : '/Off',
    filing_status_mfj:    input.filingStatus === 'mfj'    ? '/Yes' : '/Off',
    // ... etc
    home_address: input.homeAddress,
    city_state_zip: input.homeCityStateZip,
    occupation_taxpayer: input.occupation ?? '',

    // Income (Lines 1-9)
    line_1a_wages: fmt(input.w2Wages ?? 0),
    line_1z_total_wages: fmt(input.w2Wages ?? 0),
    line_2b_taxable_interest: fmt(input.taxableInterest ?? 0),
    line_3b_ordinary_dividends: fmt(input.ordinaryDividends ?? 0),
    line_8_additional_income: fmt(summary.scheduleCNetProfit),  // from Sch 1 line 10
    line_9_total_income: fmt(summary.scheduleCNetProfit + (input.w2Wages ?? 0)),

    // Adjustments and AGI (Lines 10-15)
    line_10_adjustments: fmt(summary.halfSEDeduction),
    line_11_agi: fmt(summary.agi),
    line_12_std_deduction: fmt(summary.standardDeduction),
    line_13_qbi: fmt(summary.qbiDeduction),
    line_14_total_deductions: fmt(summary.standardDeduction + summary.qbiDeduction),
    line_15_taxable_income: fmt(summary.taxableIncome),

    // Tax (Lines 16-24)
    line_16_tax: fmt(summary.federalIncomeTax),
    line_18_add_16_17: fmt(summary.federalIncomeTax),
    line_21_subtract: fmt(summary.federalIncomeTax),
    line_22_subtract: fmt(summary.federalIncomeTax),
    line_23_other_taxes: fmt(summary.schedule2Total),
    line_24_total_tax: fmt(summary.totalTax),

    // Payments and balance (Lines 25-37)
    line_33_total_payments: fmt(summary.totalPayments),
    line_37_amount_owed: fmt(summary.amountOwed),
  };
}

export function values1040S1(
  input: IndividualReturnInput,
  summary: IndividualReturnSummary,
): FormFieldValues {
  return {
    line_3_business_income: fmt(summary.scheduleCNetProfit),
    line_10_combine: fmt(summary.scheduleCNetProfit),
    line_15_se_tax_deduction: fmt(summary.halfSEDeduction),
    line_26_total_adjustments: fmt(summary.halfSEDeduction),
  };
}

export function values1040S2(
  input: IndividualReturnInput,
  summary: IndividualReturnSummary,
): FormFieldValues {
  return {
    line_4_se_tax: fmt(summary.seTotalTax),
    line_11_addl_medicare: fmt(summary.additionalMedicareTax),
    line_21_total_other_taxes: fmt(summary.schedule2Total),
  };
}

export function values8959(
  input: IndividualReturnInput,
  summary: IndividualReturnSummary,
): FormFieldValues {
  const threshold = input.filingStatus === 'mfj' ? 250_000
    : input.filingStatus === 'mfs' ? 125_000 : 200_000;
  return {
    line_8_se_income: fmt(summary.seEarnings),
    line_9_threshold: fmt(threshold),
    line_11_subtract: fmt(threshold),
    line_12_excess_se: fmt(Math.max(0, summary.seEarnings - threshold)),
    line_13_addl_medicare_se: fmt(summary.additionalMedicareTax),
    line_18_total: fmt(summary.additionalMedicareTax),
  };
}
```

Also extend `values1040SC` and `values1040SSE` to fully populate the lines that the existing v1.5 stubs leave blank — the field-map files (after extraction) will tell you which semantic keys exist.

### Task 5: Update `planFormSet` for `schedule_c`

**File:** `src/lib/irsForms/index.ts`

Replace the `schedule_c` branch:

```ts
} else if (entityType === 'schedule_c') {
  // ─── Individual return with Schedule C — IRS filing order ───
  // Order matches the assembly order on irs.gov/pub/irs-pdf/i1040gi.pdf
  set.push({ id: '1040',    values: values1040(individualInput, indSummary) });
  set.push({ id: '1040s1',  values: values1040S1(individualInput, indSummary) });
  set.push({ id: '1040s2',  values: values1040S2(individualInput, indSummary) });
  set.push({ id: '1040sc',  values: values1040SC(input, summary) });
  set.push({ id: '1040sse', values: values1040SSE(input, summary) });
  set.push({ id: '8959',    values: values8959(individualInput, indSummary) });
}
```

Note this requires `planFormSet` to also accept the `IndividualReturnInput` (or a wrapper that carries both entity + individual data). Refactor signature:

```ts
export interface PacketInput {
  individualInput?: IndividualReturnInput;  // required for schedule_c
  entityInput: EntityReturnInput;
  summary: EntityReturnSummary;
  taxYear: 2024 | 2025;
}

export async function generateIrsPdfPacket(p: PacketInput): Promise<Uint8Array> {
  const indSummary = p.individualInput ? computeIndividualReturn(p.individualInput) : undefined;
  const forms = planFormSet(p.entityInput, p.summary, p.individualInput, indSummary);
  const filled: Uint8Array[] = [];
  for (const { id, values } of forms) {
    const { definition, pdfBytes } = await loadForm(id, p.taxYear);
    filled.push(await fillAndFlattenForm(pdfBytes, definition, values));
  }
  return mergePdfs(filled);
}
```

### Task 6: Auto-extract field maps from new PDFs

**New file:** `scripts/extract_form_fields.py`

A one-shot script that scans `public/irs-forms/` for any `.pdf` without a sibling `.fields.json` and generates the JSON automatically. The taxgenerator already has 1120s.fields.json etc. as references — the format is documented in `src/lib/irsForms/types.ts`.

```python
"""Extract AcroForm metadata from a fillable PDF → produce {form}.fields.json
matching the format the taxgenerator's loadForms.ts expects.
Reads {form}.pdf, writes {form}.fields.json next to it.
"""
import json, sys, re
from pathlib import Path
from pypdf import PdfReader

FORMS_DIR = Path(__file__).parent.parent / 'public' / 'irs-forms'

def short_id(full_name: str) -> str:
    """Convert AcroForm path to a short snake_case ID."""
    # topmostSubform[0].Page1[0].f1_4[0] -> f1_4_0
    leaf = full_name.split('.')[-1]
    return re.sub(r'\W+', '_', leaf).strip('_')

def detect_year_form(pdf_path: Path):
    """Parse year+form from filename like 1040_2024.pdf or 1040sc_2025.pdf."""
    stem = pdf_path.stem
    m = re.match(r'^(.+?)_(\d{4})$', stem)
    if m:
        return m.group(1), int(m.group(2))
    # legacy un-suffixed → assume 2025
    return stem, 2025

def extract(pdf_path: Path):
    reader = PdfReader(str(pdf_path))
    fields = reader.get_fields() or {}
    form_name, year = detect_year_form(pdf_path)
    out = {
        'form': form_name,
        'year': year,
        'pdfFilename': pdf_path.name,
        'fields': {},
    }
    for full_name, field in fields.items():
        ft = str(field.get('/FT', ''))
        # Find rect by walking the widget annotation
        rect = None
        for page_idx, page in enumerate(reader.pages):
            if '/Annots' not in page:
                continue
            for annot_ref in page['/Annots']:
                annot = annot_ref.get_object()
                if annot.get('/T') and annot['/T'] in full_name:
                    if '/Rect' in annot:
                        rect = [float(x) for x in annot['/Rect']]
                        page_num = page_idx + 1
                        break
            if rect:
                break
        ftype = 'text' if ft == '/Tx' else 'checkbox' if ft == '/Btn' else 'text'
        sid = short_id(full_name)
        out['fields'][sid] = {
            'id': full_name,
            'page': page_num if rect else 1,
            'rect': rect or [0, 0, 0, 0],
            'type': ftype,
            'description': f'Auto-extracted ({sid})',
        }
    return out

def main():
    for pdf in sorted(FORMS_DIR.glob('*.pdf')):
        json_path = pdf.with_suffix('.fields.json')
        if json_path.exists():
            print(f'  skip (exists): {json_path.name}')
            continue
        data = extract(pdf)
        json_path.write_text(json.dumps(data, indent=2))
        print(f'  wrote: {json_path.name}  ({len(data["fields"])} fields)')

if __name__ == '__main__':
    main()
```

Run: `python3 scripts/extract_form_fields.py`

After this runs, every PDF in `/public/irs-forms/` has a sibling `.fields.json` with the **AcroForm field paths and rect coordinates** the pdfFiller needs. Semantic names default to the auto-generated form (e.g., `f1_10_0`); refining the semantic names is Task 7.

### Task 7: Refine the auto-extracted semantic names

The auto-generated `.fields.json` files use raw field IDs (`f1_10_0`) as keys. This works for the pdfFiller (it just needs `id` + `rect`), but for the mappers in `entityReturnMapper.ts` to be readable, you want semantic keys like `line_8_additional_income`.

For each new form (`1040`, `1040s1`, `1040s2`, `8959`, plus the 2024 versions of `1040sc` and `1040sse`):

1. Open the IRS PDF source side-by-side with the auto-generated `.fields.json`.
2. Match each field to its line label using the rect coordinates (Y descending = top-to-bottom).
3. Rename the JSON key from `f1_10_0` to a semantic name like `line_8_additional_income_from_sch1`.

The taxgenerator already has good examples — see `1040sc.fields.json` for the naming convention (`line_28_total_expenses_before_expenses_for`).

The 1040sc / 1040sse 2024 versions are nearly identical to 2025 — you can copy the existing `1040sc.fields.json` semantic names to `1040sc_2024.fields.json` after the auto-extraction.

### Task 8: Update `SUPPORTED_FORMS` constants and run end-to-end

**File:** `src/lib/irsForms/loadForms.ts`

Add `'1040'`, `'1040s1'`, `'1040s2'`, `'8959'` to `SUPPORTED_FORMS`.

Then write a smoke-test entry point:

**New file:** `scripts/test_pasta_pals.ts`

```ts
import { generateIrsPdfPacket } from '@/lib/irsForms';
import * as fs from 'fs';

// Pasta Pals 2024 fixture
const indInput: IndividualReturnInput = {
  taxpayerName: 'Jenelle Alexandra Elpedes',
  taxpayerSSN: '594-63-6983',
  filingStatus: 'single',
  homeAddress: '2141 W Madison Street',
  homeCityStateZip: 'Phoenix, AZ 85009-5212',
  occupation: 'Self-employed designer/consultant',
  taxYear: 2024,
  scheduleC: {/* … see Pasta Pals 2024 inputs in the project notes … */},
  scheduleCSummary: {/* … */},
};

const bytes = await generateIrsPdfPacket({
  individualInput: indInput,
  entityInput: indInput.scheduleC!,
  summary: indInput.scheduleCSummary!,
  taxYear: 2024,
});

fs.writeFileSync('Pasta_Pals_2024_RETURN.pdf', bytes);
console.log(`Wrote ${bytes.length} bytes`);
```

Run with `npx tsx scripts/test_pasta_pals.ts` (or via the dev server's UI flow). Output should be a single PDF with 6 forms, all properly filled, all 2024-labeled.

---

## Pasta Pals fixture data (so you can test with the right numbers)

For 2024:

```ts
const scheduleC: EntityReturnInput = {
  entityType: 'schedule_c',
  entityName: 'Pasta Pals Designs',
  ein: '41-3677262',
  stateOfFormation: 'AZ',
  taxYear: 2024,
  isInitialReturn: false,
  isFinalReturn: false,
  accountingMethod: 'cash',
  owners: [{ id: '1', name: 'Jenelle Alexandra Elpedes', ownershipPct: 100 }],
  grossReceipts: 1_500_000,
  returnsAndAllowances: 0,
  costOfGoodsSold: 0,
  otherIncome: [],
  compensation: 0,
  salariesAndWages: 0,
  repairs: 0,
  badDebts: 0,
  rents: 24_000,           // Sch C line 20b
  taxesAndLicenses: 0,
  interest: 0,
  depreciation: 30_000,
  depletion: 0,
  advertising: 120_000,
  pensionAndProfitSharing: 0,
  benefitPrograms: 0,
  otherDeductions: [
    { category: 'Contract labor', description: 'Sch C line 11', amount: 250_000 },
    { category: 'Insurance',      description: 'Sch C line 15', amount: 15_000 },
    { category: 'Legal & prof',   description: 'Sch C line 17', amount: 40_000 },
    { category: 'Supplies',       description: 'Sch C line 22', amount: 5_000 },
    { category: 'Travel',         description: 'Sch C line 24a', amount: 18_000 },
    { category: 'Meals 50%',      description: 'Sch C line 24b', amount: 6_000 },
    { category: 'Utilities',      description: 'Sch C line 25', amount: 6_000 },
    { category: 'Software',       description: 'Sch C Part V',  amount: 45_000 },
    { category: 'Education',      description: 'Sch C Part V',  amount: 10_000 },
    { category: 'Mailbox AZ',     description: 'Sch C Part V',  amount: 228 },
    { category: 'Mailbox IL',     description: 'Sch C Part V',  amount: 228 },
    { category: 'Domain',         description: 'Sch C Part V',  amount: 12 },
    { category: 'Misc',           description: 'Sch C Part V',  amount: 25_000 },
  ],
  assets: [],
  preparerNotes: '',
};
```

For 2025:


| Line               | 2024      | 2025      |
| ------------------ | --------- | --------- |
| Gross receipts     | 1,500,000 | 1,580,000 |
| L8 Advertising     | 120,000   | 160,000   |
| L11 Contract labor | 250,000   | 320,000   |
| L13 Depreciation   | 30,000    | 25,000    |
| L15 Insurance      | 15,000    | 20,000    |
| L17 Legal & prof   | 40,000    | 50,000    |
| L20b Rent          | 24,000    | 30,000    |
| L22 Supplies       | 5,000     | 7,000     |
| L24a Travel        | 18,000    | 22,000    |
| L24b Meals 50%     | 6,000     | 6,500     |
| L25 Utilities      | 6,000     | 8,000     |
| Part V Software    | 45,000    | 55,000    |
| Part V Education   | 10,000    | 10,000    |
| Part V Mailbox AZ  | 228       | 228       |
| Part V Mailbox IL  | 228       | 228       |
| Part V Domain      | 12        | 12        |
| Part V Misc        | 25,000    | 5,000     |


Expected outputs (verify after running):


|                                 | 2024    | 2025    |
| ------------------------------- | ------- | ------- |
| Net profit (Sch C L31)          | 905,532 | 861,032 |
| SE tax (Sch SE L12)             | 45,158  | 44,896  |
| Half-SE deduction               | 22,579  | 22,448  |
| Additional Medicare (Form 8959) | 5,726   | 5,356   |
| AGI (1040 L11)                  | 882,953 | 838,584 |
| Federal income tax (1040 L16)   | 279,478 | 261,746 |
| Total federal tax (1040 L24)    | 330,362 | 311,998 |
| Amount owed (1040 L37)          | 330,362 | 311,998 |


---

## Verification checklist before declaring done

- All 12 PDFs (10 new + 2 renamed) are present in `public/irs-forms/`
- `npm run build` passes without TS errors
- `python3 scripts/extract_form_fields.py` produces 12 `.fields.json` files
- Test runner produces a single `Pasta_Pals_2024_RETURN.pdf` containing 6 forms in IRS order, each labeled "2024"
- Same for 2025 — labeled "2025"
- Open both PDFs in Adobe Acrobat AND Preview — values render correctly in both (the pdfFiller's `drawString` approach is viewer-agnostic, but verify)
- Numbers match the expected-output table above to the dollar
- Form 1040 page 2 has the signature block visible and printable
- No "2025" label on any 2024 form, no "2024" on any 2025 form
- Box B (business code) and Box D (EIN) on Schedule C show one digit per cell
- SSN at the top of every form shows one digit per cell

---

## Notes for the Cursor agent

- The pdfFiller's draw-on-page approach (not setting AcroForm `/V`) is **deliberate** — see the comment block at the top of `pdfFiller.ts`. Do not "improve" it by setting form values. The proven path is rect-coordinate text drawing.
- When refining semantic field names in step 7, prioritize the lines the mappers actually write to. Unused fields can keep their auto-generated names.
- If a year-specific PDF has slightly different field positions (e.g., 2024 vs 2025 1040 might shift fields by a few points), the extraction script captures that in the rect coordinates per-year — no manual adjustment needed.
- `EntityReturnInput` can stay unchanged; `IndividualReturnInput` is the new type for 1040 filers. They coexist.
- The `schedule_c` branch is the only one that needs the individual return; entity returns (1120-S, 1065, 1120) keep their existing flow.
- `planFormSet`'s output order = IRS filing order = printed packet order. Do not reorder.

End of handoff.