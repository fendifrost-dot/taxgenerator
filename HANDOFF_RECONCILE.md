# Handoff: Reconcile the Python pipeline (federal + IL) into one coherent state

**Owner:** ONE agent only (recommend Claude Code). Do not split this across agents — a
split base is what caused the divergence this fixes.
**Read first:** `CLAUDE.md`, `HANDOFF_1040X.md`, `HANDOFF_IL1040X.md`.

---

## 1. What happened

- The **federal 1040-X** + IRS **Tax Table** fix were built in one session (Claude Code).
- The **IL-1040-X** was built separately (Cursor) on a branch → **PR #2**, which — per its own
  notes — "created the Python package fresh because the federal 1040-X wasn't on that branch."
- Result: a potential **second, divergent Python package** on PR #2 that may duplicate or
  overwrite the federal work, plus a **placeholder SSN (321-54-9876)** that appeared in the
  PR's render.

## 2. Source of truth (verified)

The current **working tree** is the most complete, correct state. Confirmed working:

- `scripts/fill_1040x_2024.py` (federal) **and** `scripts/fill_il1040x_2024.py` (IL) both present.
- `public/irs-forms/1040x_2024.pdf` and `il1040x_2024.pdf` both present.
- Federal amendment for Jacques ties to the as-filed return: total tax **$8,803 → $406**,
  column A line 6 = 2,405, line 11 = 8,803 (Tax Table fix working).
- IL amendment for Jacques: IL tax **$1,946 → $0**, SSN renders correctly as **361-94-2653**.
- Frozen baseline intact: `md5sum dist/Pasta_Pals_2024_RETURN.pdf` = `69d6775e0a40d2f9c8ed1cb387d7c7a1`.
- Note: this work is **uncommitted** — git HEAD is still the older "Schedule C Form 1040 packet"
  commit.

## 3. Goal

One committed Python pipeline containing federal 1040-X + Tax Table fix + IL-1040-X, with no
duplicate/parallel package, no placeholder SSN, and the frozen baseline untouched. PR #2 either
folded in or closed.

## 4. Steps

1. **Commit the working tree as the base of truth** with a clear message, e.g.
   `"federal 1040-X + IRS Tax Table (<$100K) + IL-1040-X amendment pipeline"`. This becomes
   the canonical state.
2. **Diff PR #2 against this base.** For each file PR #2 touches, determine: duplicate (already
   here), divergent (conflicting reimplementation), or unique improvement.
   - Duplicate/divergent → discard from PR #2; the working-tree version wins.
   - Unique improvement → cherry-pick onto the base only after confirming it doesn't regress
     the federal path.
3. **Kill the placeholder SSN.** Grep the whole repo for `321-54-9876` (and any other hardcoded
   test SSN) and remove it — SSNs must come only from the client config.
4. **Ensure a single package.** Confirm there is exactly one `taxgenerator/` package and one
   `scripts/fill_*` set — no `taxgenerator_v2/`, duplicated modules, or shadow copies from the
   fresh-build branch.
5. **Close or rebase PR #2** so main isn't later overwritten by the divergent package.

## 5. Verification (must all pass before done)

```bash
pip install -r requirements.txt

# Federal — ties to as-filed
python3 -m taxgenerator --amend --client clients/jacques_potts.json \
  --original clients/jacques_potts_original.json --year 2024
#   expect: 1040-X col A line 11 = 8,803, col C = 406, amount owed 406

# Illinois — clears the $1,946
python3 -m taxgenerator --amend --state IL --client clients/jacques_potts.json \
  --original clients/jacques_potts_original.json --year 2024
#   expect: IL net income 0, total tax 0, SSN 361-94-2653 (NOT 321-54-9876)

# Frozen federal baseline untouched
md5sum dist/Pasta_Pals_2024_RETURN.pdf      # expect 69d6775e0a40d2f9c8ed1cb387d7c7a1

# No stray test SSN anywhere
grep -rn "321-54-9876" . --include=*.py --include=*.json   # expect: no matches
```

## 6. Going forward

Branch all future form work (other years, other states) from this committed base. Don't let a
second agent build a "fresh" package on a branch that lacks current work — that is exactly the
divergence being cleaned up here.
