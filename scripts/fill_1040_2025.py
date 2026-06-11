"""Standalone 2025 Form 1040 filler — built from scratch from direct 2025
PDF AcroForm widget extraction. NOT a variant of 2024.

2025 layout reality (verified from PDF /Annots widgets):
  Y=733: f1_01, f1_02, f1_03      year-beginning/ending fiscal-year fields
  Y=722: c1_1, c1_2, c1_3         "Filed pursuant 301.9100-2 / Combat zone / Other" checkboxes
  Y=720: f1_04 + f1_05–f1_10      DECEASED person's name (f1_04, W=161) and DECEASED SSN cells
                                    (NOT primary taxpayer — primary fields are at Y=684)
  Y=708: c1_4, f1_11, f1_12, f1_13   amended/explanation row (still not primary name)
  Y=684: f1_14, f1_15, f1_16      ★ YOUR FIRST+MI | YOUR LAST | YOUR SSN (comb, MaxLen=9)
  Y=660: f1_17, f1_18, f1_19      spouse first | spouse last | spouse SSN (comb)
  Y=637: f1_20 (address), f1_21 (apt #), c1_5 (Foreign addr indicator)
  Y=612: f1_22 (city), f1_23 (state), f1_24 (zip)
  Y=590: f1_25 (foreign country), f1_26 (foreign province), f1_27 (foreign postal), checkboxes
        c1_6, c1_7 (Presidential election fund: You / Spouse)
  Y=566–578: c1_8 instances — Filing Status checkboxes (Single, MFJ, MFS, HoH, QSS)
  Y=540: f1_28 (Filing status — name of qualifying person if HoH/QSS)
  Y=534: f1_29 (Filing status — name of nonresident spouse, if MFS)
  Y=526: c1_9 (additional filing status indicator)
  Y=514: f1_30 (Digital assets — possibly something else; Y indicates after filing status)
  Y=497: c1_10 — Digital assets Yes/No checkboxes
  Y=471–435: f1_31–f1_46 + checkboxes — Dependents table (4 rows)
  Y=425–380: dependent checkbox columns
  Y=360: c1_32 — Standard deduction checkbox
  Y=330: f1_47 — Line 1z (W-2 wages total)
  Y=318: f1_48 — Line 1a sub-total ?
  Y=306: f1_49 — Line 1c
  Y=294: f1_50 — Line 1d
  Y=282: f1_51 — Line 1e
  Y=270: f1_52 — Line 1f
  Y=258: f1_53 — Line 1g
  Y=247: f1_54 (left, "h" desc), f1_55 (right, Line 1h amount)
  Y=234: f1_56 — Line 1i Nontaxable combat pay (left)
  Y=222: f1_57 — Line 1z subtotal? Actually need to verify
  Y=210: f1_58 (left, Line 2a date), f1_59 (right, Line 2a amount or 2b)
  Y=198: f1_60 (left), f1_61 (right) — Lines 3a/3b
  Y=174: f1_62 (left), f1_63 (right) — Lines 4a/4b (IRA distributions)
  Y=164: c1_35–c1_37 (rollover/Roth checkboxes), f1_64
  Y=150: f1_65 (left), f1_66 (right) — Lines 5a/5b (Pensions)
  Y=140: c1_38–c1_40, f1_67
  Y=126: f1_68 (left), f1_69 (right) — Lines 6a/6b (Social Security)
  Y=104–116: c1_41, c1_42 — Sch B/Lump-sum election checkboxes
  Y=90: f1_70 — Line 7 (Capital gain/loss)
  Y=80: c1_43, c1_44, f1_71 — Line 7 election + Foreign tax repaid
  Y=66: f1_72 — Line 8 (Additional income from Sch 1)
  Y=54: f1_73 — Line 9 (Total income)
  Y=42: f1_74 — Line 10 (Adjustments from Sch 1)
  Y=30: f1_75 — Line 11 (AGI)
"""
import json
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, ArrayObject
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

REPO = Path(__file__).parent.parent
PDF_IN = REPO / 'public' / 'irs-forms' / '1040_2025.pdf'

