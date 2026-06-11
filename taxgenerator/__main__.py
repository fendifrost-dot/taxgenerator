"""CLI entry point: python3 -m taxgenerator [args]"""
import sys
import argparse
from pathlib import Path

from .config import load_client, ConfigError
from .forms import (generate_packet, generate_amendment_packet,
                    generate_il_amendment_packet)


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog='python3 -m taxgenerator',
        description='Generate a federal tax return packet from a client JSON config.',
    )
    parser.add_argument('--client', required=True,
                        help='Path to client JSON config. In --amend mode this is '
                             'the CORRECTED (amended) config.')
    parser.add_argument('--year', required=True, type=int, choices=[2024, 2025],
                        help='Tax year (2024 or 2025)')
    parser.add_argument('--amend', action='store_true',
                        help='Produce a Form 1040-X amendment packet instead of a '
                             'full return. Requires --original.')
    parser.add_argument('--original', default=None,
                        help='Path to the originally-filed (as-filed) client config. '
                             'Required with --amend.')
    parser.add_argument('--state', default='federal', choices=['federal', 'IL'],
                        help='Jurisdiction for --amend. "federal" → Form 1040-X '
                             '(default); "IL" → Illinois Form IL-1040-X.')
    parser.add_argument('--out', default='dist',
                        help='Output directory (default: dist)')
    parser.add_argument('--filename', default=None,
                        help='Output filename. Default: {client_id}_{year}_RETURN.pdf '
                             '(or {client_id}_{year}_1040X.pdf in --amend mode)')
    args = parser.parse_args(argv)

    if args.amend and not args.original:
        parser.error("--amend requires --original (path to the as-filed config)")

    try:
        cfg = load_client(args.client)
    except ConfigError as e:
        print(f"Config error: {e}", file=sys.stderr)
        return 2

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.amend:
        try:
            original_cfg = load_client(args.original)
        except ConfigError as e:
            print(f"Config error (original): {e}", file=sys.stderr)
            return 2

        form_label = 'IL-1040-X' if args.state == 'IL' else '1040-X'
        print(f"Amending ({form_label}): {cfg.get('display_name', cfg['client_id'])}")
        print(f"Filer: {cfg['filer']['first_name']} {cfg['filer']['last_name']}  "
              f"(filing status: {cfg['filer']['filing_status']})")
        print(f"Tax year: {args.year}")
        print(f"Original config: {args.original}")

        if args.state == 'IL':
            pdf_bytes = generate_il_amendment_packet(original_cfg, cfg, args.year)
            default_fname = f"{cfg['client_id']}_{args.year}_IL1040X.pdf"
        else:
            pdf_bytes = generate_amendment_packet(original_cfg, cfg, args.year)
            default_fname = f"{cfg['client_id']}_{args.year}_1040X.pdf"

        fname = args.filename or default_fname
        out_path = out_dir / fname
        out_path.write_bytes(pdf_bytes)
        print(f"\nWrote {out_path} ({len(pdf_bytes):,} bytes)")
        return 0

    print(f"Client: {cfg.get('display_name', cfg['client_id'])}")
    print(f"Filer: {cfg['filer']['first_name']} {cfg['filer']['last_name']}  "
          f"(filing status: {cfg['filer']['filing_status']})")
    print(f"Tax year: {args.year}")

    pdf_bytes = generate_packet(cfg, args.year)

    fname = args.filename or f"{cfg['client_id']}_{args.year}_RETURN.pdf"
    out_path = out_dir / fname
    out_path.write_bytes(pdf_bytes)
    print(f"\nWrote {out_path} ({len(pdf_bytes):,} bytes)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
