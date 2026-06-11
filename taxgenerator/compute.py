"""Tax computations: from a client config + year, compute every value
needed across Form 1040, Schedules 1/2/C/SE, and Form 8959.

Returns a flat dict that the form fillers can index by line.

Also provides `compute_amendment` — turns two computed returns (the
originally-filed and the corrected) into the Form 1040-X three-column model
(A = original, C = corrected, B = C - A)."""
from .tax_tables import (
    compute_federal_tax, get_std_deduction, get_addl_medicare_threshold,
    get_ss_wage_base,
)
from .config import has_schedule_c, get_year_data


def compute_schedule_c(year_data):
    """Sum up Schedule C expenses and net profit from the year's data."""
    sc = year_data.get('schedule_c', {})
    g = sc.get('gross_receipts', 0)
    returns = sc.get('returns_allowances', 0)
    cogs = sc.get('cogs', 0)
    other_inc = sc.get('other_income_business', 0)

    # Part II expenses (lines 8-26 + 27a + 27b)
    expense_lines = {
        'L8_advertising':        sc.get('advertising', 0),
        'L9_car_truck':          sc.get('car_truck', 0),
        'L10_commissions':       sc.get('commissions', 0),
        'L11_contract_labor':    sc.get('contract_labor', 0),
        'L12_depletion':         sc.get('depletion', 0),
        'L13_depreciation':      sc.get('depreciation', 0),
        'L14_employee_benefits': sc.get('employee_benefits', 0),
        'L15_insurance':         sc.get('insurance', 0),
        'L16a_interest_mortgage':sc.get('interest_mortgage', 0),
        'L16b_interest_other':   sc.get('interest_other', 0),
        'L17_legal_professional':sc.get('legal_professional', 0),
        'L18_office':            sc.get('office', 0),
        'L19_pension_profit_sharing': sc.get('pension_profit_sharing', 0),
        'L20a_rent_vehicles':    sc.get('rent_vehicles', 0),
        'L20b_rent_other':       sc.get('rent_other', 0),
        'L21_repairs':           sc.get('repairs', 0),
        'L22_supplies':          sc.get('supplies', 0),
        'L23_taxes_licenses':    sc.get('taxes_licenses', 0),
        'L24a_travel':           sc.get('travel', 0),
        'L24b_meals_50pct':      sc.get('meals_50pct', 0),
        'L25_utilities':         sc.get('utilities', 0),
        'L26_wages':             sc.get('wages', 0),
        'L27a_energy_efficient': sc.get('energy_efficient_deduction', 0),
    }

    part_v_items = sc.get('part_v_other', [])
    part_v_total = sum(it.get('amount', 0) for it in part_v_items)
    expense_lines['L27b_other_partv'] = part_v_total

    total_expenses = sum(expense_lines.values())
    home_office = sc.get('home_office_simplified', 0)

    gross_income = (g - returns - cogs) + other_inc
    tentative_profit = gross_income - total_expenses
    net_profit = tentative_profit - home_office

    return {
        'gross_receipts': g,
        'returns_allowances': returns,
        'cogs': cogs,
        'L3_subtract': g - returns,
        'L5_gross_profit': g - returns - cogs,
        'L6_other_income': other_inc,
        'L7_gross_income': gross_income,
        'expenses': expense_lines,
        'L28_total_expenses': total_expenses,
        'L29_tentative_profit': tentative_profit,
        'L30_home_office': home_office,
        'L31_net_profit': net_profit,
        'part_v_items': part_v_items,
        'part_v_total': part_v_total,
    }


def compute_se_tax(net_profit, year):
    """Compute Schedule SE: SS tax (12.4% capped), Medicare (2.9%), total,
    and half-SE deduction."""
    se_earn = round(net_profit * 0.9235)
    ss_base = get_ss_wage_base(year)
    ss_taxable = min(se_earn, ss_base)
    ss_tax = round(ss_taxable * 0.124)
    med_tax = round(se_earn * 0.029)
    se_total = ss_tax + med_tax
    half_se = round(se_total / 2)
    return {
        'L2_net_profit': net_profit,
        'L3_combine': net_profit,
        'L4a_x_92_35':  se_earn,
        'L4c_combine':  se_earn,
        'L6_se_earnings': se_earn,
        'L7_wage_base': ss_base,
        'L8d_ss_taxable': 0,
        'L9_subtract': ss_base,
        'L10_ss_tax': ss_tax,
        'L11_med_tax': med_tax,
        'L12_se_total': se_total,
        'L13_half_se': half_se,
    }


