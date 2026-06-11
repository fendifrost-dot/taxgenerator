"""CLI: python3 -m taxgenerator --amend [--state IL] --client ... --original ... --year 2024"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from taxgenerator.forms import generate_amendment_packet


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Tax return PDF generator")
    parser.add_argument("--amend", action="store_true", help="Generate amendment packet")
    parser.add_argument("--state", help="State code for state amendment (e.g. IL)")
    parser.add_argument("--client", required=True, type=Path, help="Amended client JSON")
    parser.add_argument("--original", type=Path, help="Originally filed client JSON")
    parser.add_argument("--year", type=int, default=2024)
    args = parser.parse_args(argv)

    if not args.amend:
        parser.error("--amend is required")

    amended = load_json(args.client)
    original_path = args.original or args.client.with_name(args.client.stem + "_original.json")
    if not original_path.exists():
        print(f"Original config not found: {original_path}", file=sys.stderr)
        return 1

    original = load_json(original_path)
    result = generate_amendment_packet(original, amended, args.year, state=args.state)

    for out in result.get("outputs", []):
        print(f"Wrote {out}")

    if args.state and args.state.upper() == "IL":
        corr = result["il_amendment"]["corrected"]
        print(
            f"IL corrected: AGI={corr['line1_federal_agi']} "
            f"net_income={corr['line11_net_income']} tax={corr['line23_total_tax']}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
