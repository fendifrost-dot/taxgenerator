"""
Direct Python pipeline: fill the 6 official IRS PDFs (Form 1040, Sch 1, Sch 2,
Sch C, Sch SE, Form 8959) with Pasta Pals' values using EXACT rect-based text
overlay derived from each PDF's AcroForm widget rectangles.

Each value is centered vertically inside its widget rect using
cap-height-aware baseline math, so values land precisely in their boxes
on every form (no surface-level Y guessing).

Output: Pasta_Pals_{year}_RETURN.pdf with mail-ready filled forms.
"""
import json
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, ArrayObject
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

def stringWidthH(text, font_size):
    """Helper: Helvetica width."""
    return stringWidth(str(text), 'Helvetica', font_size)

REPO = Path(__file__).parent.parent
FORMS = REPO / 'public' / 'irs-forms'
OUT_DIR = REPO / 'dist'

# ─────────────────────────────────────────────────────────────────────────────
# Engine flags (per ChatGPT architecture critique)
# ─────────────────────────────────────────────────────────────────────────────
DEBUG_FIELDS = False   # When True, draws every rect outline + line key
WARN_OVERFLOW = True   # Print a warning when a drawn value overflows its rect
_OVERFLOW_LOG = []

# ─────────────────────────────────────────────────────────────────────────────
# Pasta Pals fixed identity
# ─────────────────────────────────────────────────────────────────────────────
TAXPAYER_NAME = 'Jenelle Alexandra Elpedes'
TAXPAYER_FIRST = 'Jenelle Alexandra'
TAXPAYER_LAST = 'Elpedes'
TAXPAYER_SSN = '594-63-6983'
HOME_ADDRESS = '2141 W Madison Street'
HOME_CITY = 'Phoenix'
HOME_STATE = 'AZ'
HOME_ZIP = '85009-5212'
OCCUPATION = 'Self-employed designer / consultant'

ENTITY_NAME = 'Pasta Pals LLC'
EIN = '41-3677262'
BIZ_ADDRESS = '2828 N Central Ave Ste 1000'
BIZ_CSZ = 'Phoenix, AZ 85004'
PRINCIPAL_BUSINESS = 'Design and consulting services'
NAICS_CODE = '541430'
# Schedule C questions I/J (1099). Defaults preserve the frozen Pasta Pals output;
# forms._identity_from_config overrides these per client config.
MADE_PAYMENTS_1099 = 'yes'
FILED_1099S = 'no'


# ─────────────────────────────────────────────────────────────────────────────
# Per-year financials + tax computation
# ─────────────────────────────────────────────────────────────────────────────
def compute_year(taxYear):
    """Return all the values needed across all 6 forms."""
    if taxYear == 2024:
        gross = 1_500_000
        adv = 120_000
        contractLabor = 250_000
        depreciation = 30_000
        insurance = 15_000
        legalProf = 40_000
        rent = 24_000
        supplies = 5_000
        travel = 18_000
        meals50 = 6_000
        utilities = 6_000
        partV_software = 45_000
        partV_education = 10_000
        partV_mailbox_az = 228
        partV_mailbox_il = 228
        partV_domain = 12
        partV_misc = 25_000
        ss_base = 168_600
        std_ded = 14_600
        brackets = [(0, 0.10), (11600, 0.12), (47150, 0.22), (100525, 0.24),
                    (191950, 0.32), (243725, 0.35), (609350, 0.37)]
    else:  # 2025
        gross = 1_580_000
        adv = 160_000
        contractLabor = 320_000
        depreciation = 25_000
        insurance = 20_000
        legalProf = 50_000
        rent = 30_000
        supplies = 7_000
        travel = 22_000
        meals50 = 6_500
        utilities = 8_000
        partV_software = 55_000
        partV_education = 10_000
        partV_mailbox_az = 228
        partV_mailbox_il = 228
        partV_domain = 12
        partV_misc = 5_000
        ss_base = 176_100
        std_ded = 15_000
        brackets = [(0, 0.10), (11925, 0.12), (48475, 0.22), (103350, 0.24),
                    (197300, 0.32), (250525, 0.35), (626350, 0.37)]

    partV_total = (partV_software + partV_education + partV_mailbox_az
                    + partV_mailbox_il + partV_domain + partV_misc)
    total_expenses = (adv + contractLabor + depreciation + insurance + legalProf
                       + rent + supplies + travel + meals50 + utilities + partV_total)
    net_profit = gross - total_expenses

    # Schedule SE
    se_earn = round(net_profit * 0.9235)
    ss_tax = round(min(se_earn, ss_base) * 0.124)
    med_tax = round(se_earn * 0.029)
    se_total = ss_tax + med_tax
    half_se = round(se_total / 2)

    # Form 8959 Add'l Medicare
    threshold = 200_000  # single
    addl_med = round(max(0, se_earn - threshold) * 0.009)

    # Form 1040
    agi = net_profit - half_se
    taxable = max(0, agi - std_ded)
    fed_tax = 0
    for i, (thr, rate) in enumerate(brackets):
        next_thr = brackets[i+1][0] if i+1 < len(brackets) else float('inf')
        if taxable > thr:
            fed_tax += (min(taxable, next_thr) - thr) * rate
    fed_tax = round(fed_tax)
    sch2_total = se_total + addl_med
    total_tax = fed_tax + sch2_total

    return {
        'taxYear': taxYear, 'gross': gross,
        # Same shape the taxgenerator package hands the fillers, so this
        # standalone path and the config-driven one print identically.
        'sch_c_expenses': {
            'L8_advertising':     adv,
            'L11_contract_labor': contractLabor,
            'L13_depreciation':   depreciation,
            'L15_insurance':      insurance,
            'L17_legal_professional': legalProf,
            'L20b_rent_other':    rent,
            'L22_supplies':       supplies,
            'L24a_travel':        travel,
            'L24b_meals_50pct':   meals50,
            'L25_utilities':      utilities,
            'other_expenses_partv': partV_total,
        },
        'partV_items': [
            {'description': 'Software & tech subscriptions', 'amount': partV_software},
            {'description': 'Education / Conferences',       'amount': partV_education},
            {'description': 'AnytimeMailbox AZ',             'amount': partV_mailbox_az},
            {'description': 'AnytimeMailbox IL',             'amount': partV_mailbox_il},
            {'description': 'Domain (Namecheap)',            'amount': partV_domain},
            {'description': 'Misc / banking',                'amount': partV_misc},
        ],
        'partV_total': partV_total,
        'sch_c_income': {
            'gross_receipts': gross, 'returns_allowances': 0,
            'L3_subtract': gross, 'cogs': 0, 'L5_gross_profit': gross,
            'L6_other_income': 0, 'L7_gross_income': gross,
        },
        'total_expenses': total_expenses, 'net_profit': net_profit,
        # No home-office expense for this client, so line 29 == line 31.
        'tentative_profit': net_profit, 'home_office': 0,
        'vehicle': {},
        'se_earn': se_earn, 'ss_taxable': min(se_earn, ss_base),
        'ss_tax': ss_tax, 'med_tax': med_tax, 'se_total': se_total,
        'half_se': half_se,
        'threshold': threshold, 'addl_med': addl_med,
        'agi': agi, 'std_ded': std_ded, 'taxable': taxable,
        'fed_tax': fed_tax, 'sch2_total': sch2_total, 'total_tax': total_tax,
        'ss_base': ss_base,
    }


