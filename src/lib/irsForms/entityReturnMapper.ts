import type { EntityReturnInput, EntityReturnSummary } from '@/types/businessEntity';
import type { IndividualReturnInput, IndividualReturnSummary } from '@/types/individualReturn';
import type { FormFieldValues } from '@/lib/irsForms/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function yn(check: boolean): string {
  return check ? '/Yes' : '/Off';
}

/** Filing status — left column then right column (Single/MFJ/MFS | HOH/QSS). */
function filingStatus1040(status: IndividualReturnInput['filingStatus']): Record<string, string> {
  return {
    'topmostSubform_0_Page1_0_Checkbox_ReadOrder_0_c1_8_0': yn(status === 'single'),
    'topmostSubform_0_Page1_0_Checkbox_ReadOrder_0_c1_8_1': yn(status === 'mfj'),
    'topmostSubform_0_Page1_0_Checkbox_ReadOrder_0_c1_8_2': yn(status === 'mfs'),
    'topmostSubform_0_Page1_0_c1_8_0': yn(status === 'hoh'),
    'topmostSubform_0_Page1_0_c1_8_1': yn(status === 'qss'),
  };
}

export function values1040(
  input: IndividualReturnInput,
  summary: IndividualReturnSummary,
  _entityInput: EntityReturnInput,
): FormFieldValues {
  const ssn = digitsOnly(input.taxpayerSSN);
  const f = summary.form1040;

  return {
    ...filingStatus1040(input.filingStatus),
    'topmostSubform_0_Page1_0_f1_05_0': ssn.slice(0, 3),
    'topmostSubform_0_Page1_0_f1_06_0': ssn.slice(3, 5),
    'topmostSubform_0_Page1_0_f1_07_0': ssn.slice(5, 9),
    'topmostSubform_0_Page1_0_f1_14_0': input.taxpayerName.split(/\s+/)[0] ?? input.taxpayerName,
    'topmostSubform_0_Page1_0_f1_15_0': input.taxpayerName.split(/\s+/).slice(1).join(' ') || ' ',
    'topmostSubform_0_Page1_0_Address_ReadOrder_0_f1_20_0': input.homeAddress,
    'topmostSubform_0_Page1_0_Address_ReadOrder_0_f1_22_0': input.homeCityStateZip,

    'topmostSubform_0_Page1_0_f1_47_0': fmt(f.line1z),
    'topmostSubform_0_Page1_0_f1_48_0': fmt(f.line2b),
    'topmostSubform_0_Page1_0_f1_49_0': fmt(f.line3a),
    'topmostSubform_0_Page1_0_f1_50_0': fmt(f.line3b),
    'topmostSubform_0_Page1_0_f1_51_0': fmt(f.line4b),
    'topmostSubform_0_Page1_0_f1_52_0': fmt(f.line5b),
    'topmostSubform_0_Page1_0_f1_53_0': fmt(f.line6bTaxable),
    'topmostSubform_0_Page1_0_f1_54_0': fmt(f.line6aGross),
    'topmostSubform_0_Page1_0_f1_55_0': fmt(f.line7),
    'topmostSubform_0_Page1_0_f1_56_0': fmt(f.line8),
    'topmostSubform_0_Page1_0_f1_57_0': fmt(f.line8z),
    'topmostSubform_0_Page1_0_f1_58_0': fmt(f.line9),
    'topmostSubform_0_Page1_0_f1_59_0': fmt(f.line9),
    'topmostSubform_0_Page1_0_f1_60_0': fmt(f.line10),
    'topmostSubform_0_Page1_0_f1_61_0': fmt(f.line11),
    'topmostSubform_0_Page1_0_f1_62_0': fmt(f.line11),
    'topmostSubform_0_Page1_0_f1_63_0': fmt(f.line11),
    'topmostSubform_0_Page1_0_f1_64_0': fmt(f.line12),
    'topmostSubform_0_Page1_0_f1_65_0': fmt(f.line12),
    'topmostSubform_0_Page1_0_f1_66_0': fmt(f.line12),
    'topmostSubform_0_Page1_0_f1_67_0': fmt(f.line13),
    'topmostSubform_0_Page1_0_f1_68_0': fmt(f.line13),
    'topmostSubform_0_Page1_0_f1_69_0': fmt(f.line13),
    'topmostSubform_0_Page1_0_f1_70_0': fmt(f.line14),
    'topmostSubform_0_Page1_0_f1_71_0': fmt(f.line14),
    'topmostSubform_0_Page1_0_f1_72_0': fmt(f.line14),
    'topmostSubform_0_Page1_0_f1_73_0': fmt(f.line15),
    'topmostSubform_0_Page1_0_f1_74_0': fmt(f.line15),
    'topmostSubform_0_Page1_0_f1_75_0': fmt(f.line15),

    line_16_tax: fmt(f.line16),
    line_17_sched2_line3: fmt(f.line17sched2line3),
    line_18_add_lines_16_and_17: fmt(f.line16 + f.line17sched2line3),
    line_23_sched2_line21_other_taxes: fmt(f.line23sched2line21),
    line_24_total_tax: fmt(f.line24),
    line_25d_sum_withholding: fmt(f.line25d),
    line_26_estimated_tax_payments: fmt(f.line26),
    line_33_total_payments: fmt(f.line33),
    line_34_refund_if_overpaid: fmt(f.line34),
    line_37_amount_you_owe: fmt(f.line37),
  };
}

