"""Audit LINE_MAPS against the printed IRS labels in each template PDF.

For every (form, year) line_key -> leaf entry, resolve the widget rect, read the
printed label text that sits immediately to the LEFT of that rect on the same
row, and check that the row carries the line number the key claims.

This is the tool CLAUDE.md's "how to add a new tax year" step 4 describes, made
repeatable: pdfplumber labels cross-referenced with .fields.json rects. It is
the only sanctioned way to assert a leaf is correct — leaf-name order is NOT
evidence (the IRS renumbered Schedule C 27a/27b between 2024 and 2025 without
changing the leaf sequence).

How a line number is identified
-------------------------------
An IRS money box has its line number reprinted immediately to its left, on the
box's own bottom row — "10 Commissions and fees . . . 10". So the authority for
"is this line 10's box?" is the RIGHTMOST line-number token on that row, the
one nearest the box.

Asking merely whether the number appears *somewhere* near the box is not
enough, and this is not hypothetical. The row band used to be 6pt either side
of a 12pt-tall rect, which reaches 3-4 printed rows; the claimed number was
then almost always present, just belonging to a neighbour. Pointing every
mapped line at every other box on its page, that rule accepted 97 of 2,852
wrong boxes — including Schedule C line 9 pointed at line 10, which prints the
car-and-truck figure in the commissions box while Part II still sums correctly.
A figure in the wrong box with self-consistent arithmetic is precisely the
defect the IRS assessed under math-error authority. The rule below accepts 0
of those 2,852, and still accepts all 148 correct mappings.

Boxes that share a row
----------------------
Yes/No pairs, the Cash/Accrual/Other method boxes, the three mileage boxes and
the three date cells all sit on one printed row, so every box on the row
matches the row's phrase equally and a phrase check cannot tell them apart.
Each is bound instead to the option word printed beside it, on the side the
form puts it — see ROW_EXPECT.

Usage:
    python3 scripts/verify_field_map.py                 # audit every form/year
    python3 scripts/verify_field_map.py 1040sc 2024     # audit one

Exit code is nonzero if any mapped line fails its label check.
"""
import re
import sys
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).parent))
import fill_pasta_pals_python as fpp  # noqa: E402

FORMS = fpp.FORMS

# Keys that are free text / identity rather than a numbered money line.
NON_LINE_KEYS = re.compile(r'^(p\d\.)?(NAME|PB|BIZ|ADDR|CSZ|SSN|EIN)$')
# 'p1.L24a' -> ('1', '24a');  'p2.L43y' -> ('2', '43y') with sub-field suffix.
LINE_KEY_RE = re.compile(r'^p(\d)\.L(\d+[a-z]?)(?:[_-]\w+)?$')

# A box's own label row. The printed label sits at the box's bottom edge and
# the row above sits at its top edge, so this must stay well under the 12pt
# row pitch or it reaches the neighbouring line.
ROW_PAD = 3.0
# Band for a row shared by several boxes (Schedule C's question rows are 12pt
# apart, so this also has to stay tight).
PHRASE_PAD = 2.0
# How far left of the rect a label token may sit and still count as its label.
X_REACH = 170.0

# '27a', '(3)', '16.' -> number plus optional letter suffix.
NUMTOK_RE = re.compile(r'^\(?(\d{1,2})([a-z]?)\)?[.,:;]?$')
# A continuation row prints the suffix alone: '24a' then a bare 'b'.
BARE_RE = re.compile(r'^\(?([a-z])\)?[.,:;]?$')

# Boxes that share their row with siblings. Each entry is
#   (phrase that identifies the row, the option word printed beside THIS box,
#    which side of the box that word is on).
# The phrase proves we are on the right row; the word proves we are on the
# right box within it. Without the word, swapping a Yes box for its No box
# audits as correct — the packet would say the opposite of what was intended
# and every check would pass.
ROW_EXPECT = {
    'p2.L43_month': ('place your vehicle in service', None, None),
    'p2.L43_day':   ('place your vehicle in service', None, None),
    'p2.L43_year':  ('place your vehicle in service', None, None),
    'p2.L44a':      ('Business', 'Business', 'left'),
    'p2.L44b':      ('Commuting', 'Commuting', 'left'),
    'p2.L44c':      ('Other', 'Other', 'left'),
    'p2.L45_yes':   ('available for personal use during off-duty hours',
                     'Yes', 'right'),
    'p2.L45_no':    ('available for personal use during off-duty hours',
                     'No', 'right'),
    'p2.L46_yes':   ('another vehicle available for personal use',
                     'Yes', 'right'),
    'p2.L46_no':    ('another vehicle available for personal use',
                     'No', 'right'),
    'p2.L47a_yes':  ('evidence to support your deduction', 'Yes', 'right'),
    'p2.L47a_no':   ('evidence to support your deduction', 'No', 'right'),
    'p2.L47b_yes':  ('is the evidence written', 'Yes', 'right'),
    'p2.L47b_no':   ('is the evidence written', 'No', 'right'),
    # Schedule C questions F, G, I and J — lettered, not numbered.
    'p1.F_cash':    ('Accounting method', 'Cash', 'right'),
    'p1.F_accrual': ('Accounting method', 'Accrual', 'right'),
    'p1.F_other':   ('Accounting method', 'Other', 'right'),
    'p1.G_yes':     ('materially participate', 'Yes', 'right'),
    'p1.G_no':      ('materially participate', 'No', 'right'),
    'p1.I_yes':     ('require you to file Form(s) 1099', 'Yes', 'right'),
    'p1.I_no':      ('require you to file Form(s) 1099', 'No', 'right'),
    'p1.J_yes':     ('file required Form(s) 1099', 'Yes', 'right'),
    'p1.J_no':      ('file required Form(s) 1099', 'No', 'right'),
}

