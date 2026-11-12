# HANDOFF — verify the Schedule C print fix (Jacques Potts 2024)

**For an independent reviewer. This is a verification brief, not a change
request.** Everything described here is already implemented and committed. The
job is to check it, not to extend it. Section 6 lists what must not be touched.

- Repo: `https://github.com/fendifrost-dot/taxgenerator`
- Branch: `fix/schedule-c-print-reconciliation` @ `1b79798` (PR #3 is open
  against `main` but still shows `d308462` — later commits are local only, so
  **review the local checkout, not a fresh clone**, until the branch is pushed)
- Local checkout used: `/Users/gocrazyglobal/taxgenerator-repo`
- Python 3.9.6 · pypdf 6.13.1 · pdfplumber 0.11.8 · reportlab 4.5.1
- Read `CLAUDE.md` first. Its invariants govern this repo.

**Deadline: Nov 20, 2026** — last day to ask the IRS to reverse its change.

### Review history

**2026-11-10 — Cursor, independent review from a separate checkout.** It ran
the section 4 commands, reproduced the square-footage break, and found that
the gate could pass a figure drawn into the wrong box in three ways: the label
check's row band reached neighbouring rows, boxes sharing a row all matched
the row's phrase equally, and the 1040-X column check read figures back
through the same map the filler drew them with. All three are now closed —
sections 7 and 8 record what that leaves. Jacques's packet was not affected:
it regenerates byte-identical and three independent reads agree on it.

---

## 1. What the IRS said

Jacques Potts's 2024 Form 1040-X was prepared by this pipeline (commits
`653ab88` and `3d09a6b`) and mailed in June 2026. The IRS processed it under
**math-error authority (IRC §6213(b))** and issued **Letter 474C on Sep 21,
2026**, then billed **$13,052.54** on **CP22A, Oct 5, 2026**.

What the IRS changed:

| Line | We filed | IRS corrected to |
|---|---|---|
| Schedule C line 31 (net profit) | $2,869 | $44,354 |
| Schedule SE line 12 | $406 | $6,267 |
| Schedule SE line 13 | $203 | $3,134 |
| 1040-X line 11 (total tax) | $406 | $9,230 |

**The notice requests nothing.** A math-error notice is a unilateral
adjustment: it states what was changed and gives 60 days to ask for a
reversal. It does not ask for documents, schedules or explanations. This
matters for section 6.

**Why the IRS could do this arithmetically.** The expense figures that
actually *printed* in Part II summed to **$27,416**, while **line 28 read
$68,631**. The IRS refigured from what it could see on the page:
$71,500 − $27,416 = **$44,084**.

**One open discrepancy.** The IRS arrived at $44,354, which is **$270 more**
than $44,084. That $270 is unexplained and should not be coded around. It
needs the IRS's own computation to resolve. Do not "fix" it in the code.

---

## 2. What was wrong on our end

Confirmed by reading the mailed PDF back box by box, not inferred from source.

| Defect on the filed return | Cause |
|---|---|
| Line 9 car/truck **$40,200 never printed** | `fill_1040sc` drew a hard-coded subset of Part II lines — the ones Pasta Pals happened to use. L9 was not among them. |
| Line 23 taxes & licenses **$1,015 never printed** | Same hard-coded subset. |
| Part V total **$244 printed on line 27b** | 27b is the *energy efficient commercial buildings* line (attach Form 7205). The IRS swapped 27a/27b between TY2024 and TY2025; the filler had the 2025 meaning hard-coded. |
| Line 48 **blank** | The 2024 branch searched page 2 for a rect matching `rect[0] > 460 and 380 < rect[1] < 440`, which matches no 2024 widget. |
| Line 31 **blank**, with $2,869 in the line-30 **square-footage blank** | Wrong leaf: `p1.L30`/`p1.L31` pointed at the simplified-method square-footage fields. |
| Schedule 1 line 26 **blank**, $203 on **line 24g** | Wrong leaf for `p2.L25`/`p2.L26`. |
| Part V listed **another client's category labels** | Descriptions were a hard-coded list of Pasta Pals' categories; only the amounts came from the client. |

Two structural causes behind all of it:

1. **`forms.py::_build_d` carried only the keys the hard-coded filler drew.**
   A nonzero computed expense on any other line was dropped from the page
   while still counting toward line 28. Silent, every time.
2. **Nothing read the output back.** The pipeline trusted that what it drew
   landed where it intended. Pasta Pals 2025 was eyeballed once and passed,
   which is why the 27a/27b inversion survived — it is correct for 2025.

---

## 3. What was fixed

### Drawing
- **`SCHC_PART_II_LINES`** — a per-year registry mapping every computed
  expense key to its form line, covering L8–L27b. `fill_1040sc` now loops the
  registry instead of a hand-picked list. An expense key with no registry
  entry, or a registry line with no `LINE_MAPS` leaf, raises `FormFillError`.
  A figure can no longer vanish while counting in line 28.
