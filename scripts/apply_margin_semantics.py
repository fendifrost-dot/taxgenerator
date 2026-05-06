"""
Rename keys in .fields.json using IRS left-margin line numbers + column order.
Run after extract_form_fields.py.
"""
import json
import re
from pathlib import Path
from collections import defaultdict
from typing import Optional

import fitz

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def margin_token_at(page, cy: float, x_max: float = 125.0) -> Optional[str]:
    words = page.get_text("words")
    best_t = None
    best_dy = 99.0
    for w in words:
        wx0, wy0, wx1, wy1, txt = w[0], w[1], w[2], w[3], w[4]
        if wx0 > x_max:
            continue
        wcy = (wy0 + wy1) / 2
        dy = abs(wcy - cy)
        if dy > 5:
            continue
        t = txt.strip()
        if not re.match(r"^\d+[a-z]?$", t):
            continue
        if dy < best_dy:
            best_dy = dy
            best_t = t
    return best_t


def rename_1040_family(path: Path):
    data = json.loads(path.read_text())
    stem = Path(data["pdfFilename"]).stem
    pdf_path = FORMS_DIR / data["pdfFilename"]
    if not pdf_path.exists():
        return
    doc = fitz.open(str(pdf_path))

    # Group fields by (page, rounded cy, margin line)
    groups = defaultdict(list)
    old_keys = list(data["fields"].keys())
    for ok in old_keys:
        spec = data["fields"][ok]
        r = spec.get("rect") or [0, 0, 0, 0]
        if r[1] == 0:
            continue
        pg = spec["page"] - 1
        cy = (r[1] + r[3]) / 2
        cx = (r[0] + r[2]) / 2
        page = doc[pg]
        mtok = margin_token_at(page, cy)
        if mtok is None:
            mtok = "nomargin"
        key = (pg, round(cy, 1), mtok)
        groups[key].append((cx, cy, ok, spec))

    new_fields = {}
    used_names = set()

    # Keep fields without rect / nomargin with original short ids
    for ok in old_keys:
        spec = data["fields"][ok]
        r = spec.get("rect") or [0, 0, 0, 0]
        if r[1] == 0:
            new_fields[ok] = spec

    for (_pg, _cy, mtok), items in groups.items():
        items.sort(key=lambda x: x[0])  # by cx
        for i, (_cx, _cyb, ok, spec) in enumerate(items):
            if mtok == "nomargin":
                base = ok  # keep extractor short id
            else:
                base = f"line_{mtok}"
            if len(items) > 1 and mtok != "nomargin":
                base = f"{base}_col{i + 1}"
            name = base
            n = 2
            while name in used_names:
                name = f"{base}_{n}"
                n += 1
            used_names.add(name)
            new_fields[name] = spec

    data["fields"] = new_fields
    path.write_text(json.dumps(data, indent=2))
    doc.close()


def main():
    for pat in (
        "1040_20*.fields.json",
        "1040s1_20*.fields.json",
        "1040s2_20*.fields.json",
        "8959_20*.fields.json",
    ):
        for jpath in sorted(FORMS_DIR.glob(pat)):
            rename_1040_family(jpath)
            print(f"margin semantics: {jpath.name}")


if __name__ == "__main__":
    main()
