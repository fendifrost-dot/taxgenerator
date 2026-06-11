"""PDF packet generation for federal and state amendments."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from taxgenerator.compute import compute_amendment, compute_il_amendment

ROOT = Path(__file__).parent.parent
SCRIPTS = ROOT / "scripts"


def _load_fill_il():
    path = SCRIPTS / "fill_il1040x_2024.py"
    spec = importlib.util.spec_from_file_location("fill_il1040x_2024", path)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(SCRIPTS))
    spec.loader.exec_module(mod)
    return mod.fill_il1040x_2024


def generate_il_amendment_packet(
    original_cfg: dict,
    amended_cfg: dict,
    year: int,
) -> tuple[dict, bytes]:
    amendment = compute_il_amendment(original_cfg, amended_cfg, year)
    fill = _load_fill_il()
    pdf_bytes = fill(amendment)
    return amendment, pdf_bytes


def generate_amendment_packet(
    original_cfg: dict,
    amended_cfg: dict,
    year: int,
    state: str | None = None,
) -> dict:
    """Generate amendment PDF(s). Returns paths and summary metadata."""
    client_id = amended_cfg.get("client_id") or amended_cfg.get("taxpayer", {}).get("client_id", "client")
    out_dir = ROOT / "dist"
    out_dir.mkdir(parents=True, exist_ok=True)
    result: dict = {"client_id": client_id, "year": year, "outputs": []}

    if state and state.upper() == "IL":
        amendment, pdf = generate_il_amendment_packet(original_cfg, amended_cfg, year)
        out_path = out_dir / f"{client_id}_{year}_IL1040X.pdf"
        out_path.write_bytes(pdf)
        result["il_amendment"] = amendment
        result["outputs"].append(str(out_path))
        return result

    federal = compute_amendment(original_cfg, amended_cfg, year)
    result["federal_amendment"] = federal
    return result