- **27a/27b are year-keyed.** 2024: 27a = other expenses, 27b = Form 7205.
  2025: reversed. The keys are deliberately *semantic*
  (`other_expenses_partv`, `energy_efficient_f7205`) rather than named after
  line numbers, because the line numbers are not stable across years.
- **Leaf corrections** verified against the printed labels: Schedule C
  `p1.L30`, `p1.L31`, `p2.L48`; Schedule 1 `p2.L25`, `p2.L26`; Form 8959
  `p1.L4`.
- **Part V descriptions** come from the client config. **Schedule C income
  lines** (2, 4, 6 and the subtractions) come from the computed return rather
  than being hard-coded to zero.
- **Questions F, G, I and J** are rect-driven and config-driven.
- **Every filler's `put()` now raises on a missing leaf.** All of them
  silently returned, which is the exact failure mode that caused this
  incident — it simply had not been triggered outside Schedule C. Fixed in
  `fill_1040`, `fill_1040s1`, `fill_1040s2`, `fill_1040sc`, `fill_1040sse`
  and `fill_8959`. `fill_8959` mattered most: it is not covered by the gate,
  so a dropped line there would have been invisible.
- **`fill_1040` no longer draws the 2025 page-2 variants of lines 11-15.**
  It drew both the 2024 (`p1.*`) and 2025 (`p2.*`) keys and let the silent
  skip discard whichever did not exist that year -- year dispatch by absent
  map entry. With `put()` now raising, that pattern is gone; the filler is
  2024-only and guarded, and `fill_1040_2025.py` owns 2025. **No figure was
  being lost here** -- the 2024 lines printed correctly from `p1.*`.

### The gate (`taxgenerator/reconcile.py`)
Before any PDF is written, the filled pages are reopened and:
- every computed figure is **read back out of the widget rect it was drawn
  into**;
- nothing unexpected sits in any other box;
- Schedule C printed Part II is **re-summed** and compared to printed line 28;
- Schedule SE arithmetic is redone from the printed figures;
- cross-form carry is checked: Sch C L31 = Sch 1 L3 = Sch SE L2;
- Schedule 1 lines 11–25 are summed against printed line 26;
- the 1040-X columns A/B/C are read back, with C compared to the model and
  B checked as C − A.

On any mismatch it raises `ReconcileError`, **nothing is written to `dist/`**,
and the run exits non-zero. There is no bypass flag; do not add one.

**Independence matters here.** `_check_labels()` delegates to
`scripts/verify_field_map.py::audit_entry`, which reads the printed IRS label
next to each rect with pdfplumber. Without that, the gate and the filler would
share `LINE_MAPS` and a remapped leaf would reconcile against itself. Two of
the negative tests exist specifically to prove this.

### Coverage added since the first round
- **Schedule 2 is now reconciled.** It carries SE tax to total tax and was the
  one required form in the packet nobody read back.
- **Schedule C Part IV may be omitted on the record** — `vehicle.omitted`
  with a written `reason`. Omitted without a reason is an error. The reason is
  copied into the print-check under "Recorded decisions" so a reviewer can
  tell a deliberate blank from a bug. See section 6.

---

## 4. How to verify

```bash
cd /Users/gocrazyglobal/taxgenerator-repo
git checkout fix/schedule-c-print-reconciliation

# 1. Every mapped money line matches the IRS label printed beside it.
python3 scripts/verify_field_map.py            # expect: PASS, exit 0

# 2. Full suite: the synthetic client that uses every Part II line, the three
#    negative tests that re-introduce the shipped defects, and the eight that
#    re-introduce a wrong-box defect (GateCatchesWrongBoxDefects).
python3 scripts/run_regression.py              # expect: Ran 23 tests, OK (skipped=1)

# 3. Regenerate Jacques's packet end to end.
python3 -m taxgenerator --amend --year 2024 \
  --client clients/jacques_potts.json \
  --original clients/jacques_potts_original.json
#    expect: writes dist/jacques_potts_2024_1040X.pdf
#    and dist/jacques_potts_2024_1040X_print_check.txt ending RESULT: PASS
#    federal md5 7d36ea36e941d662f60dff475b53cbc5

# 4. Check the 1040-X you are holding, without regenerating it: re-derives the
#    model from the configs and locates every printed figure by the line number
#    the form prints beside it.
python3 scripts/crosscheck_1040x_by_printed_line.py   # expect: RESULT: PASS
```

Worth doing by hand as well:

- Render and look: `pdftoppm -r 300 -png -f 7 -l 8 dist/jacques_potts_2024_1040X.pdf /tmp/sc`
  — page 7 is Schedule C p1, page 8 is Parts III/IV/V.
- **Prove the gate still bites.** Change a leaf in `LINE_MAPS` (e.g. point
  `p1.L31` at the square-footage field, reproducing the original bug) and
  regenerate. It must fail, print findings, and leave `dist/` unwritten. Eight
  such defects are covered by `GateCatchesWrongBoxDefects`; try one it does
  not cover rather than repeating those.
- Compare against what was actually mailed:
  `FENDI FILES/TAXES/Jacques TAXES/FINAL - Jacques 2024 Amended Returns/Jacques_Potts_2024_Form_1040X.pdf`

