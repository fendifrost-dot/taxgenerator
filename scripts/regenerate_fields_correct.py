"""Regenerate {form}_{year}.fields.json from PDF AcroForm widgets (authoritative rects)."""
import json
import re
import sys
from pathlib import Path

import fitz
from pypdf import PdfReader

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def short_id(full_name: str) -> str:
    normalized = full_name.replace("[", "_").replace("]", "")
    return re.sub(r"\W+", "_", normalized).strip("_")


def decode_pdf_text(val) -> str:
    if val is None:
        return ""
    if isinstance(val, bytes):
        return val.decode("latin-1", errors="replace")
    return str(val)


def detect_year_form(pdf_path: Path):
    stem = pdf_path.stem
    m = re.match(r"^(.+?)_(\d{4})$", stem)
    if m:
        return m.group(1), int(m.group(2))
    return stem, 2025


def field_type(ft: str) -> str:
    if ft == "/Btn":
        return "checkbox"
    return "text"


def extract(pdf_path: Path) -> dict:
    reader = PdfReader(str(pdf_path))
    fields = reader.get_fields() or {}
    form_name, year = detect_year_form(pdf_path)
    out = {"form": form_name, "year": year, "pdfFilename": pdf_path.name, "fields": {}}

    doc = fitz.open(str(pdf_path))
    widget_loc: dict[str, tuple[int, list[float]]] = {}
    for pi in range(len(doc)):
        for w in doc[pi].widgets() or []:
            if not w.field_name:
                continue
            r = w.rect
            fn = str(w.field_name)
            entry = (pi + 1, [float(r.x0), float(r.y0), float(r.x1), float(r.y1)])
            if fn not in widget_loc:
                widget_loc[fn] = entry
            else:
                old_pg, old_r = widget_loc[fn]
                old_area = max(0, old_r[2] - old_r[0]) * max(0, old_r[3] - old_r[1])
                new_area = max(0, entry[1][2] - entry[1][0]) * max(0, entry[1][3] - entry[1][1])
                if new_area > old_area:
                    widget_loc[fn] = entry
    doc.close()

    for full_name, field in fields.items():
        name_str = decode_pdf_text(full_name)
        key = short_id(name_str)
        ft = str(field.get("/FT", ""))
        page_num, rect = widget_loc.get(name_str, (1, [0.0, 0.0, 0.0, 0.0]))
        out["fields"][key] = {
            "id": name_str,
            "page": page_num,
            "rect": rect,
            "type": field_type(ft),
            "description": f"Auto-extracted ({key})",
        }

    return out


def main():
    targets = sys.argv[1:] or [p.name for p in sorted(FORMS_DIR.glob("*.pdf"))]
    for name in targets:
        pdf_path = FORMS_DIR / name if not str(name).startswith("/") else Path(name)
        if not pdf_path.exists():
            print(f"skip (missing): {pdf_path}")
            continue
        data = extract(pdf_path)
        out_path = pdf_path.with_suffix(".fields.json")
        out_path.write_text(json.dumps(data, indent=2))
        print(f"wrote: {out_path.name}  ({len(data['fields'])} fields)")


if __name__ == "__main__":
    main()
