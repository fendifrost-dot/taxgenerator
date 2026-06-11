# Cursor Follow-up: fix field-mapping bugs in the 1040 packet

**Status of the first round (commit 0ab47cb): the structural work is correct and merged.** Year-aware loading, IndividualReturnInput, computeIndividualReturn, the new mappers (values1040, values1040S1, values1040S2, values8959), the planFormSet expansion for `schedule_c`, the smoke test, and the IRS PDF templates all landed and the pipeline runs end-to-end. Numbers reconcile to the dollar:

- 2024: net profit $905,532, total federal tax $330,362
- 2025: net profit $861,032, total federal tax $311,998

The mail-readiness gate is **field placement on the rendered PDFs.** Two classes of bugs need fixing before the packet can be mailed.

---

## Bug 1 (already fixed locally — needs commit) — wrong rect coordinates in `.fields.json`

The auto-extraction script that produced `1040_2024.fields.json` etc. had a Y-offset bug. Field rects came out about 60 points lower than the actual widget rects in the PDF. This shifted every value about 5 form lines down on render.

**Fix already applied locally** by `scripts/regenerate_fields_correct.py` (committed locally but not pushed yet). The script reads `/Annots` widget rects directly per page, walks the `/Parent` chain for the field name, and writes correct `rect`, `page`, `id`, and `type`. Preserves any semantic-name keys from the existing JSON when present.

Re-running the script regenerated all 22 `.fields.json` files with correct rects. After re-running the smoke test, most Schedule C lines now land on the right form lines (Line 8 advertising, Line 11 contract labor, Line 13 depreciation, Line 15 insurance, totals all correct).

**Action**: commit `scripts/regenerate_fields_correct.py` and the regenerated `.fields.json` files. Replace `scripts/extract_form_fields.py` with this corrected version (or update the existing one).

---

## Bug 2 — field-ID drift between 2024 and 2025 PDFs (the real issue)

The IRS PDFs for 2024 and 2025 don't share identical AcroForm field paths. The mapper in `src/lib/irsForms/entityReturnMapper.ts` writes to **raw field IDs** like `topmostSubform_0_Page1_0_f1_2_0`. Those IDs point to different lines on the 2024 vs 2025 form because of subform-wrapper differences.

Example — Schedule C:

| Field | 2024 path | 2025 path | Effect |
|---|---|---|---|
| `c1_6_0` | `topmostSubform[0].Page1[0].c1_6_0` | `topmostSubform[0].Page1[0].Line1_ReadOrder[0].c1_6_0` | The `Line1_ReadOrder` wrapper exists in 2025 but not 2024 — this renumbers downstream `f1_X` indexes by one in some sections |

This is why on the 2024 Schedule C right now we see:

- The taxpayer's SSN slot showing `541990` (the NAICS code) — `f1_2_0` is the business-code field on 2024, but the mapper writes naics to `f1_2_0` thinking it's the SSN field
- Rent ($24,000) landing on Line 18 Office expense — `f1_30` in `Lines18-27` is Line 18 on 2024 but maps differently on 2025
- Form 1040 page 1 had `905,532` rendering inside the SSN slot instead of the line 8 box

The proper fix is **Task 7 from the original handoff (which was skipped)**: give each form's `.fields.json` **semantic-name keys** (`line_8_advertising`, `name_taxpayer`, `ssn_taxpayer`, etc.) that mean the same thing across years. Then the mapper writes to those semantic names, and each year's `.fields.json` resolves them to the correct field path independently.

---

## Required work — concrete, per form

For each of the 12 form/year combinations, open the IRS PDF source side-by-side with the auto-generated `.fields.json` and rename the keys from raw IDs (`topmostSubform_0_Page1_0_f1_17_0`) to semantic names. Then update the mapper to write to those semantic names.

### Schedule C semantic keys (apply to BOTH `1040sc_2024.fields.json` and `1040sc_2025.fields.json`)

