"""
After extract_form_fields.py, refine .fields.json keys to semantic names
for 1040 family forms. Uses left-margin line numbers (1040) and
position heuristics for others.
"""
import json
import re
from pathlib import Path

FORMS_DIR = Path(__file__).parent.parent / "public" / "irs-forms"

# Form 1040 (2024/2025) — field id -> semantic (from margin line + column heuristics)
# Page 1: use third column (x>400) for main amounts where tripled
F1040_P1 = {
    "f1_01_0": "line_15_taxable_income_col1",
    "f1_02_0": "line_15_taxable_income_col2",
    "f1_03_0": "line_15_taxable_income",
    "f1_04_0": "line_14_total_deductions_col1",
    "f1_05_0": "line_14_total_deductions_col2",
    "f1_06_0": "line_14_total_deductions",
    "f1_07_0": "line_12_std_or_itemized_col1",
    "f1_08_0": "line_12_std_or_itemized_col2",
    "f1_09_0": "line_12_std_or_itemized",
    "f1_10_0": "line_9_total_income_col1",
    "f1_11_0": "line_9_total_income",
    "f1_12_0": "line_7_capital_gain_col1",
    "f1_13_0": "line_7_capital_gain_col2",
    "f1_14_0": "line_7_capital_gain",
    "f1_15_0": "ssn_1a",
    "f1_16_0": "ssn_1b",
    "f1_17_0": "ssn_1c",
    "f1_18_0": "line_1z_total_wages",
    "f1_19_0": "line_8_schedule1_additional",
    "f1_20_0": "spouse_occupation",
    "f1_21_0": "preparer_firm",
    "f1_22_0": "preparer_address",
    "f1_23_0": "dependent1_name",
    "f1_24_0": "dependent2_name",
    "f1_25_0": "dependent3_name",
    "f1_26_0": "dependent1_ssn_1",
    "f1_27_0": "dependent1_ssn_2",
    "f1_28_0": "dependent1_ssn_3",
    "f1_29_0": "dependent1_child_credit",
    "f1_30_0": "dependent2_name_2",
    "f1_31_0": "dependent2_ssn",
    "f1_32_0": "dependent2_child_credit",
    "f1_33_0": "dependent3_name_2",
    "f1_34_0": "dependent3_ssn",
    "f1_35_0": "dependent3_child_credit",
    "f1_36_0": "dependents_check",
    "f1_37_0": "digital_assets_yes",
    "f1_38_0": "digital_assets_no",
    "f1_39_0": "presidential_check",
    "f1_40_0": "third_party_designee",
    "f1_41_0": "additional_info",
    "f1_42_0": "filing_status_mfs_ssn",
    "f1_43_0": "filing_status_hoh_qss_ssn",
    "f1_44_0": "filing_status_mfj_ssn",
    "f1_45_0": "filing_status_joint_alt",
    "f1_46_0": "filing_status_single_alt",
    "f1_47_0": "filing_status_alt_2",
    "f1_48_0": "filing_status_single_box",
    "f1_49_0": "filing_status_hoh_box",
    "f1_50_0": "filing_status_mfj_box",
    "f1_51_0": "filing_status_mfs_box",
    "f1_52_0": "foreign_country",
    "f1_53_0": "foreign_province",
    "f1_54_0": "foreign_postal",
    "f1_55_0": "apt_no",
    "f1_56_0": "city_state_zip",
    "f1_57_0": "spouse_name",
    "f1_58_0": "unknown_f1_58",
    "f1_59_0": "taxpayer_name",
    "f1_60_0": "occupation",
}

