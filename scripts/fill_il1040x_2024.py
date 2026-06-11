"""Standalone Form IL-1040-X filler for tax-year-2024 Illinois amendments.

Built from direct AcroForm widget extraction of the official Illinois Department
of Revenue Form IL-1040-X (R-12/24, barcode 61512241W). Unlike the federal
Form 1040-X (three columns), IL-1040-X is a SINGLE "Corrected figures" column
plus a payment reconciliation (Steps 9-10). Each money line has one widget in
the right-hand column (x ≈ 502-576); the ".00" is pre-printed, so we draw the
whole-dollar integer right-aligned at the box edge.

This Illinois form names its widgets with human-readable /T strings (e.g.
"Corrected Illinois base income") rather than f1_NN leaves, so the field map
binds each line to its descriptive widget name. Verified against pdfplumber
line labels + a rendered overlay.

Same rect-driven scaffolding as scripts/fill_1040x_2024.py (baseline math,
right-align via real Helvetica metrics, widget-removal merge).
"""
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, ArrayObject
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

REPO = Path(__file__).parent.parent
PDF_IN = REPO / 'public' / 'irs-forms' / 'il1040x_2024.pdf'

# ─────────────────────────────────────────────────────────────────────────────
# Widget extraction (direct from PDF /Annots, same approach as fill_1040x_2024)
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
            # IL widgets carry the readable name directly in /T (leaf).
            parts = []
            cur = ao
            seen = 0
            while cur is not None and seen < 12:
                t = cur.get('/T')
                if t is not None:
                    parts.append(str(t))
                p = cur.get('/Parent')
                cur = p.get_object() if hasattr(p, 'get_object') else p
                seen += 1
            leaf = parts[0] if parts else ''
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


def find_widget(page, leaf=None, x_target=None, y_target=None, tol=3.0):
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
    spec = FIELD_MAP_IL1040X_2024.get(key)
    if spec is None:
        return None
    if isinstance(spec, dict):
        return find_widget(spec['page'], leaf=spec.get('leaf'),
                           x_target=spec.get('x'), y_target=spec.get('y'))
    page_str, leaf = spec.split('.', 1)
    return find_widget(int(page_str[1:]), leaf=leaf)


# ─────────────────────────────────────────────────────────────────────────────
# FIELD REGISTRY — IL-1040-X (R-12/24). Built from /Annots /T names + rects.
# ─────────────────────────────────────────────────────────────────────────────
FIELD_MAP_IL1040X_2024 = {
    # ── Identity (page 1) ──
    'name.first':   'p1.Your first name and initial',
    'name.last':    'p1.Your last name',
    'name.ssn':     'p1.Your social security number',   # MaxLen 11, plain box
    'spouse.first': "p1.Your spouse's first name and initial",
    'spouse.last':  "p1.Your spouse's last name",
    'spouse.ssn':   "p1.Your spouse's social security number",
    'addr.street':  'p1.Mailing address (See instructions if foreign address)',
    'addr.apt':     'p1.Apartment number',
    'addr.city':    'p1.City',
    'addr.state':   'p1.State',
    'addr.zip':     'p1.ZIP or Postal Code',
    # Filing-status radio (all share leaf "Filing status"; pick by rect X)
    'fs.single':   {'page': 1, 'leaf': 'Filing status', 'x': 96.6},
    'fs.mfj':      {'page': 1, 'leaf': 'Filing status', 'x': 144.1},
    'fs.mfs':      {'page': 1, 'leaf': 'Filing status', 'x': 239.3},
    'fs.qss':      {'page': 1, 'leaf': 'Filing status', 'x': 353.9},   # "Widowed"
    'fs.hoh':      {'page': 1, 'leaf': 'Filing status', 'x': 410.6},
    # Step 11C: did you file a federal 1040X? Yes / No  (leaf "Check Box21")
    'q.fed1040x.yes': {'page': 2, 'leaf': 'Check Box21', 'x': 507.9},
    'q.fed1040x.no':  {'page': 2, 'leaf': 'Check Box21', 'x': 544.4},
    # Step 11D Explanation of changes (multiline)
    'explanation': 'p2.Explain',
}

