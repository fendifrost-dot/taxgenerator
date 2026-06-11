"""Standalone Form 1040-X filler for tax-year-2024 amendments.

Built from scratch from direct AcroForm widget extraction of the official IRS
Form 1040-X (Rev. December 2025 — the continuous-use revision valid for
amending TY2024; you enter the calendar year in the header).

Layout reality (verified from PDF /Annots widgets + pdfplumber line labels):
  Page 1 identity block (y desc):
    y=702: f1_01  calendar-year box (MaxLen 4)
    y=678: f1_03 (first+MI) | f1_04 (last) | f1_05 (SSN comb, MaxLen 9)
    y=654: f1_06 (spouse first) | f1_07 (spouse last) | f1_08 (spouse SSN comb)
    y=630: f1_09 (home address) | f1_10 (apt)
    y=606: f1_11 (city) | f1_12 (state) | f1_13 (zip)
    y=582: f1_14/15/16  foreign country / province / postal
    y=546: c1_3 radio group — filing status: [0]Single [1]MFJ [2]MFS [3]HOH [4]QSS
    y=516: f1_17  MFS/HOH qualifying-person name

  Page 1 three-column money grid — columns by rect X:
    A "Original amount"  x 382-446   (right edge 446)
    B "Net change"       x 446-510   (right edge 510)
    C "Correct amount"   x 511-576   (right edge 576)
  Line → (A,B,C) leaves (all page 1):
    1  AGI                 f1_18 f1_19 f1_20
    2  Deduction           f1_21 f1_22 f1_23
    3  L1-L2               f1_24 f1_25 f1_26
    4a QBI                 f1_27 f1_28 f1_29
    4b Sch 1-A deds        f1_30 f1_31 f1_32
    5  Taxable income      f1_33 f1_34 f1_35
    6  Tax  (+method box f1_36)   f1_37 f1_38 f1_39
    7  Nonrefundable credits      f1_40 f1_41 f1_42
    8  L6-L7               f1_43 f1_44 f1_45
    9  Reserved            f1_46 f1_47 f1_48   (leave blank)
    10 Other taxes         f1_49 f1_50 f1_51
    11 Total tax           f1_52 f1_53 f1_54
    12 Withholding         f1_55 f1_56 f1_57
    13 Estimated payments  f1_58 f1_59 f1_60
    14 EIC                 f1_61 f1_62 f1_63
    15 Refundable credits (+specify box f1_64)  f1_65 f1_66 f1_67
    16 Paid w/ ext+orig+after   (col C only)  f1_68
    17 Total payments           (col C only)  f1_69
    18 Overpayment on original  (col C only)  f1_70
    19 L17-L18                  (col C only)  f1_71
    20 Amount you owe           (col C only)  f1_72
    21 Overpaid                 (col C only)  f1_73
    22 Refund to you            (col C only)  f1_74
    23 Applied to est tax: year f1_75, amount f1_76

  Page 2:
    Part I Dependents grid (lines 24-30) — skipped (no dependent changes here)
    "Explanation of Changes" box = f2_35, rect [65,216,576,388], multiline
    Signature block at bottom — left blank for the client to sign.
"""
import json
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, ArrayObject
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

REPO = Path(__file__).parent.parent
PDF_IN = REPO / 'public' / 'irs-forms' / '1040x_2024.pdf'

# ─────────────────────────────────────────────────────────────────────────────
# Widget extraction (direct from PDF /Annots, same approach as fill_1040_2025)
# ─────────────────────────────────────────────────────────────────────────────
_WIDGETS = None


def _extract_widgets():
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
            out.append({
                'page': pg_idx + 1,
                'leaf': leaf,
                'rect': rect,
                'is_comb': bool(flags & (1 << 24)),
                'max_len': ao.get('/MaxLen'),
                'ft': str(ao.get('/FT', '')),
            })
    _WIDGETS = out
    return out


def find_widget(page, leaf=None, x_target=None, y_target=None, tol=2.0):
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
    """key is 'pN.leaf' string OR a dict {page, leaf, x, y}."""
    spec = FIELD_MAP_1040X_2024.get(key)
    if spec is None:
        return None
    if isinstance(spec, dict):
        return find_widget(spec['page'], leaf=spec.get('leaf'),
                           x_target=spec.get('x'), y_target=spec.get('y'))
    if '.' in spec:
        page_str, leaf = spec.split('.', 1)
        return find_widget(int(page_str[1:]), leaf=leaf)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# FIELD REGISTRY — line → leaf, built from rect extraction (see module docstring)
