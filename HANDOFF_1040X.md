# Handoff: Add Form 1040-X (Amended Return) to the taxgenerator pipeline

**Owner of this task:** next agent / Claude Code
**Status:** not started
**Context doc:** read `CLAUDE.md` first — this task must respect every invariant there.

---

## 1. Objective

Add reusable **Form 1040-X** generation to the Python pipeline so we can produce an
amended federal return from two computed scenarios (original + amended) for any client/year.
First real use: Jacques Potts 2024 (test data in §7).

Today the pipeline only emits the 1040 packet (`forms.generate_packet`). The amendment
logic exists *only* as a TypeScript data model in `src/lib/amendmentEngine.ts`
(`LineComparison { originalValue, amendedValue, difference }`, `AmendmentReturn`,
deadline + eligibility rules). There is **no 1040-X PDF template and no Python filler**.

---

## 2. Deliverables

1. `public/irs-forms/1040x_2024.pdf` — official IRS template (Rev. for TY2024).
2. `public/irs-forms/1040x_2024.fields.json` — extracted widget rects (regenerated, not hand-authored).
3. `scripts/fill_1040x_2024.py` — dedicated, rect-driven filler (mirror the structure of `scripts/fill_1040_2025.py`).
4. A computation shim that turns **two** computed returns (original, amended) into the
   1040-X three-column model (A = original, C = corrected, B = C − A).
5. CLI wiring: `python3 -m taxgenerator --amend --client <amended.json> --original <original.json> --year 2024`.
6. Output: `dist/{client_id}_{year}_1040X.pdf` — just the 1040-X plus the corrected schedules
   that changed (Sch C, Sch SE, Sch 1, Sch 2, 8995). Do **not** re-emit unchanged forms.

---

## 3. Architecture you must follow (from CLAUDE.md)

- **Rect-driven positioning only.** Every value is drawn from the AcroForm widget rect using
  the cap-height baseline math already in `fill_1040_2025.py`:
  `baseline = rect[1] + (rect[3] - rect[1] - font_size*0.72) / 2`. No hardcoded Y offsets.
- **Per-form, per-year field registry.** Build a `FIELD_MAP_1040X_2024` dict exactly like
  `FIELD_MAP_2025` (`scripts/fill_1040_2025.py:153`). Each entry is `'pN.leaf'` or
  `{page, leaf, x, y}` for disambiguation. Resolve via the existing `find_widget_by_key` pattern.
- **Right-align numbers** using real `stringWidth()` Helvetica metrics (already imported in
  `fill_1040_2025.py`), not font-size heuristics.
- **SSN comb** is a manual overlay (`comb_draws`, layout `'ssn'`), never AcroForm field-fill.
- **Never draw over pre-printed template text.** 1040-X has three pre-printed money columns
  (A/B/C) — confirm rects per column before drawing.
- **Do not touch 2024 frozen logic.** This adds a new form; it must not alter
  `dist/Pasta_Pals_2024_RETURN.pdf` (md5 `69d6775e0a40d2f9c8ed1cb387d7c7a1`).

---

## 4. Build steps

1. **Drop in the template.** Download the official IRS Form 1040-X (the revision valid for
   tax year 2024) to `public/irs-forms/1040x_2024.pdf`.
2. **Extract rects.** Run `python3 scripts/regenerate_fields_correct.py` (or point it at the
   new file) to produce `public/irs-forms/1040x_2024.fields.json` from the PDF `/Annots`.
3. **Map lines → leaves.** Per CLAUDE.md's "add a new year" method: run `pdfplumber` to pull
   line labels by Y position and cross-reference against the rect data. **Do not trust
   memorized line numbers — read them off the actual PDF.** The 1040-X has three money
   columns per line, so each mapped line needs three leaves (colA / colB / colC).
4. **Write `fill_1040x_2024.py`.** Copy the scaffolding from `fill_1040_2025.py`
   (`_extract_widgets`, `find_widget`, `find_widget_by_key`, `baseline_for`, `comb_draws`,
   right-align helper) and define `FIELD_MAP_1040X_2024`. Fill identity block, filing-year,
   the A/B/C numeric grid, and the Part III explanation text box.
5. **Computation shim.** Add `compute_amendment(original_cfg, amended_cfg, year)` to
   `taxgenerator/compute.py` (or a new `amend.py`) that calls the existing
   `compute_individual_return` twice and emits the column model below (§6). Mirror the field
   names in `amendmentEngine.ts` so the TS and Python paths agree.
6. **Wire `forms.py` + CLI.** Add an amendment branch to `generate_packet` (or a sibling
   `generate_amendment_packet`) and the `--amend/--original` flags in `__main__.py`.
7. **Verify** (see §8).

---