```
name_taxpayer                    → top-left name field (2024: f1_1, 2025: f1_1)
ssn_taxpayer                     → top-right SSN comb (2024: f1_2 in DComb-style, 2025: f1_2)
                                   NOT f1_2 used as plain text; verify it's the SSN comb
principal_business               → Line A
business_code_b                  → Line B comb (BComb subform)
business_name_c                  → Line C
ein_d                            → Line D comb (DComb subform)
business_address_e               → Line E address
business_csz                     → Line E city/state/zip
accounting_cash                  → F checkbox (cash)
accounting_accrual               → F checkbox (accrual)
accounting_other                 → F checkbox (other)
material_participation_yes       → G checkbox yes
material_participation_no        → G checkbox no
started_2024_check               → H checkbox
payments_required_yes            → I checkbox yes
payments_required_no             → I checkbox no
filed_1099_yes                   → J checkbox yes
filed_1099_no                    → J checkbox no
line_1_gross_receipts            → Line 1
line_2_returns_allowances        → Line 2
line_3_subtract                  → Line 3
line_4_cogs                      → Line 4
line_5_gross_profit              → Line 5
line_6_other_income              → Line 6
line_7_gross_income              → Line 7
line_8_advertising               → Line 8
line_9_car_truck                 → Line 9
line_10_commissions              → Line 10
line_11_contract_labor           → Line 11
line_12_depletion                → Line 12
line_13_depreciation             → Line 13
line_14_employee_benefits        → Line 14
line_15_insurance                → Line 15
line_16a_mortgage_interest       → Line 16a
line_16b_other_interest          → Line 16b
line_17_legal_professional       → Line 17
line_18_office                   → Line 18
line_19_pension                  → Line 19
line_20a_rent_vehicles           → Line 20a
line_20b_rent_other              → Line 20b
line_21_repairs                  → Line 21
line_22_supplies                 → Line 22
line_23_taxes_licenses           → Line 23
line_24a_travel                  → Line 24a
line_24b_meals                   → Line 24b
line_25_utilities                → Line 25
line_26_wages                    → Line 26
line_27a_other                   → Line 27a
line_28_total_expenses           → Line 28
line_29_tentative_profit         → Line 29
line_30_home_office              → Line 30
line_31_net_profit               → Line 31
line_32a_at_risk                 → Line 32a checkbox
line_32b_some_at_risk            → Line 32b checkbox
# Page 2 — Part III COGS
line_33_method                   → Line 33
line_34_change                   → Line 34
line_35_inventory_begin          → Line 35
line_36_purchases                → Line 36
line_37_cost_of_labor            → Line 37
line_38_materials                → Line 38
line_39_other_costs              → Line 39
line_40_add_35_through_39        → Line 40
line_41_inventory_end            → Line 41
line_42_cogs                     → Line 42
# Part V — Other expenses
partV_item1_desc                 → Item 1 description
partV_item1_amount               → Item 1 amount
partV_item2_desc                 → Item 2 description
partV_item2_amount               → Item 2 amount
... through item 9 ...
line_48_total_partV              → Line 48
```

To produce these mappings: use the rect Y-coordinate. On a Schedule C page (792 pt tall), Line 8 Advertising is at Y≈420 (from bottom). Each subsequent line drops by ~12 points. The rects are now correct after Bug 1 fix, so this is mechanical.

### Schedule SE semantic keys

```
name_self_employed
ssn_self_employed
line_1a_farm_profit
line_1b_ss_benefits
line_2_sch_c_net
line_3_combine
line_4a_times_92_35
line_4b_optional
line_4c_combine
line_5a_church
line_5b_times_92_35
line_6_add
line_7_ss_wage_base       (= 168_600 in 2024, 176_100 in 2025)
line_8a_ss_wages
line_8b_unreported_tips
line_8c_form_8919
line_8d_add_8a_8b_8c
line_9_subtract
line_10_ss_tax
line_11_medicare_tax
line_12_total_se_tax
line_13_half_se_deduction
```

### Form 1040 semantic keys (most critical — currently most broken)