# ─────────────────────────────────────────────────────────────────────────────
FIELD_MAP_1040X_2024 = {
    # ── Identity (page 1) ──
    'hdr.year':     'p1.f1_01_0',
    'name.first':   'p1.f1_03_0',
    'name.last':    'p1.f1_04_0',
    'name.ssn':     'p1.f1_05_0',   # comb, MaxLen 9
    'spouse.first': 'p1.f1_06_0',
    'spouse.last':  'p1.f1_07_0',
    'spouse.ssn':   'p1.f1_08_0',
    'addr.street':  'p1.f1_09_0',
    'addr.apt':     'p1.f1_10_0',
    'addr.city':    'p1.f1_11_0',
    'addr.state':   'p1.f1_12_0',
    'addr.zip':     'p1.f1_13_0',
    # Filing-status radio (c1_3 instances share the leaf index per state; pick by rect)
    'fs.single': {'page': 1, 'leaf': 'c1_3_0', 'x': 36.0, 'y': 546.0},
    'fs.mfj':    {'page': 1, 'leaf': 'c1_3_1', 'x': 79.0, 'y': 546.0},
    'fs.mfs':    {'page': 1, 'leaf': 'c1_3_2', 'x': 173.0, 'y': 546.0},
    'fs.hoh':    {'page': 1, 'leaf': 'c1_3_3', 'x': 310.0, 'y': 546.0},
    'fs.qss':    {'page': 1, 'leaf': 'c1_3_4', 'x': 432.0, 'y': 546.0},
    # Line 6 "method used to figure tax" descriptive box
    'L6.method':  'p1.f1_36_0',
    # Part II Explanation of Changes (page 2)
    'explanation': 'p2.f2_35_0',
}

# Money grid: line id → (A leaf, B leaf, C leaf). None = no widget in that column.
GRID_LEAVES = {
    '1':  ('f1_18_0', 'f1_19_0', 'f1_20_0'),
    '2':  ('f1_21_0', 'f1_22_0', 'f1_23_0'),
    '3':  ('f1_24_0', 'f1_25_0', 'f1_26_0'),
    '4a': ('f1_27_0', 'f1_28_0', 'f1_29_0'),
    '4b': ('f1_30_0', 'f1_31_0', 'f1_32_0'),
    '5':  ('f1_33_0', 'f1_34_0', 'f1_35_0'),
    '6':  ('f1_37_0', 'f1_38_0', 'f1_39_0'),
    '7':  ('f1_40_0', 'f1_41_0', 'f1_42_0'),
    '8':  ('f1_43_0', 'f1_44_0', 'f1_45_0'),
    '10': ('f1_49_0', 'f1_50_0', 'f1_51_0'),
    '11': ('f1_52_0', 'f1_53_0', 'f1_54_0'),
    '12': ('f1_55_0', 'f1_56_0', 'f1_57_0'),
    '13': ('f1_58_0', 'f1_59_0', 'f1_60_0'),
    '14': ('f1_61_0', 'f1_62_0', 'f1_63_0'),
    '15': ('f1_65_0', 'f1_66_0', 'f1_67_0'),
    # Reconciliation lines — column C only
    '16': (None, None, 'f1_68_0'),
    '17': (None, None, 'f1_69_0'),
    '18': (None, None, 'f1_70_0'),
    '19': (None, None, 'f1_71_0'),
    '20': (None, None, 'f1_72_0'),
    '21': (None, None, 'f1_73_0'),
    '22': (None, None, 'f1_74_0'),
}


# ─────────────────────────────────────────────────────────────────────────────
# Draw helpers (identical math to fill_1040_2025)
# ─────────────────────────────────────────────────────────────────────────────
def baseline_for(rect, font_size=10):
    cap = font_size * 0.72
    return rect[1] + (rect[3] - rect[1] - cap) / 2


def text_draw(rect, value, align='left', x_pad=4, font_size=10):
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


def comb_draws(rect, value, font_size=10, layout='even'):
    """Place digits in an equal-cell comb field. The 1040-X SSN box is a true
    9-cell comb (MaxLen 9, equal widths), so even distribution centers each
    digit in its cell — matching the form's pre-printed cell separators."""
    digits = ''.join(c for c in str(value) if c.isdigit())
    total_w = rect[2] - rect[0]
    x0 = rect[0]
    y = baseline_for(rect, font_size)
    n = max(1, len(digits))
    fracs = [(i + 0.5) / n for i in range(n)]
    out = []
    for i, ch in enumerate(digits):
        cx = x0 + fracs[i] * total_w
        cw = stringWidth(ch, 'Helvetica', font_size)
        out.append((cx - cw / 2, y, ch, font_size))
    return out


def wrap_text(text, max_width, font_size):
    """Greedy word-wrap to max_width (PDF points) using Helvetica metrics."""
    out = []
    for para in str(text).split('\n'):
        if not para.strip():
            out.append('')
            continue
        line = ''
        for word in para.split():
            trial = (line + ' ' + word).strip()
            if stringWidth(trial, 'Helvetica', font_size) <= max_width:
                line = trial
            else:
                if line:
                    out.append(line)
                line = word
        if line:
            out.append(line)
    return out


def fmt_money(n):
    if n is None:
        return ''
    n = int(round(n))
    if n == 0:
        return '0'
    if n < 0:
        return f"({abs(n):,})"
    return f"{n:,}"


