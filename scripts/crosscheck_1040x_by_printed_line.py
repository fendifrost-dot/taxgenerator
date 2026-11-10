"""Cross-check a generated Form 1040-X against the model, by printed position.

The amendment gate already does this on every run — `_amendment_column_c_report`
in `taxgenerator/forms.py` calls the same `read_1040x_grid`. This script is the
standalone version: point it at a 1040-X that has already been written and it
re-derives the model from the configs and compares, without regenerating
anything. Use it to check a PDF you are holding (one about to be mailed, or one
produced by an older build) rather than one you have just made.

Why locate figures by printed position at all: the filler and the old column
check both resolved a figure through GRID_LEAVES, so they shared an authority.
Point a leaf at the wrong box and the check read back the box the filler had
just written, and agreed with itself. Pointing line 11 column C at the reserved
line-9 box printed the total tax on line 9, left line 11 empty, and reported
"ok". Here the form's own printed line numbers are the authority.

Usage:
    python3 scripts/crosscheck_1040x_by_printed_line.py [pdf] [amended] [original]

Defaults to Jacques Potts's 2024 amendment in dist/. Exit code is nonzero if
anything disagrees.
"""
import sys
from pathlib import Path

REPO = Path(__file__).parent.parent
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / 'scripts'))

from taxgenerator.config import load_client            # noqa: E402
from taxgenerator.compute import compute_amendment     # noqa: E402
from taxgenerator.reconcile import read_1040x_grid     # noqa: E402

YEAR = 2024
DEFAULT_PDF = REPO / 'dist' / 'jacques_potts_2024_1040X.pdf'
DEFAULT_AMENDED = REPO / 'clients' / 'jacques_potts.json'
DEFAULT_ORIGINAL = REPO / 'clients' / 'jacques_potts_original.json'


def show(v):
    return f'{v:,}' if isinstance(v, int) else '(blank)'


def main(argv):
    pdf_path = Path(argv[1]) if len(argv) > 1 else DEFAULT_PDF
    amended_path = Path(argv[2]) if len(argv) > 2 else DEFAULT_AMENDED
    original_path = Path(argv[3]) if len(argv) > 3 else DEFAULT_ORIGINAL

    if not pdf_path.exists():
        print(f'No such PDF: {pdf_path}')
        return 2

    # Witness 1: the model, from the two configs.
    model = compute_amendment(
        load_client(original_path), load_client(amended_path), YEAR)
    want = {ln['line']: ln for ln in model['lines']}

    # Witness 2: the printed page, by position and font only.
    printed, labels, unplaced = read_1040x_grid(pdf_path.read_bytes())

    print(f'{pdf_path.name} — every figure located by the line number printed')
    print('beside it, checked against the model computed from the two configs.')
    print(f'(field map not consulted; {len(labels)} printed line numbers found)\n')
    print(f'  {"line":<5} {"col":<4} {"on page":>12} {"model":>12}  status')
    print(f'  {"-"*5} {"-"*4} {"-"*12} {"-"*12}  ------')

    problems, seen = [], set()
    for line_id, _top in labels:
        ln = want.get(line_id)
        for col in ('a', 'b', 'c'):
            got = printed.get((line_id, col))
            exp = ln.get(col) if ln else None
            if got is None and exp is None:
                continue
            seen.add((line_id, col))
            ok = got == exp
            if not ok:
                problems.append(
                    f'line {line_id} column {col.upper()}: page shows '
                    f'{show(got)}, model says {show(exp)}')
            print(f'  {line_id:<5} {col.upper():<4} {show(got):>12} '
                  f'{show(exp):>12}  {"ok" if ok else "MISMATCH"}')

    for line_id, col in sorted(set(printed) - seen):
        problems.append(f'line {line_id} column {col.upper()}: page shows '
                        f'{show(printed[(line_id, col)])}, model has nothing '
                        'there')
        print(f'  {line_id:<5} {col.upper():<4} '
              f'{show(printed[(line_id, col)]):>12} {"(none)":>12}  UNEXPECTED')
    print()

    for text, col, top in unplaced:
        problems.append(f'figure {text} in column {col.upper()} (y={top:.0f}) '
                        'sits beside no printed line number')

    # Arithmetic the service centre re-performs, on the printed figures only.
    for line_id, _top in labels:
        a, b, c = (printed.get((line_id, k)) for k in ('a', 'b', 'c'))
        if None not in (a, b, c) and b != c - a:
            problems.append(f'line {line_id}: printed B {b:,} but printed C '
                            f'{c:,} - printed A {a:,} = {c - a:,}')

    # Facts about the 2024 revision and this matter.
    if any(k[0] == '9' for k in printed):
        problems.append('line 9 is reserved on this revision but carries a '
                        'figure')
    total_tax = model['_corrected']['L24_total_tax']
    if printed.get(('11', 'c')) != total_tax:
        problems.append(f'line 11 column C is not the corrected total tax '
                        f'({total_tax:,})')
    owed = model['amount_owed_corrected']
    if printed.get(('20', 'c')) != owed:
        problems.append(f'line 20 column C is not the amount owed ({owed:,})')

    if problems:
        print(f'RESULT: FAIL — {len(problems)} problem(s)')
        for p in problems:
            print(f'  - {p}')
        return 1

    print('RESULT: PASS — every figure on the page sits on the line and in the')
    print('column the model asks for; every figure the model asks for is on the')
    print('page; printed B = printed C - printed A on every three-column line;')
    print('line 9 (reserved) is empty; line 11 column C is the corrected total')
    print(f'tax {total_tax:,} and line 20 column C the amount owed {owed:,}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