def fmt(n):
    """IRS-style integer with comma separators. Empty for zero/None."""
    if n is None or n == 0:
        return ''
    if n < 0:
        return f"({abs(int(round(n))):,})"
    return f"{int(round(n)):,}"


def fmt_force(n):
    """Like fmt but always shows zero as '0' instead of blank."""
    if n is None:
        return ''
    return f"{int(round(n)):,}"


# ─────────────────────────────────────────────────────────────────────────────
# Field-rect helpers (load .fields.json once per (form, year))
# ─────────────────────────────────────────────────────────────────────────────
_FIELD_CACHE = {}

def load_fields(form, year):
    """Returns dict {leaf_name: rect_dict} for a given form/year."""
    key = (form, year)
    if key in _FIELD_CACHE:
        return _FIELD_CACHE[key]
    f = json.load(open(FORMS / f'{form}_{year}.fields.json'))
    out = {}
    for k, fld in f['fields'].items():
        leaf = fld['id'].split('.')[-1].replace('[', '_').replace(']', '')
        out[leaf] = fld
    _FIELD_CACHE[key] = out
    return out


def baseline_for(rect, font_size=10):
    """Cap-height-aware vertical center inside a rect."""
    cap = font_size * 0.72
    return rect[1] + (rect[3] - rect[1] - cap) / 2


def draw_in(rect, value, x_pad=4, font_size=10, align='left', label=''):
    """Return (x, y, text, fs) tuple for drawing at center-vert of rect.
    Uses real Helvetica string-width metrics for right/center alignment.
    Logs an overflow warning when text width > rect width."""
    if value is None or value == '':
        return None
    text = str(value)
    text_w = stringWidth(text, 'Helvetica', font_size)
    rect_w = rect[2] - rect[0]
    if WARN_OVERFLOW and text_w > rect_w - 1:
        _OVERFLOW_LOG.append(f"OVERFLOW {label}: '{text}' width={text_w:.1f}pt > rect_w={rect_w:.1f}pt")
    if align == 'right':
        x = rect[2] - text_w - x_pad
    elif align == 'center':
        x = (rect[0] + rect[2]) / 2 - text_w / 2
    else:
        x = rect[0] + x_pad
    return (x, baseline_for(rect, font_size), text, font_size)


def debug_rect_draw(rect, label, color=(1, 0, 0)):
    """Return draw-stage tuples that outline a rect with its label.
    Only used when DEBUG_FIELDS is True."""
    # Encode as a special tuple so make_overlay can render outline
    return ('__DEBUG_RECT__', rect, label, color)


