"""Rebuild semantic keys for Form 1040 Page 1 amount columns using margin line numbers."""
import json
import re
from pathlib import Path

import fitz

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def nearest_margin_token(page, cy: float, x_max: float = 130.0):
    words = page.get_text("words")
    best = None
    bd = 999.0
    for w in words:
        wx0, wy0, wx1, wy1, txt = w[0], w[1], w[2], w[3], w[4].strip()
        if wx0 > x_max:
            continue
        wcy = (wy0 + wy1) / 2
        if abs(wcy - cy) > 10:
            continue
        if not re.match(r"^\d+[a-z]?$", txt):
            continue
        d = abs(wcy - cy)
        if d < bd:
            bd = d
            best = txt
    return best


def remap_fields_json(jpath: Path):
    data = json.loads(jpath.read_text())
    pdf_path = FORMS_DIR / data["pdfFilename"]
    doc = fitz.open(str(pdf_path))
    page = doc[0]

    field_rows = []
    for sem, spec in data["fields"].items():
        if spec.get("page") != 1:
            continue
        fid = spec.get("id", "")
        if "Page1[0]" not in fid:
            continue
        r = spec.get("rect") or [0, 0, 0, 0]
        if r[1] == 0:
            continue
        cy = (r[1] + r[3]) / 2
        cx = (r[0] + r[2]) / 2
        mtok = nearest_margin_token(page, cy)
        field_rows.append((cy, cx, mtok, sem, spec))

    doc.close()

    # Group by rounded cy + margin token
    by_row = {}
    for cy, cx, mtok, sem, spec in field_rows:
        if mtok is None:
            continue
        key = (round(cy, 1), mtok)
        by_row.setdefault(key, []).append((cx, sem, spec))

    rename = {}
    for (_cy, mtok), items in by_row.items():
        items.sort(key=lambda x: x[0])
        if len(items) == 1:
            _cx, sem, _spec = items[0]
            rename[sem] = f"line_{mtok}"
        else:
            for i, (_cx, sem, _spec) in enumerate(items):
                rename[sem] = f"line_{mtok}_col{i + 1}"

    new_fields = {}
    used = set()
    for sem, spec in data["fields"].items():
        nk = rename.get(sem, sem)
        base = nk
        j = 2
        while nk in used:
            nk = f"{base}_{j}"
            j += 1
        used.add(nk)
        new_fields[nk] = spec

    data["fields"] = new_fields
    jpath.write_text(json.dumps(data, indent=2))


def main():
    for p in sorted(FORMS_DIR.glob("1040_20*.fields.json")):
        remap_fields_json(p)
        print("remapped page1 line keys", p.name)


if __name__ == "__main__":
    main()