# ─────────────────────────────────────────────────────────────────────────────
# Fill
# ─────────────────────────────────────────────────────────────────────────────
def fill_1040x_2024(model, identity):
    """Fill the 1040-X from a three-column amendment `model` + `identity` dict.

    model: output of compute_amendment — has 'taxYear', 'lines'
           (each {line, a, b, c}), and 'explanation'.
    identity: {name_first, name_last, ssn, spouse_*, address, apt, city,
               state, zip, filing_status}.
    Returns the filled 1040-X PDF as bytes (page 1 + page 2)."""
    _extract_widgets()
    page1, page2 = [], []

    def put_text(field_key, value, align='left', x_pad=4, fs=10):
        w = find_widget_by_key(field_key)
        if not w:
            return
        draw = text_draw(w['rect'], value, align=align, x_pad=x_pad, font_size=fs)
        if draw is None:
            return
        (page2 if w['page'] == 2 else page1).append(draw)

    def put_comb(field_key, value, fs=10):
        w = find_widget_by_key(field_key)
        if not w:
            return
        (page2 if w['page'] == 2 else page1).extend(comb_draws(w['rect'], value, fs))

    def put_check(field_key):
        w = find_widget_by_key(field_key)
        if not w:
            return
        r = w['rect']
        (page2 if w['page'] == 2 else page1).append((r[0] + 0.8, r[1] + 0.8, 'X', 10))

    # ── Identity ──
    put_text('hdr.year', str(model['taxYear']), align='center')
    put_text('name.first', identity.get('name_first', ''))
    put_text('name.last', identity.get('name_last', ''))
    put_comb('name.ssn', identity.get('ssn', ''))
    if identity.get('spouse_first'):
        put_text('spouse.first', identity['spouse_first'])
        put_text('spouse.last', identity.get('spouse_last', ''))
        put_comb('spouse.ssn', identity.get('spouse_ssn', ''))
    put_text('addr.street', identity.get('address', ''))
    put_text('addr.apt', identity.get('apt', ''))
    put_text('addr.city', identity.get('city', ''))
    put_text('addr.state', identity.get('state', ''))
    put_text('addr.zip', identity.get('zip', ''))

    fs_key = {
        'single': 'fs.single', 'mfj': 'fs.mfj', 'mfs': 'fs.mfs',
        'hoh': 'fs.hoh', 'qss': 'fs.qss',
    }.get(identity.get('filing_status', 'single'), 'fs.single')
    put_check(fs_key)

    # ── Money grid: lines 1-22 ──
    for ln in model['lines']:
        leaves = GRID_LEAVES.get(ln['line'])
        if not leaves:
            continue
        for col, leaf in zip(('a', 'b', 'c'), leaves):
            if leaf is None:
                continue
            val = ln.get(col)
            if val is None:
                continue
            w = find_widget(1, leaf=leaf)
            if not w:
                continue
            draw = text_draw(w['rect'], fmt_money(val), align='right', x_pad=3)
            if draw:
                page1.append(draw)

    # Line 6 method-to-figure-tax (descriptive)
    if model.get('tax_method'):
        put_text('L6.method', model['tax_method'])

    # ── Part II Explanation of Changes (page 2 multiline box) ──
    expl_w = find_widget_by_key('explanation')
    if expl_w and model.get('explanation'):
        r = expl_w['rect']
        fs = 9
        lh = fs + 2.5
        max_w = (r[2] - r[0]) - 8
        lines = wrap_text(model['explanation'], max_w, fs)
        y = r[3] - lh
        for line in lines:
            if y < r[1] + 2:
                break
            page2.append((r[0] + 4, y, line, fs))
            y -= lh

    return _merge_overlays(PDF_IN, {0: page1, 1: page2})


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
    for page_idx, draws in page_overlays.items():
        if not draws:
            continue
        ov = _make_overlay(612, 792, draws)
        ov_reader = PdfReader(BytesIO(ov))
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


if __name__ == '__main__':
    # Smoke test with the Jacques Potts §7 numbers
    demo_model = {
        'taxYear': 2024,
        'tax_method': 'Tax Table',
        'lines': [
            {'line': '1',  'a': 42081, 'c': 2666,  'b': -39415},
            {'line': '2',  'a': 14600, 'c': 14600, 'b': 0},
            {'line': '3',  'a': 27481, 'c': -11934, 'b': -39415},
            {'line': '4a', 'a': 5496,  'c': 0,     'b': -5496},
            {'line': '5',  'a': 21985, 'c': 0,     'b': -21985},
            {'line': '6',  'a': 2406,  'c': 0,     'b': -2406},
            {'line': '10', 'a': 6398,  'c': 406,   'b': -5992},
            {'line': '11', 'a': 8804,  'c': 406,   'b': -8398},
            {'line': '20', 'a': None,  'c': 406,   'b': None},
        ],
        'explanation': 'Schedule C reconstructed from complete books and records.',
    }
    demo_identity = {
        'name_first': 'Jacques', 'name_last': 'Potts', 'ssn': '361-94-2653',
        'address': '944 PLEASANT ST', 'city': 'OAK PARK', 'state': 'IL',
        'zip': '60302', 'filing_status': 'single',
    }
    pdf = fill_1040x_2024(demo_model, demo_identity)
    out = REPO / 'dist' / '_TEST_1040X_2024.pdf'
    out.parent.mkdir(exist_ok=True)
    out.write_bytes(pdf)
    print(f'Wrote {out} ({len(pdf):,} bytes)')