## 5. 1040-X line → pipeline-value mapping

Map each 1040-X money line to the corresponding key already produced by
`compute_individual_return` (keys live in the returned dict — see `compute.py`).
Column A = original return's value, Column C = amended return's value, Column B = C − A.

| 1040-X concept            | pipeline key (from `compute_individual_return`) |
|---------------------------|--------------------------------------------------|
| Adjusted gross income     | `L11a_agi`                                       |
| Deduction (std/itemized)  | `L12_std_ded`                                    |
| Qualified business income | `L13a_qbi`                                        |
| Taxable income            | `L15_taxable`                                     |
| Tax                       | `L16_fed_tax`                                     |
| Other taxes (incl. SE)    | `L23_other_taxes` (`se_total` + addl Medicare)   |
| Total tax                 | `L24_total_tax`                                   |
| Federal withholding/pmts  | `L33_total_payments`                             |
| Amount you owe            | `L37_amount_owed`                                |

> Confirm the **exact** 1040-X line numbers/leaves from the extracted PDF in step 4.3 —
> the IRS renumbers between revisions, so bind to leaves, not to numbers in this table.

**Part III (Explanation of changes)** — auto-generate from the non-zero column-B lines, e.g.:
"Schedule C reconstructed from complete books and records: business mileage (standard rate),
contract labor, advertising, professional services, travel, supplies, and other ordinary
and necessary business expenses not captured on the originally-filed return. Net profit and
self-employment tax adjusted accordingly; QBI recomputed." Keep it factual and line-referenced.

---

## 6. Three-column model (shape to emit)

```python
{
  "taxYear": 2024,
  "lines": [
    {"line": "1",  "label": "Adjusted gross income", "a": 42081, "c": 2666, "b": -39415},
    {"line": "2",  "label": "Deduction",             "a": 14600, "c": 14600, "b": 0},
    # ...
    {"line": "11", "label": "Total tax",             "a": 8803,  "c": 406,  "b": -8397},
  ],
  "amount_owed_corrected": 406,     # if original balance was unpaid
  "refund_due": 0,                  # set instead if original balance was paid
  "explanation": "<Part III text>"
}
```

---

## 7. Test case — Jacques Potts 2024 (use to validate the form)

- Original config: reconstruct from the as-filed return (net profit $45,280, total tax **$8,803**).
- Amended config: `clients/jacques_potts.json` (already in repo; net profit $2,869, total tax **$406**).
- **Original balance was UNPAID**, so the 1040-X bottom line is **amount you owe = $406**
  (no refund; payments columns are $0).

Expected A / C / B:

| Line | Concept        |    A (orig) |   C (corrected) |        B (change) |
|------|----------------|------------:|----------------:|-----------------:|
| 1    | AGI            |    42,081   |          2,666  |        −39,415   |
| 2    | Deduction      |    14,600   |         14,600  |              0   |
| 4b   | QBI            |     5,496   |              0  |         −5,496   |
| 5    | Taxable income |    21,985   |              0  |        −21,985   |
| 6    | Tax            |     2,405   |              0  |         −2,405   |
| 10   | Other taxes/SE |     6,398   |            406  |         −5,992   |
| 11   | Total tax      |     8,803   |            406  |         −8,397   |
| 20   | Amount you owe |     8,803   |            406  |         −8,397   |

A correct fill shows **$406** as the corrected amount owed and a Part III explanation.

---

## 8. Verification workflow

```bash
# 1. Generate
python3 -m taxgenerator --amend --client clients/jacques_potts.json \
        --original clients/jacques_potts_original.json --year 2024

# 2. Confirm 2024 frozen baseline is untouched
md5sum dist/Pasta_Pals_2024_RETURN.pdf      # expect 69d6775e0a40d2f9c8ed1cb387d7c7a1

# 3. Render the 1040-X at high res and eyeball column alignment
pdftoppm -r 200 -png dist/jacques_potts_2024_1040X.pdf /tmp/x
#   - A/B/C columns land inside their pre-printed money boxes
#   - SSN comb aligns (3-2-4)
#   - amount-owed = 406; Part III text fits its box; no overflow warnings
```

Each drawn value must fit inside its widget rect (watch the CLI overflow warnings, same as
the 1040 fillers).

---

## 9. Out of scope / notes

- **State amendment (IL-1040-X):** separate task. For Jacques, IL nets to $0 (federal AGI
  $2,666 − $2,775 exemption ≤ 0), so it may just need a zeroed corrected IL with explanation.
- E-file: 1040-X for 2024 can usually be e-filed for the 2 most recent years, otherwise
  paper-file. `amendmentEngine.ts` already encodes that rule — reuse it.
- Don't reintroduce hardcoded Y offsets or share field-leaf assumptions across forms/years.