F1040_P2 = {
    "f2_01_0": "third_party_phone",
    "f2_02_0": "third_party_pin",
    "f2_03_0": "designee_name",
    "f2_04_0": "routing_number",
    "f2_05_0": "account_number",
    "f2_06_0": "refund_amount_direct_deposit",
    "f2_07_0": "estimated_penalty",
    "f2_08_0": "paid_preparer_firm_ein",
    "f2_09_0": "paid_preparer_ptin",
    "f2_10_0": "paid_preparer_phone",
    "f2_11_0": "paid_preparer_address",
    "f2_12_0": "paid_preparer_city_state_zip",
    "f2_13_0": "paid_preparer_name",
    "f2_14_0": "irs_internal_use",
    "f2_15_0": "paid_preparer_self_employed",
    "f2_16_0": "preparer_firm_name",
    "f2_17_0": "preparer_signature_date",
    "f2_18_0": "preparer_signature",
    "f2_19_0": "spouse_pin_ip_pin",
    "f2_20_0": "spouse_occupation_page2",
    "f2_21_0": "spouse_phone",
    "f2_22_0": "spouse_signature_date",
    "f2_23_0": "spouse_signature",
    "f2_24_0": "third_party_designee_yes_no",
    "f2_25_0": "taxpayer_phone",
    "f2_26_0": "taxpayer_signature_date",
    "f2_27_0": "taxpayer_signature",
    "f2_28_0": "occupation_page2",
    "f2_29_0": "designee_area",
    "f2_30_0": "line_37_amount_owed",
    "f2_31_0": "line_36_estimated_penalty_amt",
    "f2_32_0": "line_35c_amount_applied_next_year",
    "f2_33_0": "line_34_refund",
    "f2_34_0": "line_33_total_payments",
    "f2_35_0": "line_32_total_other_payments",
    "f2_36_0": "line_31_sched3_total",
    "f2_37_0": "line_30_reserved",
    "f2_38_0": "line_29_additional_child_tax_credit",
    "f2_39_0": "line_28_additional_credit_misc",
    "f2_40_0": "line_27_aoc_credit",
    "f2_41_0": "line_26_sched3_nonrefundable",
    "f2_42_0": "line_25_child_tax_credit",
    "f2_43_0": "line_24_total_tax",
    "f2_44_0": "line_23_sched2_total",
    "f2_45_0": "unknown_f2_45",
    "f2_46_0": "unknown_f2_46",
}

# Schedule 1 Part I / II — align to common line numbers (approximate from PDF order)
SCH1 = {
    "f1_01_0": "line_1_tax_refunds",
    "f1_02_0": "line_2_alimony_received",
    "f1_03_0": "line_3_business_income_loss",
    "f1_04_0": "line_4_other_gains",
    "f1_05_0": "line_5_rental_royalty",
    "f1_06_0": "line_6_farm_income",
    "f1_07_0": "line_7_unemployment",
    "f1_08_0": "line_8_other_income_desc",
    "f1_09_0": "line_8_other_income_amt",
    "f1_10_0": "line_9_total_other_income",
    "f1_11_0": "line_10_combine_lines_1_through_9",
    "f1_12_0": "line_11_educator_expenses",
    "f1_13_0": "line_12_certain_business_expenses",
    "f1_14_0": "line_13_hsa_deduction",
    "f1_15_0": "line_14_moving_expenses",
    "f1_16_0": "line_15_self_employed_sep_simple",
    "f1_17_0": "line_16_self_employed_health",
    "f1_18_0": "line_17_penalty_early_withdrawal",
    "f1_19_0": "line_18_ira_deduction",
    "f1_20_0": "line_19_student_loan_interest",
    "f1_21_0": "line_20_reservists_expenses",
    "f1_22_0": "line_21_other_adjustments_desc",
    "f1_23_0": "line_21_other_adjustments_amt",
    "f1_24_0": "line_22_archer_msa",
    "f1_25_0": "line_23_other_adjustments_2",
    "f1_26_0": "line_24_total_adjustments",
    "f2_01_0": "line_25_health_coverage_exemptions",
    "f2_02_0": "line_26_self_employment_tax_deduction",
    "f2_03_0": "line_27_reserved",
    "f2_04_0": "line_28_self_employed_health_alt",
    "f2_05_0": "line_29_keogh_sep_simple_alt",
    "f2_06_0": "line_30_penalty_early_alt",
    "f2_07_0": "line_31_reserved",
    "f2_08_0": "line_32_reserved",
    "f2_09_0": "line_33_reserved",
    "f2_10_0": "line_34_jury_duty",
    "f2_11_0": "line_35_deductible_expenses",
    "f2_12_0": "line_36_treasury_program",
    "f2_13_0": "line_37_section_1341_credit",
    "f2_14_0": "line_38_reserved",
    "f2_15_0": "line_39_reserved",
    "f2_16_0": "line_40_reserved",
    "f2_17_0": "line_41_reserved",
    "f2_18_0": "line_42_reserved",
    "f2_19_0": "line_43_reserved",
    "f2_20_0": "line_44_reserved",
    "f2_21_0": "line_45_reserved",
    "f2_22_0": "line_46_reserved",
    "f2_23_0": "line_47_reserved",
    "f2_24_0": "line_48_reserved",
    "f2_25_0": "line_49_reserved",
    "f2_26_0": "line_26_total_adjustments_to_income",
}

