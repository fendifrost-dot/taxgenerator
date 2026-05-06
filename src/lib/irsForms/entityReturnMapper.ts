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

export function values1040SC(input: EntityReturnInput, summary: EntityReturnSummary): FormFieldValues {
  const naics = '541990';
  const owner = input.owners[0]?.name ?? '';
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

  const v: FormFieldValues = {
    'topmostSubform_0_Page1_0_f1_1_0': owner,
    'topmostSubform_0_Page1_0_f1_2_0': naics,
    'topmostSubform_0_Page1_0_f1_3_0': input.entityName,
    'topmostSubform_0_Page1_0_f1_5_0': owner,
    'topmostSubform_0_Page1_0_DComb_0_f1_6_0': digitsOnly(input.ein),
    'topmostSubform_0_Page1_0_f1_7_0': `${addrLine}\n${cityZip}`,
    'topmostSubform_0_Page1_0_c1_1_0': yn(input.accountingMethod === 'cash'),
    'topmostSubform_0_Page1_0_c1_1_1': yn(input.accountingMethod === 'accrual'),

    'topmostSubform_0_Page1_0_f1_10_0': fmt(input.grossReceipts),
    'topmostSubform_0_Page1_0_f1_11_0': fmt(input.returnsAndAllowances),
    'topmostSubform_0_Page1_0_f1_12_0': fmt(grossLessReturns),
    'topmostSubform_0_Page1_0_f1_13_0': fmt(input.costOfGoodsSold),
    'topmostSubform_0_Page1_0_f1_14_0': fmt(grossProfit),
    'topmostSubform_0_Page1_0_f1_15_0': fmt(oi),
    'topmostSubform_0_Page1_0_f1_16_0': fmt(summary.grossIncome),

    'topmostSubform_0_Page1_0_Lines8_17_0_f1_17_0': fmt(input.advertising),
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_20_0': fmt(parts.contractLabor || input.compensation),
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_21_0': fmt(input.depletion),
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_22_0': fmt(input.depreciation),
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_23_0': fmt(input.benefitPrograms),
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_24_0': fmt(parts.insurance),
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_25_0': fmt(input.interest),
    'topmostSubform_0_Page1_0_Lines8_17_0_f1_26_0': fmt(parts.legal),

    'topmostSubform_0_Page1_0_Lines18_27_0_f1_29_0': fmt(input.pensionAndProfitSharing),
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_30_0': fmt(input.rents),
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_31_0': fmt(input.repairs),
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_32_0': fmt(parts.supplies),
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_33_0': fmt(input.taxesAndLicenses),
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_34_0': fmt(parts.travel),
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_35_0': fmt(parts.meals),
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_36_0': fmt(parts.utilities),
    'topmostSubform_0_Page1_0_Lines18_27_0_f1_37_0': fmt(input.salariesAndWages),

    'topmostSubform_0_Page1_0_f1_41_0': fmt(summary.ordinaryBusinessIncome),
    'topmostSubform_0_Page1_0_f1_42_0': fmt(summary.totalDeductions),
  };

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