# ─────────────────────────────────────────────────────────────────────────────
# 2025 Form 1040 FIELD REGISTRY — built from scratch, manually verified per rect
# Each entry = (rect, alignment, kind). rect = [x0, y0, x1, y1] in PDF points.
# ─────────────────────────────────────────────────────────────────────────────

# Rects loaded from direct PDF widget extraction (not .fields.json)
_WIDGETS = None

def _extract_widgets():
    """Return list of widget dicts (one per widget). Some leaf names collide
    (e.g., c1_8 has two widgets at the same instance index — one in
    Checkbox_ReadOrder, one direct), so we keep ALL widgets and look up by
    rect signature when needed."""
    global _WIDGETS
    if _WIDGETS is not None:
        return _WIDGETS
    out = []
    r = PdfReader(str(PDF_IN))
    for pg_idx, page in enumerate(r.pages[:2]):
        annots = page.get('/Annots', [])
        if hasattr(annots, 'get_object'):
            annots = annots.get_object()
        for a in annots:
            ao = a.get_object() if hasattr(a, 'get_object') else a
            if ao.get('/Subtype') != '/Widget':
                continue
            rect = ao.get('/Rect')
            if not rect:
                continue
            rect = [float(x) for x in rect]
            t = ao.get('/T', '')
            parent = ao.get('/Parent')
            names = [str(t)] if t else []
            while parent:
                p = parent.get_object() if hasattr(parent, 'get_object') else parent
                pt = p.get('/T')
                if pt:
                    names.insert(0, str(pt))
                parent = p.get('/Parent')
            full = '.'.join(names)
            leaf = full.split('.')[-1] if full else ''
            leaf = leaf.replace('[', '_').replace(']', '')
            flags = int(ao.get('/Ff') or 0)
            mlen = ao.get('/MaxLen')
            out.append({
                'page': pg_idx + 1,
                'leaf': leaf,
                'full': full,
                'rect': rect,
                'is_comb': bool(flags & (1 << 24)),
                'max_len': mlen,
                'ft': str(ao.get('/FT', '')),
            })
    _WIDGETS = out
    return out


def find_widget(page, leaf=None, x_target=None, y_target=None, tol=2.0):
    """Find a widget by page + (optional) leaf + (optional) rect position.
    All criteria are AND'ed."""
    for w in _extract_widgets():
        if w['page'] != page:
            continue
        if leaf is not None and w['leaf'] != leaf:
            continue
        r = w['rect']
        if x_target is not None and abs(r[0] - x_target) > tol:
            continue
        if y_target is not None and abs(r[1] - y_target) > tol:
            continue
        return w
    return None


def find_widget_by_key(key):
    """Look up by FIELD_MAP_2025 key. Each registry entry is either a
    'pN.leaf' string OR a dict {page, leaf, x, y} for disambiguation."""
    spec = FIELD_MAP_2025.get(key)
    if spec is None:
        return None
    if isinstance(spec, dict):
        return find_widget(spec['page'], leaf=spec.get('leaf'),
                          x_target=spec.get('x'), y_target=spec.get('y'))
    # Plain string 'p1.f1_14_0' style
    if '.' in spec:
        page_str, leaf = spec.split('.', 1)
        page = int(page_str[1:])
        return find_widget(page, leaf=leaf)
    return None


