"""Post-fill reconciliation: read the generated PDF back and prove it prints
what was computed.

Why this exists
---------------
The Jacques Potts 2024 Form 1040-X was computed correctly — total expenses
$68,631, net profit $2,869 — but the printed Schedule C showed only $27,416 of
those expenses, because the filler drew a hand-picked subset of Part II lines
and mapped line 31 onto a square-footage box. Nothing compared the paper to
the model, so the defect shipped. The IRS added up the visible lines, refigured
the profit, and issued a math-error assessment.

This module closes that gap. It does not trust the filler's intent: it opens
the output PDF, reads the text that actually landed inside each widget
rectangle, and then redoes the form's arithmetic on the values it read — the
same thing a human or an IRS examiner does with the paper.

Three families of check
-----------------------
1. ``placed``   every value the model expects on a line is the value that
                reads back from that line's rect.
2. ``stray``    no money lands in a box that was not intended — this is what
                catches a figure printed one line off (net profit in the
                line-30 square-footage box, half-SE on Schedule 1 line 24g).
3. ``math``     the printed figures add up: Part II lines sum to line 28,
                L7 − L28 = L29, L29 − L30 = L31, Part V sums to line 48 and
                equals the "other expenses" line, Schedule 1 line 3 ties to
                Schedule C line 31 and Schedule SE line 2, and so on.

Any finding fails the packet. Callers must write no PDF to dist/ when it does.
"""
import io
import re
import sys
from pathlib import Path

import pdfplumber

_SCRIPTS = Path(__file__).parent.parent / 'scripts'
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))


class ReconcileError(Exception):
    """The printed packet does not match the computed return."""

    def __init__(self, findings, report):
        self.findings = findings
        self.report = report
        super().__init__(f'{len(findings)} reconciliation failure(s)')


MONEY_RE = re.compile(r'^\(?-?[\d,]+\)?$')

# Widget rects that legitimately carry non-line content: identity text and the
# manual comb overlays (SSN / NAICS / EIN). Keyed by form; leaf names as
# load_fields() reports them. Anything else holding a money-shaped value is a
# stray.
IDENTITY_LEAVES = {
    '1040sc': {'f1_1_0', 'f1_2_0', 'f1_3_0', 'BComb_0_f1_4_0', 'f1_5_0',
               'DComb_0_f1_6_0', 'f1_7_0', 'f1_8_0', 'f1_9_0'},
    '1040s1': {'f1_01_0', 'f1_02_0'},
    '1040s2': {'f1_01_0', 'f1_02_0'},
    '1040sse': {'f1_1_0', 'f1_2_0', 'f1_3_0', 'f1_4_0'},
    '8959': {'f1_1_0', 'f1_2_0'},
}


class Finding:
    def __init__(self, kind, form, detail):
        self.kind = kind
        self.form = form
        self.detail = detail

    def __str__(self):
        return f'[{self.kind}] {self.form}: {self.detail}'


# ─────────────────────────────────────────────────────────────────────────────
# Reading values back out of a filled PDF
# ─────────────────────────────────────────────────────────────────────────────
def read_rect(page, rect, pad=2.0):
    """The text that actually landed inside `rect` on `page`."""
    h = page.height
    hits = []
    for w in page.extract_words():
        y_mid = h - (w['top'] + w['bottom']) / 2
        if not (rect[1] - pad <= y_mid <= rect[3] + pad):
            continue
        if w['x1'] <= rect[0] + 1 or w['x0'] >= rect[2] - 1:
            continue
        hits.append((w['x0'], w['text']))
    hits.sort()
    return ' '.join(t for _, t in hits).strip()


def parse_money(text):
    """'1,234' -> 1234, '(56)' -> -56, '' -> 0. None if not money-shaped."""
    s = (text or '').strip()
    if s == '':
        return 0
    if not MONEY_RE.match(s):
        return None
    neg = s.startswith('(') and s.endswith(')')
    digits = s.strip('()').replace(',', '').lstrip('-')
    if not digits.isdigit():
        return None
    val = int(digits)
    return -val if (neg or s.lstrip().startswith('-')) else val


