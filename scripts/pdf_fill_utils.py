"""Shared rect-driven PDF fill helpers for IRS / state form fillers."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import fitz

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"


def load_fields(form_stem: str) -> dict[str, Any]:
    path = FORMS_DIR / f"{form_stem}.fields.json"
    return json.loads(path.read_text())


def find_widget_by_key(registry: dict, *candidates: str) -> dict | None:
    """Resolve a field spec by semantic key or AcroForm leaf id substring."""
    fields = registry.get("fields", registry)
    for key, spec in fields.items():
        if key in candidates:
            return spec
        leaf = spec.get("id", "")
        for c in candidates:
            if c.lower() in leaf.lower() or c.lower() in key.lower():
                return spec
    return None


def baseline_for(rect: list[float], page_height: float = 792.0) -> tuple[float, float, float, float]:
    """Convert bottom-origin PDF rect to top-origin draw coordinates (x0, top, width, height)."""
    x0, y0, x1, y1 = rect
    top = page_height - y1
    return x0, top, x1 - x0, y1 - y0


def right_align(page: fitz.Page, rect: list[float], text: str, fontsize: float = 9.0) -> None:
  x0, y0, x1, y1 = rect
  w = x1 - x0
  while fontsize > 5 and fitz.get_text_length(text, fontname="helv", fontsize=fontsize) > w - 4:
    fontsize -= 0.5
  tw = fitz.get_text_length(text, fontname="helv", fontsize=fontsize)
  x = x1 - tw - 2
  y = y0 + (y1 - y0 - fontsize) / 2 + fontsize * 0.8
  page.insert_text((x, y), text, fontname="helv", fontsize=fontsize, color=(0, 0, 0))


def left_align(page: fitz.Page, rect: list[float], text: str, fontsize: float = 9.0) -> None:
  x0, y0, x1, y1 = rect
  w = x1 - x0
  while fontsize > 5 and fitz.get_text_length(text, fontname="helv", fontsize=fontsize) > w - 4:
    fontsize -= 0.5
  y = y0 + (y1 - y0 - fontsize) / 2 + fontsize * 0.8
  page.insert_text((x0 + 2, y), text, fontname="helv", fontsize=fontsize, color=(0, 0, 0))


def comb_draws(page: fitz.Page, rect: list[float], digits: str, slots: int | None = None) -> None:
  """Draw one character per comb cell across a wide SSN / numeric field."""
  x0, y0, x1, y1 = rect
  n = slots or max(len(digits), 9)
  cell_w = (x1 - x0) / n
  fontsize = min(10.0, (y1 - y0) * 0.75)
  for i, ch in enumerate(digits[:n]):
    cx = x0 + cell_w * i + cell_w * 0.35
    cy = y0 + (y1 - y0 - fontsize) / 2 + fontsize * 0.8
    page.insert_text((cx, cy), ch, fontname="helv", fontsize=fontsize, color=(0, 0, 0))


def money(n: int | float) -> str:
  return f"{round(n):,}"


def flatten_widgets(doc: fitz.Document) -> None:
  for page in doc:
    for w in page.widgets() or []:
      w.field_flags |= fitz.PDF_FIELD_IS_READ_ONLY
