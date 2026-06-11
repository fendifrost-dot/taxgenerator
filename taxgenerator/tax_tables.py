"""IRS tax tables (brackets, std deductions, SS wage base, AMT thresholds)
for tax years 2024 and 2025, parameterized by filing status.

Sources:
- Rev. Proc. 2023-34 (2024 inflation adjustments)
- Rev. Proc. 2024-40 (2025 inflation adjustments)
- SSA wage base announcements
"""

# ─────────────────────────────────────────────────────────────────────────────
# Filing statuses
# ─────────────────────────────────────────────────────────────────────────────
FILING_STATUSES = ('single', 'mfj', 'mfs', 'hoh', 'qss')

def normalize_filing_status(s):
    s = (s or '').lower().strip()
    aliases = {
        'single': 'single',
        'married_filing_jointly': 'mfj', 'mfj': 'mfj', 'joint': 'mfj',
        'married_filing_separately': 'mfs', 'mfs': 'mfs', 'separate': 'mfs',
        'head_of_household': 'hoh', 'hoh': 'hoh',
        'qualifying_surviving_spouse': 'qss', 'qss': 'qss',
        'qualifying_widow': 'qss', 'widow': 'qss',
    }
    if s not in aliases:
        raise ValueError(f"Unknown filing status: {s!r}. Expected one of {FILING_STATUSES}")
    return aliases[s]


# ─────────────────────────────────────────────────────────────────────────────
# 2024 tax brackets — list of (lower_threshold, marginal_rate)
# ─────────────────────────────────────────────────────────────────────────────
BRACKETS_2024 = {
    'single': [(0, 0.10), (11600, 0.12), (47150, 0.22), (100525, 0.24),
               (191950, 0.32), (243725, 0.35), (609350, 0.37)],
    'mfj':    [(0, 0.10), (23200, 0.12), (94300, 0.22), (201050, 0.24),
               (383900, 0.32), (487450, 0.35), (731200, 0.37)],
    'mfs':    [(0, 0.10), (11600, 0.12), (47150, 0.22), (100525, 0.24),
               (191950, 0.32), (243725, 0.35), (365600, 0.37)],
    'hoh':    [(0, 0.10), (16550, 0.12), (63100, 0.22), (100500, 0.24),
               (191950, 0.32), (243700, 0.35), (609350, 0.37)],
    'qss':    [(0, 0.10), (23200, 0.12), (94300, 0.22), (201050, 0.24),
               (383900, 0.32), (487450, 0.35), (731200, 0.37)],
}

BRACKETS_2025 = {
    'single': [(0, 0.10), (11925, 0.12), (48475, 0.22), (103350, 0.24),
               (197300, 0.32), (250525, 0.35), (626350, 0.37)],
    'mfj':    [(0, 0.10), (23850, 0.12), (96950, 0.22), (206700, 0.24),
               (394600, 0.32), (501050, 0.35), (751600, 0.37)],
    'mfs':    [(0, 0.10), (11925, 0.12), (48475, 0.22), (103350, 0.24),
               (197300, 0.32), (250525, 0.35), (375800, 0.37)],
    'hoh':    [(0, 0.10), (17000, 0.12), (64850, 0.22), (103350, 0.24),
               (197300, 0.32), (250500, 0.35), (626350, 0.37)],
    'qss':    [(0, 0.10), (23850, 0.12), (96950, 0.22), (206700, 0.24),
               (394600, 0.32), (501050, 0.35), (751600, 0.37)],
}

BRACKETS = {2024: BRACKETS_2024, 2025: BRACKETS_2025}


# ─────────────────────────────────────────────────────────────────────────────
# Standard deductions (base — does not include age 65/blind add-ons)
# ─────────────────────────────────────────────────────────────────────────────
STD_DEDUCTION = {
    2024: {'single': 14600, 'mfj': 29200, 'mfs': 14600, 'hoh': 21900, 'qss': 29200},
    2025: {'single': 15000, 'mfj': 30000, 'mfs': 15000, 'hoh': 22500, 'qss': 30000},
}

# Age-65 / blind additional std deduction
STD_DEDUCTION_ADDITIONAL = {
    2024: {'single': 1950, 'mfj': 1550, 'mfs': 1550, 'hoh': 1950, 'qss': 1550},
    2025: {'single': 2000, 'mfj': 1600, 'mfs': 1600, 'hoh': 2000, 'qss': 1600},
}