# Line → leaf assignments verified by visual inspection of widget rects + form
FIELD_MAP_2025 = {
    # ── Identity (page 1) ───────────────────────────────────────────────────
    'name.first':     'p1.f1_14_0',   # Your first name + MI (Y=684)
    'name.last':      'p1.f1_15_0',   # Your last name (Y=684)
    'name.ssn':       'p1.f1_16_0',   # Your SSN (Y=684, comb, MaxLen=9)
    'spouse.first':   'p1.f1_17_0',
    'spouse.last':    'p1.f1_18_0',
    'spouse.ssn':     'p1.f1_19_0',
    'addr.street':    'p1.f1_20_0',   # Y=637
    'addr.apt':       'p1.f1_21_0',
    'addr.city':      'p1.f1_22_0',   # Y=612
    'addr.state':     'p1.f1_23_0',
    'addr.zip':       'p1.f1_24_0',
    # Filing status checkboxes — c1_8 has duplicates at the same instance
    # index (Checkbox_ReadOrder vs direct), distinguish by rect X/Y
    'fs.single':      {'page': 1, 'leaf': 'c1_8_0', 'x': 97.6, 'y': 578.0},
    'fs.mfj':         {'page': 1, 'leaf': 'c1_8_1', 'x': 97.6, 'y': 566.0},
    'fs.mfs':         {'page': 1, 'leaf': 'c1_8_2', 'x': 97.6, 'y': 554.0},
    'fs.hoh':         {'page': 1, 'leaf': 'c1_8_0', 'x': 349.6, 'y': 578.0},
    'fs.qss':         {'page': 1, 'leaf': 'c1_8_1', 'x': 349.6, 'y': 566.0},

    # ── Income lines (page 1) ───────────────────────────────────────────────
    # Right-column money fields — each line's amount field
    'p1.L1z':  'p1.f1_47_0',   # Total wages from W-2 box 1 (Y=330)
    'p1.L2b':  'p1.f1_59_0',   # Line 2b Taxable interest (Y=210)
    'p1.L3b':  'p1.f1_61_0',   # Line 3b Ordinary dividends (Y=198)
    'p1.L4b':  'p1.f1_63_0',   # Line 4b IRA dist taxable (Y=174)
    'p1.L5b':  'p1.f1_66_0',   # Line 5b Pensions taxable (Y=150)
    'p1.L6b':  'p1.f1_69_0',   # Line 6b SS taxable (Y=126)
    'p1.L7':   'p1.f1_70_0',   # Line 7 Capital gain (Y=90)
    'p1.L8':   'p1.f1_72_0',   # Line 8 Additional income (Y=66)
    'p1.L9':   'p1.f1_73_0',   # Line 9 Total income (Y=54)
    'p1.L10':  'p1.f1_74_0',   # Line 10 Adjustments (Y=42)
    'p1.L11a': 'p1.f1_75_0',   # Line 11a Subtract 10 from 9 = AGI (Y=30)

    # ── Page 2 (Tax and Credits / Payments / Amount owed) ──────────────────
    # 2025 splits Line 11 into 11a (page 1) and 11b (page 2 carry-forward).
    # Line 12e is the std-ded amount; 13a=QBI, 13b=Sch 1-A additional deds.
    'p2.L11b': 'p2.f2_01_0',   # AGI carry-forward from page 1 (Y=744)
    'p2.L12e': 'p2.f2_02_0',   # Standard deduction amount (Y=684)
    'p2.L13a': 'p2.f2_03_0',   # QBI deduction (Y=672)
    'p2.L13b': 'p2.f2_04_0',   # Additional deductions (Sch 1-A line 38) (Y=660)
    'p2.L14':  'p2.f2_05_0',   # Add 12e + 13a + 13b (Y=648)
    'p2.L15':  'p2.f2_06_0',   # Taxable income (Y=636)
    'p2.L16':  'p2.f2_08_0',   # Tax (Y=624)
    'p2.L17':  'p2.f2_09_0',   # Sch 2 Line 3 (Y=612)
    'p2.L18':  'p2.f2_10_0',   # Add 16+17 (Y=600)
    'p2.L19':  'p2.f2_11_0',   # Child tax credit (Y=588)
    'p2.L20':  'p2.f2_12_0',   # Sch 3 Line 8 (Y=576)
    'p2.L21':  'p2.f2_13_0',   # Subtract 20 from 18 (Y=564)
    'p2.L22':  'p2.f2_14_0',   # Subtract (Y=552)
    'p2.L23':  'p2.f2_15_0',   # Other taxes from Sch 2 (Y=540)
    'p2.L24':  'p2.f2_16_0',   # Total tax (Y=528)
    'p2.L26':  'p2.f2_21_0',   # 2025 estimated tax payments
    'p2.L37':  'p2.f2_35_0',   # Amount you owe
}


def baseline_for(rect, font_size=10):
    """Cap-height-aware vertical center for reportlab drawString baseline."""
    cap = font_size * 0.72
    return rect[1] + (rect[3] - rect[1] - cap) / 2


