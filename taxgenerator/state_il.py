"""Illinois individual income tax — Form IL-1040 / IL-1040-X.

Illinois is a flat tax that flows from federal AGI. This module computes the
IL-1040 line model and turns an originally-filed + corrected pair into the
Form IL-1040-X amendment model (single "Corrected figures" column plus the
payment reconciliation in Steps 9-10).

State has historically been out of scope (see CLAUDE.md); this is the first
state form. It is its own template/registry — no leaf assumptions are shared
with the federal forms. It depends only on the *federal* computed return
(`compute_individual_return`) for AGI, never the other way around.

Sources: 2024 Form IL-1040-X + 2024 IL-1040 Instructions (Step 4 exemption,
income limitation), Illinois Income Tax Act (4.95% flat rate).
"""
from .compute import compute_individual_return
from .tax_tables import normalize_filing_status


# ─────────────────────────────────────────────────────────────────────────────
# Year-specific IL constants (each year is its own registry)
# ─────────────────────────────────────────────────────────────────────────────
IL_TAX_RATE = {2024: 0.0495}
IL_EXEMPTION_PER_PERSON = {2024: 2775}
IL_SENIOR_BLIND_ADDL = {2024: 1000}   # Lines 10b / 10c: $1,000 per checkbox
# Federal-AGI ceiling above which the Line 10 exemption allowance is disallowed
# (2024 IL-1040 Instructions, Step 4). Above the limit → exemption = $0.
IL_EXEMPTION_AGI_LIMIT = {2024: {'mfj': 500000, 'default': 250000}}


def _exemption_persons_default(filing_status, has_spouse):
    """Default count for Line 10a ($2,775 × persons): 2 for a joint return,
    otherwise 1. Overridable via the config's `illinois.exemption_persons`."""
    fs = normalize_filing_status(filing_status)
    return 2 if (fs == 'mfj' or has_spouse) else 1


def _exemption_allowed(agi, year, filing_status):
    """Is the personal exemption allowance permitted at this AGI? Disallowed
    above the year/status income limitation."""
    fs = normalize_filing_status(filing_status)
    limit = IL_EXEMPTION_AGI_LIMIT[year]['mfj' if fs == 'mfj' else 'default']
    return agi <= limit