# Money lines → widget leaf. Single "Corrected figures" column. Page in MONEY_PAGE.
MONEY_LEAVES = {
    # Step 2: Income (page 1)
    '1':   'Corrected federally adjusted gross income',
    '2':   'Corrected federally tax-exempt',
    '3':   'Corrected other additions',
    '4':   'Corrected other income',                 # Line 4 "Total income"
    # Step 3: Base income
    '5':   'Corrected Social Security benefits',
    '6':   'Corrected Illinois Income Tax',
    '7':   'Corrected other subtractions',
    '8':   'Corrected total subtractions',
    '9':   'Corrected Illinois base income',
    # Step 4: Exemptions
    '10a': 'Corrected exemption amount',
    '10b': 'Corrected number of persons who are 65 or older',
    '10c': 'Corrected number of people who are legally blind',
    '10d': 'Corrrected number of claimed dependents',   # (sic) Sch IL-E/EITC amt
    '10':  'Corrected exemption allowance',
    # Step 5: Net income and tax
    '11':  'Corrected Illinois net income',
    '12':  'Corrected residents calculation',
    '13':  'Corrected recapture of investment tax credits',
    '14':  'Corrected income tax',
    # Step 6: Nonrefundable credits
    '15':  'Corrected credit from Schedule CR',
    '16':  'Corrected Schedule ICR',
    '17':  'Corrected credit from Schedule 1299-C',
    '18':  'Corrected nonrefundable credits',
    '19':  'Corrected tax after nonrefundable credits',
    # Step 7: Other taxes
    '20':  'Corrected household employment tax',
    '21':  'Corrected use tax',
    '22':  'Corrected Compassionate Use of Medical Cannabis Program Act',
    '23':  'Corrected total tax',
    # Page 2
    '24':  'Correted total tax from Line 23',           # (sic) leaf typo in form
    '25':  'Corrected Illinois Income Tax withheld',
    '26':  'Corrected estimated payments',
    '27':  'Corrected pass-through withholding',
    '28':  'Corrected pass-through entity tax credit',
    '29':  'Corrected Earned Income Tax Credit',
    '30':  'Corrected Child Tax credit from Schedule IL-E/EITC',
    '31':  'Corrected total amount paid',
    '32':  'Corrected total payments and refundable credit',
    '33':  'Correct if Line 32 is greater',
    '34':  'Corrected if Line 24 is greater',
    '35':  'Corrected overpayment, if any, as shown',
    '36':  'Corrected overpayment',
    '37':  'Corrected amount from Line 36',
    '38':  'Corrected Subtract Line 38',
    '39':  'Corrected amount you owe',
}
MONEY_PAGE = {lid: (2 if int(lid.rstrip('abcd')) >= 24 else 1)
              for lid in MONEY_LEAVES}


# ─────────────────────────────────────────────────────────────────────────────
# Draw helpers (identical math to fill_1040x_2024)
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


def comb_draws(rect, value, font_size=10):
    digits = ''.join(c for c in str(value) if c.isdigit())
    total_w = rect[2] - rect[0]
    x0, y = rect[0], baseline_for(rect, font_size)
    n = max(1, len(digits))
    out = []
    for i, ch in enumerate(digits):
        cx = x0 + ((i + 0.5) / n) * total_w
        cw = stringWidth(ch, 'Helvetica', font_size)
        out.append((cx - cw / 2, y, ch, font_size))
    return out


