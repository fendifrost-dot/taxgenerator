"""Audit LINE_MAPS against the printed IRS labels in each template PDF.

For every (form, year) line_key -> leaf entry, resolve the widget rect, read the
printed label text that sits immediately to the LEFT of that rect on the same
row, and check that the row carries the line number the key claims.

This is the tool CLAUDE.md's "how to add a new tax year" step 4 describes, made
repeatable: pdfplumber labels cross-referenced with .fields.json rects. It is
the only sanctioned way to assert a leaf is correct — leaf-name order is NOT
evidence (the IRS renumbered Schedule C 27a/27b between 2024 and 2025 without
changing the leaf sequence).

Usage:
    python3 scripts/verify_field_map.py                 # audit every form/year
    python3 scripts/verify_field_map.py 1040sc 2024     # audit one

Exit code is nonzero if any mapped money line fails its label check.
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

# How far from the rect's own y-band a label row may sit and still count.
Y_TOL = 6.0
# How far left of the rect a label token may sit and still count as its label.
X_REACH = 170.0

# Most IRS money boxes have their line number reprinted immediately to their
# left, which is what the default check looks for. A few boxes don't — Part IV
# of Schedule C answers "Yes/No" or splits a date across three cells, and its
# line number sits at the far-left margin. For those, verify the whole printed
# row instead, by a phrase that identifies the line beyond doubt.
ROW_EXPECT = {
    'p2.L43_month': 'place your vehicle in service',
    'p2.L43_day':   'place your vehicle in service',
    'p2.L43_year':  'place your vehicle in service',
    'p2.L44a':      'Business',
    'p2.L44b':      'Commuting',
    'p2.L44c':      'Other',
    'p2.L45_yes':   'available for personal use during off-duty hours',
    'p2.L45_no':    'available for personal use during off-duty hours',
    'p2.L46_yes':   'another vehicle available for personal use',
    'p2.L46_no':    'another vehicle available for personal use',
    'p2.L47a_yes':  'evidence to support your deduction',
    'p2.L47a_no':   'evidence to support your deduction',
    'p2.L47b_yes':  'is the evidence written',
    'p2.L47b_no':   'is the evidence written',
    # Schedule C questions F, G, I and J — lettered, not numbered.
    'p1.F_cash':    'Accounting method',
    'p1.F_accrual': 'Accounting method',
    'p1.F_other':   'Accounting method',
    'p1.G_yes':     'materially participate',
    'p1.G_no':      'materially participate',
    'p1.I_yes':     'require you to file Form(s) 1099',
    'p1.I_no':      'require you to file Form(s) 1099',
    'p1.J_yes':     'file required Form(s) 1099',
    'p1.J_no':      'file required Form(s) 1099',
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


def label_tokens(form, year, page_no, rect):
    """Tokens printed just left of `rect` on the same row."""
    y_lo, y_hi = rect[1] - Y_TOL, rect[3] + Y_TOL
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


def norm(tok):
    return tok.strip().strip('.,:;()“”"’\'').lower()


def audit_entry(form, year, line_key, leaf):
    """Return (status, detail). status is 'ok' | 'bad' | 'skip'."""
    phrase = ROW_EXPECT.get(line_key)
    m = LINE_KEY_RE.match(line_key)
    if phrase is None:
        if not m or NON_LINE_KEYS.match(line_key.split('.')[-1]):
            return 'skip', 'not a numbered money line'
    elif m is None:
        # Lettered question (F / G / I / J) — page from the key prefix.
        page_no = int(line_key[1])
        return _audit_by_phrase(form, year, line_key, leaf, page_no, phrase)
    page_no, want = int(m.group(1)), m.group(2)

    fields = fpp.load_fields(form, year)
    fld = fields.get(leaf)
    if fld is None:
        return 'bad', f'leaf {leaf} not present in {form}_{year}.fields.json'
    if fld.get('page') != page_no:
        return 'bad', (f'leaf {leaf} is on page {fld.get("page")}, '
                       f'but key says page {page_no}')

    rect = fld['rect']

    if phrase:
        return _check_phrase(form, year, line_key, leaf, page_no, rect, phrase)

    toks = label_tokens(form, year, page_no, rect)
    texts = [norm(t['text']) for t in toks]
    row = ' '.join(t['text'] for t in toks)

    # The line number may print as '27a' or split as '27' + 'a'.
    base = re.match(r'^(\d+)([a-z]?)$', want)
    num, suffix = base.group(1), base.group(2)
    hit = want in texts or (suffix and num in texts and suffix in texts)

    if hit:
        return 'ok', f'[{leaf}] y={rect[1]:.0f} label "{row[-48:]}"'
    return 'bad', (f'[{leaf}] y={rect[1]:.0f} expected line "{want}" '
                   f'but row reads "{row[-70:]}"')


def _audit_by_phrase(form, year, line_key, leaf, page_no, phrase):
    fields = fpp.load_fields(form, year)
    fld = fields.get(leaf)
    if fld is None:
        return 'bad', f'leaf {leaf} not present in {form}_{year}.fields.json'
    if fld.get('page') != page_no:
        return 'bad', (f'leaf {leaf} is on page {fld.get("page")}, '
                       f'but key says page {page_no}')
    return _check_phrase(form, year, line_key, leaf, page_no, fld['rect'],
                         phrase)


def _check_phrase(form, year, line_key, leaf, page_no, rect, phrase):
    # Tight band: Schedule C's question rows are 12pt apart, so the default
    # tolerance would pull in the row above as well.
    full = full_row(form, year, page_no, rect, pad=2.0)
    if phrase.lower() in full.lower():
        return 'ok', f'[{leaf}] y={rect[1]:.0f} row "{phrase}" ok'
    return 'bad', (f'[{leaf}] y={rect[1]:.0f} expected row to contain '
                   f'"{phrase}" but row reads "{full[:80]}"')


def full_row(form, year, page_no, rect, pad=None):
    """Every printed word on the rect's row, left to right."""
    tol = Y_TOL if pad is None else pad
    y_lo, y_hi = rect[1] - tol, rect[3] + tol
    ws = [w for w in page_words(form, year, page_no) if y_lo <= w['y'] <= y_hi]
    ws.sort(key=lambda w: w['x0'])
    return ' '.join(w['text'] for w in ws)


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