# ─────────────────────────────────────────────────────────────────────────────
# IL-1040 line computation (one return)
# ─────────────────────────────────────────────────────────────────────────────
def compute_il_return(fed_return, il_cfg, year, filing_status, has_spouse):
    """Compute the IL-1040 line model from a *federal* computed return plus an
    optional `illinois` config block. Returns a flat dict of IL line values.

    For a sole-proprietor filer with no IL add-backs/subtractions the chain is
    simply: federal AGI → base income → minus exemption → × 4.95%."""
    il = il_cfg or {}
    rate = IL_TAX_RATE[year]

    # ── Step 2: Income ──
    L1 = int(round(fed_return['L11a_agi']))          # federal AGI (1040 Line 11)
    L2 = int(il.get('tax_exempt_interest_dividends', 0))
    L3 = int(il.get('additions_sch_m', 0))            # other additions
    L4 = L1 + L2 + L3                                  # total income

    # ── Step 3: Base income (subtractions) ──
    subs = il.get('subtractions', {})
    L5 = int(subs.get('social_security_retirement', 0))
    L6 = int(subs.get('il_tax_overpayment', 0))
    L7 = int(subs.get('other_sch_m', 0))
    L8 = L5 + L6 + L7                                  # total subtractions
    L9 = L4 - L8                                       # IL base income

    # ── Step 4: Exemptions ──
    persons = int(il.get('exemption_persons',
                         _exemption_persons_default(filing_status, has_spouse)))
    if _exemption_allowed(L1, year, filing_status):
        L10a = persons * IL_EXEMPTION_PER_PERSON[year]
    else:
        L10a = 0
    L10b = int(il.get('num_65_older', 0)) * IL_SENIOR_BLIND_ADDL[year]
    L10c = int(il.get('num_blind', 0)) * IL_SENIOR_BLIND_ADDL[year]
    L10d = int(il.get('dependent_exemption', 0))      # from Sch IL-E/EITC
    L10 = L10a + L10b + L10c + L10d                    # exemption allowance

    # ── Step 5: Net income and tax ──
    L11 = max(0, L9 - L10)                             # net income (≥ 0)
    L12 = round(L11 * rate)                            # tax @ 4.95%
    L13 = int(il.get('recapture_4255', 0))
    L14 = max(0, L12 + L13)                            # income tax (≥ 0)

    # ── Step 6: Nonrefundable credits ──
    cr = il.get('credits', {})
    L15 = int(cr.get('sch_cr', 0))                    # tax paid to other state
    L16 = int(cr.get('sch_icr', 0))                   # property/K-12/volunteer
    L17 = int(cr.get('sch_1299c', 0))
    L18 = min(L15 + L16 + L17, L14)                    # total credits ≤ Line 14
    L19 = L14 - L18                                    # tax after nonref credits

    # ── Step 7: Other taxes ──
    L20 = int(il.get('household_employment_tax', 0))
    L21 = int(il.get('use_tax', 0))                   # from original return
    L22 = int(il.get('cannabis_gaming_surcharge', 0))
    L23 = L19 + L20 + L21 + L22                        # total tax

    # ── Step 8: Payments and refundable credit ──
    pay = il.get('payments', {})
    L25 = int(pay.get('il_withholding', 0))
    L26 = int(pay.get('estimated_payments', 0))
    L27 = int(pay.get('pass_through_withholding', 0))
    L28 = int(pay.get('pass_through_entity_credit', 0))
    L29 = int(pay.get('eitc', 0))                     # IL EITC (% of federal)
    L30 = int(pay.get('child_tax_credit', 0))
    L31 = int(il.get('amount_paid_with_original', 0))  # Line 31 (incl. addl paid)
    L32 = L25 + L26 + L27 + L28 + L29 + L30 + L31       # total payments

    return {
        '1': L1, '2': L2, '3': L3, '4': L4,
        '5': L5, '6': L6, '7': L7, '8': L8, '9': L9,
        '10a': L10a, '10b': L10b, '10c': L10c, '10d': L10d, '10': L10,
        '11': L11, '12': L12, '13': L13, '14': L14,
        '15': L15, '16': L16, '17': L17, '18': L18, '19': L19,
        '20': L20, '21': L21, '22': L22, '23': L23,
        '24': L23,                                     # Page 2 Line 24 = Line 23
        '25': L25, '26': L26, '27': L27, '28': L28, '29': L29, '30': L30,
        '31': L31, '32': L32,
        'total_tax': L23,
        'total_payments': L32,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Form IL-1040-X amendment model
# ─────────────────────────────────────────────────────────────────────────────
def _resolve_il_as_filed(original_cfg, year, filing_status, has_spouse):
    """Resolve the original IL return — what was actually filed. Mirrors the
    federal `_resolve_as_filed`: an optional `il_as_filed` block on the original
    config overrides recomputed figures (the original IL return may have used a
    different method or contained an error a recompute won't reproduce). Any
    omitted key falls back to recomputing from the original federal AGI."""
    recomputed = compute_il_return(
        compute_individual_return(original_cfg, year),
        original_cfg.get('illinois'), year, filing_status, has_spouse)
    af = original_cfg.get('il_as_filed') or {}
    o = dict(recomputed)
    # The figures from the original IL return that actually matter to the
    # IL-1040-X reconciliation: original overpayment (→ Line 35) and original
    # total tax (used only in the explanation narrative).
    if 'total_tax' in af:
        o['total_tax'] = int(af['total_tax'])
    if 'overpayment_line32' in af:
        o['overpayment'] = int(af['overpayment_line32'])
    else:
        o['overpayment'] = int(af.get('overpayment', 0))
    return o


def compute_il_amendment(original_cfg, amended_cfg, year, taxpayer_name=None):
    """Turn an originally-filed config and a corrected config into the Form
    IL-1040-X model.

    Unlike the federal 1040-X (three columns), IL-1040-X shows a single
    *corrected figures* column and reconciles it (Steps 9-10) against what was
    already paid/overpaid on the original IL return. Returns:
      {taxYear, lines:{id:value}, draw, amount_owed, refund,
       original_total_tax, corrected_total_tax, explanation}
    `draw` is the set of line ids that should be rendered (always-on spine +
    any nonzero optional lines)."""
    if year not in IL_TAX_RATE:
        raise ValueError(
            f"IL amendment supported for tax year(s) {sorted(IL_TAX_RATE)} only "
            f"(got {year}). Add year constants + a year-specific filler to extend.")

    fs = amended_cfg['filer']['filing_status']
    has_spouse = bool(amended_cfg.get('spouse'))

    fed_c = compute_individual_return(amended_cfg, year)
    corrected = compute_il_return(fed_c, amended_cfg.get('illinois'),
                                  year, fs, has_spouse)
    original = _resolve_il_as_filed(original_cfg, year, fs, has_spouse)

    lines = dict(corrected)

    # ── Step 9: corrected overpayment / underpayment ──
    L24 = corrected['24']
    L32 = corrected['32']
    L33 = (L32 - L24) if L32 > L24 else None          # adjusted overpayment
    L34 = (L24 - L32) if L24 > L32 else None          # adjusted underpayment

    # ── Step 10: adjusted refund or amount you owe ──
    L35 = int(original.get('overpayment', 0))         # overpayment on original
    # Line 36: overpayment, if Line 33 > Line 35
    L36 = (L33 - L35) if (L33 is not None and L33 > L35) else None
    L37 = L36 if L36 is not None else None            # amount refunded (all of it)
    L38 = 0 if L36 is not None else None              # applied to est tax (none)
    # Line 39 amount you owe (per the form's conditional text):
    if L33 is not None and L33 < L35:
        L39 = L35 - L33
    elif L34 is not None:
        L39 = L34 + L35
    else:                                             # 33 and 34 both blank
        L39 = L35
    L39 = max(0, L39)

    lines.update({'33': L33, '34': L34, '35': L35,
                  '36': L36, '37': L37, '38': L38, '39': L39})

    # ── Render policy: always-on spine + nonzero optional lines ──
    spine = {'1', '4', '9', '10a', '10', '11', '12', '14', '19', '23',
             '24', '32', '39'}
    draw = set(spine)
    for lid, val in lines.items():
        if val is not None and val != 0:
            draw.add(lid)

    if taxpayer_name is None:
        f = amended_cfg['filer']
        taxpayer_name = f"{f['first_name']} {f['last_name']}".strip()

    explanation = _il_explanation(taxpayer_name, year,
                                  original.get('total_tax', 0),
                                  corrected['total_tax'])

    return {
        'taxYear': year,
        'lines': lines,
        'draw': draw,
        'amount_owed': L39,
        'refund': (L37 or 0),
        'original_total_tax': int(original.get('total_tax', 0)),
        'corrected_total_tax': corrected['total_tax'],
        'explanation': explanation,
        '_corrected': corrected,
        '_original': original,
    }


def _il_explanation(taxpayer_name, year, original_tax, corrected_tax):
    """Auto-generate the Step 11D reason-for-amending narrative."""
    delta = corrected_tax - original_tax
    direction = 'reduced' if delta < 0 else ('increased' if delta > 0 else 'unchanged')
    return (
        f"Form IL-1040-X — Tax Year {year} — {taxpayer_name}. This amended "
        f"Illinois return reflects a corrected federal return: Schedule C was "
        f"reconstructed from complete books and records, lowering federal "
        f"adjusted gross income (IL-1040 Line 1), which flows through to "
        f"Illinois base income and tax. Illinois income tax {direction} from "
        f"${original_tax:,} to ${corrected_tax:,}. A copy of the amended "
        f"federal Form 1040-X is attached."
    )