export function values1040S1(
  _input: IndividualReturnInput,
  summary: IndividualReturnSummary,
): FormFieldValues {
  const net = summary.scheduleCNetProfit;
  return {
    'topmostSubform_0_Page1_0_f1_07_0': fmt(net),
    'topmostSubform_0_Page1_0_f1_08_0': fmt(net),
    'topmostSubform_0_Page2_0_f2_07_0': fmt(summary.halfSEDeduction),
    'topmostSubform_0_Page2_0_f2_30_0': fmt(summary.halfSEDeduction),
  };
}

export function values1040S2(_input: IndividualReturnInput, summary: IndividualReturnSummary): FormFieldValues {
  return {
    'form1_0_Page1_0_f1_15_0': fmt(summary.seTotalTax),
    'form1_0_Page1_0_f1_21_0': fmt(summary.additionalMedicareTax),
    'form1_0_Page2_0_f2_24_0': fmt(summary.schedule2Total),
  };
}

export function values8959(input: IndividualReturnInput, summary: IndividualReturnSummary): FormFieldValues {
  const threshold =
    input.filingStatus === 'mfj' ? 250_000
    : input.filingStatus === 'mfs' ? 125_000
    : 200_000;
  const nameParts = input.taxpayerName.trim().split(/\s+/);
  const first = nameParts[0] ?? '';
  const last = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  const line11Excess = Math.max(0, summary.seEarnings - threshold);

  return {
    'topmostSubform_0_Page1_0_f1_1_0': first,
    'topmostSubform_0_Page1_0_f1_2_0': last,
    'topmostSubform_0_Page1_0_f1_10_0': fmt(summary.seEarnings),
    'topmostSubform_0_Page1_0_f1_11_0': fmt(threshold),
    'topmostSubform_0_Page1_0_f1_12_0': fmt(threshold),
    'topmostSubform_0_Page1_0_f1_13_0': fmt(line11Excess),
    'topmostSubform_0_Page1_0_f1_14_0': fmt(summary.additionalMedicareTax),
    'topmostSubform_0_Page1_0_f1_18_0': fmt(summary.additionalMedicareTax),
  };
}

function scheduleCExpenseParts(input: EntityReturnInput): {
  contractLabor: number;
  supplies: number;
  travel: number;
  meals: number;
  utilities: number;
  insurance: number;
  legal: number;
  softwareEducationMisc: { description: string; amount: number }[];
} {
  let contractLabor = 0;
  let supplies = 0;
  let travel = 0;
  let meals = 0;
  let utilities = 0;
  let insurance = 0;
  let legal = 0;
  const softwareEducationMisc: { description: string; amount: number }[] = [];

  for (const d of input.otherDeductions) {
    const cat = d.category.toLowerCase();
    const amt = d.amount;
    if (cat.includes('contract') || cat.includes('labor')) contractLabor += amt;
    else if (cat.includes('supply')) supplies += amt;
    else if (cat.includes('travel')) travel += amt;
    else if (cat.includes('meal')) meals += amt;
    else if (cat.includes('utilities') || cat.includes('utility')) utilities += amt;
    else if (cat.includes('insurance')) insurance += amt;
    else if (cat.includes('legal') || cat.includes('professional')) legal += amt;
    else softwareEducationMisc.push({ description: d.description, amount: amt });
  }

  return { contractLabor, supplies, travel, meals, utilities, insurance, legal, softwareEducationMisc };
}