# ─────────────────────────────────────────────────────────────────────────────
# Per-form, per-year line→leaf maps (built from pdfplumber+rect matching).
# These fix the leaf-name drift between 2024 and 2025 forms.
# Lines we don't fill for Pasta Pals are omitted; only the lines we use are
# explicitly listed below for clarity.
# ─────────────────────────────────────────────────────────────────────────────
LINE_MAPS = {
    # ── Form 1040 ───────────────────────────────────────────────────────────
    ('1040', 2024): {
        # Page 1 right column
        'p1.L8':  'f1_53_0',   # Additional income from Sch 1 line 10
        'p1.L9':  'f1_54_0',   # Total income
        'p1.L10': 'f1_55_0',   # Adjustments from Sch 1 line 26
        'p1.L11': 'f1_56_0',   # AGI
        'p1.L12': 'f1_57_0',   # Standard deduction
        'p1.L13': 'f1_58_0',   # QBI deduction
        'p1.L14': 'f1_59_0',   # Add 12 + 13
        'p1.L15': 'f1_60_0',   # Taxable income
        # Page 2 right column
        'p2.L16': 'f2_02_0',   # Tax
        'p2.L17': 'f2_03_0',   # Sch 2 line 3
        'p2.L18': 'f2_04_0',   # Add 16 + 17
        'p2.L22': 'f2_08_0',   # Subtract 21 from 18
        'p2.L23': 'f2_09_0',   # Other taxes from Sch 2 line 21
        'p2.L24': 'f2_10_0',   # Total tax
        'p2.L37': 'f2_28_0',   # Amount you owe
    },
    # ('1040', 2025) intentionally absent. The 2025 Form 1040 is filled by
    # scripts/fill_1040_2025.py (FIELD_MAP_2025), because the 2025 page-1/2
    # layout is materially different: Line 11 splits into 11a (page 1) and 11b
    # (page 2), and page 2 carries 12e / 13a / 13b where 2024 had 12 / 13.
    # The entry that used to live here mapped p2.L11/L12/L13 onto the boxes
    # that are really 12e/13a/13b — dead code, but a trap for the next editor.
    # fill_1040() now refuses any year but 2024 rather than silently drawing
    # nothing, so a future caller cannot resurrect the mistake quietly.

    # ── Schedule 1 ──────────────────────────────────────────────────────────
    ('1040s1', 2024): {
        'p1.L1':  'f1_04_0',
        'p1.L3':  'f1_07_0',   # Business income (Sch C)
        'p1.L9':  'f1_37_0',   # Total other income (sum of 8a-z)
        'p1.L10': 'f1_38_0',   # Combine 1-7 + 9 = additional income
        'p2.L11': 'f2_01_0',
        'p2.L15': 'f2_05_0',   # Half-SE deduction
        # f2_22_0 is Line 24g (chaplains' 403(b) contributions), not Line 26.
        # The 2025 map already carried this fix; 2024 did not, so the Jacques
        # 2024 Schedule 1 printed the half-SE deduction on 24g and left the
        # total-adjustments line blank.
        'p2.L25': 'f2_30_0',   # Total other adjustments (24a-24z) (Y=300)
        'p2.L26': 'f2_31_0',   # Adjustments to income (Y=276)
    },
    ('1040s1', 2025): {
        'p1.L1':  'f1_04_0',
        'p1.L3':  'f1_07_0',
        'p1.L9':  'f1_37_0',
        'p1.L10': 'f1_38_0',
        'p2.L11': 'f2_01_0',
        'p2.L15': 'f2_05_0',
        # Line 26 (Total adjustments to income) is the LAST right-column money
        # field on page 2 — f2_30_0 at Y=240. (f2_22_0 is Line 24g, much higher.)
        'p2.L26': 'f2_30_0',
    },

    # ── Schedule 2 ──────────────────────────────────────────────────────────
    ('1040s2', 2024): {
        'p1.L4':  'f1_14_0',   # SE tax
        'p1.L11': 'f1_21_0',   # Additional Medicare Tax
        'p2.L18': 'f2_22_0',   # Add lines 17a-17z (or similar)
        'p2.L21': 'f2_25_0',   # Total other taxes
    },
    ('1040s2', 2025): {
        'p1.L4':  'f1_15_0',
        'p1.L11': 'f1_22_0',
        'p2.L18': 'f2_21_0',
        'p2.L21': 'f2_24_0',
    },

    # ── Form 8959 ───────────────────────────────────────────────────────────
    # 8959 lines 1-4: Medicare wages (all 0 for Pasta Pals)
    # Lines 7=addl med on wages, 8=SE earnings, 9=200K threshold,
    # 10=line 4 amount, 11=subtract 10 from 9, 12=excess SE over threshold,
    # 13=addl medicare on SE, 18=total addl medicare
    ('8959', 2024): {
        # f1_5_0 (Y=624) is Line 3 (wages from Form 8919); Line 4's box is
        # f1_6_0 at Y=612. Harmless so far only because lines 1-3 are 0 for
        # these clients and fmt(0) draws nothing.
        'p1.L4':  'f1_6_0',    # Add lines 1 through 3
        'p1.L7':  'f1_9_0',    # 0.9% × line 6 = 0
        'p1.L8':  'f1_10_0',   # SE earnings (Sch SE)
        'p1.L9':  'f1_11_0',   # 200,000 threshold (single)
        'p1.L10': 'f1_12_0',   # Line 4 amount
        'p1.L11': 'f1_13_0',   # Line 9 - Line 10
        'p1.L12': 'f1_14_0',   # SE excess over threshold
        'p1.L13': 'f1_15_0',   # 0.9% × Line 12
        'p1.L18': 'f1_20_0',   # Total addl Medicare
    },
    ('8959', 2025): {
        'p1.L4':  'f1_6_0',
        'p1.L7':  'f1_9_0',
        'p1.L8':  'f1_10_0',
        'p1.L9':  'f1_11_0',
        'p1.L10': 'f1_12_0',
        'p1.L11': 'f1_13_0',
        'p1.L12': 'f1_14_0',
        'p1.L13': 'f1_15_0',
        'p1.L18': 'f1_20_0',
    },

    # ── Schedule SE ─────────────────────────────────────────────────────────
    # 2024 and 2025 use same leaf names per inspection
    ('1040sse', 2024): {
        'p1.L2':   'f1_5_0',    # Net profit Sch C
        'p1.L3':   'f1_6_0',    # Combine
        'p1.L4a':  'f1_7_0',    # × 92.35%
        'p1.L4c':  'f1_9_0',    # Combine
        'p1.L6':   'f1_12_0',   # SE earnings
        # L7 SS wage base PRE-PRINTED on form — do not draw
        'p1.L9':   'f1_18_0',   # Subtract 8d from 7
        'p1.L10':  'f1_19_0',   # SS tax (12.4%)
        'p1.L11':  'f1_20_0',   # Medicare (2.9%)
        'p1.L12':  'f1_21_0',   # Total SE tax
        'p1.L13':  'f1_22_0',   # Half-SE deduction
    },
    ('1040sse', 2025): {
        'p1.L2':   'f1_5_0',
        'p1.L3':   'f1_6_0',
        'p1.L4a':  'f1_7_0',
        'p1.L4c':  'f1_9_0',
        'p1.L6':   'f1_12_0',
        'p1.L9':   'f1_18_0',
        'p1.L10':  'f1_19_0',
        'p1.L11':  'f1_20_0',
        'p1.L12':  'f1_21_0',
        'p1.L13':  'f1_22_0',
    },

    # ── Schedule C ──────────────────────────────────────────────────────────
    # Sch C right-column money fields (X=475) for income lines 1-7 and
    # tentative profit lines on page 1. Verified by inspecting rects.
    ('1040sc', 2024): {
        # Header text (left/middle column)
        'p1.NAME':  'f1_1_0',  # Name proprietor
        'p1.PB':    'f1_3_0',  # Principal business (Line A)
        'p1.BIZ':   'f1_5_0',  # Business name (Line C)
        'p1.ADDR':  'f1_7_0',  # Line E address
        'p1.CSZ':   'f1_8_0',  # City/state/zip
        # Income (right column X≈475)
        'p1.L1':    'f1_10_0', # Gross receipts
        'p1.L2':    'f1_11_0', # Returns
        'p1.L3':    'f1_12_0', # 1 - 2
        'p1.L4':    'f1_13_0', # COGS
        'p1.L5':    'f1_14_0', # Gross profit
        'p1.L6':    'f1_15_0', # Other income
        'p1.L7':    'f1_16_0', # Gross income (5+6)
        # Expenses LEFT column (X≈194)
        'p1.L8':    'f1_17_0', # Advertising
        'p1.L9':    'f1_18_0', # Car/truck
        'p1.L10':   'f1_19_0', # Commissions
        'p1.L11':   'f1_20_0', # Contract labor
        'p1.L12':   'f1_21_0', # Depletion
        'p1.L13':   'f1_22_0', # Depreciation
        'p1.L14':   'f1_23_0', # Employee benefits
        'p1.L15':   'f1_24_0', # Insurance
        'p1.L16a':  'f1_25_0', # Mortgage interest
        'p1.L16b':  'f1_26_0', # Other interest
        'p1.L17':   'f1_27_0', # Legal/professional
        # Expenses RIGHT column (X≈475)
        'p1.L18':   'f1_28_0', # Office
        'p1.L19':   'f1_29_0', # Pension
        'p1.L20a':  'f1_30_0', # Rent vehicles
        'p1.L20b':  'f1_31_0', # Rent other
        'p1.L21':   'f1_32_0', # Repairs
        'p1.L22':   'f1_33_0', # Supplies
        'p1.L23':   'f1_34_0', # Taxes/licenses
        'p1.L24a':  'f1_35_0', # Travel
        'p1.L24b':  'f1_36_0', # Meals
        'p1.L25':   'f1_37_0', # Utilities
        'p1.L26':   'f1_38_0', # Wages
        'p1.L27a':  'f1_39_0', # Energy efficient (2024 may differ)
        'p1.L27b':  'f1_40_0', # Other from Part V
        # Totals
        'p1.L28':   'f1_41_0',
        'p1.L29':   'f1_42_0',
        # f1_43 (Y=180, X=352) and f1_44 (Y=168, X=237) are the Line 30
        # simplified-method SQUARE FOOTAGE boxes (a) home / (b) business use —
        # NOT money fields. Line 30's amount is f1_45 and Line 31's is f1_46,
        # both in the right money column, exactly as in 2025. Mapping L31 to
        # f1_44 printed net profit into the square-footage box; that is what
        # the IRS read as a blank line 31 on the Jacques 2024 1040-X.
        'p1.L30':   'f1_45_0',   # Home-office amount (Y=156, right column)
        'p1.L31':   'f1_46_0',   # Net profit (Y=120, right column)
        # Page 2 — Part IV vehicle info (required when L9 > 0 and no Form 4562)
        'p2.L43_month': 'f2_9_0',    # Date placed in service — month (Y=420)
        'p2.L43_day':   'f2_10_0',   # ...day
        'p2.L43_year':  'f2_11_0',   # ...year
        'p2.L44a':      'f2_12_0',   # Business miles (Y=372)
        'p2.L44b':      'f2_13_0',   # Commuting miles
        'p2.L44c':      'f2_14_0',   # Other miles
        'p2.L45_yes':   'c2_5_0',    # Vehicle available off-duty? (Y=349.8)
        'p2.L45_no':    'c2_5_1',
        'p2.L46_yes':   'c2_6_0',    # Another vehicle available? (Y=325.8)
        'p2.L46_no':    'c2_6_1',
        'p2.L47a_yes':  'c2_7_0',    # Evidence to support deduction? (Y=301.8)
        'p2.L47a_no':   'c2_7_1',
        'p2.L47b_yes':  'c2_8_0',    # Is the evidence written? (Y=277.8)
        'p2.L47b_no':   'c2_8_1',
        # Page 2 — Part V total. The old code searched page 2 heuristically for
        # a rect with x>460 and 380<y<440; no 2024 widget matches, so line 48
        # was never printed at all. It is f2_33_0 at Y=36.
        'p2.L48':   'f2_33_0',
    },
    ('1040sc', 2025): {
        'p1.NAME':  'f1_1_0',
        'p1.PB':    'f1_3_0',
        'p1.BIZ':   'f1_5_0',
        'p1.ADDR':  'f1_7_0',
        'p1.CSZ':   'f1_8_0',
        'p1.L1':    'f1_10_0',
        'p1.L2':    'f1_11_0',
        'p1.L3':    'f1_12_0',
        'p1.L4':    'f1_13_0',
        'p1.L5':    'f1_14_0',
        'p1.L6':    'f1_15_0',
        'p1.L7':    'f1_16_0',
        'p1.L8':    'f1_17_0',
        'p1.L9':    'f1_18_0',
        'p1.L10':   'f1_19_0',
        'p1.L11':   'f1_20_0',
        'p1.L12':   'f1_21_0',
        'p1.L13':   'f1_22_0',
        'p1.L14':   'f1_23_0',
        'p1.L15':   'f1_24_0',
        'p1.L16a':  'f1_25_0',
        'p1.L16b':  'f1_26_0',
        'p1.L17':   'f1_27_0',
        'p1.L18':   'f1_28_0',
        'p1.L19':   'f1_29_0',
        'p1.L20a':  'f1_30_0',
        'p1.L20b':  'f1_31_0',
        'p1.L21':   'f1_32_0',
        'p1.L22':   'f1_33_0',
        'p1.L23':   'f1_34_0',
        'p1.L24a':  'f1_35_0',
        'p1.L24b':  'f1_36_0',
        'p1.L25':   'f1_37_0',
        'p1.L26':   'f1_38_0',
        # 2025 Sch C: L27a is HIGHER on page (energy efficient at Y=252),
        # L27b is BELOW it (Other from L48 at Y=240).
        'p1.L27a':  'f1_40_0',   # Energy efficient deduction (Y=252)
        'p1.L27b':  'f1_39_0',   # Other expenses (from line 48) (Y=240)
        'p1.L28':   'f1_41_0',   # Add 8 through 27b (Y=228)
        'p1.L29':   'f1_42_0',   # Tentative profit (Y=216)
        # f1_43, f1_44 are LEFT/MIDDLE-column simplified-method-worksheet
        # fields for Line 30 (home office) — leave unmapped (Pasta Pals has 0).
        'p1.L30':   'f1_45_0',   # Home office expense input box (Y=156)
        'p1.L31':   'f1_46_0',   # Net profit (Y=120) — RIGHT column
        # Line 32 has only checkboxes (32a/32b) for risk type — no money field.
        # Page 2 — Part IV vehicle info (same leaves/rects as 2024)
        'p2.L43_month': 'f2_9_0',
        'p2.L43_day':   'f2_10_0',
        'p2.L43_year':  'f2_11_0',
        'p2.L44a':      'f2_12_0',
        'p2.L44b':      'f2_13_0',
        'p2.L44c':      'f2_14_0',
        'p2.L45_yes':   'c2_5_0',
        'p2.L45_no':    'c2_5_1',
        'p2.L46_yes':   'c2_6_0',
        'p2.L46_no':    'c2_6_1',
        'p2.L47a_yes':  'c2_7_0',
        'p2.L47a_no':   'c2_7_1',
        'p2.L47b_yes':  'c2_8_0',
        'p2.L47b_no':   'c2_8_1',
        # Page 2 Line 48 Total Other Expenses (Part V) at Y=36 right column
        'p2.L48':   'f2_33_0',
    },
}


