"""Extract AcroForm metadata from a fillable PDF → produce {form}.fields.json
matching the format the taxgenerator's loadForms.ts expects.
Reads {form}.pdf, writes {form}.fields.json next to it.
"""
import json
import re
from pathlib import Path

from pypdf import PdfReader

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def short_id(full_name: str) -> str:
    """Unique snake_case ID from full AcroForm path (leaf-only IDs collide)."""
    normalized = full_name.replace("[", "_").replace("]", "")
    return re.sub(r"\W+", "_", normalized).strip("_")


def decode_pdf_text(val) -> str:
    if val is None:
        return ""
    if isinstance(val, bytes):
        return val.decode("latin-1", errors="replace")
    return str(val)


def detect_year_form(pdf_path: Path):
    """Parse year+form from filename like 1040_2024.pdf or 1040sc_2025.pdf."""
    stem = pdf_path.stem
    m = re.match(r"^(.+?)_(\d{4})$", stem)
    if m:
        return m.group(1), int(m.group(2))
    return stem, 2025


def extract(pdf_path: Path):
    reader = PdfReader(str(pdf_path))
    fields = reader.get_fields() or {}
    form_name, year = detect_year_form(pdf_path)
    out = {"form": form_name, "year": year, "pdfFilename": pdf_path.name, "fields": {}}

    for full_name, field in fields.items():
        ft = str(field.get("/FT", ""))
        page_num = 1
        rect = None
        name_str = decode_pdf_text(full_name)

        for page_idx, page in enumerate(reader.pages):
            annots = page.get("/Annots")
            if not annots:
                continue
            for annot_ref in annots:
                annot = annot_ref.get_object()
                t = annot.get("/T")
                t_str = decode_pdf_text(t) if t is not None else ""
                if t_str and (t_str == name_str or name_str.endswith(t_str) or t_str in name_str):
                    r = annot.get("/Rect")
                    if r:
                        rect = [float(x) for x in r]
                        page_num = page_idx + 1
                        break
            if rect:
                break

        ftype = "text" if ft == "/Tx" else "checkbox" if ft == "/Btn" else "text"
        sid = short_id(full_name)
        out["fields"][sid] = {
            "id": full_name,
            "page": page_num if rect else 1,
            "rect": rect or [0, 0, 0, 0],
            "type": ftype,
            "description": f"Auto-extracted ({sid})",
        }
    return out


def main():
    for pdf in sorted(FORMS_DIR.glob("*.pdf")):
        json_path = pdf.with_suffix(".fields.json")
        if json_path.exists():
            print(f"  skip (exists): {json_path.name}")
            continue
        data = extract(pdf)
        json_path.write_text(json.dumps(data, indent=2))
        print(f"  wrote: {json_path.name}  ({len(data['fields'])} fields)")


if __name__ == "__main__":
    main()
