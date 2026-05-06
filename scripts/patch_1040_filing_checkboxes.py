"""Rename filing-status checkbox keys to semantic names (works with full-path AcroForm IDs)."""
import json
from pathlib import Path
from typing import Optional

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def semantic_for_field(fid: str, rect: list) -> Optional[str]:
    """Match by AcroForm path fragments + column for duplicate c1_3 leaves."""
    x0 = rect[0] if rect and len(rect) >= 1 else 0
    if "FilingStatus_ReadOrder[0].c1_3[0]" in fid:
        return "filing_status_single"
    if "FilingStatus_ReadOrder[0].c1_3[1]" in fid:
        return "filing_status_mfj"
    if "FilingStatus_ReadOrder[0].c1_3[2]" in fid:
        return "filing_status_mfs"
    if "FilingStatus_ReadOrder" not in fid and "c1_3[0]" in fid and x0 > 300:
        return "filing_status_hoh"
    if "FilingStatus_ReadOrder" not in fid and "c1_3[1]" in fid and x0 > 300:
        return "filing_status_qss"
    return None


def patch(path: Path):
    data = json.loads(path.read_text())
    new_fields = {}
    for sem, spec in data["fields"].items():
        fid = spec.get("id", "")
        if isinstance(fid, bytes):
            fid = fid.decode("latin-1", errors="replace")
        mapped = semantic_for_field(fid, spec.get("rect") or [])
        new_sem = mapped if mapped else sem
        new_fields[new_sem] = spec
    data["fields"] = new_fields
    path.write_text(json.dumps(data, indent=2))


def main():
    for p in sorted(FORMS_DIR.glob("1040_20*.fields.json")):
        patch(p)
        print("patched filing boxes", p.name)


if __name__ == "__main__":
    main()