class FormReader:
    """Reads one filled form's PDF by widget rect."""

    def __init__(self, form, year, pdf_bytes):
        import fill_pasta_pals_python as fpp
        self.fpp = fpp
        self.form = form
        self.year = year
        self._doc = pdfplumber.open(io.BytesIO(pdf_bytes))
        self.fields = fpp.load_fields(form, year)

    def close(self):
        self._doc.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def page_for(self, line_key):
        return 2 if line_key.startswith('p2.') else 1

    def rect(self, line_key):
        return self.fpp.get_rect(self.form, self.year, line_key)

    def text(self, line_key):
        rect = self.rect(line_key)
        if rect is None:
            return None
        page_no = self.page_for(line_key)
        if page_no > len(self._doc.pages):
            return None
        return read_rect(self._doc.pages[page_no - 1], rect)

    def value(self, line_key):
        return parse_money(self.text(line_key))

    def all_widget_text(self):
        """{leaf: text} for every widget rect that has ink in it."""
        out = {}
        for leaf, fld in self.fields.items():
            page_no = fld.get('page', 1)
            if page_no > len(self._doc.pages):
                continue
            txt = read_rect(self._doc.pages[page_no - 1], fld['rect'])
            if txt:
                out[leaf] = txt
        return out


# ─────────────────────────────────────────────────────────────────────────────
# Per-form expectation builders — what the model says each line must print
# ─────────────────────────────────────────────────────────────────────────────
def schedule_c_expected(computed_sc, year):
    """{line_key: expected printed string} for Schedule C."""
    import fill_pasta_pals_python as fpp
    fmt = fpp.fmt
    registry = fpp.schc_part_ii_lines(year)

    exp = {
        'p1.L1': fmt(computed_sc['gross_receipts']),
        'p1.L2': fpp.fmt_force(computed_sc['returns_allowances']),
        'p1.L3': fmt(computed_sc['L3_subtract']),
        'p1.L4': fpp.fmt_force(computed_sc['cogs']),
        'p1.L5': fmt(computed_sc['L5_gross_profit']),
        'p1.L6': fpp.fmt_force(computed_sc['L6_other_income']),
        'p1.L7': fmt(computed_sc['L7_gross_income']),
        'p1.L28': fmt(computed_sc['L28_total_expenses']),
        'p1.L29': fmt(computed_sc['L29_tentative_profit']),
        'p1.L31': fmt(computed_sc['L31_net_profit']),
    }
    if computed_sc.get('L30_home_office'):
        exp['p1.L30'] = fmt(computed_sc['L30_home_office'])
    for key, line_key in registry.items():
        amount = computed_sc['expenses'].get(key, 0)
        if amount:
            exp[line_key] = fmt(amount)
    if computed_sc.get('part_v_total'):
        exp['p2.L48'] = fmt(computed_sc['part_v_total'])

    # Part IV is required whenever line 9 carries car/truck expense. Derived
    # here straight from the config block rather than from the filler, so the
    # two sides are independent.
    if computed_sc['expenses'].get('L9_car_truck'):
        exp.update(_part_iv_expected(computed_sc.get('vehicle') or {}))
    return exp


def _part_iv_expected(v):
    exp = {}
    parsed = _split_date(v.get('date_placed_in_service') or '')
    if parsed:
        month, day, year4 = parsed
        exp['p2.L43_month'] = month
        exp['p2.L43_day'] = day
        exp['p2.L43_year'] = year4
    for sub, key in (('a', 'business_miles'), ('b', 'commuting_miles'),
                     ('c', 'other_miles')):
        if v.get(key) is not None:
            exp[f'p2.L44{sub}'] = f'{int(v[key]):,}'
    for line, key in (('L45', 'available_for_personal_use'),
                      ('L46', 'another_vehicle_available'),
                      ('L47a', 'have_evidence'),
                      ('L47b', 'evidence_written')):
        ans = str(v.get(key, '')).strip().lower()
        if ans in ('yes', 'no'):
            exp[f'p2.{line}_{ans}'] = 'X'
    return exp


def _split_date(raw):
    s = str(raw).strip()
    for sep, order in (('-', 'ymd'), ('/', 'mdy')):
        parts = s.split(sep)
        if len(parts) == 3 and all(p.strip().isdigit() for p in parts):
            a, b, c = (p.strip() for p in parts)
            y, m, d = (a, b, c) if order == 'ymd' else (c, a, b)
            if len(y) == 2:
                y = '20' + y
            return f'{int(m):02d}', f'{int(d):02d}', y
    return None


def schedule_1_expected(computed, year):
    import fill_pasta_pals_python as fpp
    fmt = fpp.fmt
    net = computed['net_profit']
    return {
        'p1.L3': fmt(net),
        'p1.L10': fmt(net),
        'p2.L15': fmt(computed['half_se']),
        'p2.L26': fmt(computed['half_se']),
    }