# ─────────────────────────────────────────────────────────────────────────────
# Social Security wage base (cap on 12.4% SS portion of SE tax)
# ─────────────────────────────────────────────────────────────────────────────
SS_WAGE_BASE = {2024: 168600, 2025: 176100}


# ─────────────────────────────────────────────────────────────────────────────
# Additional Medicare Tax thresholds (Form 8959) by filing status
# These are the income thresholds above which the 0.9% addl Medicare applies
# ─────────────────────────────────────────────────────────────────────────────
ADDL_MEDICARE_THRESHOLD = {
    'single': 200000,
    'mfj':    250000,
    'mfs':    125000,
    'hoh':    200000,
    'qss':    200000,
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
# The IRS Tax Table (1040 instructions) is mandatory for taxable income below
# $100,000; the Tax Computation Worksheet (bracket math) is used at or above it.
TAX_TABLE_CEILING = 100000


def _round_half_up(x):
    """Round to the nearest whole dollar, ties going up — the rounding the IRS
    uses to build the Tax Table. (Python's built-in round() is banker's
    rounding and would disagree on exact half-dollar amounts.)"""
    import math
    # round(x, 2) first scrubs binary-float noise (e.g. 5.499999996 → 5.5) so a
    # true tie lands on .5 before we push it up.
    return int(math.floor(round(x, 2) + 0.5))


def _bracket_tax(taxable_income, year, fs):
    """Federal income tax from the rate schedule (Tax Computation Worksheet)."""
    brackets = BRACKETS[year][fs]
    tax = 0.0
    for i, (thr, rate) in enumerate(brackets):
        next_thr = brackets[i+1][0] if i+1 < len(brackets) else float('inf')
        if taxable_income > thr:
            tax += (min(taxable_income, next_thr) - thr) * rate
    return tax


def _tax_table_lookup(taxable_income, year, fs):
    """Replicate the IRS Tax Table for taxable income under $100,000.

    The table taxes the *midpoint* of the row the income falls in, then rounds
    to the nearest dollar (ties up). Row widths:
      - income < $25:        special small rows ($0-5, $5-15, $15-25)
      - $25 ≤ income < $3k:  $25-wide rows
      - $3k ≤ income < $100k: $50-wide rows
    Applying the rate schedule to each row midpoint reproduces the published
    table cell exactly, so under-$100k figures tie to the IRS to the dollar."""
    ti = int(taxable_income)
    if ti < 0:
        ti = 0
    if ti < 5:
        mid = 2.5
    elif ti < 15:
        mid = 10.0
    elif ti < 25:
        mid = 20.0
    elif ti < 3000:
        mid = (ti // 25) * 25 + 12.5
    else:
        mid = (ti // 50) * 50 + 25.0
    return _round_half_up(_bracket_tax(mid, year, fs))


def compute_federal_tax(taxable_income, year, filing_status):
    """Compute federal income tax.

    Uses the IRS Tax Table (midpoint method) for taxable income below $100,000
    so the figure ties to the IRS exactly, and the rate-schedule bracket math at
    or above $100,000 (where the Tax Table no longer applies)."""
    fs = normalize_filing_status(filing_status)
    if taxable_income < TAX_TABLE_CEILING:
        return _tax_table_lookup(taxable_income, year, fs)
    return round(_bracket_tax(taxable_income, year, fs))


def get_std_deduction(year, filing_status, age_65_or_older=False, blind=False,
                      spouse_age_65_or_older=False, spouse_blind=False):
    """Return the standard deduction for the given filing status, including
    age-65/blind additions."""
    fs = normalize_filing_status(filing_status)
    base = STD_DEDUCTION[year][fs]
    add = STD_DEDUCTION_ADDITIONAL[year][fs]
    extras = 0
    if age_65_or_older:
        extras += add
    if blind:
        extras += add
    if fs in ('mfj', 'qss'):
        if spouse_age_65_or_older:
            extras += add
        if spouse_blind:
            extras += add
    return base + extras


def get_addl_medicare_threshold(filing_status):
    return ADDL_MEDICARE_THRESHOLD[normalize_filing_status(filing_status)]


def get_ss_wage_base(year):
    return SS_WAGE_BASE[year]
