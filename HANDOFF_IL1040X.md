# Handoff: Add Form IL-1040-X (Illinois Amended Return) to the pipeline

**Owner:** next agent / Claude Code
**Status:** not started
**Read first:** `CLAUDE.md`, and `HANDOFF_1040X.md` + the federal amendment code it produced
(`scripts/fill_1040x_2024.py`, `compute_amendment`/`_resolve_as_filed` in `compute.py`,
`generate_amendment_packet` in `forms.py`, `--amend` in `__main__.py`). Mirror that work.

---

## 1. Objective

Add reusable **Form IL-1040-X** (Illinois Amended Individual Income Tax Return) generation,
parallel to the federal 1040-X just built. First use: Jacques Potts 2024 (test data §6).

State has been out of scope until now (CLAUDE.md). The federal amendment path exists and
works; this extends it to Illinois. Illinois starts from **federal AGI**, so the IL amendment
depends on the federal computation we already produce.

---

## 2. Deliverables

1. `public/irs-forms/il1040x_2024.pdf` — official IL Dept. of Revenue Form IL-1040-X for TY2024
   (year-specific; get the 2024 revision).
2. `public/irs-forms/il1040x_2024.fields.json` — regenerated via `regenerate_fields_correct.py`.
3. `scripts/fill_il1040x_2024.py` — rect-driven filler, same scaffolding as `fill_1040x_2024.py`.
4. `compute_il_amendment(original_cfg, amended_cfg, year)` in `compute.py` (or a new `state_il.py`).
5. CLI: extend the amend flow with a state flag, e.g.
   `python3 -m taxgenerator --amend --state IL --client <amended.json> --original <orig.json> --year 2024`.
6. Output: `dist/{client_id}_{year}_IL1040X.pdf`.

---

## 3. Illinois computation (get this exact)

IL-1040 / IL-1040-X is a **flat tax that flows from federal AGI**. For a sole-proprietor
filer with no IL add-backs/subtractions, the chain is:

```
Line 1  Federal AGI                      = federal 1040 Line 11 (use the AMENDED federal AGI)
Line 4  Total income                     = Line 1 (+ Sch M additions, usually 0)
Line 9  Illinois base income             = Line 4 − Sch M subtractions (usually 0)
Line 10 Exemption allowance              = $2,775 per person (2024)*  *income-limited; see note
Line 11 Net income                       = max(0, Line 9 − Line 10)
Line 12 Tax                              = round(Line 11 × 0.0495)     # IL flat 4.95%
Line 14 Income tax                       = Line 12 (+ recapture, usually 0)
Line 23 Total tax
Payments (withholding/estimates/PTE/credits) → balance due or refund
```

- **Rate:** 4.95% (0.0495) for 2024. **Exemption:** $2,775/person for 2024.
- **Exemption income limitation:** the personal exemption is disallowed above a high AGI
  threshold (well above this client). Implement the threshold but it won't bind for Jacques.
- **EITC / other credits:** Illinois EITC = a percentage of federal EITC. Only relevant if the
  federal return claims EITC — it does not here, so leave at 0 unless a config provides it.
- **as-filed column / original figures:** like the federal `_resolve_as_filed`, source the
  "originally filed" IL figures from the original config (or an optional `il_as_filed` block)
  so the amended form reflects what was actually filed, not just a recompute.

> IL-1040-X reconciles **corrected tax** against **what was already paid/refunded** on the
> original IL return, then shows the additional balance due or additional refund. Read the
> actual form to bind these payment-reconciliation lines — **don't trust memorized line
> numbers; pull labels via pdfplumber and bind to widget leaves**, exactly as the federal
> filler does.

---

## 4. Build steps (mirror the federal 1040-X)

1. Drop `il1040x_2024.pdf` into `public/irs-forms/`.
2. `python3 scripts/regenerate_fields_correct.py` → `il1040x_2024.fields.json`.
3. `pdfplumber` to map IL line labels → widget rects; build `FIELD_MAP_IL1040X_2024`.
4. Write `scripts/fill_il1040x_2024.py` reusing `baseline_for`, `comb_draws`, right-align,
   `find_widget_by_key` from the federal filler. Fill identity, corrected figures, the
   payment reconciliation, and the explanation/Step for the reason amended.
5. `compute_il_amendment` — call the existing federal `compute_individual_return` for the
   amended config to get amended federal AGI, apply §3, and emit original vs corrected IL.
6. Wire `--state IL` into `__main__.py` / `forms.py`.
7. Verify (§7).

---

## 5. Invariants

- Rect-driven positioning only; per-form field registry; manual comb for the SSN.
- **Do not touch the federal or frozen logic.** This is additive. Re-confirm
  `dist/Pasta_Pals_2024_RETURN.pdf` md5 = `69d6775e0a40d2f9c8ed1cb387d7c7a1` after.
- IL is its own template/registry — no shared leaf assumptions with the federal forms.
- Don't draw over IL's pre-printed text or the 4.95% / exemption labels.

---

## 6. Test case — Jacques Potts 2024

Federal amended AGI = **$2,666** (from `clients/jacques_potts.json` via the federal path).
Original IL return figures (from the as-filed IL-1040, for column/original values):

| IL line | Concept            | Original (as filed) | Corrected (amended) |
|---------|--------------------|--------------------:|--------------------:|
| 1       | Federal AGI        |             42,081  |               2,666 |
| 9       | IL base income     |             42,081  |               2,666 |
| 10      | Exemption          |              2,775  |               2,775 |
| 11      | Net income         |             39,306  |  **0** (2,666−2,775 floored) |
| 12/14   | Tax (4.95%)        |              1,946  |               **0** |
| 23      | Total tax          |              1,946  |               **0** |

Original IL balance was **unpaid**, so the IL-1040-X shows the **$1,946 liability reduced to
$0** (no refund; additional balance due = $0). A correct fill shows corrected total tax $0
and an explanation referencing the federal Schedule C amendment that lowered AGI.

---

## 7. Verification

```bash
python3 -m taxgenerator --amend --state IL --client clients/jacques_potts.json \
        --original clients/jacques_potts_original.json --year 2024
md5sum dist/Pasta_Pals_2024_RETURN.pdf      # expect 69d6775e0a40d2f9c8ed1cb387d7c7a1 (untouched)
pdftoppm -r 200 -png dist/jacques_potts_2024_IL1040X.pdf /tmp/il
#   - Federal AGI 2,666 flows to Line 1; net income 0; tax 0; total tax 0
#   - SSN comb aligned; no overflow warnings; explanation fits its box
```

---

## 8. Notes / out of scope

- Other states: this is IL-specific. A general state engine is a later, larger task.
- If the client paid part of the original IL balance, the reconciliation should produce a
  refund of the overpayment — handle via the payment lines, same pattern as federal.
- Possible follow-on (not this task): the amended federal income is now low enough that
  **federal + IL EITC eligibility** may exist — flag for human review, do not auto-claim.