def comb_draws(rect, value, font_size=10, layout='ssn'):
    """Place digits in a comb field using EXPLICIT per-group cell positions.

    For the IRS Form 1040 SSN box, the dashes are at PDF X fractions
    ~30% and ~62% of the rect width. Within each group, digits are
    placed at the CENTER of evenly-divided cells, so:

      Group 1 (3 cells in left 30%):     centers at 5%, 15%, 25%
      Group 2 (2 cells centered around 47%): centers at 42%, 53%
      Group 3 (4 cells in right 38%):    centers at 65%, 73%, 81%, 89%

    These were chosen by visual inspection of the rendered template
    so digits sit cleanly in their cells without grazing the dashes.
    The middle group's 2 digits are kept TIGHT TOGETHER (not spread)
    so "63" reads as a pair, not as the end of group 2 + start of group 3.

    layout='ssn' uses the SSN positions; layout='even' falls back to even.
    Returns list of (x, y, char, fs) tuples."""
    digits = ''.join(c for c in str(value) if c.isdigit())
    total_w = rect[2] - rect[0]
    x0 = rect[0]
    y = baseline_for(rect, font_size)

    if layout == 'ssn':
        # Fractional center X for each of 9 digits
        # Measured visually from the bare 2025 1040 template:
        #   dash 1 at PDF X frac ~0.302  (501.3 in rect [469, 576])
        #   dash 2 at PDF X frac ~0.588  (531.9)
        # Group 2 has only 2 digits — kept TIGHT TOGETHER as a pair
        # (centered in group 2's space) so "63" reads as a unit and "3"
        # doesn't drift toward the second dash.
        center_fracs = [0.050, 0.151, 0.252,         # group 1
                        0.395, 0.450,                 # group 2: TIGHT pair shifted LEFT
                        0.640, 0.743, 0.846, 0.949]   # group 3
    else:
        # Even distribution
        n = max(1, len(digits))
        center_fracs = [(i + 0.5) / n for i in range(n)]

    out = []
    for i, ch in enumerate(digits[:len(center_fracs)]):
        cx = x0 + center_fracs[i] * total_w
        char_w = stringWidth(ch, 'Helvetica', font_size)
        out.append((cx - char_w / 2, y, ch, font_size))
    return out


def text_draw(rect, value, align='left', x_pad=4, font_size=10):
    """Single-line text draw at vertical center with chosen horizontal align.
    Uses real Helvetica string-width metrics for right/center alignment."""
    if value is None or value == '':
        return None
    text = str(value)
    text_w = stringWidth(text, 'Helvetica', font_size)
    if align == 'right':
        x = rect[2] - text_w - x_pad
    elif align == 'center':
        x = (rect[0] + rect[2]) / 2 - text_w / 2
    else:
        x = rect[0] + x_pad
    return (x, baseline_for(rect, font_size), text, font_size)