class FormFillError(Exception):
    """A value could not be placed on the form. Generation must stop.

    Raised instead of silently dropping a figure — a dropped expense line is
    what produced the Jacques 2024 math-error notice: line 28 still counted
    $68,631 while only $27,416 of it was visible to the IRS.
    """


# ─────────────────────────────────────────────────────────────────────────────
# Schedule C Part II: computed-expense key → form line, per year.
#
# Lines 8-26 have carried the same meaning in every year we support, so they
# are shared. Lines 27a/27b have NOT: the IRS swapped them between 2024 and
# 2025, verified three ways in both templates (printed label next to the box,
# the Part V header's cross-reference, and line 48's "Enter here and on line
# 27x"). That is why the expense keys for those two are semantic rather than
# line-numbered, and why nothing downstream may assume 27a means "other".
#
#   2024: 27a = Other expenses (from line 48)   27b = Energy efficient (7205)
#   2025: 27a = Energy efficient (7205)         27b = Other expenses (line 48)
#
# A new tax year must be added explicitly — a missing year raises rather than
# defaulting, so no year inherits another year's line numbering by accident.
# ─────────────────────────────────────────────────────────────────────────────
_SCHC_LINES_8_TO_26 = {
    'L8_advertising':             'p1.L8',
    'L9_car_truck':               'p1.L9',
    'L10_commissions':            'p1.L10',
    'L11_contract_labor':         'p1.L11',
    'L12_depletion':              'p1.L12',
    'L13_depreciation':           'p1.L13',
    'L14_employee_benefits':      'p1.L14',
    'L15_insurance':              'p1.L15',
    'L16a_interest_mortgage':     'p1.L16a',
    'L16b_interest_other':        'p1.L16b',
    'L17_legal_professional':     'p1.L17',
    'L18_office':                 'p1.L18',
    'L19_pension_profit_sharing': 'p1.L19',
    'L20a_rent_vehicles':         'p1.L20a',
    'L20b_rent_other':            'p1.L20b',
    'L21_repairs':                'p1.L21',
    'L22_supplies':               'p1.L22',
    'L23_taxes_licenses':         'p1.L23',
    'L24a_travel':                'p1.L24a',
    'L24b_meals_50pct':           'p1.L24b',
    'L25_utilities':              'p1.L25',
    'L26_wages':                  'p1.L26',
}

SCHC_PART_II_LINES = {
    2024: dict(_SCHC_LINES_8_TO_26,
               other_expenses_partv='p1.L27a',
               energy_efficient_f7205='p1.L27b'),
    2025: dict(_SCHC_LINES_8_TO_26,
               energy_efficient_f7205='p1.L27a',
               other_expenses_partv='p1.L27b'),
}


def schc_part_ii_lines(year):
    """expense-key → line-key registry for a year, or raise."""
    try:
        return SCHC_PART_II_LINES[year]
    except KeyError:
        raise FormFillError(
            f"No Schedule C Part II line registry for {year}. Add one to "
            "SCHC_PART_II_LINES after verifying that year's template with "
            "scripts/verify_field_map.py — do not inherit another year's "
            "line numbering (the IRS swapped 27a/27b between 2024 and 2025)."
        ) from None


