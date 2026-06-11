"""Federal and Illinois return computation for amendment flows."""
from __future__ import annotations

import copy
from typing import Any

IL_FLAT_RATE_2024 = 0.0495
IL_EXEMPTION_2024 = 2775
IL_EXEMPTION_PHASEOUT_START = {
    "single": 250_000,
    "mfj": 500_000,
    "mfs": 250_000,
    "hoh": 250_000,
    "qss": 500_000,
}


def _filing_status(cfg: dict) -> str:
    return cfg.get("filing_status") or cfg.get("taxpayer", {}).get("filing_status", "single")


def _exemption_count(cfg: dict) -> int:
    tp = cfg.get("taxpayer", {})
    n = 1
    if _filing_status(cfg) == "mfj":
        n = 2
    n += int(tp.get("dependents", cfg.get("dependents", 0)) or 0)
    return n


def _il_exemption_allowance(base_income: int, cfg: dict, year: int) -> int:
    if year != 2024:
        raise ValueError(f"IL exemption rules not implemented for {year}")
    status = _filing_status(cfg)
    threshold = IL_EXEMPTION_PHASEOUT_START.get(status, 250_000)
    count = _exemption_count(cfg)
    gross = IL_EXEMPTION_2024 * count
    if base_income <= threshold:
        return gross
    # Illinois reduces exemption above threshold; simplified phase-down.
    excess = base_income - threshold
    reduction = min(gross, int(excess * 0.05))
    return max(0, gross - reduction)


def compute_il_return(federal_agi: int, cfg: dict, year: int) -> dict[str, int]:
    """Compute IL-1040 lines for a sole proprietor with no Sch M add-backs/subtractions."""
    additions = int(cfg.get("il", {}).get("additions", 0))
    subtractions = int(cfg.get("il", {}).get("subtractions", 0))
    recapture = int(cfg.get("il", {}).get("recapture", 0))
    credits = int(cfg.get("il", {}).get("nonrefundable_credits", 0))
    other_taxes = int(cfg.get("il", {}).get("other_taxes", 0))
    use_tax = int(cfg.get("il", {}).get("use_tax", 0))

    line1 = int(federal_agi)
    line4 = line1 + additions
    line9 = line4 - subtractions
    line10 = _il_exemption_allowance(line9, cfg, year)
    line11 = max(0, line9 - line10)
    line12 = round(line11 * IL_FLAT_RATE_2024)
    line14 = max(0, line12 + recapture)
    line18 = min(credits, line14)
    line19 = max(0, line14 - line18)
    line23 = line19 + other_taxes + use_tax

    return {
        "line1_federal_agi": line1,
        "line4_total_income": line4,
        "line9_il_base_income": line9,
        "line10_exemption": line10,
        "line11_net_income": line11,
        "line12_tax": line12,
        "line14_income_tax": line14,
        "line23_total_tax": line23,
    }


def _schedule_c_net(cfg: dict) -> int:
    sc = cfg.get("schedule_c", {})
    if "net_profit" in sc:
        return int(sc["net_profit"])
    gross = int(sc.get("gross_receipts", 0)) - int(sc.get("returns_allowances", 0)) - int(sc.get("cogs", 0))
    expenses = sum(int(v) for v in sc.get("expenses", {}).values())
    return gross - expenses


def compute_individual_return(cfg: dict, year: int) -> dict[str, Any]:
    """Minimal federal 1040 computation for Schedule C sole proprietors (AGI focus)."""
    w2 = int(cfg.get("w2_wages", 0))
    interest = int(cfg.get("taxable_interest", 0))
    dividends = int(cfg.get("ordinary_dividends", 0))
    sched_c = _schedule_c_net(cfg)
    half_se = int(cfg.get("half_se_deduction", round(max(0, sched_c * 0.9235) * 0.153 * 0.5)))
    if "half_se_deduction" not in cfg and sched_c > 0:
        se_inc = round(sched_c * 0.9235)
        half_se = round(se_inc * 0.153 * 0.5)

    total_income = w2 + interest + dividends + sched_c
    agi = total_income - half_se

    override = cfg.get("federal_agi")
    if override is not None:
        agi = int(override)

    withholding = int(cfg.get("federal_withholding", 0))
    estimated = int(cfg.get("estimated_payments", 0))

    return {
        "agi": agi,
        "schedule_c_net": sched_c,
        "half_se_deduction": half_se,
        "withholding": withholding,
        "estimated_payments": estimated,
        "form1040": {"line11": agi},
    }