```
name_first_taxpayer
name_last_taxpayer
ssn_taxpayer
name_first_spouse
name_last_spouse
ssn_spouse
home_address
apt_no
city_state_zip
filing_status_single
filing_status_mfj
filing_status_mfs
filing_status_hoh
filing_status_qss
digital_assets_yes
digital_assets_no
someone_can_claim_you
someone_can_claim_spouse
spouse_itemizes
age_blindness_you_born_before_1960
age_blindness_you_blind
age_blindness_spouse_born_before_1960
age_blindness_spouse_blind
dependents_count
line_1a_w2_wages
line_1b_household_wages
line_1c_unreported_tips
line_1d_medicaid_waiver
line_1e_taxable_dependent_care
line_1f_employer_adoption
line_1g_form_8919
line_1h_other_earned
line_1z_total_wages
line_2a_tax_exempt_interest
line_2b_taxable_interest
line_3a_qualified_dividends
line_3b_ordinary_dividends
line_4a_ira_distributions
line_4b_ira_taxable
line_5a_pensions
line_5b_pensions_taxable
line_6a_ss_benefits
line_6b_ss_taxable
line_6c_lump_sum_election
line_7_capital_gain
line_8_additional_income_sch1
line_9_total_income
line_10_adjustments_sch1
line_11_agi
line_12_standard_deduction
line_13_qbi
line_14_add_12_13
line_15_taxable_income
line_16_tax
line_17_sch2_line3
line_18_add_16_17
line_19_child_tax_credit
line_20_sch3_line8
line_21_subtract
line_22_subtract
line_23_sch2_line21
line_24_total_tax
line_25a_w2_withheld
line_25b_1099_withheld
line_25c_other_withheld
line_25d_total_withheld
line_26_estimated_payments
line_27_eic
line_28_addl_child_tax_credit
line_29_aoc_credit
line_31_sch3_line15
line_32_total_other_payments_refundable
line_33_total_payments
line_34_overpayment
line_35a_refund_amount
line_36_apply_to_2025
line_37_amount_owed
line_38_estimated_tax_penalty
sign_taxpayer_occupation
sign_taxpayer_phone
sign_taxpayer_email
sign_spouse_occupation
preparer_name
preparer_ptin
```

### Schedule 1 semantic keys

Lines 1, 2a, 3, 4, 5, 6, 7, 8a–8z, 9, 10 (additional income); 11, 12, 13, 14, 15 (half-SE), 16, 17, 18, 19a, 20, 21, 23, 24a, 25, 26 (total adjustments).

### Schedule 2 semantic keys

