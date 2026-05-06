"""Overwrite rect + page in each .fields.json from live PDF widget geometry (authoritative)."""
import json
from pathlib import Path

import fitz

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def main():
    for jpath in sorted(FORMS_DIR.glob("*.fields.json")):
        data = json.loads(jpath.read_text())
        pdf_path = FORMS_DIR / data["pdfFilename"]
        if not pdf_path.exists():
            continue
        doc = fitz.open(str(pdf_path))
        loc = {}
        for pi in range(len(doc)):
            for w in doc[pi].widgets() or []:
                if not w.field_name:
                    continue
                r = w.rect
                fn = str(w.field_name)
                entry = (pi + 1, [float(r.x0), float(r.y0), float(r.x1), float(r.y1)])
                if fn not in loc:
                    loc[fn] = entry
                else:
                    old_pg, old_r = loc[fn]
                    old_area = max(0, old_r[2] - old_r[0]) * max(0, old_r[3] - old_r[1])
                    new_area = max(0, entry[1][2] - entry[1][0]) * max(0, entry[1][3] - entry[1][1])
                    if new_area > old_area:
                        loc[fn] = entry
        doc.close()

        updated = 0
        for spec in data["fields"].values():
            fid = spec.get("id")
            if isinstance(fid, bytes):
                fid = fid.decode("latin-1", errors="replace")
            if fid not in loc:
                continue
            pg, rect = loc[fid]
            if spec.get("page") != pg or spec.get("rect") != rect:
                spec["page"] = pg
                spec["rect"] = rect
                updated += 1
        data["fields"] = {k: v for k, v in data["fields"].items()}  # noop stable order
        jpath.write_text(json.dumps(data, indent=2))
        print(f"{jpath.name}: synced {updated} fields from widgets")


if __name__ == "__main__":
    main()