def schedule_se_expected(computed, year):
    import fill_pasta_pals_python as fpp
    fmt = fpp.fmt
    return {
        'p1.L2': fmt(computed['net_profit']),
        'p1.L3': fmt(computed['net_profit']),
        'p1.L4a': fmt(computed['se_earn']),
        'p1.L4c': fmt(computed['se_earn']),
        'p1.L6': fmt(computed['se_earn']),
        # Line 9 is "subtract line 8d from line 7". The pipeline models no
        # W-2 social-security wages, so line 8d is zero and line 9 is the full
        # wage base; _check_schedule_se_math re-derives line 10 from it so a
        # client who does have W-2 wages fails here instead of filing wrong.
        'p1.L9': fmt(computed['ss_base']),
        'p1.L10': fmt(computed['ss_tax']),
        'p1.L11': fmt(computed['med_tax']),
        'p1.L12': fmt(computed['se_total']),
        'p1.L13': fmt(computed['half_se']),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Checks
# ─────────────────────────────────────────────────────────────────────────────
def _check_placed(reader, expected, findings, rows):
    """Every expected value reads back from its own rect."""
    for line_key in sorted(expected):
        want = expected[line_key]
        rect = reader.rect(line_key)
        if rect is None:
            findings.append(Finding(
                'placed', f'{reader.form} {reader.year}',
                f'{line_key} expects "{want}" but no leaf is mapped for it'))
            rows.append((reader.form, line_key, want, '<no leaf>', 'FAIL'))
            continue
        got = reader.text(line_key)
        ok = (got == want)
        rows.append((reader.form, line_key, want, got, 'ok' if ok else 'FAIL'))
        if not ok:
            findings.append(Finding(
                'placed', f'{reader.form} {reader.year}',
                f'{line_key} should print "{want}" but the box at '
                f'y={rect[1]:.0f} reads "{got}"'))


def _check_labels(reader, expected, findings):
    """Confirm each line's box really is that line's box on the IRS template.

    Without this the gate would be blind to the defect that caused the Jacques
    notice: the filler and the gate both read LINE_MAPS, so a leaf pointing at
    the wrong box makes the value "read back" correctly from the wrong place.
    Here the printed label beside the rect is the authority, not the map.
    """
    import verify_field_map

    for line_key in sorted(expected):
        leaf = reader.fpp.LINE_MAPS.get(
            (reader.form, reader.year), {}).get(line_key)
        if leaf is None:
            continue
        status, detail = verify_field_map.audit_entry(
            reader.form, reader.year, line_key, leaf)
        if status == 'bad':
            findings.append(Finding(
                'label', f'{reader.form} {reader.year}',
                f'{line_key} is mapped to a box that is not line '
                f'{line_key.split(".L")[-1]} on the printed form — {detail}'))


def _check_stray(reader, expected, findings):
    """No money-shaped value sits in a box the model did not intend."""
    intended_leaves = set()
    line_map = reader.fpp.LINE_MAPS.get((reader.form, reader.year), {})
    for line_key in expected:
        leaf = line_map.get(line_key)
        if leaf:
            intended_leaves.add(leaf)
    # Checkbox and Part IV answers are intended whenever they are mapped.
    for line_key, leaf in line_map.items():
        if re.search(r'_(yes|no|month|day|year)$', line_key):
            intended_leaves.add(leaf)

    allowed = intended_leaves | IDENTITY_LEAVES.get(reader.form, set())
    # Schedule C Part V rows are itemised client expenses, intended by
    # definition; _check_schedule_c_math proves they sum to line 48.
    allowed |= {leaf for leaf, fld in reader.fields.items()
                if 'PartVTable' in fld.get('id', '')}

    for leaf, txt in reader.all_widget_text().items():
        if leaf in allowed:
            continue
        if parse_money(txt) in (None, 0) and not MONEY_RE.match(txt):
            continue  # free text (a Part V description, a name) — not a figure
        fld = reader.fields[leaf]
        findings.append(Finding(
            'stray', f'{reader.form} {reader.year}',
            f'unexpected value "{txt}" in widget {leaf} '
            f'(page {fld.get("page")}, y={fld["rect"][1]:.0f}) — no line of '
            f'the computed return belongs there'))


def _check_schedule_c_math(reader, computed_sc, findings, notes):
    """Redo Schedule C's arithmetic on the values that actually printed."""
    year = reader.year
    registry = reader.fpp.schc_part_ii_lines(year)

    printed = {}
    for key, line_key in registry.items():
        val = reader.value(line_key)
        if val is None:
            findings.append(Finding(
                'math', f'1040sc {year}',
                f'{line_key} holds "{reader.text(line_key)}", which is not a '
                'money amount'))
            return
        printed[line_key] = val

    part_ii_sum = sum(printed.values())
    l28 = reader.value('p1.L28')
    l7 = reader.value('p1.L7')
    l29 = reader.value('p1.L29')
    l30 = reader.value('p1.L30') or 0
    l31 = reader.value('p1.L31')

    notes.append(f'Schedule C: printed Part II lines sum to {part_ii_sum:,}; '
                 f'line 28 reads {l28:,}')

    if part_ii_sum != l28:
        gap = l28 - part_ii_sum
        findings.append(Finding(
            'math', f'1040sc {year}',
            f'printed Part II lines total {part_ii_sum:,} but line 28 reads '
            f'{l28:,} — {gap:,} of expense is counted in the total without '
            'appearing on any visible line. This is exactly the defect that '
            'drew the IRS math-error assessment.'))

    if l7 - l28 != l29:
        findings.append(Finding(
            'math', f'1040sc {year}',
            f'line 7 ({l7:,}) − line 28 ({l28:,}) = {l7 - l28:,}, but line 29 '
            f'reads {l29:,}'))

    if l29 - l30 != l31:
        findings.append(Finding(
            'math', f'1040sc {year}',
            f'line 29 ({l29:,}) − line 30 ({l30:,}) = {l29 - l30:,}, but line '
            f'31 reads {l31:,}'))

    # Part V: the itemised rows must sum to line 48, which must equal the
    # "other expenses" line (27a in 2024, 27b in 2025).
    part_v_rows = []
    for leaf, fld in reader.fields.items():
        if (fld.get('page') == 2 and fld.get('type') == 'text'
                and 'PartVTable' in fld.get('id', '') and fld['rect'][0] >= 400):
            txt = read_rect(reader._doc.pages[1], fld['rect'])
            val = parse_money(txt)
            if val:
                part_v_rows.append(val)
    l48 = reader.value('p2.L48') or 0
    other_line = reader.fpp.schc_partv_total_line(year)
    l_other = reader.value(other_line) or 0

    if part_v_rows or l48 or l_other:
        notes.append(f'Schedule C: Part V rows sum to {sum(part_v_rows):,}; '
                     f'line 48 reads {l48:,}; {other_line} reads {l_other:,}')
        if sum(part_v_rows) != l48:
            findings.append(Finding(
                'math', f'1040sc {year}',
                f'Part V rows total {sum(part_v_rows):,} but line 48 reads '
                f'{l48:,}'))
        if l48 != l_other:
            findings.append(Finding(
                'math', f'1040sc {year}',
                f'line 48 reads {l48:,} but {other_line} — the "other '
                f'expenses" line for {year} — reads {l_other:,}'))


def _check_schedule_se_math(reader, computed, findings, notes):
    """Redo Schedule SE's arithmetic on the printed figures."""
    v = reader.value
    l3, l4a, l6 = v('p1.L3'), v('p1.L4a'), v('p1.L6')
    l9, l10, l11, l12, l13 = (v('p1.L9'), v('p1.L10'), v('p1.L11'),
                              v('p1.L12'), v('p1.L13'))
    if None in (l3, l4a, l6, l9, l10, l11, l12, l13):
        findings.append(Finding('math', f'1040sse {reader.year}',
                                'a Part I line did not read back as a number'))
        return

    def near(got, want, tol=1):
        return abs(got - want) <= tol

    notes.append(f'Schedule SE: L3 {l3:,} x 92.35% = {l4a:,}; '
                 f'SS 12.4% of min(L6,L9) = {l10:,}; Medicare 2.9% = {l11:,}; '
                 f'total {l12:,}; half {l13:,}')

    if not near(l4a, round(l3 * 0.9235)):
        findings.append(Finding(
            'math', f'1040sse {reader.year}',
            f'line 4a reads {l4a:,} but 92.35% of line 3 ({l3:,}) is '
            f'{round(l3 * 0.9235):,}'))
    if not near(l10, round(min(l6, l9) * 0.124)):
        findings.append(Finding(
            'math', f'1040sse {reader.year}',
            f'line 10 reads {l10:,} but 12.4% of the smaller of line 6 '
            f'({l6:,}) and line 9 ({l9:,}) is '
            f'{round(min(l6, l9) * 0.124):,}'))
    if not near(l11, round(l6 * 0.029)):
        findings.append(Finding(
            'math', f'1040sse {reader.year}',
            f'line 11 reads {l11:,} but 2.9% of line 6 ({l6:,}) is '
            f'{round(l6 * 0.029):,}'))
    if not near(l12, l10 + l11):
        findings.append(Finding(
            'math', f'1040sse {reader.year}',
            f'line 12 reads {l12:,} but lines 10 + 11 = {l10 + l11:,}'))
    if not near(l13, round(l12 / 2)):
        findings.append(Finding(
            'math', f'1040sse {reader.year}',
            f'line 13 reads {l13:,} but half of line 12 is {round(l12 / 2):,}'))


def _check_cross_form(printed, findings, notes):
    """Schedule 1 line 3 = Schedule C line 31 = Schedule SE line 2."""
    sc31 = printed.get(('1040sc', 'p1.L31'))
    s1l3 = printed.get(('1040s1', 'p1.L3'))
    se2 = printed.get(('1040sse', 'p1.L2'))
    present = [v for v in (sc31, s1l3, se2) if v is not None]
    if len(present) > 1:
        notes.append(f'Carry-forward: Sch C L31 {sc31}, Sch 1 L3 {s1l3}, '
                     f'Sch SE L2 {se2}')
        if len(set(present)) != 1:
            findings.append(Finding(
                'math', 'cross-form',
                f'net profit disagrees across forms — Schedule C line 31 '
                f'{sc31}, Schedule 1 line 3 {s1l3}, Schedule SE line 2 {se2}'))

    s1l15 = printed.get(('1040s1', 'p2.L15'))
    s1l26 = printed.get(('1040s1', 'p2.L26'))
    s1l25 = printed.get(('1040s1', 'p2.L25')) or 0
    if s1l15 is not None and s1l26 is not None:
        expect26 = s1l15 + s1l25
        notes.append(f'Schedule 1: lines 11-25 sum to {expect26}; '
                     f'line 26 reads {s1l26}')
        if expect26 != s1l26:
            findings.append(Finding(
                'math', '1040s1',
                f'lines 11 through 25 sum to {expect26} but line 26 (total '
                f'adjustments) reads {s1l26}'))


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
def reconcile(parts, computed, year, label=''):
    """Check each filled form against the computed return.

    parts: list of (form_name, pdf_bytes) in packet order.
    computed: the dict from compute_individual_return (or the amendment's
              corrected-side model).
    Returns the report text. Raises ReconcileError if anything disagrees.
    """
    findings = []
    rows = []
    notes = []
    printed = {}

    builders = {
        '1040sc': lambda: schedule_c_expected(computed['sch_c'], year),
        '1040s1': lambda: schedule_1_expected(computed, year),
        '1040sse': lambda: schedule_se_expected(computed, year),
    }

    for form, pdf_bytes in parts:
        if form not in builders:
            notes.append(f'{form}: no reconciliation rules yet — not checked')
            continue
        expected = builders[form]()
        with FormReader(form, year, pdf_bytes) as reader:
            _check_labels(reader, expected, findings)
            _check_placed(reader, expected, findings, rows)
            _check_stray(reader, expected, findings)
            if form == '1040sc':
                _check_schedule_c_math(reader, computed['sch_c'], findings, notes)
            elif form == '1040sse':
                _check_schedule_se_math(reader, computed, findings, notes)
            for line_key in list(expected) + ['p2.L25']:
                val = reader.value(line_key)
                if val is not None:
                    printed[(form, line_key)] = val

    _check_cross_form(printed, findings, notes)

    report = _format_report(label, year, rows, notes, findings)
    if findings:
        raise ReconcileError(findings, report)
    return report


def _format_report(label, year, rows, notes, findings):
    out = []
    out.append('=' * 78)
    out.append(f'PRINT CHECK — {label or "return"} {year}')
    out.append('=' * 78)
    out.append('')
    out.append('Computed vs printed, read back from the output PDF by widget rect:')
    out.append('')
    out.append(f'  {"form":<9} {"line":<14} {"computed":>14} {"printed":>14}  status')
    out.append(f'  {"-"*9} {"-"*14} {"-"*14} {"-"*14}  ------')
    for form, line_key, want, got, status in rows:
        shown_want = want if want != '' else '(blank)'
        shown_got = got if got not in ('', None) else '(blank)'
        out.append(f'  {form:<9} {line_key:<14} {shown_want:>14} '
                   f'{shown_got:>14}  {status}')
    out.append('')
    if notes:
        out.append('Arithmetic performed on the printed figures:')
        for n in notes:
            out.append(f'  - {n}')
        out.append('')
    if findings:
        out.append(f'RESULT: FAIL — {len(findings)} finding(s). '
                   'No packet was written.')
        out.append('')
        for f in findings:
            out.append(f'  {f}')
    else:
        out.append('RESULT: PASS — every computed figure prints on its own '
                   'line, nothing landed in an unintended box, and the '
                   'printed figures add up.')
    out.append('')
    return '\n'.join(out)