def wrap_text(text, max_width, font_size):
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
def fill_il1040x_2024(model, identity):
    """Fill the IL-1040-X from a single-column amendment `model` + `identity`.

    model: output of compute_il_amendment — has 'taxYear', 'lines' (dict
           {line_id: value}), 'draw' (set of line ids to render), 'explanation'.
    identity: {name_first, name_last, ssn, spouse_*, address, apt, city, state,
               zip, filing_status, filed_federal_1040x (bool)}.
    Returns the filled IL-1040-X PDF as bytes (page 1 + page 2)."""
    _extract_widgets()
    page1, page2 = [], []

    def sink(w):
        return page2 if w['page'] == 2 else page1

    def put_text(field_key, value, align='left', x_pad=4, fs=10):
        w = find_widget_by_key(field_key)
        if not w:
            return
        draw = text_draw(w['rect'], value, align=align, x_pad=x_pad, font_size=fs)
        if draw:
            sink(w).append(draw)

    def put_check(field_key):
        w = find_widget_by_key(field_key)
        if not w:
            return
        r = w['rect']
        sink(w).append((r[0] + 0.8, r[1] + 0.8, 'X', 9))

    # ── Identity ──
    put_text('name.first', identity.get('name_first', ''))
    put_text('name.last', identity.get('name_last', ''))
    put_text('name.ssn', identity.get('ssn', ''))
    if identity.get('spouse_first'):
        put_text('spouse.first', identity['spouse_first'])
        put_text('spouse.last', identity.get('spouse_last', ''))
        put_text('spouse.ssn', identity.get('spouse_ssn', ''))
    put_text('addr.street', identity.get('address', ''))
    put_text('addr.apt', identity.get('apt', ''))
    put_text('addr.city', identity.get('city', ''))
    put_text('addr.state', identity.get('state', ''))
    put_text('addr.zip', identity.get('zip', ''))

    put_check({
        'single': 'fs.single', 'mfj': 'fs.mfj', 'mfs': 'fs.mfs',
        'hoh': 'fs.hoh', 'qss': 'fs.qss',
    }.get(identity.get('filing_status', 'single'), 'fs.single'))

    # ── Money column: lines drawn per model['draw'] ──
    draw = model.get('draw') or set(model['lines'].keys())
    for lid, leaf in MONEY_LEAVES.items():
        if lid not in draw:
            continue
        val = model['lines'].get(lid)
        if val is None:
            continue
        w = find_widget(MONEY_PAGE[lid], leaf=leaf)
        if not w:
            continue
        d = text_draw(w['rect'], fmt_money(val), align='right', x_pad=3)
        if d:
            sink(w).append(d)

    # ── Step 11C: filed a federal 1040-X? ──
    if identity.get('filed_federal_1040x'):
        put_check('q.fed1040x.yes')

    # ── Step 11D Explanation (multiline box) ──
    expl_w = find_widget_by_key('explanation')
    if expl_w and model.get('explanation'):
        r = expl_w['rect']
        fs = 9
        lh = fs + 2.5
        max_w = (r[2] - r[0]) - 8
        y = r[3] - lh
        for line in wrap_text(model['explanation'], max_w, fs):
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
    # Smoke test with the Jacques Potts §6 numbers
    from taxgenerator.config import load_client
    from taxgenerator.state_il import compute_il_amendment
    orig = load_client(str(REPO / 'clients' / 'jacques_potts_original.json'))
    amend = load_client(str(REPO / 'clients' / 'jacques_potts.json'))
    model = compute_il_amendment(orig, amend, 2024)
    ident = {
        'name_first': 'Jacques', 'name_last': 'Potts', 'ssn': '361-94-2653',
        'address': '944 PLEASANT ST', 'city': 'OAK PARK', 'state': 'IL',
        'zip': '60302', 'filing_status': 'single', 'filed_federal_1040x': True,
    }
    pdf = fill_il1040x_2024(model, ident)
    out = REPO / 'dist' / '_TEST_IL1040X_2024.pdf'
    out.parent.mkdir(exist_ok=True)
    out.write_bytes(pdf)
    print(f'Wrote {out} ({len(pdf):,} bytes)')