SCH2 = {
    "f1_01_0": "line_1_additional_medicare_tax",
    "f1_02_0": "line_2_net_investment_income_tax",
    "f1_03_0": "line_3_uncollected_medicare",
    "f1_04_0": "line_4_self_employment_tax",
    "f1_05_0": "line_5_reserved",
    "f1_06_0": "line_6_additional_tax_on_ira",
    "f1_07_0": "line_7_reserved",
    "f1_08_0": "line_8_additional_tax_on_iras",
    "f1_09_0": "line_9_reserved",
    "f1_10_0": "line_10_section_72_penalty",
    "f1_11_0": "line_11_reserved",
    "f1_12_0": "line_12_reserved",
    "f1_13_0": "line_13_uncollected_ss_medicare",
    "f1_14_0": "line_14_reserved",
    "f1_15_0": "line_15_interest_on_tax_deferral",
    "f1_16_0": "line_16_reserved",
    "f1_17_0": "line_17_reserved",
    "f2_01_0": "line_1_tax_from_sched_j",
    "f2_02_0": "line_2_tax_from_8814",
    "f2_03_0": "line_3_tax_from_4972",
    "f2_04_0": "line_4_amt_form_6251",
    "f2_05_0": "line_5_excess_premium_credit",
    "f2_06_0": "line_6_reserved",
    "f2_07_0": "line_7_reserved",
    "f2_08_0": "line_8_additional_tax_fsas",
    "f2_09_0": "line_9_uncollected_stimulus",
    "f2_10_0": "line_10_section_962",
    "f2_11_0": "line_11_section_965",
    "f2_12_0": "line_12_reserved",
    "f2_13_0": "line_13_other_taxes",
    "f2_14_0": "line_14_other_taxes_desc",
    "f2_15_0": "line_14_other_taxes_amt",
    "f2_16_0": "line_15_reserved",
    "f2_17_0": "line_16_reserved",
    "f2_18_0": "line_17_reserved",
    "f2_19_0": "line_18_reserved",
    "f2_20_0": "line_19_reserved",
    "f2_21_0": "line_20_reserved",
    "f2_22_0": "line_21_total_additional_taxes",
    "f2_23_0": "line_22_reserved",
    "f2_24_0": "line_23_reserved",
}

F8959 = {
    "f1_1_0": "name_shown_on_return",
    "f1_2_0": "ssn",
    "f1_3_0": "line_1_medicare_wages",
    "f1_4_0": "line_2_unreported_medicare_wages",
    "f1_5_0": "line_3_wages_tip_subtotal",
    "f1_6_0": "line_4_self_employment_income",
    "f1_7_0": "line_5_combine_lines_3_and_4",
    "f1_8_0": "line_6_railroad_compensation",
    "f1_9_0": "line_7_combine_lines_5_and_6",
    "f1_10_0": "line_8_enter_amount_from_1040_line_11",
    "f1_11_0": "line_9_threshold",
    "f1_12_0": "line_10_subtract_line_9_from_8",
    "f1_13_0": "line_11_enter_smaller_of_7_or_10",
    "f1_14_0": "line_12_multiply_line_11_by_009",
    "f1_15_0": "line_13_additional_medicare_withholding",
    "f1_16_0": "line_14_total_additional_medicare_tax",
    "f1_17_0": "line_15_reserved",
    "f1_18_0": "line_16_reserved",
    "f1_19_0": "line_17_reserved",
    "f1_20_0": "line_18_total_additional_medicare_tax",
    "f1_21_0": "line_19_reserved",
    "f1_22_0": "line_20_reserved",
    "f1_23_0": "line_21_reserved",
    "f1_24_0": "line_22_reserved",
    "f1_25_0": "line_23_reserved",
    "f1_26_0": "line_24_reserved",
}

