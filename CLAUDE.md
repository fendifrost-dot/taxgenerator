# CLAUDE.md — taxgenerator

Context for Claude Code (or any agent) working on this repo.

## What this repo is

A federal tax return generator. Two parallel paths:

1. **TypeScript / React app** (`src/`, `package.json`) — the original Lovable-generated UI. Vite + Vite + shadcn + Tailwind. Modules under `src/lib/` (engines for 1040, business entities, amendments, optimizer, etc.). Currently NOT used as the production filing path because the AcroForm rect data drifted between 2024/2025 templates and the mappers couldn't keep up.

2. **Python pipeline** (`taxgenerator/`, `scripts/`, `clients/`) — the production filing path. Config-driven CLI that takes a client JSON config + tax year and produces a mail-ready federal packet PDF. Built May 2026 to ship Pasta Pals' 2024 + 2025 returns. Treats each year's IRS template as its own field registry (no shared assumptions across years).

## Production state (as of May 6, 2026)

- ✅ Pasta Pals LLC 2024 federal return — frozen at md5 `69d6775e0a40d2f9c8ed1cb387d7c7a1`. **DO NOT REGENERATE OR TOUCH 2024 LOGIC** without explicit user permission.
- ✅ Pasta Pals LLC 2025 federal return — produced via `taxgenerator/` package + `scripts/fill_1040_2025.py`. Visually verified all 11 pages.
- ✅ CLI: `python3 -m taxgenerator --client clients/{id}.json --year {2024|2025}`
- ✅ Tax tables for all 5 filing statuses (single, mfj, mfs, hoh, qss) for 2024 and 2025
- ✅ Computation pipeline: Schedule C → Schedule SE → Form 8959 → Form 1040 with proper bracket math

The frozen 2024 baseline is also saved at `/Users/gocrazyglobal/Library/Application Support/Claude/local-agent-mode-sessions/.../outputs/_FROZEN_2024.pdf`. Diff against this if you ever rebuild 2024.

## Repo layout

```
taxgenerator/
├── README.md                   ← package-level usage docs
├── __main__.py                 ← CLI entry point (python3 -m taxgenerator)
├── config.py                   ← JSON schema validation + load_client()
├── tax_tables.py               ← brackets, std deds, SS base, Medicare thresholds
├── compute.py                  ← Sch C / SE / 8959 / 1040 calculations + 1040-X
├── state_il.py                 ← Illinois IL-1040 / IL-1040-X computation (flows from federal AGI)
└── forms.py                    ← wraps scripts/fill_*.py for parameterized fills

clients/
└── pasta_pals.json             ← reference client config (use as template for new clients)

scripts/
├── fill_pasta_pals_python.py   ← year-aware form fillers (LINE_MAPS dict per year)
├── fill_1040_2025.py           ← dedicated 2025 Form 1040 (page 1 + 2) — built from
│                                  scratch because 2025 layout is materially different from 2024
├── debug_2025_1040.py          ← debug overlay tool (draws rect outlines + leaf names)
├── regenerate_fields_correct.py← regenerates .fields.json files from PDF /Annots widgets
└── _versions/                  ← backup snapshots of fill_pasta_pals_python.py

public/irs-forms/
├── 1040_{2024,2025}.pdf        ← official IRS templates
├── 1040_{2024,2025}.fields.json← extracted widget rects (regenerable)
├── 1040s1_*, 1040s2_*, 1040sc_*, 1040sse_*, 8959_*  (same pattern)

src/                            ← TypeScript/React app (not currently used for filing)
```

## Critical invariants

1. **2024 IS FROZEN.** The Pasta Pals 2024 return shipped to the client. Any code change that affects 2024 output must be flagged loudly. Diff md5 before declaring 2024 work done. The CLI defaults to 2025-only generation; pass `--include-2024` only if you mean it.