def schc_partv_total_line(year):
    """The line that Part V's total feeds (27a in 2024, 27b in 2025)."""
    return schc_part_ii_lines(year)['other_expenses_partv']


def get_rect(form, year, line_key):
    """Return the rect for a given form/year/line, or None if unknown."""
    line_map = LINE_MAPS.get((form, year), {})
    leaf = line_map.get(line_key)
    if not leaf:
        return None
    fields = load_fields(form, year)
    fld = fields.get(leaf)
    if not fld:
        return None
    return fld['rect']


# ─────────────────────────────────────────────────────────────────────────────
# PDF overlay primitive
# ─────────────────────────────────────────────────────────────────────────────
def make_overlay(width, height, draws):
    """draws: list of (x, y, text, font_size) tuples, or
    ('__DEBUG_RECT__', rect, label, color) for debug outlines.
    Returns 1-page PDF bytes."""
    buf = BytesIO()
    c = Canvas(buf, pagesize=(width, height))
    for draw in draws:
        if draw is None:
            continue
        if len(draw) == 4 and draw[0] == '__DEBUG_RECT__':
            _, rect, label, color = draw
            c.setStrokeColorRGB(*color)
            c.setLineWidth(0.4)
            c.rect(rect[0], rect[1], rect[2]-rect[0], rect[3]-rect[1], stroke=1, fill=0)
            c.setFillColorRGB(*color)
            c.setFont('Helvetica', 5)
            c.drawString(rect[0], rect[3] + 1, label)
            c.setFillColorRGB(0, 0, 0)
            continue
        x, y, text, fs = draw
        c.setFont('Helvetica', fs)
        c.drawString(x, y, str(text))
    c.showPage()
    c.save()
    return buf.getvalue()


def overlay_on_pdf(pdf_path, page_overlays):
    """Apply per-page overlay PDFs onto the original PDF.
    Removes widget annotations on each page so empty form fields don't render
    on top of our drawn text. Returns merged PDF as bytes."""
    reader = PdfReader(str(pdf_path))
    writer = PdfWriter(clone_from=reader)

    for page in writer.pages:
        if '/Annots' in page:
            annots = page['/Annots']
            if hasattr(annots, 'get_object'):
                annots = annots.get_object()
            kept = ArrayObject()
            for a in annots:
                ao = a.get_object() if hasattr(a, 'get_object') else a
                if ao.get('/Subtype') != '/Widget':
                    kept.append(a)
            page[NameObject('/Annots')] = kept

    for page_idx, ov_bytes in page_overlays.items():
        ov_reader = PdfReader(BytesIO(ov_bytes))
        if page_idx < len(writer.pages):
            writer.pages[page_idx].merge_page(ov_reader.pages[0])

    if '/AcroForm' in writer._root_object:
        af = writer._root_object['/AcroForm']
        if hasattr(af, 'get_object'):
            af = af.get_object()
        if '/XFA' in af:
            del af[NameObject('/XFA')]

    out = BytesIO()
    writer.write(out)
    return out.getvalue()


def merge_pdfs(parts):
    writer = PdfWriter()
    for part in parts:
        reader = PdfReader(BytesIO(part))
        for page in reader.pages:
            writer.add_page(page)
    out = BytesIO()
    writer.write(out)
    return out.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# Per-form fill builders — all use rect-based positioning via LINE_MAPS
# ─────────────────────────────────────────────────────────────────────────────

def fill_1040(d):
    yr = d['taxYear']
    if yr != 2024:
        raise ValueError(
            f"fill_1040() is the 2024-only Form 1040 filler (got year {yr}). "
            "Use fill_1040_2025.fill_1040_2025() for 2025, or add a "
            "year-specific filler as CLAUDE.md describes."
        )
    pdf_path = FORMS / f'1040_{yr}.pdf'
    fields = load_fields('1040', yr)

    page1 = []
    page2 = []

    def put(line_key, value, x_pad=4, fs=10, align='left'):
        rect = get_rect('1040', yr, line_key)
        if rect is None:
            return
        draw = draw_in(rect, value, x_pad, fs, align)
        page = page2 if line_key.startswith('p2.') else page1
        if draw is not None:
            page.append(draw)

    # ── Header (raw rect lookups for non-line-numbered fields) ──
    def put_leaf(leaf, value, x_pad=4, fs=10):
        f = fields.get(leaf)
        if f and value:
            r = f['rect']
            page1.append((r[0] + x_pad, baseline_for(r, fs), str(value), fs))

    put_leaf('f1_04_0', TAXPAYER_FIRST)
    put_leaf('f1_05_0', TAXPAYER_LAST)
    # SSN — split into 3 chunks at the SSN field rect
    ssn_digits = ''.join(c for c in TAXPAYER_SSN if c.isdigit())
    ssn_rect = fields.get('f1_06_0', {}).get('rect')
    if ssn_rect:
        y = baseline_for(ssn_rect, 10)
        x0 = ssn_rect[0] + 3
        page1.append((x0, y, ssn_digits[0:3], 10))
        page1.append((x0 + 41, y, ssn_digits[3:5], 10))
        page1.append((x0 + 71, y, ssn_digits[5:9], 10))
    # Address (same leaf name in both years per inspection)
    for leaf, value in [
        ('Address_ReadOrder_0_f1_10_0', HOME_ADDRESS),
        ('Address_ReadOrder_0_f1_12_0', HOME_CITY),
        ('Address_ReadOrder_0_f1_13_0', HOME_STATE),
        ('Address_ReadOrder_0_f1_14_0', HOME_ZIP),
    ]:
        put_leaf(leaf, value)

    # Filing status checkbox (Single)
    fs_box = fields.get('filing_status_single')
    if fs_box and fs_box.get('rect'):
        r = fs_box['rect']
        page1.append((r[0] + 1, r[1] + 1, 'X', 11))

    # ── Line values ──
    # Page 1 income lines: only L8, L9, L10 in 2025 (page 1 ends at L10).
    # In 2024, page 1 also has L11-L15.
    put('p1.L8', fmt(d['net_profit']))   # Additional income from Sch 1
    put('p1.L9', fmt(d['net_profit']))   # Total income
    put('p1.L10', fmt(d['half_se']))     # Adjustments from Sch 1 line 26
    # 2024-only page 1 lines (LINE_MAPS entries are absent in 2025)
    put('p1.L11', fmt(d['agi']))
    put('p1.L12', fmt(d['std_ded']))
    put('p1.L14', fmt(d['std_ded']))     # 12 + 13 (QBI=0)
    put('p1.L15', fmt(d['taxable']))

    # Page 2 lines (2025-only Lines 11-15, plus Lines 16+ for both years)
    put('p2.L11', fmt(d['agi']))
    put('p2.L12', fmt(d['std_ded']))
    put('p2.L14', fmt(d['std_ded']))     # 12+13
    put('p2.L15', fmt(d['taxable']))
    put('p2.L16', fmt(d['fed_tax']))     # Tax
    put('p2.L18', fmt(d['fed_tax']))     # Add 16+17 (17=0)
    put('p2.L22', fmt(d['fed_tax']))     # Subtract 21 from 18
    put('p2.L23', fmt(d['sch2_total']))  # Other taxes from Sch 2
    put('p2.L24', fmt(d['total_tax']))   # Total tax
    put('p2.L37', fmt(d['total_tax']))   # Amount you owe

    overlays = {0: make_overlay(612, 792, page1)}
    if page2:
        overlays[1] = make_overlay(612, 792, page2)
    return overlay_on_pdf(pdf_path, overlays)