def fill_1040_2025(d):
    """Fill Form 1040 (2025) page 1 + page 2 from values dict d.
    d must contain: name_first, name_last, ssn, address, city, state, zip,
    plus all line values (net_profit, half_se, agi, std_ded, taxable, fed_tax,
    sch2_total, total_tax)."""
    _extract_widgets()  # warm cache

    page1 = []
    page2 = []

    def put_text(field_key, value, align='left', x_pad=4, fs=10):
        widget = find_widget_by_key(field_key)
        if not widget:
            return
        draw = text_draw(widget['rect'], value, align=align, x_pad=x_pad, font_size=fs)
        if draw is None:
            return
        page = page2 if widget['page'] == 2 else page1
        page.append(draw)

    def put_comb(field_key, value, fs=10):
        widget = find_widget_by_key(field_key)
        if not widget:
            return
        page = page2 if widget['page'] == 2 else page1
        page.extend(comb_draws(widget['rect'], value, fs))

    def put_check(field_key):
        widget = find_widget_by_key(field_key)
        if not widget:
            return
        r = widget['rect']
        page = page2 if widget['page'] == 2 else page1
        page.append((r[0] + 1, r[1] + 1, 'X', 11))

    # ── Identity ──
    put_text('name.first', d['name_first'])
    put_text('name.last',  d['name_last'])
    put_comb('name.ssn',   d['ssn'])

    put_text('addr.street', d['address'])
    put_text('addr.city',   d['city'])
    put_text('addr.state',  d['state'])
    put_text('addr.zip',    d['zip'])

    # ── Filing Status: Single (uses rect-based disambiguation) ──
    put_check('fs.single')

    # ── Page 1 income lines ──
    # All income lines blank EXCEPT L8, L9, L10 (page 1 ends at L10 in 2025).
    put_text('p1.L8',   fmt_money(d['net_profit']), align='right', x_pad=2)
    put_text('p1.L9',   fmt_money(d['net_profit']), align='right', x_pad=2)
    put_text('p1.L10',  fmt_money(d['half_se']),    align='right', x_pad=2)
    put_text('p1.L11a', fmt_money(d['agi']),        align='right', x_pad=2)

    # ── Page 2 Tax/Credits/Payments ──
    put_text('p2.L11b', fmt_money(d['agi']),        align='right', x_pad=2)
    put_text('p2.L12e', fmt_money(d['std_ded']),    align='right', x_pad=2)
    # L13a = 0 QBI (skip), L13b = 0 (skip)
    put_text('p2.L14',  fmt_money(d['std_ded']),    align='right', x_pad=2)  # 12e+13a+13b
    put_text('p2.L15',  fmt_money(d['taxable']),    align='right', x_pad=2)
    put_text('p2.L16',  fmt_money(d['fed_tax']),    align='right', x_pad=2)
    # L17 = 0 (Sch 2 L3 = AMT, none), skip
    put_text('p2.L18',  fmt_money(d['fed_tax']),    align='right', x_pad=2)
    # L19/20 = 0 (no credits), skip
    put_text('p2.L21',  fmt_money(d['fed_tax']),    align='right', x_pad=2)
    put_text('p2.L22',  fmt_money(d['fed_tax']),    align='right', x_pad=2)
    put_text('p2.L23',  fmt_money(d['sch2_total']), align='right', x_pad=2)
    put_text('p2.L24',  fmt_money(d['total_tax']),  align='right', x_pad=2)
    # L25-26: payments = 0 (skip)
    put_text('p2.L37',  fmt_money(d['total_tax']),  align='right', x_pad=2)

    # ── Build merged PDF ──
    return _merge_overlays(PDF_IN, {0: page1, 1: page2})


def fmt_money(n):
    if n is None or n == 0:
        return ''
    if n < 0:
        return f"({abs(int(round(n))):,})"
    return f"{int(round(n)):,}"


def _make_overlay(width, height, draws):
    buf = BytesIO()
    c = Canvas(buf, pagesize=(width, height))
    for x, y, text, fs in draws:
        c.setFont('Helvetica', fs)
        c.drawString(x, y, str(text))
    c.showPage()
    c.save()
    return buf.getvalue()


def _merge_overlays(pdf_path, page_overlays):
    reader = PdfReader(str(pdf_path))
    writer = PdfWriter(clone_from=reader)
    # Strip widget annotations
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
    # Apply overlays
    for page_idx, draws in page_overlays.items():
        if not draws:
            continue
        ov = _make_overlay(612, 792, draws)
        ov_reader = PdfReader(BytesIO(ov))
        if page_idx < len(writer.pages):
            writer.pages[page_idx].merge_page(ov_reader.pages[0])
    # Strip XFA
    if '/AcroForm' in writer._root_object:
        af = writer._root_object['/AcroForm']
        if hasattr(af, 'get_object'):
            af = af.get_object()
        if '/XFA' in af:
            del af[NameObject('/XFA')]
    out = BytesIO()
    writer.write(out)
    return out.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# Standalone test driver — fills 2025 1040 only, page 1 verification
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    test_data = {
        'name_first': 'Jenelle Alexandra',
        'name_last':  'Elpedes',
        'ssn':        '594-63-6983',
        'address':    '2141 W Madison Street',
        'city':       'Phoenix',
        'state':      'AZ',
        'zip':        '85009-5212',
        'net_profit': 861032,
        'half_se':    22448,
        'agi':        838584,
        'std_ded':    15000,
        'taxable':    823584,
        'fed_tax':    261746,
        'sch2_total': 50252,
        'total_tax':  311998,
    }
    pdf = fill_1040_2025(test_data)
    out = REPO / 'dist' / '_TEST_1040_2025_p1.pdf'
    out.write_bytes(pdf)
    print(f'Wrote {out} ({len(pdf):,} bytes)')