# Schedule C — common IRS layout (abbreviated; keys vary slightly 2024 vs 2025)
def sch_c_rename(orig_key: str) -> str:
    m = {
        "f1_1_0": "principal_business_name",
        "f1_2_0": "principal_business_code",
        "f1_3_0": "business_name",
        "f1_4_0": "ein_box_d",
        "f1_5_0": "business_address",
        "f1_6_0": "business_city_state_zip",
        "f1_7_0": "accounting_method_cash",
        "f1_8_0": "accounting_method_accrual",
        "f1_9_0": "accounting_method_other",
        "f1_10_0": "material_participation_yes",
        "f1_11_0": "material_participation_no",
        "f1_12_0": "line_1_gross_receipts",
        "f1_13_0": "line_2_returns_allowances",
        "f1_14_0": "line_4_cost_of_goods_sold",
        "f1_15_0": "line_5_gross_profit",
        "f1_16_0": "line_6_other_income",
        "f1_17_0": "line_7_gross_income",
        "f1_18_0": "line_8_advertising",
        "f1_19_0": "line_9_car_truck",
        "f1_20_0": "line_10_commissions",
        "f1_21_0": "line_11_contract_labor",
        "f1_22_0": "line_12_depletion",
        "f1_23_0": "line_13_depreciation_179",
        "f1_24_0": "line_14_employee_benefits",
        "f1_25_0": "line_15_insurance",
        "f1_26_0": "line_16_interest_mortgage",
        "f1_27_0": "line_17_interest_other",
        "f1_28_0": "line_18_legal_professional",
        "f1_29_0": "line_19_office_expense",
        "f1_30_0": "line_20_pension_plans",
        "f1_31_0": "line_21_rent_vehicles",
        "f1_32_0": "line_22_rent_other",
        "f1_33_0": "line_23_repairs",
        "f1_34_0": "line_24_supplies",
        "f1_35_0": "line_25_taxes_licenses",
        "f1_36_0": "line_26_travel",
        "f1_37_0": "line_27_meals",
        "f1_38_0": "line_28_total_expenses_before",
        "f1_39_0": "line_29_tentative_profit",
        "f1_40_0": "line_30_home_office",
        "f1_41_0": "line_31_net_profit",
        "f1_42_0": "investment_at_risk_all",
        "f1_43_0": "investment_at_risk_some",
        "f1_44_0": "part_v_other_expenses_line_1_desc",
        "f1_45_0": "part_v_other_expenses_line_1_amt",
        "f1_46_0": "part_v_other_expenses_line_2_desc",
        "f1_47_0": "part_v_other_expenses_line_2_amt",
        "f1_48_0": "part_v_other_expenses_line_3_desc",
        "f1_49_0": "part_v_other_expenses_line_3_amt",
        "f1_50_0": "part_v_other_expenses_line_4_desc",
        "f1_51_0": "part_v_other_expenses_line_4_amt",
        "f1_52_0": "part_v_other_expenses_line_5_desc",
        "f1_53_0": "part_v_other_expenses_line_5_amt",
        "f1_54_0": "part_v_other_expenses_line_6_desc",
        "f1_55_0": "part_v_other_expenses_line_6_amt",
        "f1_56_0": "part_v_other_expenses_line_7_desc",
        "f1_57_0": "part_v_other_expenses_line_7_amt",
        "f1_58_0": "part_v_other_expenses_line_8_desc",
        "f1_59_0": "part_v_other_expenses_line_8_amt",
        "f1_60_0": "part_v_other_expenses_line_9_desc",
        "f1_61_0": "part_v_other_expenses_line_9_amt",
        "f1_62_0": "part_v_other_expenses_line_10_desc",
        "f1_63_0": "part_v_other_expenses_line_10_amt",
        "f1_64_0": "part_v_other_expenses_line_11_desc",
        "f1_65_0": "part_v_other_expenses_line_11_amt",
        "f1_66_0": "part_v_other_expenses_line_12_desc",
        "f1_67_0": "part_v_other_expenses_line_12_amt",
        "f1_68_0": "part_v_other_expenses_line_13_desc",
        "f1_69_0": "part_v_other_expenses_line_13_amt",
        "f1_70_0": "part_v_total_other_expenses",
        "f1_71_0": "part_iv_vehicle_1",
        "f1_72_0": "part_iv_vehicle_2",
    }
    return m.get(orig_key, orig_key)


