"""Rename Form 1040 Page 2 amount fields to readable semantic keys (f2_nn leaf → IRS line)."""
import json
import re
from pathlib import Path

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"

PAGE2_MAP = {
    "f2_01_0": "line_16_form8814_amount",
    "f2_02_0": "line_16_tax",
    "f2_03_0": "line_17_sched2_line3",
    "f2_04_0": "line_18_add_lines_16_and_17",
    "f2_05_0": "line_19_sched8812_child_tax_credit",
    "f2_06_0": "line_20_sched3_line8",
    "f2_07_0": "line_21_add_lines_19_and_20",
    "f2_08_0": "line_22_subtract_line_21_from_18",
    "f2_09_0": "line_23_sched2_line21_other_taxes",
    "f2_10_0": "line_24_total_tax",
    "f2_11_0": "line_25a_w2_withholding",
    "f2_12_0": "line_25b_1099_withholding",
    "f2_13_0": "line_25c_other_withholding",
    "f2_14_0": "line_25d_sum_withholding",
    "f2_15_0": "line_26_estimated_tax_payments",
    "f2_16_0": "line_27_earned_income_credit",
    "f2_17_0": "line_28_additional_child_tax_credit",
    "f2_18_0": "line_29_american_opportunity_credit",
    "f2_19_0": "line_30_reserved",
    "f2_20_0": "line_31_sched3_line15",
    "f2_21_0": "line_32_total_other_payments_and_credits",
    "f2_22_0": "line_33_total_payments",
    "f2_23_0": "line_34_refund_if_overpaid",
    "f2_24_0": "line_35a_refund_amount_to_you",
    "RoutingNo_0_f2_25_0": "line_35b_routing_number",
    "AccountNo_0_f2_26_0": "line_35d_account_number",
    "f2_27_0": "line_36_estimated_tax_applied_to_next_year",
    "f2_28_0": "line_37_amount_you_owe",
    "f2_29_0": "line_38_estimated_tax_penalty",
    "f2_30_0": "third_party_designee_name",
    "f2_31_0": "third_party_designee_phone_pin",
    "f2_32_0": "occupation_misc_right_column",
}


def leaf_tail(key: str) -> str:
    """Extract trailing widget path e.g. topmostSubform_0_Page2_0_f2_02_0 → f2_02_0."""
    m = re.search(r"(f2_\d+_0|RoutingNo_0_f2_25_0|AccountNo_0_f2_26_0)$", key)
    return m.group(1) if m else ""


def remap(path: Path):
    data = json.loads(path.read_text())
    new_fields = {}
    used = set()
    for key, spec in data["fields"].items():
        nk = key
        tail = leaf_tail(key)
        if tail and tail in PAGE2_MAP:
            nk = PAGE2_MAP[tail]
        base = nk
        i = 2
        while nk in used:
            nk = f"{base}_{i}"
            i += 1
        used.add(nk)
        new_fields[nk] = spec
    data["fields"] = new_fields
    path.write_text(json.dumps(data, indent=2))


def main():
    for p in sorted(FORMS_DIR.glob("1040_20*.fields.json")):
        remap(p)
        print("remapped page2 semantics", p.name)


if __name__ == "__main__":
    main()
