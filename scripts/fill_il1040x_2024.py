"""Rect-driven filler for Illinois Form IL-1040-X (TY2024)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import fitz

from pdf_fill_utils import (
    comb_draws,
    find_widget_by_key,
    flatten_widgets,
    left_align,
    load_fields,
    money,
    right_align,
)

FIELD_MAP_IL1040X_2024: dict[str, str] = {
    "line1": "Corrected federally adjusted gross income",
    "line2": "Corrected federally tax-exempt",
    "line3": "Corrected other additions",
    "line4": "Corrected other income",
    "line5": "Corrected Social Security benefits",
    "line6": "Corrected Illinois Income Tax",
    "line7": "Corrected other subtractions",
    "line8": "Corrected total subtractions",
    "line9": "Corrected Illinois base income",
    "line10": "Corrected exemption allowance",
    "line11": "Corrected Illinois net income",
    "line12": "Corrected residents calculation",
    "line13": "Corrected recapture of investment tax credits",
    "line14": "Corrected income tax",
    "line23_page1": "Corrected total tax",
    "line24": "Correted total tax from Line 23",
    "line25": "Corrected Illinois Income Tax withheld",
    "line26": "Corrected estimated payments",
    "line27": "Corrected pass-through withholding",
    "line28": "Corrected pass-through entity tax credit",
    "line29": "Corrected Earned Income Tax Credit",
    "line30": "Corrected Child Tax credit from Schedule IL-E/EITC",
    "line31": "Corrected total amount paid",
    "line32": "Corrected total payments and refundable credit",
    "line33": "Correct if Line 32 is greater",
    "line34": "Corrected if Line 24 is greater",
    "line35": "Corrected overpayment, if any, as shown",
    "line36": "Corrected overpayment",
    "line39": "Corrected amount you owe",
    "explain": "Explain",
    "ssn": "Your social security number",
    "first_name": "Your first name and initial",
    "last_name": "Your last name",
    "yob": "Year of birth",
    "address": "Mailing address (See instructions if foreign address)",
    "city": "City",
    "state": "State",
    "zip": "ZIP or Postal Code",
    "email": "Email Address",
}


def _rect(fields: dict, semantic: str) -> list[float] | None:
    leaf = FIELD_MAP_IL1040X_2024.get(semantic, semantic)
    spec = find_widget_by_key(fields, leaf, semantic)
    return spec.get("rect") if spec else None


def _page(fields: dict, semantic: str) -> int:
    leaf = FIELD_MAP_IL1040X_2024.get(semantic, semantic)
    spec = find_widget_by_key(fields, leaf, semantic)
    return int(spec.get("page", 1)) if spec else 1


def _draw_amount(
    doc: fitz.Document,
    fields: dict,
    semantic: str,
    value: int,
    *,
    show_zero: bool = False,
) -> None:
    rect = _rect(fields, semantic)
    if not rect or rect[1] == 0:
        return
    page = doc[_page(fields, semantic) - 1]
    if value == 0 and not show_zero:
        return
    right_align(page, rect, money(value) if value else "0")


def fill_il1040x_2024(amendment: dict[str, Any], template_pdf: Path | None = None) -> bytes:
    root = Path(__file__).parent.parent
    pdf_path = template_pdf or root / "public" / "irs-forms" / "il1040x_2024.pdf"
    fields = load_fields("il1040x_2024")
    doc = fitz.open(str(pdf_path))

    tp = amendment.get("taxpayer", {})
    corrected = amendment["corrected"]
    payments = amendment["payments"]

    # Identity
    ssn_rect = _rect(fields, "ssn")
    if ssn_rect:
        digits = "".join(c for c in str(tp.get("ssn", "")) if c.isdigit())
        comb_draws(doc[0], ssn_rect, digits, slots=9)

    name = str(tp.get("name", ""))
    parts = name.split()
    first_rect = _rect(fields, "first_name")
    last_rect = _rect(fields, "last_name")
    if first_rect:
        left_align(doc[0], first_rect, parts[0] if parts else name)
    if last_rect:
        left_align(doc[0], last_rect, " ".join(parts[1:]) if len(parts) > 1 else "")

    yob_rect = _rect(fields, "yob")
    if yob_rect and tp.get("year_of_birth"):
        left_align(doc[0], yob_rect, str(tp["year_of_birth"]))

    for key, val in [
        ("address", tp.get("address")),
        ("city", tp.get("city")),
        ("state", tp.get("state")),
        ("zip", tp.get("zip")),
        ("email", tp.get("email")),
    ]:
        rect = _rect(fields, key)
        if rect and val:
            left_align(doc[_page(fields, key) - 1], rect, str(val))

    # Filing status checkbox — single
    for w in doc[0].widgets() or []:
        if w.field_name == "Filing status" and w.rect.x0 < 110:
            w.field_value = True
            w.update()

    # Corrected income / tax lines
    line_map = {
        "line1": corrected["line1_federal_agi"],
        "line4": corrected["line4_total_income"],
        "line9": corrected["line9_il_base_income"],
        "line10": corrected["line10_exemption"],
        "line11": corrected["line11_net_income"],
        "line12": corrected["line12_tax"],
        "line14": corrected["line14_income_tax"],
        "line23_page1": corrected["line23_total_tax"],
        "line24": corrected["line23_total_tax"],
    }
    # line_map includes zeros for net income / tax totals (show_zero below)
    zero_lines = {"line11", "line12", "line14", "line23_page1", "line24", "line39"}
    for sem, val in line_map.items():
        _draw_amount(doc, fields, sem, val, show_zero=sem in zero_lines)

    pay_map = {
        "line31": payments.get("corrected_total_payments", 0),
        "line32": payments.get("corrected_total_payments", 0),
        "line33": payments.get("line33_adjusted_overpayment", 0),
        "line34": payments.get("line34_adjusted_underpayment", 0),
        "line35": payments.get("original_overpayment_line35", 0),
        "line39": payments.get("line39_amount_owed", 0),
    }
    for sem, val in pay_map.items():
        _draw_amount(doc, fields, sem, val, show_zero=sem in zero_lines)

    explain_rect = _rect(fields, "explain")
    if explain_rect:
        left_align(doc[1], explain_rect, amendment.get("explanation", ""), fontsize=8.0)

    # Federal change reason checkbox on page 2
    for w in doc[1].widgets() or []:
        if w.field_name and "Federal change" in str(w.field_name):
            w.field_value = True
            w.update()
            break
    else:
        for w in doc[1].widgets() or []:
            if w.field_type_string == "CheckBox" and w.rect.y0 > 400:
                w.field_value = True
                w.update()
                break

    flatten_widgets(doc)
    out = doc.tobytes(garbage=4, deflate=True)
    doc.close()
    return out