2. **2025 is its own template, not a 2024 variant.** The IRS shifted the Form 1040 page-1 layout in 2025 (Line 11a moved, header rows shifted, SSN comb dash positions changed). Field leaf names (`f1_NN_0`) point to *different* visual positions in 2024 vs 2025. Always look up the actual rect from the year-specific `.fields.json` or directly from PDF `/Annots`. Never reuse a 2024 leaf-name assumption for 2025.

3. **Field positioning is rect-driven, not Y-offset-guessed.** Every value is drawn at a position computed from the AcroForm widget rect using cap-height-aware baseline math:
   ```python
   baseline = rect[1] + (rect[3] - rect[1] - font_size * 0.72) / 2
   ```
   Right-alignment uses real `stringWidth()` Helvetica metrics, not 0.5×font_size heuristics.

4. **Pre-printed form values are not redrawn.** Schedule SE Line 7 has the SS wage base ($168,600 / $176,100) pre-printed in the IRS template. The fill code MUST NOT draw over it.

5. **Comb fields use form-specific layouts.** The 2025 Form 1040 SSN box uses 3-2-4 grouping with dashes at rect-fractions ~0.302 and ~0.588. See `comb_draws()` in `scripts/fill_1040_2025.py` for the exact `center_fracs` array.

## How to add a new client

1. Copy `clients/pasta_pals.json` to `clients/{new_id}.json`.
2. Edit identity (`filer`, `address`, `spouse` if applicable), `schedule_c` block, and per-year financials in `years.{2024|2025}.schedule_c`.
3. Run `python3 -m taxgenerator --client clients/{new_id}.json --year 2025`.
4. Open the resulting PDF in `dist/` and visually verify line positions.

## How to add a new tax year (e.g. 2026)

1. Drop the year's IRS PDF templates into `public/irs-forms/{form}_{year}.pdf`.
2. Run `python3 scripts/regenerate_fields_correct.py` to extract widget rects.
3. Add bracket + std-ded entries for the year in `taxgenerator/tax_tables.py`.
4. Build a line→leaf map for the year by:
   - Running `pdfplumber` to extract line labels by Y position
   - Cross-referencing with `.fields.json` rect data
   - Adding entries to the `LINE_MAPS` dict in `scripts/fill_pasta_pals_python.py`
5. **Critical:** if Form 1040 page 1 layout shifted (it did in 2025), build a year-specific filler module like `scripts/fill_1040_2025.py`. Don't try to make one filler handle both layouts.
6. Visually verify by rendering at high res (`pdftoppm -r 300`) and zooming into header/income/tax sections.

## Verification workflow

When you change anything in the fill pipeline:

```bash
# 1. Regenerate
python3 -m taxgenerator --client clients/pasta_pals.json --year 2025

# 2. Confirm 2024 didn't regress (its file should be UNCHANGED)
md5sum dist/Pasta_Pals_2024_RETURN.pdf
# Expected: 69d6775e0a40d2f9c8ed1cb387d7c7a1

# 3. Render 2025 for visual review
pdftoppm -r 200 -png dist/Pasta_Pals_2025_RETURN.pdf /tmp/p25
# Inspect each /tmp/p25-*.png

# 4. Check overflow warnings printed by the CLI
# Each value drawn must fit inside its widget rect.
```

If you see overflow warnings or visual misplacement, the fix is almost always
in `scripts/fill_pasta_pals_python.py`'s LINE_MAPS for the year, OR in
`scripts/fill_1040_2025.py`'s `FIELD_MAP_2025` dict.

## Amendments (Form 1040-X)

Produce an amended federal return from two client configs (as-filed + corrected):

```bash
python3 -m taxgenerator --amend \
  --client clients/{corrected}.json \
  --original clients/{as_filed}.json \
  --year 2024
# → dist/{client_id}_2024_1040X.pdf
```