# The option words any shared row may offer. A box is bound to its own word by
# being the nearest of these on the declared side.
SIBLING_WORDS = frozenset({
    'Cash', 'Accrual', 'Other', 'Yes', 'No', 'Business', 'Commuting',
})

# Cells that must run left to right in this order on their row. A date split
# across three cells has no label beside each cell, so order is the only
# evidence that the month is not in the year's box.
ORDERED_CELLS = {
    '1040sc': [
        ('line 43 date cells',
         ['p2.L43_month', 'p2.L43_day', 'p2.L43_year']),
    ],
}

_word_cache = {}


def page_words(form, year, page_no):
    """Printed words on a template page, in PDF (bottom-origin) coordinates."""
    key = (form, year, page_no)
    if key in _word_cache:
        return _word_cache[key]
    path = FORMS / f'{form}_{year}.pdf'
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[page_no - 1]
        h = page.height
        words = [
            {'x0': w['x0'], 'x1': w['x1'], 'y': h - w['bottom'], 'text': w['text']}
            for w in page.extract_words()
        ]
    _word_cache[key] = words
    return words


def label_tokens(form, year, page_no, rect, pad=ROW_PAD):
    """Tokens printed just left of `rect`, on the rect's own bottom row."""
    y_lo, y_hi = rect[1] - pad, rect[1] + pad
    out = []
    for w in page_words(form, year, page_no):
        if not (y_lo <= w['y'] <= y_hi):
            continue
        if w['x1'] > rect[0] + 1:            # must sit left of the box
            continue
        if w['x0'] < rect[0] - X_REACH:      # ...but not clear across the page
            continue
        out.append(w)
    out.sort(key=lambda w: w['x0'])
    return out


def row_line_number(form, year, page_no, rect):
    """The line number printed nearest this box: (claimed, row text).

    Walks the box's own row left to right, collecting line-number-shaped
    tokens, and returns the one closest to the box. A bare letter inherits the
    last number seen, so a continuation row printing '24a' then 'b' yields
    '24b'.
    """
    toks = label_tokens(form, year, page_no, rect)
    cands, stem = [], None
    for w in toks:
        m = NUMTOK_RE.match(w['text'])
        if m:
            stem = m.group(1)
            cands.append((w['x0'], m.group(1) + m.group(2)))
            continue
        b = BARE_RE.match(w['text'])
        if b and stem:
            cands.append((w['x0'], stem + b.group(1)))
    row = ' '.join(w['text'] for w in toks)
    return (max(cands)[1] if cands else None), row


def nearest_sibling(form, year, page_no, rect, side):
    """The option word closest to this box on `side`, or None."""
    cands = []
    for w in page_words(form, year, page_no):
        if not (rect[1] - PHRASE_PAD <= w['y'] <= rect[3] + PHRASE_PAD):
            continue
        text = norm_word(w['text'])
        if text not in SIBLING_WORDS:
            continue
        if side == 'right' and w['x0'] >= rect[2]:
            cands.append((w['x0'] - rect[2], text))
        elif side == 'left' and w['x1'] <= rect[0]:
            cands.append((rect[0] - w['x1'], text))
    return min(cands)[1] if cands else None


def norm_word(tok):
    return tok.strip().strip('.,:;()“”"’\'')


def norm(tok):
    return norm_word(tok).lower()


def audit_entry(form, year, line_key, leaf):
    """Return (status, detail). status is 'ok' | 'bad' | 'skip'."""
    spec = ROW_EXPECT.get(line_key)
    m = LINE_KEY_RE.match(line_key)
    if spec is None and (not m or NON_LINE_KEYS.match(line_key.split('.')[-1])):
        return 'skip', 'not a numbered money line'

    fields = fpp.load_fields(form, year)
    fld = fields.get(leaf)
    if fld is None:
        return 'bad', f'leaf {leaf} not present in {form}_{year}.fields.json'

    # Page comes from the key prefix: 'p2.L44a' and 'p1.G_yes' alike.
    page_no = int(line_key[1]) if line_key[:1] == 'p' else 1
    if fld.get('page') != page_no:
        return 'bad', (f'leaf {leaf} is on page {fld.get("page")}, '
                       f'but key says page {page_no}')

    rect = fld['rect']
    if spec is not None:
        return _check_shared_row(form, year, line_key, leaf, page_no, rect,
                                 *spec)

    want = m.group(2)
    claimed, row = row_line_number(form, year, page_no, rect)
    if claimed == want:
        return 'ok', f'[{leaf}] y={rect[1]:.0f} label "{row[-48:]}"'
    if claimed is None:
        return 'bad', (f'[{leaf}] y={rect[1]:.0f} expected line "{want}" but '
                       f'no line number is printed beside this box; row reads '
                       f'"{row[-70:]}"')
    return 'bad', (f'[{leaf}] y={rect[1]:.0f} expected line "{want}" but the '
                   f'number printed beside this box is "{claimed}"; row reads '
                   f'"{row[-70:]}"')


