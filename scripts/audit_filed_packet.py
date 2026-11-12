"""Audit a packet that was already produced and mailed.

Reads a finished PDF, works out which IRS form and page each sheet is by
matching its printed text against the blank templates, and then reports what
value sits in every widget box — mapped lines by line number, and anything
else as an unexpected box.

This does not regenerate anything, so it is safe to run against frozen output.

    python3 scripts/audit_filed_packet.py <packet.pdf> [--year 2024]
"""
import argparse
import sys
from pathlib import Path

import pdfplumber

REPO = Path(__file__).parent.parent
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / 'scripts'))

import fill_pasta_pals_python as fpp                     # noqa: E402
from taxgenerator.reconcile import read_rect, parse_money  # noqa: E402

FORMS = ('1040', '1040s1', '1040s2', '1040sc', '1040sse', '8959', '1040x')


def template_fingerprints(year):
    """{(form, page_no): set(words)} for every template we can read."""
    out = {}
    for form in FORMS:
        path = fpp.FORMS / f'{form}_{year}.pdf'
        if not path.exists():
            continue
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                words = {w['text'] for w in page.extract_words()}
                if words:
                    out[(form, i)] = words
    return out


def identify(page_words, fingerprints):
    """Best (form, page_no) match for a filled page, by word overlap."""
    best, best_score = None, 0.0
    for key, template_words in fingerprints.items():
        if not template_words:
            continue
        overlap = len(page_words & template_words) / len(template_words)
        if overlap > best_score:
            best, best_score = key, overlap
    return (best, best_score) if best_score >= 0.55 else (None, best_score)


def audit(pdf_path, year):
    fingerprints = template_fingerprints(year)
    findings = []
    print(f'Auditing {pdf_path}')
    print(f'Templates: tax year {year}\n')

    with pdfplumber.open(pdf_path) as doc:
        for idx, page in enumerate(doc.pages):
            words = {w['text'] for w in page.extract_words()}
            (match, score) = identify(words, fingerprints)
            if match is None:
                print(f'--- sheet {idx + 1}: not recognised '
                      f'(best overlap {score:.0%})')
                continue
            form, page_no = match
            print(f'--- sheet {idx + 1}: {form} page {page_no} '
                  f'(match {score:.0%})')

            fields = fpp.load_fields(form, year)
            line_map = fpp.LINE_MAPS.get((form, year), {})
            leaf_to_line = {v: k for k, v in line_map.items()}

            for leaf, fld in sorted(
                    fields.items(),
                    key=lambda kv: -kv[1]['rect'][1]):
                if fld.get('page') != page_no:
                    continue
                txt = read_rect(page, fld['rect'])
                if not txt:
                    continue
                line_key = leaf_to_line.get(leaf)
                y = fld['rect'][1]
                if line_key:
                    print(f'      {line_key:<14} {txt:>18}   [{leaf}]')
                else:
                    money = parse_money(txt)
                    flag = ''
                    if money not in (None, 0):
                        flag = '   <-- VALUE IN AN UNMAPPED BOX'
                        findings.append(
                            f'{form} page {page_no}: "{txt}" sits in {leaf} '
                            f'(y={y:.0f}), which is not a mapped line')
                    print(f'      {"(unmapped)":<14} {txt:>18}   '
                          f'[{leaf}]{flag}')
            print()

    print('=' * 70)
    if findings:
        print(f'{len(findings)} value(s) in boxes this build does not map:')
        for f in findings:
            print(f'  - {f}')
    else:
        print('Every value sits in a box this build maps to a line.')
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--year', type=int, default=2024)
    args = ap.parse_args()
    audit(args.pdf, args.year)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