def fill_1040s1(d):
    yr = d['taxYear']
    pdf_path = FORMS / f'1040s1_{yr}.pdf'
    fields = load_fields('1040s1', yr)

    page1 = []
    page2 = []

    def put_leaf_p1(leaf, value, x_pad=4, fs=10):
        f = fields.get(leaf)
        if f and value:
            r = f['rect']
            page1.append((r[0] + x_pad, baseline_for(r, fs), str(value), fs))

    def put(line_key, value, x_pad=4, fs=10):
        rect = get_rect('1040s1', yr, line_key)
        if rect is None:
            return
        draw = draw_in(rect, value, x_pad, fs)
        page = page2 if line_key.startswith('p2.') else page1
        if draw is not None:
            page.append(draw)

    # Header — name (left) + SSN (right)
    put_leaf_p1('f1_01_0', TAXPAYER_NAME)
    put_leaf_p1('f1_02_0', TAXPAYER_SSN)

    # Part I lines
    put('p1.L3', fmt(d['net_profit']))    # Business income
    put('p1.L10', fmt(d['net_profit']))   # Combine 1-7+9 = additional income
    # L9 is sum of 8a-z, all 0 → leave blank

    # Part II adjustments
    put('p2.L15', fmt(d['half_se']))      # Half-SE deduction
    put('p2.L26', fmt(d['half_se']))      # Total adjustments

    overlays = {0: make_overlay(612, 792, page1)}
    if page2:
        overlays[1] = make_overlay(612, 792, page2)
    return overlay_on_pdf(pdf_path, overlays)


def fill_1040s2(d):
    yr = d['taxYear']
    pdf_path = FORMS / f'1040s2_{yr}.pdf'
    fields = load_fields('1040s2', yr)

    page1 = []
    page2 = []

    def put_leaf_p1(leaf, value, x_pad=4, fs=10):
        f = fields.get(leaf)
        if f and value:
            r = f['rect']
            page1.append((r[0] + x_pad, baseline_for(r, fs), str(value), fs))

    def put(line_key, value, x_pad=4, fs=10):
        rect = get_rect('1040s2', yr, line_key)
        if rect is None:
            return
        draw = draw_in(rect, value, x_pad, fs)
        page = page2 if line_key.startswith('p2.') else page1
        if draw is not None:
            page.append(draw)

    put_leaf_p1('f1_01_0', TAXPAYER_NAME)
    put_leaf_p1('f1_02_0', TAXPAYER_SSN)

    # Part II Other Taxes (page 1)
    put('p1.L4', fmt(d['se_total']))       # SE tax
    put('p1.L11', fmt(d['addl_med']))      # Additional Medicare Tax

    # Page 2: Line 21 total
    put('p2.L21', fmt(d['sch2_total']))

    overlays = {0: make_overlay(612, 792, page1)}
    if page2:
        overlays[1] = make_overlay(612, 792, page2)
    return overlay_on_pdf(pdf_path, overlays)


_YESNO_LINES = (
    ('L45', 'available_for_personal_use',
     'Line 45 — was the vehicle available for personal use off duty?'),
    ('L46', 'another_vehicle_available',
     'Line 46 — do you (or your spouse) have another vehicle for personal use?'),
    ('L47a', 'have_evidence',
     'Line 47a — do you have evidence to support the deduction?'),
)


def _parse_service_date(raw):
    """Split a placed-in-service date into (month, day, year) cell strings.

    Accepts 'YYYY-MM-DD' or 'MM/DD/YYYY'. Returns None if unparseable.
    """
    s = str(raw).strip()
    for sep, order in (('-', 'ymd'), ('/', 'mdy')):
        parts = s.split(sep)
        if len(parts) == 3 and all(p.strip().isdigit() for p in parts):
            a, b, c = (p.strip() for p in parts)
            y, m, day = (a, b, c) if order == 'ymd' else (c, a, b)
            if len(y) == 2:
                y = '20' + y
            return f'{int(m):02d}', f'{int(day):02d}', y
    return None


def _schc_part_iv_draws(yr, d):
    """Page-2 draws for Schedule C Part IV, or raise listing what is missing.

    Part IV is mandatory when line 9 car/truck expense is claimed and no Form
    4562 is filed for the business. Nothing here is inferred: a client whose
    config lacks the vehicle answers fails generation.
    """
    v = d.get('vehicle') or {}
    missing = []

    date_parts = _parse_service_date(v.get('date_placed_in_service') or '')
    if date_parts is None:
        missing.append(
            'schedule_c.vehicle.date_placed_in_service  '
            '(Line 43, "YYYY-MM-DD" or "MM/DD/YYYY")')

    miles = {}
    for sub, key in (('a', 'business_miles'), ('b', 'commuting_miles'),
                     ('c', 'other_miles')):
        val = v.get(key)
        if val is None:
            missing.append(f'schedule_c.vehicle.{key}  (Line 44{sub})')
        else:
            miles[sub] = val

    answers = {}
    for line, key, prompt in _YESNO_LINES:
        ans = str(v.get(key, '')).strip().lower()
        if ans not in ('yes', 'no'):
            missing.append(f'schedule_c.vehicle.{key}  ("yes" or "no") — {prompt}')
        else:
            answers[line] = ans

    # 47b is asked only when 47a is "yes".
    if answers.get('L47a') == 'yes':
        ans = str(v.get('evidence_written', '')).strip().lower()
        if ans not in ('yes', 'no'):
            missing.append(
                'schedule_c.vehicle.evidence_written  ("yes" or "no") — '
                'Line 47b, is the evidence written?')
        else:
            answers['L47b'] = ans

    if missing:
        raise FormFillError(
            f"Schedule C {yr}: line 9 claims car/truck expense of "
            f"{d['sch_c_expenses'].get('L9_car_truck', 0):,}, so Part IV "
            "(lines 43-47b) is required and no Form 4562 is being generated. "
            "The client config is missing:\n  - "
            + "\n  - ".join(missing)
            + "\nSupply the taxpayer's actual answers; these must not be "
              "guessed. If a Form 4562 is filed for this business instead, "
              "Part IV is not required — that path is not implemented yet."
        )

    draws = []

    def place(line_key, value, fs=10, align='center'):
        rect = get_rect('1040sc', yr, line_key)
        if rect is None:
            raise FormFillError(
                f"Schedule C {yr}: no LINE_MAPS leaf for {line_key} "
                "(Part IV). Derive it with scripts/verify_field_map.py.")
        draws.append(draw_in(rect, value, 2, fs, align=align,
                             label=f'1040sc {line_key}'))

    month, day, year4 = date_parts
    place('p2.L43_month', month)
    place('p2.L43_day', day)
    place('p2.L43_year', year4)

    place('p2.L44a', f"{int(miles['a']):,}", align='right')
    place('p2.L44b', f"{int(miles['b']):,}", align='right')
    place('p2.L44c', f"{int(miles['c']):,}", align='right')

    for line, ans in answers.items():
        place(f'p2.{line}_{ans}', 'X', fs=9)

    return draws


