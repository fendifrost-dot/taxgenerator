# taxgenerator (Python pipeline)

Config-driven federal tax return packet generator.

## Usage

```bash
# Generate Pasta Pals 2025 packet
python3 -m taxgenerator --client clients/pasta_pals.json --year 2025

# Output: dist/pasta_pals_2025_RETURN.pdf
```

CLI flags:
- `--client PATH` — path to client JSON config (required)
- `--year YEAR`   — tax year, 2024 or 2025 (required)
- `--out DIR`     — output directory (default: `dist`)
- `--filename FN` — output filename (default: `{client_id}_{year}_RETURN.pdf`)

## Adding a new client

1. Copy `clients/pasta_pals.json` to `clients/{your_id}.json`
2. Replace the identity, address, Sch C entity info, and per-year financials
3. Run the CLI

The config schema is documented inline in `clients/pasta_pals.json`. Required
top-level keys: `client_id`, `filer`, `address`, `years`. Optional: `spouse`,
`dependents`, `schedule_c`, `other_income`, `payments`.

### Filing statuses

`filer.filing_status` must be one of:
- `single`
- `mfj` (married filing jointly) — requires `spouse` block
- `mfs` (married filing separately) — requires `spouse` block
- `hoh` (head of household)
- `qss` (qualifying surviving spouse)

Standard deductions and tax brackets are auto-selected based on this.

## What's in the packet

Each generated PDF contains, in IRS filing order:
1. Form 1040 (page 1+2)
2. Schedule 1 (page 1+2) — Additional Income & Adjustments
3. Schedule 2 (page 1+2) — Additional Taxes
4. Schedule C (page 1+2) — Profit or Loss From Business
5. Schedule SE (page 1) — Self-Employment Tax
6. Form 8959 (page 1) — Additional Medicare Tax

State filing is **out of scope** — federal only.

## Architecture

- `taxgenerator/config.py` — JSON config loader + validator
- `taxgenerator/tax_tables.py` — brackets, std deductions, SS wage base for all 5 filing statuses
- `taxgenerator/compute.py` — Schedule C / SE / Form 8959 / 1040 calculations
- `taxgenerator/forms.py` — wraps the existing `scripts/fill_pasta_pals_python.py` form fillers and parameterizes their identity globals from a client config
- `taxgenerator/__main__.py` — CLI entry point
- `scripts/fill_pasta_pals_python.py` — original year-aware form fillers (2024 frozen, 2025 fresh)
- `scripts/fill_1040_2025.py` — dedicated 2025 Form 1040 filler with rect-based positioning

## Adding support for a new tax year

1. Add the year's IRS PDF templates to `public/irs-forms/{form}_{year}.pdf`
2. Run `python3 scripts/regenerate_fields_correct.py` to extract widget rects
3. Add bracket + std-ded entries for the new year in `taxgenerator/tax_tables.py`
4. Build a new line→leaf map for the year in `scripts/fill_pasta_pals_python.py`
   (LINE_MAPS dict) and verify visually at high resolution
5. If Form 1040 layout shifts materially (as 2025 did vs 2024), build a
   year-specific filler module in `scripts/fill_{form}_{year}.py` following
   the pattern of `fill_1040_2025.py`

## What's NOT yet supported

- Itemized deductions on Schedule A (config flag exists but Sch A not generated)
- Multiple Schedule C businesses per client
- Schedule D (capital gains), Schedule E (rental/royalty), Schedule F (farm)
- W-2 wages flow through the 1040 income lines but no W-2 PDF attachment
- Child tax credit / EIC / Schedule 3 credits
- AMT calculations (Form 6251)
- State returns

These can be added incrementally — the architecture supports it but no
config schema or filler exists yet.