def compute_form_8959(se_earnings, w2_medicare_wages, filing_status):
    """Form 8959: 0.9% additional Medicare tax."""
    threshold = get_addl_medicare_threshold(filing_status)
    # Lines 1-7 (W-2 Medicare wages — for now assumed 0)
    line4 = w2_medicare_wages
    line5 = threshold
    line6 = max(0, line4 - line5)
    line7 = round(line6 * 0.009)
    # Lines 8-13 (SE income)
    line8 = se_earnings
    line9 = threshold
    line10 = line4
    line11 = max(0, line9 - line10)
    line12 = max(0, line8 - line11)
    line13 = round(line12 * 0.009)
    line18 = line7 + line13
    return {
        'L4_add_1_3': line4,
        'L5_threshold_wages': line5,
        'L7_addl_med_wages': line7,
        'L8_se_earnings': line8,
        'L9_threshold': line9,
        'L10_line4': line10,
        'L11_subtract': line11,
        'L12_excess': line12,
        'L13_addl_med_se': line13,
        'L18_total': line18,
        'threshold': threshold,
        'addl_med': line18,
    }


def compute_individual_return(cfg, year):
    """Top-level: compute every value needed to fill the federal packet."""
    fs = cfg['filer']['filing_status']
    year_data = get_year_data(cfg, year)
    other_income = cfg.get('other_income', {})
    payments = cfg.get('payments', {})

    # Schedule C net profit (if applicable)
    sch_c = compute_schedule_c(year_data) if has_schedule_c(cfg) else None
    net_profit = sch_c['L31_net_profit'] if sch_c else 0

    # Schedule SE
    se = compute_se_tax(net_profit, year) if net_profit > 0 else None
    se_total = se['L12_se_total'] if se else 0
    half_se = se['L13_half_se'] if se else 0
    se_earnings = se['L6_se_earnings'] if se else 0

    # Form 8959 (Additional Medicare)
    f8959 = compute_form_8959(se_earnings, other_income.get('w2_wages', 0), fs)
    addl_med = f8959['L18_total']

    # 1040 income section
    w2 = other_income.get('w2_wages', 0)
    int_taxable = other_income.get('taxable_interest', 0)
    div_ord = other_income.get('ordinary_dividends', 0)
    ira_taxable = other_income.get('ira_taxable', 0)
    pen_taxable = other_income.get('pensions_taxable', 0)
    ss_taxable = other_income.get('social_security_taxable', 0)
    cap_gain = other_income.get('capital_gain_loss', 0)

    # Schedule 1 line 3 = business income (sch C net profit)
    sch1_l10_addl = net_profit  # for solo Sch C, only Line 3 contributes

    # 1040 Line 8 = additional income from Sch 1 Line 10
    line8_addl = sch1_l10_addl
    # Line 9 = total income
    line9_total = w2 + int_taxable + div_ord + ira_taxable + pen_taxable + ss_taxable + cap_gain + line8_addl
    # Line 10 = adjustments (Sch 1 Line 26 — for solo Sch C this is just half-SE)
    line10_adj = half_se
    # Line 11a = AGI
    line11_agi = line9_total - line10_adj

    # Standard vs itemized deduction
    if payments.get('use_itemized_deductions'):
        deduction = payments.get('itemized_deductions_total', 0)
    else:
        deduction = get_std_deduction(year, fs)
    line12_std_ded = deduction
    line13_qbi = payments.get('qbi_deduction', 0)
    line13b_addl = payments.get('additional_deductions_sch1a', 0)
    line14_add = line12_std_ded + line13_qbi + line13b_addl
    line15_taxable = max(0, line11_agi - line14_add)

    # Tax
    fed_tax = compute_federal_tax(line15_taxable, year, fs)

    # Schedule 2
    sch2_total = se_total + addl_med
    total_tax = fed_tax + sch2_total

    # Payments / refund
    fed_withholding = payments.get('federal_withholding', 0)
    estimated = payments.get('estimated_payments', 0)
    total_payments = fed_withholding + estimated
    overpaid = max(0, total_payments - total_tax)
    amount_owed = max(0, total_tax - total_payments)

    return {
        'taxYear': year,
        'filing_status': fs,
        'sch_c': sch_c,
        'se': se,
        'f8959': f8959,
        # Form 1040 page 1
        'w2_wages': w2,
        'L1z_wages': w2,
        'L2b_interest': int_taxable,
        'L3b_dividends': div_ord,
        'L4b_ira_taxable': ira_taxable,
        'L5b_pensions_taxable': pen_taxable,
        'L6b_ss_taxable': ss_taxable,
        'L7_capital_gain': cap_gain,
        'L8_addl_income': line8_addl,
        'L9_total_income': line9_total,
        'L10_adjustments': line10_adj,
        'L11a_agi': line11_agi,
        # Form 1040 page 2
        'L12_std_ded': line12_std_ded,
        'L13a_qbi': line13_qbi,
        'L13b_addl_deds': line13b_addl,
        'L14_add': line14_add,
        'L15_taxable': line15_taxable,
        'L16_fed_tax': fed_tax,
        'L23_other_taxes': sch2_total,
        'L24_total_tax': total_tax,
        'L33_total_payments': total_payments,
        'L34_overpaid': overpaid,
        'L37_amount_owed': amount_owed,
        # Convenience aliases used by older form fillers
        'net_profit': net_profit,
        'se_earn': se_earnings,
        'ss_tax': se['L10_ss_tax'] if se else 0,
        'med_tax': se['L11_med_tax'] if se else 0,
        'se_total': se_total,
        'half_se': half_se,
        'agi': line11_agi,
        'std_ded': line12_std_ded,
        'taxable': line15_taxable,
        'fed_tax': fed_tax,
        'sch2_total': sch2_total,
        'total_tax': total_tax,
        'addl_med': addl_med,
        'threshold': f8959['threshold'],
        'ss_base': se['L7_wage_base'] if se else 0,
        # Pass-through original schedule_c expenses (for fill_1040sc compat)
        'gross': sch_c['gross_receipts'] if sch_c else 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Form 1040-X amendment model
# ─────────────────────────────────────────────────────────────────────────────

# 1040-X (Rev. 12-2025) Part I line labels — used for the Part II explanation.
_AMEND_LINE_LABELS = {
    '1': 'Adjusted gross income',
    '2': 'Deduction (standard or itemized)',
    '3': 'Subtract line 2 from line 1',
    '4a': 'Qualified business income deduction',
    '4b': 'Additional deductions (Schedule 1-A)',
    '5': 'Taxable income',
    '6': 'Tax',
    '7': 'Nonrefundable credits',
    '8': 'Subtract line 7 from line 6',
    '10': 'Other taxes (incl. self-employment tax)',
    '11': 'Total tax',
    '12': 'Federal income tax withheld',
    '13': 'Estimated tax payments',
    '14': 'Earned income credit (EIC)',
    '15': 'Refundable credits',
    '16': 'Amount paid with original return / after filing',
    '17': 'Total payments',
    '18': 'Overpayment on original return',
    '19': 'Subtract line 18 from line 17',
    '20': 'Amount you owe',
    '21': 'Overpayment on this amended return',
    '22': 'Refund',
}

# Core income/tax grid lines — always rendered in columns A and C (incl. -0-).
_AMEND_CORE_LINES = {'1', '2', '3', '4a', '4b', '5', '6', '8', '10', '11'}
# Credit/payment lines — rendered only when nonzero.
_AMEND_OPTIONAL_LINES = {'7', '12', '13', '14', '15'}


def _amend_line(line_id, a, c, core):
    """Build one three-column row, applying the render policy.

    core=True  → always show A and C (a meaningful 0/-0- on the grid),
                 show B only when there's an actual change.
    core=False → show A/C only when nonzero, B only when changed.
    Cells that should not be drawn are set to None."""
    a = int(round(a))
    c = int(round(c))
    delta = c - a
    if core:
        av, cv = a, c
    else:
        av = a if a != 0 else None
        cv = c if c != 0 else None
    bv = delta if delta != 0 else None
    return {
        'line': line_id,
        'label': _AMEND_LINE_LABELS.get(line_id, ''),
        'a': av, 'b': bv, 'c': cv,
    }


def _amend_explanation(taxpayer_name, year, changed):
    """Auto-generate the Part II (Explanation of Changes) narrative from the
    set of non-zero column-B lines. Factual and line-referenced."""
    head = (
        f"Form 1040-X — Tax Year {year} — {taxpayer_name}. "
        "The originally-filed return understated allowable Schedule C business "
        "expenses. Schedule C has been reconstructed from complete books and "
        "records to capture ordinary and necessary business expenses not "
        "reported on the original return (e.g., advertising, car and truck, "
        "contract labor, legal and professional services, supplies, taxes and "
        "licenses, travel, meals, and other expenses). Net profit, "
        "self-employment tax, and the qualified business income deduction were "
        "recomputed accordingly. Resulting changes:"
    )
    # Pure-subtraction/derived lines add no information to the narrative.
    _derived = {'3', '8'}

    def _dollar(n):
        return f"-${abs(n):,}" if n < 0 else f"${n:,}"

    bullets = []
    for ln in changed:
        if (ln['b'] is None or ln['line'] in _derived
                or ln['line'] not in _AMEND_LINE_LABELS):
            continue
        direction = 'increased' if ln['b'] > 0 else 'decreased'
        if ln['a'] is not None and ln['c'] is not None:
            bullets.append(
                f"- Line {ln['line']} ({ln['label']}) {direction} by "
                f"{_dollar(abs(ln['b']))} (from {_dollar(ln['a'])} to {_dollar(ln['c'])}).")
        else:
            bullets.append(
                f"- Line {ln['line']} ({ln['label']}) {direction} by {_dollar(abs(ln['b']))}.")
    return head + "\n" + "\n".join(bullets)


# Maps `as_filed` block keys to the internal computed-return keys they override.
_AS_FILED_FIELD_MAP = {
    'agi':                   'L11a_agi',
    'deduction':             'L12_std_ded',
    'qbi_deduction':         'L13a_qbi',
    'additional_deductions': 'L13b_addl_deds',
    'taxable_income':        'L15_taxable',
    'tax':                   'L16_fed_tax',
    'nonrefundable_credits': 'L_nonref_credits',
    'other_taxes':           'L23_other_taxes',
    'total_tax':             'L24_total_tax',
    'overpayment':           'L34_overpaid',
}
_AS_FILED_PAYMENT_KEYS = ('federal_withholding', 'estimated_payments',
                          'earned_income_credit')


def _resolve_as_filed(original_cfg, year):
    """Resolve the column-A figures for Form 1040-X — the return *as actually
    filed*.

    Column A should architecturally reflect what was filed, which can differ
    from a fresh recompute: the original return may have used a different method
    or contained an error a recompute won't reproduce. If `original_cfg` carries
    an `as_filed` block, those figures take precedence; any field it omits falls
    back to recomputing the original return.

    Returns (a, pay_a): a is the computed-return-shaped dict for column A, and
    pay_a is the resolved payments dict for the payment lines."""
    recomputed = compute_individual_return(original_cfg, year)
    af = original_cfg.get('as_filed') or {}

    a = dict(recomputed)
    for af_key, internal_key in _AS_FILED_FIELD_MAP.items():
        if af_key in af:
            a[internal_key] = af[af_key]

    pay_a = dict(original_cfg.get('payments', {}))
    for k in _AS_FILED_PAYMENT_KEYS:
        if k in af:
            pay_a[k] = af[k]

    return a, pay_a


def compute_amendment(original_cfg, amended_cfg, year, taxpayer_name=None):
    """Turn an originally-filed config and a corrected config into the
    Form 1040-X three-column model.

    Returns a dict:
      {taxYear, tax_method, lines:[{line,label,a,b,c}, ...],
       amount_owed_corrected, refund_due, explanation}
    Column A = original return (as filed — see `_resolve_as_filed`),
    column C = corrected return, B = C - A.
    Reconciliation lines 16-22 are column-C only."""
    a, pay_a = _resolve_as_filed(original_cfg, year)
    c = compute_individual_return(amended_cfg, year)

    if taxpayer_name is None:
        f = amended_cfg['filer']
        taxpayer_name = f"{f['first_name']} {f['last_name']}".strip()

    pay_c = amended_cfg.get('payments', {})

    # Nonrefundable credits (line 7). Column A may carry a filed value via the
    # as_filed block; the corrected path has no such concept yet.
    a_nonref = a.get('L_nonref_credits', 0)
    c_nonref = 0

    lines = []

    # ── Part I grid: lines 1-15 (columns A/B/C) ──
    # Line 3 = AGI - deduction (literal subtraction; may be negative).
    grid = [
        ('1',  a['L11a_agi'],          c['L11a_agi']),
        ('2',  a['L12_std_ded'],       c['L12_std_ded']),
        ('3',  a['L11a_agi'] - a['L12_std_ded'], c['L11a_agi'] - c['L12_std_ded']),
        ('4a', a['L13a_qbi'],          c['L13a_qbi']),
        ('4b', a['L13b_addl_deds'],    c['L13b_addl_deds']),
        ('5',  a['L15_taxable'],       c['L15_taxable']),
        ('6',  a['L16_fed_tax'],       c['L16_fed_tax']),
        ('7',  a_nonref,               c_nonref),
        ('8',  a['L16_fed_tax'] - a_nonref, c['L16_fed_tax'] - c_nonref),  # line 6 - line 7
        ('10', a['L23_other_taxes'],   c['L23_other_taxes']),
        ('11', a['L24_total_tax'],     c['L24_total_tax']),
        ('12', pay_a.get('federal_withholding', 0), pay_c.get('federal_withholding', 0)),
        ('13', pay_a.get('estimated_payments', 0),  pay_c.get('estimated_payments', 0)),
        ('14', pay_a.get('earned_income_credit', 0), pay_c.get('earned_income_credit', 0)),
        ('15', 0,                      0),
    ]
    for line_id, a_val, c_val in grid:
        lines.append(_amend_line(line_id, a_val, c_val,
                                 core=line_id in _AMEND_CORE_LINES))

    # ── Reconciliation: lines 16-22 (column C only) ──
    # Line 16: amounts already paid toward this year (with/after the original
    # return). Defaults to 0 — the original balance for the test case was unpaid.
    line16_c = pay_c.get('amount_paid_with_return', 0)
    line12_15_c = (pay_c.get('federal_withholding', 0)
                   + pay_c.get('estimated_payments', 0)
                   + pay_c.get('earned_income_credit', 0))
    line17_c = line12_15_c + line16_c          # total payments
    line18_c = a['L34_overpaid']               # overpayment shown on original return (as filed)
    line19_c = line17_c - line18_c
    corrected_total_tax = c['L24_total_tax']
    line20_c = max(0, corrected_total_tax - line19_c)   # amount you owe
    line21_c = max(0, line19_c - corrected_total_tax)   # overpaid on amendment
    line22_c = line21_c                                 # refund to taxpayer

    def col_c_only(line_id, val, force=False):
        return {'line': line_id, 'label': _AMEND_LINE_LABELS.get(line_id, ''),
                'a': None, 'b': None,
                'c': int(round(val)) if (val != 0 or force) else None}

    lines.append(col_c_only('16', line16_c))
    lines.append(col_c_only('17', line17_c))
    lines.append(col_c_only('18', line18_c))
    lines.append(col_c_only('19', line19_c))
    lines.append(col_c_only('20', line20_c, force=(line20_c > 0)))
    lines.append(col_c_only('21', line21_c))
    lines.append(col_c_only('22', line22_c))

    changed = [ln for ln in lines if ln.get('b') is not None]
    explanation = _amend_explanation(taxpayer_name, year, changed)

    return {
        'taxYear': year,
        'tax_method': 'Tax Table',
        'lines': lines,
        'amount_owed_corrected': line20_c,
        'refund_due': line22_c,
        'explanation': explanation,
        # raw returns, for the attached corrected schedules
        '_original': a,
        '_corrected': c,
    }
