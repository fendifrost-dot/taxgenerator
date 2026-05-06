"""Correct `page` in .fields.json using PyMuPDF widget locations (fixes Page2 leaks onto page 1)."""
import json
from pathlib import Path

import fitz

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def decode_name(val):
    if val is None:
        return ""
    if isinstance(val, bytes):
        return val.decode("latin-1", errors="replace")
    return str(val)


def fix_json(jpath: Path):
    data = json.loads(jpath.read_text())
    pdf_path = FORMS_DIR / data["pdfFilename"]
    if not pdf_path.exists():
        return
    doc = fitz.open(str(pdf_path))
    name_to_page = {}
    for pi in range(len(doc)):
        page = doc[pi]
        for w in page.widgets() or []:
            if w.field_name:
                name_to_page[decode_name(w.field_name)] = pi + 1
    doc.close()

    changed = 0
    for spec in data["fields"].values():
        fid = decode_name(spec.get("id"))
        if fid in name_to_page:
            new_pg = name_to_page[fid]
            if spec.get("page") != new_pg:
                spec["page"] = new_pg
                changed += 1
    if changed:
        jpath.write_text(json.dumps(data, indent=2))
    print(f"{jpath.name}: updated {changed} page refs")


def main():
    for jpath in sorted(FORMS_DIR.glob("*.fields.json")):
        fix_json(jpath)


if __name__ == "__main__":
    main()