def fill_1040sc(d):
    yr = d['taxYear']
    pdf_path = FORMS / f'1040sc_{yr}.pdf'
    fields = load_fields('1040sc', yr)

    page1 = []
    page2 = []

    def put(line_key, value, x_pad=4, fs=10, align='left'):
        rect = get_rect('1040sc', yr, line_key)
        if rect is None:
            return
        draw = draw_in(rect, value, x_pad, fs, align)
        page = page2 if line_key.startswith('p2.') else page1
        if draw is not None:
            page.append(draw)

    def put_leaf_p1(leaf, value, x_pad=4, fs=10):
        f = fields.get(leaf)
        if f and value:
            r = f['rect']
            page1.append((r[0] + x_pad, baseline_for(r, fs), str(value), fs))

    # Header text
    put('p1.NAME', TAXPAYER_NAME)
    put('p1.PB', PRINCIPAL_BUSINESS)
    put('p1.BIZ', ENTITY_NAME)
    put('p1.ADDR', BIZ_ADDRESS)
    put('p1.CSZ', BIZ_CSZ)

    # Comb fields: SSN (right of name), Box B (right of PB), Box D EIN (right of BIZ)
    # These are pre-defined comb regions on every Sch C; positions verified.
    def comb_draws(start_x, end_x, n_cells, y_baseline, value):
        digits = ''.join(c for c in str(value) if c.isdigit())
        digits = (digits + ' ' * n_cells)[:n_cells]
        cell_w = (end_x - start_x) / n_cells
        out = []
        for i, ch in enumerate(digits):
            if ch.strip():
                cx = start_x + cell_w * i + cell_w / 2
                out.append((cx - 3, y_baseline, ch, 10))
        return out
    page1 += comb_draws(446.4, 576.0, 9, 687.5, TAXPAYER_SSN)   # SSN comb
    page1 += comb_draws(460.8, 547.2, 6, 663.5, NAICS_CODE)     # Box B
    page1 += comb_draws(446.4, 576.0, 9, 638.5, EIN)            # Box D EIN

    # Checkboxes — F Cash, G Yes, then config-driven 1099 questions I & J.
    # Columns: Yes x=517 / No x=553.  Rows: question I y=564, question J y=552.
    page1.append((169, 599, 'X', 11))   # F Cash
    page1.append((517, 588, 'X', 11))   # G Yes
    if str(MADE_PAYMENTS_1099).lower() == 'yes':
        page1.append((517, 564, 'X', 11))   # I Yes (made payments requiring 1099)
        # Question J only applies when I = Yes
        if str(FILED_1099S).lower() == 'yes':
            page1.append((517, 552, 'X', 11))   # J Yes (filed required 1099s)
        else:
            page1.append((553, 552, 'X', 11))   # J No
    else:
        page1.append((553, 564, 'X', 11))   # I No — leave J blank (N/A)

    # ── Part I income (right column) ────────────────────────────────────────
    # Lines 2, 4 and 6 used to be hard-coded to 0 and lines 3 and 5 to repeat
    # gross receipts. That is right only for a client with no returns, no cost
    # of goods sold and no other business income — true of both clients so far,
    # wrong for anyone else, and silently so, because line 7 was computed from
    # the real figures.
    inc = d['sch_c_income']
    put('p1.L1', fmt(inc['gross_receipts']), align='right', x_pad=2)
    put('p1.L2', fmt_force(inc['returns_allowances']), align='right', x_pad=2)
    put('p1.L3', fmt(inc['L3_subtract']), align='right', x_pad=2)
    put('p1.L4', fmt_force(inc['cogs']), align='right', x_pad=2)
    put('p1.L5', fmt(inc['L5_gross_profit']), align='right', x_pad=2)
    put('p1.L6', fmt_force(inc['L6_other_income']), align='right', x_pad=2)
    put('p1.L7', fmt(inc['L7_gross_income']), align='right', x_pad=2)

    # ── Part II expenses — every nonzero computed line, data-driven ─────────
    # Driven off the computed expense dict, not a hand-picked subset, so a
    # line no previous client happened to use cannot go missing while still
    # counting toward line 28.
    registry = schc_part_ii_lines(yr)
    expenses = d['sch_c_expenses']

    unknown = [k for k in expenses if k not in registry]
    if unknown:
        raise FormFillError(
            f"Schedule C {yr}: computed expense key(s) {sorted(unknown)} have "
            f"no line in SCHC_PART_II_LINES[{yr}]. Add them (and the matching "
            "LINE_MAPS leaf) before generating."
        )

    for key, line_key in registry.items():
        amount = expenses.get(key, 0)
        if not amount:
            continue
        if get_rect('1040sc', yr, line_key) is None:
            raise FormFillError(
                f"Schedule C {yr}: {key} = {amount:,} belongs on {line_key}, "
                f"but LINE_MAPS[('1040sc', {yr})] has no leaf for it. Derive "
                "the leaf with scripts/verify_field_map.py and add it; this "
                "figure must not be dropped while line 28 still counts it."
            )
        put(line_key, fmt(amount), align='right', x_pad=2)

    # Totals. Line 29 is the tentative profit (L7 − L28) and line 31 the net
    # profit (L29 − L30); they differ whenever home-office expense is claimed.
    put('p1.L28', fmt(d['total_expenses']), align='right', x_pad=2)
    put('p1.L29', fmt(d['tentative_profit']), align='right', x_pad=2)
    if d.get('home_office'):
        put('p1.L30', fmt(d['home_office']), align='right', x_pad=2)
    put('p1.L31', fmt(d['net_profit']), align='right', x_pad=2)

    # ── Part IV — vehicle information ───────────────────────────────────────
    # Required whenever car/truck expense is claimed on line 9 and no Form
    # 4562 is filed for the business. The Jacques 2024 amendment claimed
    # $40,200 here with Part IV left blank.
    if expenses.get('L9_car_truck'):
        page2 += _schc_part_iv_draws(yr, d)

    # ── Page 2 Part V — itemized other expenses ─────────────────────────────
    # Descriptions come from the client's own config. They used to be a
    # hard-coded list of Pasta Pals' categories, so every other client's Part V
    # printed Pasta Pals' labels against its own amounts.
    partv_items = [it for it in d.get('partV_items', []) if it.get('amount')]

    rows = {}
    for fld in fields.values():
        if (fld.get('page') == 2 and fld.get('type') == 'text'
                and 'PartVTable' in fld.get('id', '')):
            r = fld['rect']
            kind = 'desc' if r[0] < 400 else 'amt'
            rows.setdefault(round(r[1]), {})[kind] = r
    row_keys = sorted(rows.keys(), reverse=True)

    if len(partv_items) > len(row_keys):
        raise FormFillError(
            f"Schedule C {yr}: {len(partv_items)} Part V items but the form "
            f"has only {len(row_keys)} rows. Form 1040 Schedule C has no "
            "continuation page — combine items in the client config, or add "
            "an attached statement, rather than dropping any."
        )

    for item, y_key in zip(partv_items, row_keys):
        cells = rows[y_key]
        if 'desc' in cells:
            r = cells['desc']
            page2.append(draw_in(r, item.get('description', ''), 4, 9,
                                 label=f'1040sc p2 PartV desc'))
        if 'amt' in cells:
            r = cells['amt']
            page2.append(draw_in(r, fmt(item['amount']), 2, 9, align='right',
                                 label=f'1040sc p2 PartV amt'))

    # Line 48 total — flows to 27a in 2024 and 27b in 2025 (see the printed
    # "Enter here and on line 27x" on each template).
    if d.get('partV_total'):
        rect = get_rect('1040sc', yr, 'p2.L48')
        if rect is None:
            raise FormFillError(
                f"Schedule C {yr}: Part V total {d['partV_total']:,} has no "
                "p2.L48 leaf in LINE_MAPS."
            )
        page2.append(draw_in(rect, fmt(d['partV_total']), 2, 10, align='right',
                             label='1040sc p2.L48'))

    overlays = {0: make_overlay(612, 792, page1)}
    if page2:
        overlays[1] = make_overlay(612, 792, page2)
    return overlay_on_pdf(pdf_path, overlays)