Lines 1, 2, 3 (Part I); 4 (SE tax), 5, 6, 7, 8, 9, 10, 11 (Add'l Medicare), 12, 13, 14, 15, 17, 21 (total).

### Form 8959 semantic keys

Lines 1–7 (Part I Medicare wages); 8–13 (Part II SE income); 14–17 (Part III RRTA); 18 (Part IV total); 19–24 (Part V withholding reconciliation).

---

## How to do it (mechanically)

For each PDF in `public/irs-forms/`:

1. Open the PDF and visually identify what each line is (the IRS labels each line — e.g., "8 Advertising").
2. Open the matching `.fields.json` and find the field whose `rect` Y-coordinate matches that line's vertical position. (The rects are now correct post-Bug-1 fix, so this is straightforward.)
3. Rename the JSON key from the raw ID to the semantic name.
4. Repeat for every line in the form.

You can automate steps 2–3 with a script that reads the form's pdf-text-extraction layer and pairs each label with the closest field-rect Y. I'd write that script if I were doing this, rather than hand-mapping every field.

After renaming, update `entityReturnMapper.ts` so each mapper writes to semantic keys:

```ts
// before
'topmostSubform_0_Page1_0_f1_17_0': fmt(input.advertising),

// after
'line_8_advertising': fmt(input.advertising),
```

This single change makes the mapper year-independent. Both `1040sc_2024.fields.json` and `1040sc_2025.fields.json` resolve `line_8_advertising` to whatever AcroForm field on their respective PDF actually represents Line 8 — even if the underlying `f1_X` numbering or subform path differs.

---

## Verification protocol

1. Run `npx tsx scripts/run_pasta_pals_jenelle.ts` (already in repo on `main`).
2. Open `dist/Pasta_Pals_2024_RETURN.pdf` in Adobe Acrobat and Preview.
3. For each page, verify visually:
   - Schedule C: name in top-left, SSN comb top-right (594-63-6983 distributed across 9 cells), business code 541990 in Box B comb (6 cells), EIN 41-3677262 in Box D comb (9 cells), gross receipts $1,500,000 on Line 1, advertising $120,000 on Line 8, contract labor $250,000 on Line 11, depreciation $30,000 on Line 13, insurance $15,000 on Line 15, legal $40,000 on Line 17, rent $24,000 on Line 20b (NOT Line 18), supplies $5,000 on Line 22, travel $18,000 on Line 24a, meals $6,000 on Line 24b, utilities $6,000 on Line 25, Part V Other $80,468 on Line 27a, total expenses $594,468 on Line 28, net profit $905,532 on Line 31.
   - Form 1040: name fields populated, SSN comb in correct cells, filing status Single checked, Line 8 = $905,532, Line 11 AGI = $882,953, Line 15 taxable = $868,353, Line 16 tax = $279,478, Line 23 = $50,884, Line 24 total = $330,362, Line 37 owed = $330,362.
   - Schedule 1: Line 3 = $905,532, Line 26 = $22,579.
   - Schedule 2: Line 4 = $45,158, Line 11 = $5,726, Line 21 = $50,884.
   - Schedule SE: Line 2 = $905,532, Line 12 = $45,158, Line 13 = $22,579.
   - Form 8959: Line 8 = $836,259, Line 13 = $5,726, Line 18 = $5,726.
4. Repeat for `dist/Pasta_Pals_2025_RETURN.pdf` against the 2025 expected-output table (in `CURSOR_HANDOFF.md`).

If any value lands on the wrong line, the corresponding semantic-name mapping in that form's `.fields.json` is wrong — fix the JSON, no code change needed.

---

## Specific bugs I observed (smoking guns)

These will all resolve when the semantic-name refactor is done correctly. Listing them as smoke tests for the fix:

1. **2024 Schedule C: SSN slot at top-right shows `541990`** — `f1_2_0` is currently being treated as the business-code field by the mapper but it's actually the SSN field on the 2024 PDF. Semantic name `ssn_taxpayer` resolves correctly.
2. **2024 Schedule C: Box D EIN comb shows wrong digit** — likely an off-by-one in the digit list passed to the comb. Verify `digitsOnly("41-3677262")` produces "413677262" and that all 9 chars get drawn into the 9 cells.
3. **2024 Schedule C: Rent $24,000 landing on Line 18 Office expense** — mapper writes `input.rents` to `f1_30_0` in `Lines18_27`. On 2024 PDF, that field is actually Line 20a (or 20b). Need semantic name `line_20b_rent_other`.
4. **2024 Schedule C: Line 31 Net profit appears empty** — net profit value may currently be going to a non-existent field or to Line 29 only. Semantic name `line_31_net_profit` resolves it.
5. **2024 Form 1040 page 1: SSN slot shows `905,532`** — `f1_X_0` (whichever the mapper chose) is the SSN comb on 2024, not the Line 8 box. Semantic name `ssn_taxpayer` for the SSN comb and `line_8_additional_income_sch1` for Line 8 fixes both.
6. **NAICS code is hardcoded to `541990`** in the mapper. For Pasta Pals the actual code is `541430` (Graphic Design Services). The mapper should pull from a new field on `EntityReturnInput.principalBusinessCode` (add to the type) rather than hardcoding.
7. **Form 1040 mapper writes both name fields but doesn't include Address line — `homeAddress` and `homeCityStateZip` from IndividualReturnInput should land on the address row of Form 1040 page 1.**

---

## Test fixture is already in repo

`scripts/run_pasta_pals_jenelle.ts` carries Jenelle's actual 2024 and 2025 numbers and writes `dist/Pasta_Pals_{year}_RETURN.pdf`. After making changes, run that and visually verify against the table above.

---

## Acceptance criteria for this round

- All 7 smoking-gun bugs above visually resolved.
- All numbers in the verification protocol present at the right lines on both 2024 and 2025 PDFs.
- `npm run build` clean.
- The mappers in `entityReturnMapper.ts` write only to semantic keys (no `topmostSubform_0_Page1_0_*` IDs in the mapper code).
- `.fields.json` files have semantic keys; the raw ID is in the `id` field of each entry.

End of follow-up.