def sch_se_rename(orig_key: str) -> str:
    m = {
        "f1_1_0": "name",
        "f1_2_0": "ssn",
        "f1_3_0": "line_a_multiple_businesses_yes",
        "f1_4_0": "line_a_multiple_businesses_no",
        "f1_5_0": "line_b_principal_business_code",
        "f1_6_0": "line_c_business_name",
        "f1_7_0": "line_d_ein",
        "f1_8_0": "line_e_farm_optional_method",
        "f1_9_0": "line_f_net_farm_profit",
        "f1_10_0": "line_g_optional_method_partnership",
        "f1_11_0": "line_h_net_partnership_income",
        "f1_12_0": "line_i_combine_lines_f_g_h",
        "f1_13_0": "line_j_max_optional_method",
        "f1_14_0": "line_k_smaller_i_or_j",
        "f1_15_0": "line_l_net_earnings_diff",
        "f1_16_0": "line_m_schedule_k1_box_14",
        "f1_17_0": "line_n_combine_lines_l_m",
        "f1_18_0": "line_o_partnership_income",
        "f1_19_0": "line_p_combine_lines_n_o",
        "f1_20_0": "line_1a_net_farm_profit",
        "f1_21_0": "line_1b_net_nonfarm_profit",
        "f1_22_0": "line_2_combine_lines_1a_1b",
        "f1_23_0": "line_3_combine_lines_1a_1b_from_schedule_k1",
        "f1_24_0": "line_4a_optional_method_farm",
        "f1_25_0": "line_4b_optional_method_nonfarm",
        "f1_26_0": "line_4c_combine_optional",
        "f1_27_0": "line_5a_net_earnings_factor",
        "f1_28_0": "line_5b_net_earnings_factor",
        "f1_29_0": "line_5c_combine",
        "f1_30_0": "line_6_combine_net_earnings",
        "f1_31_0": "line_7_maximum_earnings",
        "f1_32_0": "line_8_total_se_tax",
    }
    return m.get(orig_key, orig_key)


def merge_maps(form_stem: str, fields: dict) -> dict:
    out = {}
    if re.match(r"^1040_\d{4}$", form_stem):
        # 1040_2024 or 1040_2025 (not 1040s1, 1040sc, etc.)
        for k in fields:
            if k in F1040_P1:
                out[k] = F1040_P1[k]
            elif k in F1040_P2:
                out[k] = F1040_P2[k]
            else:
                out[k] = k
    elif "1040s1_" in form_stem:
        for k in fields:
            out[k] = SCH1.get(k, k)
    elif "1040s2_" in form_stem:
        for k in fields:
            out[k] = SCH2.get(k, k)
    elif form_stem.startswith("8959_"):
        for k in fields:
            out[k] = F8959.get(k, k)
    elif "1040sc_" in form_stem:
        for k in fields:
            out[k] = sch_c_rename(k)
    elif "1040sse_" in form_stem:
        for k in fields:
            out[k] = sch_se_rename(k)
    else:
        for k in fields:
            out[k] = k
    return out


def rename_form_json(path: Path):
    data = json.loads(path.read_text())
    stem_pdf = Path(data.get("pdfFilename", "x.pdf")).stem
    rev = merge_maps(stem_pdf, data["fields"])
    new_fields = {}
    for old_key, spec in data["fields"].items():
        new_key = rev.get(old_key, old_key)
        new_fields[new_key] = {**spec}
    data["fields"] = new_fields
    path.write_text(json.dumps(data, indent=2))


def main():
    for jpath in sorted(FORMS_DIR.glob("*.fields.json")):
        rename_form_json(jpath)
        print(f"renamed keys in {jpath.name}")


if __name__ == "__main__":
    main()