def _check_shared_row(form, year, line_key, leaf, page_no, rect,
                      phrase, word, side):
    """A box on a row it shares with its siblings.

    Two things must hold: the row is the right row (its phrase), and the box is
    the right box within it (the option word beside it).
    """
    full = full_row(form, year, page_no, rect, pad=PHRASE_PAD)
    if phrase.lower() not in full.lower():
        return 'bad', (f'[{leaf}] y={rect[1]:.0f} expected row to contain '
                       f'"{phrase}" but row reads "{full[:80]}"')
    if word is None:
        return 'ok', f'[{leaf}] y={rect[1]:.0f} row "{phrase}" ok'
    got = nearest_sibling(form, year, page_no, rect, side)
    if got == word:
        return 'ok', (f'[{leaf}] y={rect[1]:.0f} row "{phrase}", '
                      f'"{word}" to the {side} ok')
    return 'bad', (f'[{leaf}] y={rect[1]:.0f} is on the right row '
                   f'("{phrase}") but the word to its {side} is '
                   f'"{got}", not "{word}" — this box is a sibling\'s, so the '
                   f'answer would print against the wrong option')


def full_row(form, year, page_no, rect, pad=None):
    """Every printed word on the rect's row, left to right."""
    tol = ROW_PAD if pad is None else pad
    y_lo, y_hi = rect[1] - tol, rect[3] + tol
    ws = [w for w in page_words(form, year, page_no) if y_lo <= w['y'] <= y_hi]
    ws.sort(key=lambda w: w['x0'])
    return ' '.join(w['text'] for w in ws)


def ordered_cell_report(form, year):
    """[(name, status, detail)] for each ordered cell group on this form.

    A date split across three cells has no label beside any one cell, so the
    only evidence that the month is not sitting in the year's box is that the
    three boxes run left to right in the order the form prints them.
    """
    out = []
    line_map = fpp.LINE_MAPS.get((form, year)) or {}
    fields = fpp.load_fields(form, year)
    for name, keys in ORDERED_CELLS.get(form, []):
        xs = []
        for key in keys:
            leaf = line_map.get(key)
            fld = fields.get(leaf) if leaf else None
            xs.append(None if fld is None else fld['rect'][0])
        if any(x is None for x in xs):
            missing = [k for k, x in zip(keys, xs) if x is None]
            out.append((name, 'ok', f'not mapped ({", ".join(missing)})'))
            continue
        order = ', '.join(f'{k.split(".")[-1]} x={x:.0f}'
                          for k, x in zip(keys, xs))
        if xs == sorted(xs):
            out.append((name, 'ok', 'printed left to right in order'))
        else:
            out.append((name, 'bad',
                        f'the cells are not in the order the form prints '
                        f'them, so each value would land in another cell\'s '
                        f'box: {order}'))
    return out


def audit_ordered_cells(form, year):
    """Cells with no label of their own must at least be in printed order."""
    bad = 0
    for name, status, detail in ordered_cell_report(form, year):
        flag = 'OK  ' if status == 'ok' else 'BAD '
        if status == 'bad':
            bad += 1
        print(f'  {flag} {name:<22} {detail}')
    return bad


def audit(form, year):
    line_map = fpp.LINE_MAPS.get((form, year))
    if not line_map:
        print(f'  (no LINE_MAPS entry for {form} {year})')
        return 0
    bad = 0
    for line_key in sorted(line_map, key=_sort_key):
        status, detail = audit_entry(form, year, line_key, line_map[line_key])
        if status == 'skip':
            continue
        flag = 'OK  ' if status == 'ok' else 'BAD '
        if status == 'bad':
            bad += 1
        print(f'  {flag} {line_key:<10} {detail}')
    bad += audit_ordered_cells(form, year)
    return bad


def _sort_key(line_key):
    m = LINE_KEY_RE.match(line_key)
    if not m:
        return (0, 0, '')
    num = re.match(r'^(\d+)([a-z]?)$', m.group(2))
    return (int(m.group(1)), int(num.group(1)), num.group(2))


def main(argv):
    if len(argv) == 3:
        targets = [(argv[1], int(argv[2]))]
    else:
        targets = sorted(fpp.LINE_MAPS.keys(), key=lambda k: (k[0], k[1]))

    total_bad = 0
    for form, year in targets:
        print(f'\n=== {form} {year} ===')
        total_bad += audit(form, year)

    print()
    if total_bad:
        print(f'FAIL — {total_bad} mapped line(s) do not match the printed label.')
        return 1
    print('PASS — every mapped money line matches its printed label.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