The regenerated packet is saved at
`FENDI FILES/TAXES/Jacques TAXES/CORRECTED - Nov 2026/`, alongside its print
check. `FILED vs CORRECTED - figure comparison.md`, one level up, tabulates
every difference.

---

## 5. What changed on the return itself

**No dollar figure was added, removed or altered.** Verified by extracting
every money token from both PDFs and comparing the multisets. The seven
differences are placement only:

| Figure | Filed | Corrected |
|---|---|---|
| $40,200 car & truck | not printed | Schedule C line 9 |
| $1,015 taxes & licenses | not printed | Schedule C line 23 |
| $244 other expenses | line 27b | line 27a |
| $244 Part V total | line 48 blank | line 48 |
| $2,869 net profit | line-30 square-footage blank | line 31 |
| $203 half of SE tax | Schedule 1 line 24g | Schedule 1 line 26 |
| Part V descriptions | another client's labels | the client's own row |

Printed Part II now sums to $68,631 and ties to line 28. Illinois
(IL-1040-X) regenerates **byte-identical** to what was mailed — md5
`38d591187b8152b357c04755426ecfe6` — so it had no print defects.

---

## 6. Do not change

1. **The frozen Pasta Pals 2024 return.** md5
   `69d6775e0a40d2f9c8ed1cb387d7c7a1`. Never regenerate or modify it. Its
   defects are documented and were audited read-only.
2. **Any dollar figure** in `clients/jacques_potts.json` or
   `clients/jacques_potts_original.json`. These are the preparer's, not the
   code's.
3. **Schedule C line I = "No".** Reviewed and deliberately left as filed.
   It is not an open question for this review.
4. **Schedule C Part IV, left blank.** Also deliberate, and recorded in the
   config with its reason: Part IV was blank on the return as filed, and the
   IRS did not request vehicle information. **Do not "complete" it.** More
   generally — see CLAUDE.md invariant 9 — never volunteer to the IRS
   anything it did not ask for, and never let such an item block delivery.
5. **The June `FINAL` folder.** It is the record of what was actually mailed.
6. **The $270 discrepancy** in section 1. Leave it open.

---

## 7. Known gaps (real, and deliberately still open)

- **Schedule SE line 9 is hardcoded to the Social Security wage base.**
  Correct only when the client has no W-2 wages. Jacques has none, so the
  filed figure is right — but this will overstate SE tax for any client who
  does. Worth fixing before the next client, and worth a test.
- **Form 1040-X is only partly reconciled.** The three money columns are read
  back off the printed page and checked, as is the Part II explanation's
  presence; the rest of the form is not. The print check names what covers it
  ("1040x: checked below, by the Form 1040-X column read-back").
- **Form 4562 is not generated**, so Part IV is the only route for a client
  claiming car/truck expense who needs the disclosure.
- ~~**The 1040-X money grid can still drop a line silently, and the check
  shares its authority.**~~ **Closed 2026-11-10.** The filler's three bare
  `continue`s now raise `FormFillError`, and `_amendment_column_c_report`
  locates every figure by the line number the form prints beside it
  (`read_1040x_grid`) instead of resolving it through `GRID_LEAVES`. The
  AGI / taxable-income / total-tax ties used to compare the model against
  itself and never read the page; they now read the page. Pointing line 11
  column C at the reserved line-9 box used to report "ok" and now produces
  four independent findings.
- **Form 1040 itself and Form 8959 are unreconciled.** 8959 is only included
  when additional Medicare tax applies; it is absent from Jacques's packet
  because that figure is zero.

---

## 8. Highest-value things a reviewer could find

In rough order of what would hurt most if wrong:

1. ~~A **leaf that points at the wrong rect but still passes the label
   audit**~~ — **largely closed 2026-11-10.** The old rule accepted the
   claimed line number anywhere in a band reaching 3-4 printed rows, and took
   97 of 2,852 possible wrong boxes; it now requires the number printed
   *nearest* the box and takes none, while all 148 correct mappings still
   pass. Row-sharing boxes (Yes/No, Cash/Accrual/Other, the mileage boxes) are
   bound to the option word beside them rather than the shared phrase, and the
   three unlabelled line 43 date cells are held by their printed order. Still
   worth attacking: forms other than Schedule C, and any box whose row carries
   no line number at all.
2. A **computed expense key that reaches line 28 without a registry entry** in
   some path the synthetic client does not exercise.
3. **Any remaining silent `return` on a missing rect.** Every `put()` helper
   in `fill_pasta_pals_python.py` was audited and now raises, and so is the
   1040-X money grid. Still unswept: the `put_leaf*` helpers and the Illinois
   filler (`fill_il1040x_2024.py`), which take different shapes. The IL-1040-X
   has no read-back gate of its own at all — it is byte-identical to what was
   mailed, which is evidence about this packet and not about the code.
4. A way to get a PDF written while the gate fails.
5. 2025 regressions: the 27a/27b meanings are reversed that year and Pasta
   Pals 2025 is the only live client exercising it.