- **Template:** `public/irs-forms/1040x_2024.pdf` is the IRS continuous-use
  Form 1040-X (Rev. 12-2025); you enter the calendar year (2024) in the header.
  Note this revision labels the explanation section **"Part II"** (older revs
  said Part III). Currently TY2024 only — other years need a year-specific
  filler (`fill_1040x_{year}.py`).
- **Filler:** `scripts/fill_1040x_2024.py` — same rect-driven approach as
  `fill_1040_2025.py`. `FIELD_MAP_1040X_2024` + `GRID_LEAVES` map each line to
  its A/B/C money-column leaves (columns at rect X 382-446 / 446-510 / 511-576;
  reconciliation lines 16-22 are column-C only). SSN is a manual even-cell comb.
- **Computation:** `compute_amendment(original_cfg, amended_cfg, year)` in
  `compute.py` emits the three-column model (A=original, C=corrected, B=C−A)
  plus an auto-generated Part II explanation. Core grid lines (1-11) always
  show A/C incl. -0-; credit/payment lines render only when nonzero.
- **Column A = as-filed, not a recompute.** `_resolve_as_filed` sources column
  A from an optional `as_filed` block on the *original* config when present,
  falling back to recomputing the original return. This keeps column A faithful
  to what was actually filed even if the original used a different method or
  contained an error a recompute won't reproduce. The `as_filed` keys
  (`agi`, `deduction`, `qbi_deduction`, `additional_deductions`,
  `taxable_income`, `tax`, `nonrefundable_credits`, `other_taxes`, `total_tax`,
  `overpayment`, plus the three payment keys) each override one column-A figure;
  any omitted key falls back to the recompute.
- **Packet:** `generate_amendment_packet` in `forms.py` emits the 1040-X plus
  ONLY the changed corrected schedules (Sch 1, Sch 2, Sch C, Sch SE; 8959 only
  if additional Medicare applies). Reuses the existing 2024 fpp fillers — does
  not touch frozen 2024 *output*.
- **Reference test:** Jacques Potts 2024 (`clients/jacques_potts{,_original}.json`).
  Original total tax $8,803, corrected $406, amount owed $406 (original
  balance unpaid → no refund). Figures now tie to the IRS exactly:
  `compute_federal_tax` uses the IRS Tax Table (row-midpoint method) for
  taxable income under $100,000 and the rate-schedule bracket math at or above
  it. The $100K boundary is why the frozen returns (taxable ~$868K/$823K) are
  untouched by the table change.

## State amendments — Illinois (Form IL-1040-X)

Produce an Illinois amended return (the first state form; mirrors the federal
1040-X pipeline):

```bash
python3 -m taxgenerator --amend --state IL \
  --client clients/{corrected}.json \
  --original clients/{as_filed}.json \
  --year 2024
# → dist/{client_id}_2024_IL1040X.pdf
```

- **Template:** `public/irs-forms/il1040x_2024.pdf` is the IL DoR Form IL-1040-X
  (R-12/24), pulled from `taxarchive.illinois.gov` (prior-year archive; the
  current-year path on tax.illinois.gov serves the 2025 rev). Year-specific —
  TY2024 only. `il1040x_2024.fields.json` regenerated via
  `regenerate_fields_correct.py` (called per-PDF so other forms aren't touched).
- **Single column, not three.** Unlike the federal 1040-X, IL-1040-X has ONE
  "Corrected figures" column; original figures enter only via the Step 9-10
  reconciliation (Line 35 overpayment on the original IL-1040, Line 31 amount
  already paid). The form's widgets carry human-readable `/T` names (e.g.
  "Corrected Illinois base income"), so the field map binds line→name directly
  rather than `f1_NN` leaves. Filing-status radios share the leaf "Filing
  status" — selected by rect X.