export function values1040SC(
  input: EntityReturnInput,
  summary: EntityReturnSummary,
  individual?: IndividualReturnInput,
): FormFieldValues {
  // NAICS code: prefer principalBusinessCode passthrough on the entity input,
  // fall back to a generic services code.
  const naics = digitsOnly(((input as unknown) as { principalBusinessCode?: string }).principalBusinessCode ?? '541990');
  const principalBusinessText = ((input as unknown) as { principalBusiness?: string }).principalBusiness
    ?? 'Design and consulting services';
  const owner = individual?.taxpayerName ?? input.owners[0]?.name ?? '';
  const ssnDigits = digitsOnly(individual?.taxpayerSSN ?? '');
  const addrLine = input.homeAddress;
  const cityZip = input.homeCityStateZip;
  const oi = input.otherIncome.reduce((s, x) => s + x.amount, 0);
  const parts = scheduleCExpenseParts(input);

  const grossLessReturns = input.grossReceipts - input.returnsAndAllowances;
  const grossProfit = grossLessReturns - input.costOfGoodsSold;

  const miscRows: { description: string; amount: number }[] = [...parts.softwareEducationMisc];
  if (input.badDebts > 0) miscRows.unshift({ description: 'Bad debts', amount: input.badDebts });

  const partVKeys: [string, string][] = [
    ['topmostSubform_0_Page2_0_PartVTable_0_Item1_0_f2_15_0', 'topmostSubform_0_Page2_0_PartVTable_0_Item1_0_f2_16_0'],
    ['topmostSubform_0_Page2_0_PartVTable_0_Item2_0_f2_17_0', 'topmostSubform_0_Page2_0_PartVTable_0_Item2_0_f2_18_0'],
    ['topmostSubform_0_Page2_0_PartVTable_0_Item3_0_f2_19_0', 'topmostSubform_0_Page2_0_PartVTable_0_Item3_0_f2_20_0'],
    ['topmostSubform_0_Page2_0_PartVTable_0_Item4_0_f2_21_0', 'topmostSubform_0_Page2_0_PartVTable_0_Item4_0_f2_22_0'],
    ['topmostSubform_0_Page2_0_PartVTable_0_Item5_0_f2_23_0', 'topmostSubform_0_Page2_0_PartVTable_0_Item5_0_f2_24_0'],
    ['topmostSubform_0_Page2_0_PartVTable_0_Item6_0_f2_25_0', 'topmostSubform_0_Page2_0_PartVTable_0_Item6_0_f2_26_0'],
    ['topmostSubform_0_Page2_0_PartVTable_0_Item7_0_f2_27_0', 'topmostSubform_0_Page2_0_PartVTable_0_Item7_0_f2_28_0'],
    ['topmostSubform_0_Page2_0_PartVTable_0_Item8_0_f2_29_0', 'topmostSubform_0_Page2_0_PartVTable_0_Item8_0_f2_30_0'],
    ['topmostSubform_0_Page2_0_PartVTable_0_Item9_0_f2_31_0', 'topmostSubform_0_Page2_0_PartVTable_0_Item9_0_f2_32_0'],
  ];

  // Field-to-line mapping (verified by Y-coordinate inspection of the IRS PDF widget annotations):
  //   Header:
  //     f1_1 (top-left, Y=684) Name of proprietor
  //     f1_2 (top-right, Y=685) SSN slot — note: this is the SSN, not the NAICS code
  //     f1_3 (Y=660 left) Line A Principal business
  //     BComb.f1_4 (Y=661) Line B NAICS code (6-digit comb)
  //     f1_5 (Y=636 left) Line C Business name
  //     DComb.f1_6 (Y=636) Line D EIN (9-digit comb)
  //     f1_7 (Y=624) Line E business address
  //     f1_8 (Y=612) Line E city/state/zip
  //   Income (right column, Y=516..444): f1_10..f1_16 = Lines 1..7
  //   Left expense column (X=194):
  //     f1_17=L8, f1_18=L9, f1_19=L10, f1_20=L11, f1_21=L12, f1_22=L13,
  //     f1_23=L14, f1_24=L15, f1_25=L16a, f1_26=L16b, f1_27=L17
  //   Right expense column (X=475, in Lines18_27 subform):
  //     f1_28=L18, f1_29=L19, f1_30=L20a, f1_31=L20b, f1_32=L21, f1_33=L22,
  //     f1_34=L23, f1_35=L24a, f1_36=L24b, f1_37=L25, f1_38=L26, f1_39=L27a, f1_40=L27b
  //   Totals: f1_41=L28 total expenses, f1_42=L29 tentative profit
  //   Net profit: Line30_ReadOrder.f1_43 (line 30 home office), Line30_ReadOrder.f1_44 = L31 net
  const tentativeProfit = summary.grossIncome - summary.totalDeductions;
  const netProfit = summary.ordinaryBusinessIncome;
  const v: FormFieldValues = {
    // Header
    'topmostSubform_0_Page1_0_f1_1_0': owner,
    'topmostSubform_0_Page1_0_f1_2_0': ssnDigits,
    'topmostSubform_0_Page1_0_f1_3_0': principalBusinessText,
    'topmostSubform_0_Page1_0_BComb_0_f1_4_0': naics,
    'topmostSubform_0_Page1_0_f1_5_0': input.entityName,
    'topmostSubform_0_Page1_0_DComb_0_f1_6_0': digitsOnly(input.ein),
    'topmostSubform_0_Page1_0_f1_7_0': addrLine,
    'topmostSubform_0_Page1_0_f1_8_0': cityZip,
    'topmostSubform_0_Page1_0_c1_1_0': yn(input.accountingMethod === 'cash'),
    'topmostSubform_0_Page1_0_c1_1_1': yn(input.accountingMethod === 'accrual'),

    // Part I — Income (right column)
    'topmostSubform_0_Page1_0_f1_10_0': fmt(input.grossReceipts),
    'topmostSubform_0_Page1_0_f1_11_0': fmt(input.returnsAndAllowances),
    'topmostSubform_0_Page1_0_f1_12_0': fmt(grossLessReturns),
    'topmostSubform_0_Page1_0_f1_13_0': fmt(input.costOfGoodsSold),
    'topmostSubform_0_Page1_0_f1_14_0': fmt(grossProfit),
    'topmostSubform_0_Page1_0_f1_15_0': fmt(oi),
    'topmostSubform_0_Page1_0_f1_16_0': fmt(summary.grossIncome),

    // Part II — Expenses (LEFT column, Lines 8-17)
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_17_0': fmt(input.advertising),                  // L8
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_18_0': fmt(0),                                  // L9 car/truck
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_19_0': fmt(0),                                  // L10 commissions
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_20_0': fmt(parts.contractLabor || input.compensation), // L11
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_21_0': fmt(input.depletion),                    // L12
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_22_0': fmt(input.depreciation),                 // L13
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_23_0': fmt(input.benefitPrograms),              // L14
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_24_0': fmt(parts.insurance),                    // L15
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_25_0': fmt(0),                                  // L16a mortgage
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_26_0': fmt(input.interest),                     // L16b other interest
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_27_0': fmt(parts.legal),                        // L17

    // Part II — Expenses (RIGHT column, Lines 18-27a)
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_28_0': fmt(0),                                 // L18 office
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_29_0': fmt(input.pensionAndProfitSharing),     // L19
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_30_0': fmt(0),                                 // L20a rent vehicles
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_31_0': fmt(input.rents),                       // L20b rent other
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_32_0': fmt(input.repairs),                     // L21
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_33_0': fmt(parts.supplies),                    // L22
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_34_0': fmt(input.taxesAndLicenses),            // L23
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_35_0': fmt(parts.travel),                      // L24a
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_36_0': fmt(parts.meals),                       // L24b
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_37_0': fmt(parts.utilities),                   // L25
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_38_0': fmt(input.salariesAndWages),            // L26 wages
    // L27a (other expenses from Part V) is set below after we know miscRows total

    // Totals (f1_41=L28 Y=228, f1_42=L29 Y=216, f1_45=L30 Y=156, f1_46=L31 Y=120)
    'topmostSubform_0_Page1_0_f1_41_0': fmt(summary.totalDeductions),                        // L28 total expenses
    'topmostSubform_0_Page1_0_f1_42_0': fmt(tentativeProfit),                                // L29 tentative profit
    'topmostSubform_0_Page1_0_f1_45_0': fmt(0),                                              // L30 home office (none)
    'topmostSubform_0_Page1_0_f1_46_0': fmt(netProfit),                                      // L31 net profit
  };

  // Line 27a Energy efficient commercial buildings = 0 (f1_39, Y=264)
  // Line 27b Other expenses from Part V = total (f1_40, Y=240)
  const partVTotal = miscRows.reduce((s, r) => s + r.amount, 0);
  v['topmostSubform_0_Page1_0_Lines18_27_0_f1_39_0'] = fmt(0);
  v['topmostSubform_0_Page1_0_Lines18_27_0_f1_40_0'] = fmt(partVTotal);
  // Line 48 (Part V total) on page 2 also gets the same value
  v['topmostSubform_0_Page2_0_f2_33_0'] = fmt(partVTotal);

  for (let i = 0; i < Math.min(miscRows.length, partVKeys.length); i++) {
    const [dk, ak] = partVKeys[i];
    const row = miscRows[i];
    v[dk] = row.description.slice(0, 90);
    v[ak] = fmt(row.amount);
  }

  return v;
}

export function values1040SSE(_input: EntityReturnInput, summary: IndividualReturnSummary): FormFieldValues {
  const net = summary.scheduleCNetProfit;
  return {
    'topmostSubform_0_Page1_0_f1_5_0': fmt(net),
    'topmostSubform_0_Page1_0_f1_11_0': fmt(summary.ssTax),
    'topmostSubform_0_Page1_0_f1_12_0': fmt(summary.medicareTax),
    'topmostSubform_0_Page1_0_f1_21_0': fmt(summary.seTotalTax),
    'topmostSubform_0_Page1_0_f1_22_0': fmt(summary.halfSEDeduction),
  };
}
