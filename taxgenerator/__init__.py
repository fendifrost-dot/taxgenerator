"""Federal tax return generator — config-driven.

Usage:
    python3 -m taxgenerator --client clients/pasta_pals.json --year 2025

Or programmatic:
    from taxgenerator.config import load_client
    from taxgenerator.cli import generate_packet
    cfg = load_client('clients/pasta_pals.json')
    packet_bytes = generate_packet(cfg, year=2025)

Currently supports: federal Form 1040 + Schedules 1, 2, C, SE + Form 8959.
Filing statuses: single, mfj, mfs, hoh, qss.
Tax years: 2024, 2025.
"""
__version__ = '1.0.0'