- **Computation:** `taxgenerator/state_il.py` (federal `compute.py` untouched).
  IL flows from federal AGI: `compute_il_return` does Line 1 (= amended federal
  AGI) → base income → minus exemption → × 4.95%. 2024 exemption $2,775/person,
  disallowed if federal AGI > $250,000 ($500,000 MFJ) — implemented but doesn't
  bind for the test client. `compute_il_amendment` emits the corrected single
  column + reconciliation (amount owed / refund) + auto Step 11D explanation.
- **Original IL figures = as-filed, not a recompute.** `_resolve_il_as_filed`
  mirrors the federal `_resolve_as_filed`: an optional `il_as_filed` block on
  the *original* config (keys `total_tax`, `overpayment_line32`) overrides the
  recompute; omitted keys fall back. IL-specific corrected inputs live in an
  optional `illinois` config block (exemption persons, Sch M add/subtract, IL
  payments, use tax); sensible defaults (1 exemption / single, all else 0) make
  it optional for a plain sole-proprietor filer.
- **Filler:** `scripts/fill_il1040x_2024.py` — same rect-driven scaffolding as
  `fill_1040x_2024.py` (`baseline_for`, `text_draw`, `wrap_text`, widget-removal
  merge). SSN is a plain box (not a comb on this form). Step 11C "filed federal
  1040-X?" auto-checks Yes. Step 11A federal-acceptance date is left blank for
  the human (we can't know the IRS acceptance date).
- **Reference test:** Jacques Potts 2024. Corrected federal AGI $2,666 → IL base
  $2,666 − exemption $2,775 → net income $0 → tax $0. IL tax reduced from
  $1,946 (original, unpaid) to $0; amount owed $0, no refund. Both pages
  visually verified.

## Roadmap (priority-ordered)

1. **Schedule A (itemized deductions)** — config flag `payments.use_itemized_deductions` exists but no Sch A filler. Add when first client needs it.
2. **Joint-filing visual test** — wire up MFJ checkbox + spouse name/SSN fields, render with a synthetic MFJ client. Currently the code paths exist but are untested visually.
3. **Schedule D (capital gains)** — cap_gain_loss flows to Form 1040 Line 7 but no Sch D PDF.
4. **Multiple Schedule C businesses** — current `cfg.schedule_c` is a single object; needs to become a list.
5. **State returns** — Illinois IL-1040-X (amendments) now implemented (see "State amendments — Illinois" above; TY2024 only, `state_il.py` + `fill_il1040x_2024.py`). Still TODO: IL full original returns (IL-1040), other tax years, and other states (a general state engine is a later, larger task). AZ Form 140 has stub code in `src/` but the Python pipeline doesn't touch it.
6. **Bring Python wins back to TypeScript path** — port rect-driven positioning + per-year LINE_MAPS to `src/lib/irsForms/` so the React UI can produce filings without going through Python.
7. **PDF parser for client intake** — many clients send 1099s / W-2s as PDFs. Auto-extract values into a draft client config.
8. **Snapshot regression tests** — render every supported client × year combo and compare image hashes against committed baselines. Catches drift after any LINE_MAPS edit.

## Things to avoid

- Don't reintroduce hardcoded Y offsets in fill functions. Use rects only.
- Don't share field-leaf assumptions across years. Each year is its own registry.
- Don't draw over IRS pre-printed values (SS wage base, $200K threshold labels, etc.).
- Don't use AcroForm field-fill for the SSN comb on Form 1040 — the form's native rendering uses bold blue ~14pt and looks unprofessional. Manual overlay only.
- Don't trust LLM "intuition" about where fields are — always extract rects from the actual PDF `/Annots` and verify by rendering.

## Stale docs to ignore (or clean up)

- `README.md` — Lovable boilerplate, doesn't reflect actual project state. Replace at some point.
- `CURSOR_HANDOFF.md`, `CURSOR_FOLLOWUP.md` — historical handoff docs from when Cursor was driving the work. Both describe a Schedule C / Form 1040 mapping situation that has since been rebuilt. Archive when convenient.
