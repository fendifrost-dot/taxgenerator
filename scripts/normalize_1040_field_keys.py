"""Rename Form 1040 .fields.json keys to short AcroForm IDs (f1_01_0) for stable mappers."""
import json
import re
from pathlib import Path

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def short_key(acro_id: str) -> str:
    leaf = acro_id.split(".")[-1]
    return re.sub(r"\W+", "_", leaf).strip("_")


def normalize(path: Path):
    data = json.loads(path.read_text())
    new_fields = {}
    for _old_k, spec in data["fields"].items():
        fid = spec.get("id", "")
        if isinstance(fid, bytes):
            fid = fid.decode("latin-1", errors="replace")
        nk = short_key(fid)
        # Dedupe
        base = nk
        i = 2
        while nk in new_fields:
            nk = f"{base}_{i}"
            i += 1
        new_fields[nk] = spec
    data["fields"] = new_fields
    path.write_text(json.dumps(data, indent=2))


def main():
    for p in sorted(FORMS_DIR.glob("1040_20*.fields.json")):
        normalize(p)
        print("normalized keys", p.name)


if __name__ == "__main__":
    main()
