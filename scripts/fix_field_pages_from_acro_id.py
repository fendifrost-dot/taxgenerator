"""Set `page` from AcroForm path (Page1 vs Page2). Fixes phantom Page2 widgets stuck on page 1."""
import json
from pathlib import Path
from typing import Optional

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def page_from_id(fid: str) -> Optional[int]:
    if ".Page2[" in fid:
        return 2
    if ".Page1[" in fid:
        return 1
    return None


def fix_json(path: Path):
    data = json.loads(path.read_text())
    new_fields = {}
    removed = 0
    for k, spec in data["fields"].items():
        r = spec.get("rect") or [0, 0, 0, 0]
        if r == [0, 0, 0, 0]:
            removed += 1
            continue
        fid = spec.get("id", "")
        if isinstance(fid, bytes):
            fid = fid.decode("latin-1", errors="replace")
        pg = page_from_id(fid)
        if pg is not None:
            spec["page"] = pg
        new_fields[k] = spec
    data["fields"] = new_fields
    path.write_text(json.dumps(data, indent=2))
    print(f"{path.name}: fixed pages, removed {removed} zero-rect stubs")


def main():
    for p in sorted(FORMS_DIR.glob("*.fields.json")):
        fix_json(p)


if __name__ == "__main__":
    main()