def _resolve_as_filed(cfg: dict, year: int, domain: str) -> dict[str, int]:
    block = cfg.get(f"{domain}_as_filed")
    if block:
        return {k: int(v) for k, v in block.items()}

    if domain == "il":
        federal = cfg.get("federal_as_filed", {}).get("line11_agi")
        if federal is None:
            federal = compute_individual_return(cfg, year)["agi"]
        return compute_il_return(int(federal), cfg, year)

    if domain == "federal":
        fed = compute_individual_return(cfg, year)
        return {"line11_agi": fed["agi"]}

    raise ValueError(domain)


def compute_il_amendment(original_cfg: dict, amended_cfg: dict, year: int) -> dict[str, Any]:
    amended_fed = compute_individual_return(amended_cfg, year)
    amended_agi = int(amended_fed["agi"])
    corrected = compute_il_return(amended_agi, amended_cfg, year)
    original_il = _resolve_as_filed(original_cfg, year, "il")

    orig_payments = int(original_cfg.get("il_as_filed", {}).get("total_payments", 0))
    orig_overpayment = int(original_cfg.get("il_as_filed", {}).get("overpayment", 0))
    orig_amount_owed = int(original_cfg.get("il_as_filed", {}).get("amount_owed", 0))

    corrected_payments = int(amended_cfg.get("il", {}).get("total_payments", orig_payments))
    corrected_overpayment = max(0, corrected_payments - corrected["line23_total_tax"])
    corrected_underpayment = max(0, corrected["line23_total_tax"] - corrected_payments)

    # Step 9–10 reconciliation (IL-1040-X page 2)
    line33 = corrected_overpayment if corrected_payments > corrected["line23_total_tax"] else 0
    line34 = corrected_underpayment if corrected["line23_total_tax"] > corrected_payments else 0
    line35 = orig_overpayment
    if line33 and line33 < line35:
        line39 = line35 - line33
    elif line34:
        line39 = line34 + line35
    elif not line33 and not line34:
        line39 = line35
    else:
        line39 = 0

    return {
        "taxpayer": amended_cfg.get("taxpayer", {}),
        "year": year,
        "amended_federal_agi": amended_agi,
        "original": original_il,
        "corrected": corrected,
        "payments": {
            "original_total_payments": orig_payments,
            "corrected_total_payments": corrected_payments,
            "original_overpayment_line35": line35,
            "original_amount_owed": orig_amount_owed,
            "line33_adjusted_overpayment": line33,
            "line34_adjusted_underpayment": line34,
            "line39_amount_owed": line39,
        },
        "explanation": amended_cfg.get(
            "amendment_explanation",
            "Federal Form 1040-X amendment corrected Schedule C business expenses, reducing federal AGI "
            "and Illinois base income. Illinois tax recomputed accordingly.",
        ),
    }


def compute_amendment(original_cfg: dict, amended_cfg: dict, year: int) -> dict[str, Any]:
    """Federal 1040-X computation (original vs corrected AGI and tax)."""
    original = _resolve_as_filed(original_cfg, year, "federal")
    amended = compute_individual_return(amended_cfg, year)
    return {
        "original": original,
        "corrected": {"line11_agi": amended["agi"]},
        "taxpayer": amended_cfg.get("taxpayer", {}),
        "year": year,
    }