def fill_1040sse(d):
    yr = d['taxYear']
    pdf_path = FORMS / f'1040sse_{yr}.pdf'
    fields = load_fields('1040sse', yr)

    page1 = []

    def put_leaf(leaf, value, x_pad=4, fs=10):
        f = fields.get(leaf)
        if f and value:
            r = f['rect']
            page1.append((r[0] + x_pad, baseline_for(r, fs), str(value), fs))

    def put(line_key, value, x_pad=4, fs=10, align='left'):
        rect = get_rect('1040sse', yr, line_key)
        if rect is None:
            return
        draw = draw_in(rect, value, x_pad, fs, align)
        if draw is not None:
            page1.append(draw)

    # Header
    put_leaf('f1_1_0', TAXPAYER_NAME)
    put_leaf('f1_2_0', TAXPAYER_SSN)

    # Part I lines
    put('p1.L2', fmt(d['net_profit']))     # Net profit Sch C
    put('p1.L3', fmt(d['net_profit']))     # Combine
    put('p1.L4a', fmt(d['se_earn']))       # × 92.35%
    put('p1.L4c', fmt(d['se_earn']))       # Combine
    put('p1.L6', fmt(d['se_earn']))        # SE earnings
    # L7 SS wage base PRE-PRINTED on form — do not draw
    put('p1.L9', fmt(d['ss_base']))        # Subtract 8d from 7
    put('p1.L10', fmt(d['ss_tax']))        # SS tax (12.4%)
    put('p1.L11', fmt(d['med_tax']))       # Medicare (2.9%)
    put('p1.L12', fmt(d['se_total']))      # Total SE tax
    put('p1.L13', fmt(d['half_se']))       # Half-SE deduction

    overlays = {0: make_overlay(612, 792, page1)}
    return overlay_on_pdf(pdf_path, overlays)


def fill_8959(d):
    yr = d['taxYear']
    pdf_path = FORMS / f'8959_{yr}.pdf'
    fields = load_fields('8959', yr)

    page1 = []

    def put_leaf(leaf, value, x_pad=4, fs=10):
        f = fields.get(leaf)
        if f and value:
            r = f['rect']
            page1.append((r[0] + x_pad, baseline_for(r, fs), str(value), fs))

    def put(line_key, value, x_pad=4, fs=10):
        rect = get_rect('8959', yr, line_key)
        if rect is None:
            return
        draw = draw_in(rect, value, x_pad, fs)
        if draw is not None:
            page1.append(draw)

    # Header
    put_leaf('f1_1_0', TAXPAYER_NAME)
    put_leaf('f1_2_0', TAXPAYER_SSN)

    # Part I — wages all 0 (no W-2 income)
    put('p1.L4', fmt_force(0))             # Add 1-3
    put('p1.L7', fmt_force(0))             # Addl Medicare on wages

    # Part II — SE income
    put('p1.L8', fmt(d['se_earn']))        # SE earnings from Sch SE
    put('p1.L9', fmt(d['threshold']))      # 200,000 threshold
    put('p1.L10', fmt_force(0))            # Line 4 amount (= 0)
    put('p1.L11', fmt(d['threshold']))     # Subtract 10 from 9
    put('p1.L12', fmt(d['se_earn'] - d['threshold']))  # SE excess
    put('p1.L13', fmt(d['addl_med']))      # 0.9% × Line 12

    # Part IV total
    put('p1.L18', fmt(d['addl_med']))

    overlays = {0: make_overlay(612, 792, page1)}
    return overlay_on_pdf(pdf_path, overlays)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
# Lazy-import the standalone 2025 fillers so the 2024 path stays untouched
def _fill_1040_for(d):
    """Use 2025-specific filler (built from scratch) for year 2025;
    fall back to the original year-shared fill_1040 for 2024."""
    if d['taxYear'] == 2025:
        from fill_1040_2025 import fill_1040_2025
        # Map our compute_year dict into the 2025 fill function's expected shape
        return fill_1040_2025({
            'name_first': TAXPAYER_FIRST,
            'name_last':  TAXPAYER_LAST,
            'ssn':        TAXPAYER_SSN,
            'address':    HOME_ADDRESS,
            'city':       HOME_CITY,
            'state':      HOME_STATE,
            'zip':        HOME_ZIP,
            'net_profit': d['net_profit'],
            'half_se':    d['half_se'],
            'agi':        d['agi'],
            'std_ded':    d['std_ded'],
            'taxable':    d['taxable'],
            'fed_tax':    d['fed_tax'],
            'sch2_total': d['sch2_total'],
            'total_tax':  d['total_tax'],
        })
    return fill_1040(d)


def main():
    OUT_DIR.mkdir(exist_ok=True)
    # Make scripts/ importable so we can lazy-import fill_1040_2025
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    # 2024 is FROZEN — pass --include-2024 to regenerate it.
    # Default behavior writes only 2025 so iterating on 2025 doesn't
    # regenerate the 2024 PDF (even byte-identically).
    years = [2025]
    if '--include-2024' in sys.argv:
        years = [2024, 2025]
    for year in years:
        print(f"\n=== {year} ===")
        d = compute_year(year)
        print(f"  net profit: ${d['net_profit']:,}  SE tax: ${d['se_total']:,}  total tax: ${d['total_tax']:,}")
        parts = [
            _fill_1040_for(d),
            fill_1040s1(d),
            fill_1040s2(d),
            fill_1040sc(d),
            fill_1040sse(d),
            fill_8959(d),
        ]
        merged = merge_pdfs(parts)
        out_path = OUT_DIR / f'Pasta_Pals_{year}_RETURN.pdf'
        out_path.write_bytes(merged)
        print(f"  Wrote {out_path} ({len(merged):,} bytes)")
    if _OVERFLOW_LOG:
        print(f"\n⚠️  {len(_OVERFLOW_LOG)} overflow warning(s):")
        for w in _OVERFLOW_LOG:
            print(f"   {w}")
    else:
        print("\n✓ No overflow warnings — every drawn value fits inside its rect.")


if __name__ == '__main__':
    main()
