/**
 * stateReturnRules.ts
 *
 * State income tax rules for all 50 states + DC.
 *
 * Architecture:
 *  - Federal AGI and taxable income are the canonical source.
 *  - State returns are DERIVATIVE of the federal return — they start from
 *    federal AGI and apply state-specific additions, subtractions, credits.
 *  - States with no income tax return a zeroed result immediately.
 *  - Residency status (full-year, part-year, nonresident) determines
 *    how much income is subject to state tax.
 *
 * Coverage:
 *  - No-tax states: FL, TX, WA, NV, WY, SD, AK (NH / TN: dividends/interest only, treated as de minimis)
 *  - Conformity states (start from federal AGI with minor adjustments): most states
 *  - Non-conformity states with own rules: CA, NJ, PA (has flat tax + no federal deduction)
 *
 * Sources: State revenue department publications, Tax Foundation 2024 data.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface StateTaxBracket {
  rate: number;
  upTo: number | null;
}

export type StateConformityType =
  | 'no_income_tax'          // No state income tax at all
  | 'federal_agi_conforming' // Starts from federal AGI with minor adjustments
  | 'own_rules';             // Has its own rules (CA, NJ, PA)

export type FilingStatusKey =
  | 'single'
  | 'married_filing_jointly'
  | 'head_of_household';

export interface StateDeductionRules {
  standardDeduction_single?: number;
  standardDeduction_mfj?: number;
  standardDeduction_hoh?: number;
  personalExemption_single?: number;
  personalExemption_mfj?: number;
  dependentExemption?: number;
  allowsFederalItemized?: boolean;    // some states piggyback on Sch A
  saltCapConforms?: boolean;          // most states don't have their own SALT cap
}

export interface StateAddBack {
  description: string;
  appliesTo: 'always' | 'sometimes';
  note: string;
}

export interface StateSubtraction {
  description: string;
  maxAmount?: number;
  note: string;
}

export interface StateCreditSummary {
  name: string;
  description: string;
  isRefundable: boolean;
}

export interface StateReturnRules {
  stateCode: string;
  stateName: string;
  conformityType: StateConformityType;
  taxYear: number;

  // Flat vs graduated
  isFlatTax: boolean;
  flatRate?: number;

  // Graduated brackets (single filer — apply for MFJ with doubling or separate table)
  brackets_single?: StateTaxBracket[];
  brackets_mfj?: StateTaxBracket[];

  deductions: StateDeductionRules;

  // Additions to federal AGI for state purposes
  addBacks: StateAddBack[];

  // Subtractions from federal AGI for state purposes
  subtractions: StateSubtraction[];

  // Notable credits
  credits: StateCreditSummary[];

  // Part-year / nonresident: income allocation method
  allocationMethod: 'income_ratio' | 'days_ratio' | 'source_income' | 'n_a';

  // Key compliance notes
  notes: string[];
}

// ─── State tax computation output ─────────────────────────────────────────────

export interface StateReturnResult {
  stateCode: string;
  stateName: string;
  taxYear: number;
  residencyStatus: 'full_year' | 'part_year' | 'nonresident';

  federalAGI: number;
  stateAdditions: number;
  stateSubtractions: number;
  stateAGI: number;
  stateDeduction: number;
  stateTaxableIncome: number;
  stateTaxBeforeCredits: number;
  estimatedStateCredits: number;
  estimatedStateTax: number;
  effectiveStateRate: number;

  notes: string[];
  warnings: string[];
}

// ─── No-tax states ─────────────────────────────────────────────────────────────

const NO_TAX_STATES = new Set(['FL', 'TX', 'WA', 'NV', 'WY', 'SD', 'AK', 'NH', 'TN']);

// ─── State rules database ─────────────────────────────────────────────────────

const STATE_RULES: Record<string, Omit<StateReturnRules, 'taxYear'>> = {

  // ── No income tax ──────────────────────────────────────────────────────────
  FL: {
    stateCode: 'FL', stateName: 'Florida',
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['Florida has no state individual income tax.'],
  },
  TX: {
    stateCode: 'TX', stateName: 'Texas',
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['Texas has no state individual income tax.'],
  },
  WA: {
    stateCode: 'WA', stateName: 'Washington',
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['Washington has no state income tax. Note: Washington Capital Gains Tax (7%) applies to long-term capital gains >$262,000 (2024).'],
  },
  NV: {
    stateCode: 'NV', stateName: 'Nevada',
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['Nevada has no state individual income tax.'],
  },
  WY: {
    stateCode: 'WY', stateName: 'Wyoming',
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['Wyoming has no state individual income tax.'],
  },
  SD: {
    stateCode: 'SD', stateName: 'South Dakota',
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['South Dakota has no state individual income tax.'],
  },
  AK: {
    stateCode: 'AK', stateName: 'Alaska',
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['Alaska has no state individual income tax.'],
  },
  NH: {
    stateCode: 'NH', stateName: 'New Hampshire',
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['New Hampshire taxes only interest and dividends (4% in 2024, phasing out by 2027). W-2 wages and SE income are not taxed.'],
  },
  TN: {
    stateCode: 'TN', stateName: 'Tennessee',
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['Tennessee eliminated its Hall Income Tax on investment income effective 2021. No income tax.'],
  },

  // ── Flat tax states ────────────────────────────────────────────────────────
  CO: {
    stateCode: 'CO', stateName: 'Colorado',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.044,
    deductions: { standardDeduction_single: 14_600, standardDeduction_mfj: 29_200 },
    addBacks: [
      { description: 'Federal bonus depreciation add-back', appliesTo: 'sometimes', note: 'CO does not fully conform to bonus depreciation; verify each year.' },
    ],
    subtractions: [
      { description: 'PERA pension income subtraction', note: 'Colorado PERA pension benefits subtractable up to certain amounts.' },
      { description: 'Military retirement income', maxAmount: 24_000, note: 'Up to $24,000 military retirement income excluded for eligible filers.' },
    ],
    credits: [
      { name: 'Colorado Child Tax Credit', description: '60% of federal CTC for filers with AGI < $85k', isRefundable: true },
      { name: 'Earned Income Credit', description: '20% of federal EIC', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Colorado uses federal taxable income as starting point, then applies 4.4% flat rate.', 'TABOR refund credits may apply in certain years.'],
  },
  IL: {
    stateCode: 'IL', stateName: 'Illinois',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.0495,
    deductions: { personalExemption_single: 2_425, personalExemption_mfj: 4_850, dependentExemption: 2_425 },
    addBacks: [
      { description: 'Federal NOL add-back', appliesTo: 'always', note: 'Illinois does not recognize federal NOL deductions.' },
    ],
    subtractions: [
      { description: 'Retirement income (pension, IRA, SS) fully excluded', note: 'Illinois does not tax retirement income for retirees.' },
    ],
    credits: [
      { name: 'Illinois Earned Income Credit', description: '20% of federal EIC', isRefundable: true },
      { name: 'Property Tax Credit', description: '5% of Illinois property taxes paid', isRefundable: false },
      { name: 'Education Expense Credit', description: 'Up to $500 for educational expenses', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Illinois uses a flat 4.95% rate on net income.', 'Illinois does not conform to federal itemized deductions.'],
  },
  PA: {
    stateCode: 'PA', stateName: 'Pennsylvania',
    conformityType: 'own_rules', isFlatTax: true, flatRate: 0.0307,
    deductions: {},
    addBacks: [],
    subtractions: [
      { description: 'Retirement income (pensions, 401k distributions, IRA distributions)', note: 'Pennsylvania does not tax most retirement income if withdrawn after reaching retirement age.' },
    ],
    credits: [
      { name: 'PA Tax Forgiveness Credit', description: 'Income-based credit for low-income filers', isRefundable: true },
    ],
    allocationMethod: 'source_income',
    notes: [
      'Pennsylvania has its own income classification system — does NOT start from federal AGI.',
      'PA recognizes 8 income classes: compensation, S-Corp net income, net profits from business, net gains from sale of property, interest, dividends, estate/trust income, gambling winnings.',
      'PA does NOT allow federal deductions (no itemized deductions, no standard deduction).',
      'Business losses in one class cannot offset income in another class.',
      'PA flat tax: 3.07%.',
    ],
  },

  // ── Graduated tax states ───────────────────────────────────────────────────
  CA: {
    stateCode: 'CA', stateName: 'California',
    conformityType: 'own_rules', isFlatTax: false,
    brackets_single: [
      { rate: 0.01,   upTo: 10_412  },
      { rate: 0.02,   upTo: 24_684  },
      { rate: 0.04,   upTo: 38_959  },
      { rate: 0.06,   upTo: 54_081  },
      { rate: 0.08,   upTo: 68_350  },
      { rate: 0.093,  upTo: 349_137 },
      { rate: 0.103,  upTo: 418_961 },
      { rate: 0.113,  upTo: 698_274 },
      { rate: 0.123,  upTo: null    },  // + 1% Mental Health Services Tax on income > $1M
    ],
    brackets_mfj: [
      { rate: 0.01,   upTo: 20_824  },
      { rate: 0.02,   upTo: 49_368  },
      { rate: 0.04,   upTo: 77_918  },
      { rate: 0.06,   upTo: 108_162 },
      { rate: 0.08,   upTo: 136_700 },
      { rate: 0.093,  upTo: 698_274 },
      { rate: 0.103,  upTo: 837_922 },
      { rate: 0.113,  upTo: 1_000_000 },
      { rate: 0.123,  upTo: null    },
    ],
    deductions: {
      standardDeduction_single: 5_202,
      standardDeduction_mfj: 10_404,
      personalExemption_single: 144,
      personalExemption_mfj: 288,
      dependentExemption: 433,
    },
    addBacks: [
      { description: 'Federal bonus depreciation (CA does not conform to 100% bonus)', appliesTo: 'sometimes', note: 'CA allows only 40% bonus depreciation (certain years may differ).' },
      { description: 'Federal NOL carryback (CA generally does not allow carryback)', appliesTo: 'sometimes', note: 'Check CA NOL suspension rules — certain years CA suspended NOL deductions.' },
    ],
    subtractions: [
      { description: 'CA does not tax HSA contributions/distributions (HSA not recognized)', note: 'CA does not conform to federal HSA treatment — HSA deductions must be added back.' },
      { description: 'Renter\'s Credit: $60 single / $120 MFJ (income limits apply)', note: 'Nonrefundable credit for renters with adjusted gross income below threshold.' },
    ],
    credits: [
      { name: 'CA Earned Income Tax Credit (CalEITC)', description: 'Supplemental to federal EIC, up to ~$3,500 for families', isRefundable: true },
      { name: 'Young Child Tax Credit', description: '$1,117 per child under 6 (2024)', isRefundable: true },
      { name: 'Foster Youth Tax Credit', description: 'Refundable credit for former foster youth', isRefundable: true },
      { name: 'Renter\'s Credit', description: '$60 (single) / $120 (MFJ) nonrefundable', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: [
      'California does NOT recognize federal S Corp election — CA treats S Corps as regular corporations (CA S Corp election required separately).',
      'CA has its own AMT (7% on AMTI above exemption).',
      'CA Mental Health Services Tax: 1% surcharge on income > $1,000,000.',
      'CA does not conform to federal SALT cap — mortgage interest and property taxes deductible in full for CA purposes.',
      'CA does not recognize HSA deductions — add back federal HSA deduction.',
      'Community property state: MFS filers must split community income equally.',
    ],
  },
  NY: {
    stateCode: 'NY', stateName: 'New York',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.04,   upTo: 17_150  },
      { rate: 0.045,  upTo: 23_600  },
      { rate: 0.0525, upTo: 27_900  },
      { rate: 0.0585, upTo: 161_550 },
      { rate: 0.0625, upTo: 323_200 },
      { rate: 0.0685, upTo: 2_155_350 },
      { rate: 0.0965, upTo: 5_000_000 },
      { rate: 0.103,  upTo: 25_000_000 },
      { rate: 0.109,  upTo: null     },
    ],
    brackets_mfj: [
      { rate: 0.04,   upTo: 27_900  },
      { rate: 0.045,  upTo: 43_000  },
      { rate: 0.0525, upTo: 161_550 },
      { rate: 0.0585, upTo: 323_200 },
      { rate: 0.0625, upTo: 2_155_350 },
      { rate: 0.0685, upTo: 5_000_000 },
      { rate: 0.0965, upTo: 25_000_000 },
      { rate: 0.103,  upTo: null    },
    ],
    deductions: {
      standardDeduction_single: 8_000,
      standardDeduction_mfj:    16_050,
      standardDeduction_hoh:    11_200,
      dependentExemption: 1_000,
    },
    addBacks: [
      { description: 'Federal bonus depreciation add-back (NY does not conform)', appliesTo: 'sometimes', note: 'NY decoupled from federal bonus depreciation — requires add-back and separate NY depreciation.' },
    ],
    subtractions: [
      { description: 'NY pension income exclusion (federal/NY/local government pensions)', note: 'Up to $20,000 exclusion for eligible pension income for filers age 59½+.' },
      { description: 'NY college tuition deduction (NYS 529 contributions)', maxAmount: 5_000, note: 'Up to $5,000 (single) / $10,000 (MFJ) for NY 529 contributions.' },
    ],
    credits: [
      { name: 'NY Earned Income Credit', description: '30% of federal EIC', isRefundable: true },
      { name: 'NY Child and Dependent Care Credit', description: '20-110% of federal credit based on income', isRefundable: false },
      { name: 'NY Child Tax Credit', description: '$100-$333 per qualifying child under 17', isRefundable: false },
      { name: 'NYC/Yonkers Resident Tax', description: 'Additional city-level income tax for NYC/Yonkers residents', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: [
      'NYC residents pay an additional NYC income tax (3.078%–3.876% for 2024).',
      'Yonkers residents pay a Yonkers surcharge (16.75% of NY state tax for 2024).',
      'NY "millionaire\'s tax" top rate applies to income above $1M.',
      'NY metropolitan commuter transportation mobility tax (MCTMT) may apply for SE income in Metro area.',
    ],
  },
  GA: {
    stateCode: 'GA', stateName: 'Georgia',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.055,
    deductions: {
      standardDeduction_single: 12_000,
      standardDeduction_mfj:    24_000,
      standardDeduction_hoh:    18_000,
      dependentExemption: 3_000,
    },
    addBacks: [],
    subtractions: [
      { description: 'Retirement income exclusion: up to $35,000 per person (age 62+)', maxAmount: 35_000, note: 'Military retirement: full exclusion. Other retirement: $35k cap per person.' },
    ],
    credits: [
      { name: 'GA Earned Income Credit', description: '10% of federal EIC', isRefundable: false },
      { name: 'GA Child and Dependent Care Credit', description: '30% of federal CDCC', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Georgia switched to a 5.5% flat tax effective 2024 (phasing down to 4.99% by 2029).'],
  },
  NC: {
    stateCode: 'NC', stateName: 'North Carolina',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.0475,
    deductions: { standardDeduction_single: 12_750, standardDeduction_mfj: 25_500 },
    addBacks: [],
    subtractions: [
      { description: 'Bailey retirement exclusion (certain government pension income)', note: 'Bailey exclusion for retirement income from certain pre-1989 government employment.' },
    ],
    credits: [
      { name: 'NC Child Deduction', description: 'Up to $3,000 deduction per child under 17 (income limits)', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['NC flat rate: 4.75% (2024), scheduled to decline to 3.99% by 2026.'],
  },
  VA: {
    stateCode: 'VA', stateName: 'Virginia',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.02,  upTo: 3_000  },
      { rate: 0.03,  upTo: 5_000  },
      { rate: 0.05,  upTo: 17_000 },
      { rate: 0.0575, upTo: null  },
    ],
    brackets_mfj: [
      { rate: 0.02,  upTo: 3_000  },
      { rate: 0.03,  upTo: 5_000  },
      { rate: 0.05,  upTo: 17_000 },
      { rate: 0.0575, upTo: null  },
    ],
    deductions: {
      standardDeduction_single: 8_000,
      standardDeduction_mfj:    16_000,
      personalExemption_single: 930,
      personalExemption_mfj:    1_860,
      dependentExemption: 930,
    },
    addBacks: [],
    subtractions: [
      { description: 'Age deduction for taxpayers age 65+ (up to $12,000 single)', maxAmount: 12_000, note: 'Phased out above certain AGI thresholds.' },
      { description: 'Military pay subtraction for active duty military', note: 'VA active duty military pay subtraction available.' },
    ],
    credits: [
      { name: 'Low Income Individual Credit', description: 'Credit for low-income taxpayers', isRefundable: false },
      { name: 'Land Preservation Credit', description: 'Credit for conservation donations', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Virginia top rate (5.75%) kicks in at a very low $17,000 — most taxpayers are in the top bracket.'],
  },
  AZ: {
    stateCode: 'AZ', stateName: 'Arizona',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.025,
    deductions: { standardDeduction_single: 14_600, standardDeduction_mfj: 29_200 },
    addBacks: [],
    subtractions: [],
    credits: [
      { name: 'AZ Charitable Credit', description: 'Credits for donations to qualifying charities', isRefundable: false },
      { name: 'AZ Family Income Tax Credit', description: 'Credit for families with children under 17', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Arizona flat tax 2.5% effective 2023 (reduced from graduated).'],
  },
  FL_placeholder_conforming: {
    stateCode: 'FL', stateName: 'Florida', // Already handled above as no-tax
    conformityType: 'no_income_tax', isFlatTax: false,
    deductions: {}, addBacks: [], subtractions: [], credits: [],
    allocationMethod: 'n_a',
    notes: ['Florida has no state individual income tax.'],
  },
  OH: {
    stateCode: 'OH', stateName: 'Ohio',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.00,   upTo: 26_050  },
      { rate: 0.02765, upTo: 46_100  },
      { rate: 0.03226, upTo: 92_150  },
      { rate: 0.03688, upTo: 115_300 },
      { rate: 0.03990, upTo: null    },
    ],
    deductions: { personalExemption_single: 2_400, personalExemption_mfj: 4_800, dependentExemption: 2_400 },
    addBacks: [],
    subtractions: [
      { description: 'Small business income deduction: first $250,000 deductible', maxAmount: 250_000, note: 'Ohio Business Income Deduction allows 100% deduction of first $250,000 SE/pass-through income.' },
    ],
    credits: [
      { name: 'Ohio Retirement Income Credit', description: 'Up to $200 credit on retirement income', isRefundable: false },
      { name: 'Joint Filing Credit', description: 'MFJ credit based on combined income', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Ohio municipalities levy their own income tax (typically 1.0%–2.5%) on wages/SE income.', 'Ohio school district income tax may also apply.'],
  },
  MI: {
    stateCode: 'MI', stateName: 'Michigan',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.0425,
    deductions: { personalExemption_single: 5_600, personalExemption_mfj: 11_200, dependentExemption: 5_600 },
    addBacks: [],
    subtractions: [
      { description: 'Pension income deduction (age/birth year dependent)', note: 'Michigan has complex pension deduction rules based on birth year of taxpayer.' },
      { description: 'Interest/dividends from US obligations', note: 'Interest from US government obligations is exempt from MI tax.' },
    ],
    credits: [
      { name: 'Michigan Homestead Property Tax Credit', description: 'Credit on property taxes for homeowners/renters', isRefundable: true },
      { name: 'Michigan Earned Income Tax Credit', description: '6% of federal EIC', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Michigan cities (Detroit, etc.) levy additional city income taxes.'],
  },
  // ── Additional flat-tax states ─────────────────────────────────────────────
  IN: {
    stateCode: 'IN', stateName: 'Indiana',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.0305,
    deductions: { personalExemption_single: 1_000, personalExemption_mfj: 2_000, dependentExemption: 1_500 },
    addBacks: [],
    subtractions: [
      { description: 'Retirement income: SS benefits fully excluded', note: 'Indiana does not tax Social Security benefits.' },
      { description: 'Military retirement income deduction', note: 'Active duty pay and certain military retirement income excluded.' },
    ],
    credits: [
      { name: 'IN Earned Income Credit', description: '9% of federal EIC', isRefundable: true },
      { name: 'IN Unified Tax Credit for the Elderly', description: 'Credit for filers age 65+', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Indiana flat rate 3.05% (2024, phasing down to 2.9% by 2027).', 'Indiana county income taxes (0.5%–3.38%) apply based on county of residence.'],
  },
  KY: {
    stateCode: 'KY', stateName: 'Kentucky',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.04,
    deductions: { standardDeduction_single: 3_160, standardDeduction_mfj: 6_320 },
    addBacks: [],
    subtractions: [
      { description: 'Pension income exclusion (up to $31,110)', maxAmount: 31_110, note: 'Exclusion applies to pension/retirement income (excluding IRAs).' },
    ],
    credits: [
      { name: 'KY Family Size Tax Credit', description: 'Credit based on family size for lower-income filers', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Kentucky reduced to 4.0% flat rate effective 2024 (previously 4.5%).'],
  },
  MA: {
    stateCode: 'MA', stateName: 'Massachusetts',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.05,
    deductions: { personalExemption_single: 4_400, personalExemption_mfj: 8_800, dependentExemption: 1_000 },
    addBacks: [
      { description: 'Interest from US obligations — included in MA income (unlike some states)', appliesTo: 'always', note: 'MA includes US interest income, unlike states that exclude it.' },
    ],
    subtractions: [
      { description: 'Rental deduction: up to $3,000 for renters (50% of rent paid)', maxAmount: 3_000, note: 'Deductible portion of rent paid during the year.' },
      { description: 'Social Security benefits fully excluded', note: 'MA does not tax Social Security benefits.' },
    ],
    credits: [
      { name: 'MA Earned Income Credit', description: '30% of federal EIC', isRefundable: true },
      { name: 'MA Child Care Credit', description: 'Up to $240 per child under 13', isRefundable: false },
      { name: 'MA Commuter Deduction', description: 'Up to $750 for tolls/MBTA passes', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: [
      'Massachusetts 5% flat rate applies to earned and unearned income (5% rate).',
      'Capital gains taxed at 8.5% (short-term) or 5% (long-term) — MA maintains own capital gains rates.',
      'MA "Millionaires Tax" (Surtax): additional 4% on income > $1,000,000 effective 2023.',
    ],
  },
  UT: {
    stateCode: 'UT', stateName: 'Utah',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.0485,
    deductions: { standardDeduction_single: 14_600, standardDeduction_mfj: 29_200 },
    addBacks: [],
    subtractions: [],
    credits: [
      { name: 'UT Taxpayer Tax Credit', description: '6% nonrefundable credit on income ($10k cap)', isRefundable: false },
      { name: 'UT Earned Income Credit', description: '15% of federal EIC', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Utah flat rate 4.85% (2024).'],
  },

  // ── Additional graduated states ────────────────────────────────────────────
  AL: {
    stateCode: 'AL', stateName: 'Alabama',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.02,  upTo: 500    },
      { rate: 0.04,  upTo: 3_000  },
      { rate: 0.05,  upTo: null   },
    ],
    brackets_mfj: [
      { rate: 0.02,  upTo: 1_000  },
      { rate: 0.04,  upTo: 6_000  },
      { rate: 0.05,  upTo: null   },
    ],
    deductions: {
      standardDeduction_single: 3_000,
      standardDeduction_mfj:    8_500,
      personalExemption_single: 1_500,
      personalExemption_mfj:    3_000,
      dependentExemption: 1_000,
    },
    addBacks: [],
    subtractions: [
      { description: 'Federal income taxes paid (deductible for AL purposes)', note: 'Alabama uniquely allows deduction of federal income taxes paid.' },
      { description: 'Social Security benefits fully excluded', note: 'Alabama does not tax SS benefits.' },
    ],
    credits: [
      { name: 'AL Child/Dependent Care Credit', description: 'Based on federal credit', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Alabama allows federal income taxes as a deduction — significantly reduces AL taxable income.'],
  },
  AR: {
    stateCode: 'AR', stateName: 'Arkansas',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.02,   upTo: 4_300  },
      { rate: 0.04,   upTo: 8_500  },
      { rate: 0.044,  upTo: null   },
    ],
    brackets_mfj: [
      { rate: 0.02,   upTo: 4_300  },
      { rate: 0.04,   upTo: 8_500  },
      { rate: 0.044,  upTo: null   },
    ],
    deductions: { standardDeduction_single: 2_340, standardDeduction_mfj: 4_680, dependentExemption: 29 },
    addBacks: [],
    subtractions: [
      { description: 'Retirement income exclusion (up to $6,000 for taxpayers 59½+)', maxAmount: 6_000, note: 'Pension/retirement income exclusion.' },
    ],
    credits: [
      { name: 'AR Low Income Tax Credit', description: 'Credit for low-income filers', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Arkansas reduced to 4.4% top rate effective 2024 (previously higher); applying 4.4% for estimate.'],
  },
  CT: {
    stateCode: 'CT', stateName: 'Connecticut',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.03,   upTo: 10_000  },
      { rate: 0.05,   upTo: 50_000  },
      { rate: 0.055,  upTo: 100_000 },
      { rate: 0.06,   upTo: 200_000 },
      { rate: 0.065,  upTo: 250_000 },
      { rate: 0.069,  upTo: 500_000 },
      { rate: 0.0699, upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.03,   upTo: 20_000  },
      { rate: 0.05,   upTo: 100_000 },
      { rate: 0.055,  upTo: 200_000 },
      { rate: 0.06,   upTo: 400_000 },
      { rate: 0.065,  upTo: 500_000 },
      { rate: 0.069,  upTo: 1_000_000 },
      { rate: 0.0699, upTo: null    },
    ],
    deductions: { personalExemption_single: 15_000, personalExemption_mfj: 24_000, dependentExemption: 0 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security benefits: 25-100% excluded based on AGI', note: 'CT partially or fully excludes SS benefits depending on income level.' },
      { description: 'Pension/annuity income: $75k single/$100k MFJ exclusion (age 65+)', maxAmount: 75_000, note: 'CT pension income exclusion for qualifying retirement income.' },
    ],
    credits: [
      { name: 'CT Earned Income Tax Credit', description: '23% of federal EIC', isRefundable: true },
      { name: 'CT Child Tax Credit', description: 'Up to $600 per dependent child under 18 (income limits)', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['CT has a "bubble" bracket structure — verify AGI phase-out ranges.'],
  },
  DE: {
    stateCode: 'DE', stateName: 'Delaware',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.00,   upTo: 2_000  },
      { rate: 0.022,  upTo: 5_000  },
      { rate: 0.039,  upTo: 10_000 },
      { rate: 0.048,  upTo: 20_000 },
      { rate: 0.052,  upTo: 25_000 },
      { rate: 0.0555, upTo: 60_000 },
      { rate: 0.066,  upTo: null   },
    ],
    deductions: { standardDeduction_single: 3_250, standardDeduction_mfj: 6_500, personalExemption_single: 110, personalExemption_mfj: 220, dependentExemption: 110 },
    addBacks: [],
    subtractions: [
      { description: 'Exclusion of $12,500 pension/retirement income (age 60+)', maxAmount: 12_500, note: 'Delaware pension exclusion for qualifying filers.' },
    ],
    credits: [
      { name: 'DE Child Care Credit', description: 'Credit based on child care expenses', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Delaware has no sales tax. Top income rate 6.6%.'],
  },
  DC: {
    stateCode: 'DC', stateName: 'District of Columbia',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.04,   upTo: 10_000  },
      { rate: 0.06,   upTo: 40_000  },
      { rate: 0.065,  upTo: 60_000  },
      { rate: 0.085,  upTo: 350_000 },
      { rate: 0.0925, upTo: 1_000_000 },
      { rate: 0.1075, upTo: null    },
    ],
    deductions: { standardDeduction_single: 12_950, standardDeduction_mfj: 25_900, dependentExemption: 1_775 },
    addBacks: [],
    subtractions: [
      { description: 'DC 529 contributions (up to $4,000 per account)', maxAmount: 4_000, note: 'DC College Savings Plan contributions deductible.' },
    ],
    credits: [
      { name: 'DC Earned Income Tax Credit', description: '70% of federal EIC', isRefundable: true },
      { name: 'DC Schedule H Property Tax Credit', description: 'For eligible renters/homeowners', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['DC top rate 10.75% on income >$1M.'],
  },
  HI: {
    stateCode: 'HI', stateName: 'Hawaii',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.014,  upTo: 2_400   },
      { rate: 0.032,  upTo: 4_800   },
      { rate: 0.055,  upTo: 9_600   },
      { rate: 0.064,  upTo: 14_400  },
      { rate: 0.068,  upTo: 19_200  },
      { rate: 0.072,  upTo: 24_000  },
      { rate: 0.076,  upTo: 36_000  },
      { rate: 0.079,  upTo: 48_000  },
      { rate: 0.0825, upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.014,  upTo: 4_800   },
      { rate: 0.032,  upTo: 9_600   },
      { rate: 0.055,  upTo: 19_200  },
      { rate: 0.064,  upTo: 28_800  },
      { rate: 0.068,  upTo: 38_400  },
      { rate: 0.072,  upTo: 48_000  },
      { rate: 0.076,  upTo: 72_000  },
      { rate: 0.079,  upTo: 96_000  },
      { rate: 0.0825, upTo: null    },
    ],
    deductions: { standardDeduction_single: 2_200, standardDeduction_mfj: 4_400, personalExemption_single: 1_144, personalExemption_mfj: 2_288, dependentExemption: 1_144 },
    addBacks: [],
    subtractions: [
      { description: 'Public pension income fully excluded (state/county/federal pensions)', note: 'Hawaii does not tax most government pension income.' },
    ],
    credits: [
      { name: 'HI Earned Income Tax Credit', description: '20% of federal EIC', isRefundable: true },
      { name: 'HI Food/Excise Tax Credit', description: 'Refundable credit for lower-income filers', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Hawaii top rate 11% for income >$400,000 (starting 2024). One of the highest state rates.'],
  },
  ID: {
    stateCode: 'ID', stateName: 'Idaho',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.058,
    deductions: { standardDeduction_single: 14_600, standardDeduction_mfj: 29_200 },
    addBacks: [],
    subtractions: [
      { description: 'Retirement income exclusion: up to $46,080 (age 65+ or disabled)', maxAmount: 46_080, note: 'Idaho retirement income deduction.' },
    ],
    credits: [
      { name: 'ID Grocery Credit', description: '$120/person refundable credit', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Idaho flat rate 5.8% effective 2023.'],
  },
  IA: {
    stateCode: 'IA', stateName: 'Iowa',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.057,
    deductions: { standardDeduction_single: 2_210, standardDeduction_mfj: 5_450 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security benefits fully excluded for filers age 55+', note: 'Iowa does not tax SS benefits for qualifying age groups.' },
      { description: 'Retirement income fully excluded for filers age 55+', note: 'Iowa exempts pension/IRA income for taxpayers age 55 and older.' },
    ],
    credits: [
      { name: 'IA Earned Income Credit', description: '15% of federal EIC', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Iowa transitioning to 3.9% flat rate by 2026; 2024 rate approximately 5.7%.'],
  },
  KS: {
    stateCode: 'KS', stateName: 'Kansas',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.031, upTo: 15_000 },
      { rate: 0.057, upTo: 30_000 },
      { rate: 0.057, upTo: null   },
    ],
    brackets_mfj: [
      { rate: 0.031, upTo: 30_000 },
      { rate: 0.057, upTo: 60_000 },
      { rate: 0.057, upTo: null   },
    ],
    deductions: { standardDeduction_single: 3_500, standardDeduction_mfj: 8_000, personalExemption_single: 2_250, personalExemption_mfj: 4_500, dependentExemption: 2_250 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security benefits fully excluded', note: 'Kansas does not tax Social Security benefits.' },
    ],
    credits: [
      { name: 'KS Earned Income Credit', description: '17% of federal EIC', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Kansas top rate 5.7%.'],
  },
  LA: {
    stateCode: 'LA', stateName: 'Louisiana',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0185, upTo: 12_500 },
      { rate: 0.035,  upTo: 50_000 },
      { rate: 0.0425, upTo: null   },
    ],
    brackets_mfj: [
      { rate: 0.0185, upTo: 25_000 },
      { rate: 0.035,  upTo: 100_000 },
      { rate: 0.0425, upTo: null   },
    ],
    deductions: { standardDeduction_single: 4_500, standardDeduction_mfj: 9_000, dependentExemption: 1_000 },
    addBacks: [
      { description: 'Federal income taxes paid — Louisiana allows deduction of actual federal taxes paid', appliesTo: 'always', note: 'Louisiana allows federal income tax deduction, significantly reducing LA taxable income.' },
    ],
    subtractions: [
      { description: 'Retirement income (pension, IRA) up to $6,000 per person (age 65+)', maxAmount: 6_000, note: 'Louisiana retirement income exclusion.' },
    ],
    credits: [
      { name: 'LA Earned Income Credit', description: '3.5% of federal EIC', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Louisiana allows federal income taxes as a deduction. Voters approved flat tax changes; verify current rate.'],
  },
  ME: {
    stateCode: 'ME', stateName: 'Maine',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.058,  upTo: 24_500  },
      { rate: 0.0675, upTo: 58_050  },
      { rate: 0.0715, upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.058,  upTo: 49_050  },
      { rate: 0.0675, upTo: 116_100 },
      { rate: 0.0715, upTo: null    },
    ],
    deductions: { standardDeduction_single: 14_600, standardDeduction_mfj: 29_200 },
    addBacks: [],
    subtractions: [
      { description: 'Military pension income exclusion', note: 'Maine military pension income excluded.' },
      { description: 'Social Security: partial exclusion based on income', note: 'ME partially excludes SS benefits for qualifying income levels.' },
    ],
    credits: [
      { name: 'ME Earned Income Credit', description: '25% of federal EIC', isRefundable: true },
      { name: 'ME Property Tax Fairness Credit', description: 'Refundable credit for homeowners/renters', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Maine top rate 7.15%.'],
  },
  MD: {
    stateCode: 'MD', stateName: 'Maryland',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.02,   upTo: 1_000   },
      { rate: 0.03,   upTo: 2_000   },
      { rate: 0.04,   upTo: 3_000   },
      { rate: 0.0475, upTo: 100_000 },
      { rate: 0.05,   upTo: 125_000 },
      { rate: 0.0525, upTo: 150_000 },
      { rate: 0.055,  upTo: 250_000 },
      { rate: 0.0575, upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.02,   upTo: 1_000   },
      { rate: 0.03,   upTo: 2_000   },
      { rate: 0.04,   upTo: 3_000   },
      { rate: 0.0475, upTo: 150_000 },
      { rate: 0.05,   upTo: 175_000 },
      { rate: 0.0525, upTo: 225_000 },
      { rate: 0.055,  upTo: 300_000 },
      { rate: 0.0575, upTo: null    },
    ],
    deductions: { standardDeduction_single: 2_400, standardDeduction_mfj: 4_800, personalExemption_single: 3_200, personalExemption_mfj: 6_400, dependentExemption: 3_200 },
    addBacks: [],
    subtractions: [
      { description: 'Pension exclusion (up to $36,200 for 65+)', maxAmount: 36_200, note: 'Maryland pension exclusion for qualifying retirees.' },
      { description: 'Social Security: fully excluded for income < $150k', note: 'Maryland excludes SS benefits for lower/middle income filers.' },
    ],
    credits: [
      { name: 'MD Earned Income Credit', description: '28% of federal EIC', isRefundable: true },
      { name: 'MD Child/Dependent Care Credit', description: 'Up to 32% of federal credit', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: [
      'Maryland county/city income taxes apply (2.25%–3.2% surcharge on state tax depending on jurisdiction).',
      'MD top rate 5.75%.',
    ],
  },
  MN: {
    stateCode: 'MN', stateName: 'Minnesota',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0535, upTo: 30_070  },
      { rate: 0.068,  upTo: 98_760  },
      { rate: 0.0785, upTo: 183_340 },
      { rate: 0.0985, upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.0535, upTo: 43_950  },
      { rate: 0.068,  upTo: 174_610 },
      { rate: 0.0785, upTo: 304_970 },
      { rate: 0.0985, upTo: null    },
    ],
    deductions: { standardDeduction_single: 14_575, standardDeduction_mfj: 29_150 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security subtraction: up to 100% for lower incomes', note: 'MN has its own SS subtraction schedule based on provisional income.' },
      { description: 'Military pay subtraction for active duty', note: 'Active duty military pay excluded from MN income.' },
    ],
    credits: [
      { name: 'MN Working Family Credit', description: 'MN version of EIC — 45% of federal EIC', isRefundable: true },
      { name: 'MN K-12 Education Credit', description: 'Up to $1,000 per family for education expenses', isRefundable: true },
      { name: 'MN Child and Dependent Care Credit', description: 'Up to $720 per child under 5', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Minnesota top rate 9.85%, one of the higher state rates.'],
  },
  MS: {
    stateCode: 'MS', stateName: 'Mississippi',
    conformityType: 'federal_agi_conforming', isFlatTax: true, flatRate: 0.047,
    deductions: { standardDeduction_single: 2_300, standardDeduction_mfj: 4_600, personalExemption_single: 6_000, personalExemption_mfj: 12_000, dependentExemption: 1_500 },
    addBacks: [],
    subtractions: [
      { description: 'Retirement income fully excluded (pensions, IRA, SS)', note: 'Mississippi does not tax retirement income.' },
    ],
    credits: [
      { name: 'MS Earned Income Credit', description: 'Based on federal EIC', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Mississippi is moving to a flat rate — approximately 4.7% for 2024, phasing to 4.0% by 2026.'],
  },
  MO: {
    stateCode: 'MO', stateName: 'Missouri',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.00,   upTo: 1_207  },
      { rate: 0.015,  upTo: 2_414  },
      { rate: 0.02,   upTo: 3_622  },
      { rate: 0.025,  upTo: 4_829  },
      { rate: 0.03,   upTo: 6_036  },
      { rate: 0.035,  upTo: 7_243  },
      { rate: 0.04,   upTo: 8_450  },
      { rate: 0.045,  upTo: 9_658  },
      { rate: 0.0495, upTo: null   },
    ],
    deductions: { standardDeduction_single: 14_600, standardDeduction_mfj: 29_200 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security benefits: excluded when federal AGI < $85k (single)/$100k (MFJ)', note: 'Missouri SS exclusion based on federal AGI.' },
      { description: 'Pension income: up to $6,000 deduction for public pensions', maxAmount: 6_000, note: 'Public pension income deduction for qualifying filers.' },
    ],
    credits: [
      { name: 'MO Earned Income Credit', description: '10% of federal EIC', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Missouri top rate 4.95% (2024). Rate reducing further in coming years.'],
  },
  MT: {
    stateCode: 'MT', stateName: 'Montana',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.01,   upTo: 3_600  },
      { rate: 0.02,   upTo: 6_300  },
      { rate: 0.03,   upTo: 9_700  },
      { rate: 0.04,   upTo: 13_000 },
      { rate: 0.05,   upTo: 16_800 },
      { rate: 0.06,   upTo: 21_600 },
      { rate: 0.069,  upTo: null   },
    ],
    deductions: { standardDeduction_single: 5_540, standardDeduction_mfj: 11_080 },
    addBacks: [],
    subtractions: [
      { description: 'Pension income exclusion: up to $4,640 (age 65+)', maxAmount: 4_640, note: 'Montana pension deduction for elderly.' },
    ],
    credits: [
      { name: 'MT Earned Income Credit', description: '3% of federal EIC', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Montana top rate 6.9%.'],
  },
  NE: {
    stateCode: 'NE', stateName: 'Nebraska',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0246, upTo: 3_700  },
      { rate: 0.0351, upTo: 22_170 },
      { rate: 0.0501, upTo: 35_730 },
      { rate: 0.0584, upTo: null   },
    ],
    brackets_mfj: [
      { rate: 0.0246, upTo: 7_390  },
      { rate: 0.0351, upTo: 44_340 },
      { rate: 0.0501, upTo: 71_460 },
      { rate: 0.0584, upTo: null   },
    ],
    deductions: { standardDeduction_single: 7_900, standardDeduction_mfj: 15_800 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security benefits: phasing toward full exclusion by 2025', note: 'Nebraska is phasing out state taxation of SS benefits.' },
    ],
    credits: [
      { name: 'NE Earned Income Credit', description: '10% of federal EIC', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Nebraska top rate 5.84% (2024), scheduled to decrease further.'],
  },
  NM: {
    stateCode: 'NM', stateName: 'New Mexico',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.017,  upTo: 5_500  },
      { rate: 0.032,  upTo: 11_000 },
      { rate: 0.047,  upTo: 16_000 },
      { rate: 0.049,  upTo: 210_000 },
      { rate: 0.059,  upTo: null   },
    ],
    brackets_mfj: [
      { rate: 0.017,  upTo: 8_000  },
      { rate: 0.032,  upTo: 16_000 },
      { rate: 0.047,  upTo: 24_000 },
      { rate: 0.049,  upTo: 315_000 },
      { rate: 0.059,  upTo: null   },
    ],
    deductions: { standardDeduction_single: 14_600, standardDeduction_mfj: 29_200 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security benefits fully excluded for filers with income < $100k (single)/$150k (MFJ)', note: 'New Mexico SS exclusion for lower-income filers.' },
    ],
    credits: [
      { name: 'NM Earned Income Credit', description: '25% of federal EIC', isRefundable: true },
      { name: 'NM Working Families Tax Credit', description: 'Refundable credit for working families', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['New Mexico top rate 5.9%.'],
  },
  ND: {
    stateCode: 'ND', stateName: 'North Dakota',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0195, upTo: 44_725  },
      { rate: 0.0245, upTo: 225_975 },
      { rate: 0.029,  upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.0195, upTo: 74_750  },
      { rate: 0.0245, upTo: 275_925 },
      { rate: 0.029,  upTo: null    },
    ],
    deductions: { standardDeduction_single: 14_600, standardDeduction_mfj: 29_200 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security benefits fully excluded for lower-income filers', note: 'ND excludes SS for filers below certain income thresholds.' },
    ],
    credits: [
      { name: 'ND Earned Income Credit', description: '4% of federal EIC (after 2023 changes)', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['North Dakota simplified to 3 brackets effective 2024. Top rate 2.9%.'],
  },
  OK: {
    stateCode: 'OK', stateName: 'Oklahoma',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0025, upTo: 1_000  },
      { rate: 0.0075, upTo: 2_500  },
      { rate: 0.0175, upTo: 3_750  },
      { rate: 0.0275, upTo: 4_900  },
      { rate: 0.0375, upTo: 7_200  },
      { rate: 0.0475, upTo: null   },
    ],
    brackets_mfj: [
      { rate: 0.0025, upTo: 2_000  },
      { rate: 0.0075, upTo: 5_000  },
      { rate: 0.0175, upTo: 7_500  },
      { rate: 0.0275, upTo: 9_800  },
      { rate: 0.0375, upTo: 12_200 },
      { rate: 0.0475, upTo: null   },
    ],
    deductions: { standardDeduction_single: 6_350, standardDeduction_mfj: 12_700 },
    addBacks: [],
    subtractions: [
      { description: 'Federal civil service retirement income exclusion', note: 'Oklahoma allows full deduction of federal civil service retirement income.' },
      { description: 'Social Security benefits fully excluded', note: 'Oklahoma does not tax SS benefits.' },
    ],
    credits: [
      { name: 'OK Earned Income Credit', description: '5% of federal EIC', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Oklahoma top rate 4.75%.'],
  },
  OR: {
    stateCode: 'OR', stateName: 'Oregon',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0475, upTo: 19_050  },
      { rate: 0.0675, upTo: 250_000 },
      { rate: 0.099,  upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.0475, upTo: 38_100  },
      { rate: 0.0675, upTo: 500_000 },
      { rate: 0.099,  upTo: null    },
    ],
    deductions: { standardDeduction_single: 2_420, standardDeduction_mfj: 4_840 },
    addBacks: [
      { description: 'Federal tax liability deduction (OR allows deduction of federal taxes)', appliesTo: 'always', note: 'Oregon allows deduction of federal income taxes paid, up to $7,050 (single) / $14,100 (MFJ) in 2024.' },
    ],
    subtractions: [
      { description: 'SS benefits fully excluded', note: 'Oregon does not tax Social Security benefits.' },
    ],
    credits: [
      { name: 'OR Earned Income Credit', description: '12% of federal EIC (18% with qualifying child under 3)', isRefundable: true },
      { name: 'OR Working Family Household and Dependent Care Credit', description: 'Refundable child/dependent care credit', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: [
      'Oregon top rate 9.9% for income > $250,000 (single).',
      'Statewide Transit Tax (0.1%) applies to wages.',
      'Portland Metro and Multnomah County have additional income taxes on higher earners.',
    ],
  },
  RI: {
    stateCode: 'RI', stateName: 'Rhode Island',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0375, upTo: 68_200  },
      { rate: 0.0475, upTo: 155_050 },
      { rate: 0.0599, upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.0375, upTo: 68_200  },
      { rate: 0.0475, upTo: 155_050 },
      { rate: 0.0599, upTo: null    },
    ],
    deductions: { standardDeduction_single: 10_550, standardDeduction_mfj: 21_150, personalExemption_single: 4_850, personalExemption_mfj: 9_700, dependentExemption: 4_850 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security benefits: excluded for lower incomes', note: 'RI excludes SS benefits when federal AGI is below threshold.' },
    ],
    credits: [
      { name: 'RI Earned Income Credit', description: '16% of federal EIC', isRefundable: true },
      { name: 'RI Child and Dependent Care Credit', description: '25% of federal credit', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Rhode Island top rate 5.99%.'],
  },
  SC: {
    stateCode: 'SC', stateName: 'South Carolina',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.00,   upTo: 3_460  },
      { rate: 0.03,   upTo: 17_330 },
      { rate: 0.064,  upTo: null   },
    ],
    deductions: { standardDeduction_single: 14_600, standardDeduction_mfj: 29_200 },
    addBacks: [],
    subtractions: [
      { description: 'Retirement income deduction: $10,000 per taxpayer (age 65+)', maxAmount: 10_000, note: 'South Carolina retirement income deduction for elderly.' },
      { description: 'Social Security benefits fully excluded', note: 'SC does not tax SS benefits.' },
    ],
    credits: [
      { name: 'SC Earned Income Credit', description: '41.67% of federal EIC', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: ['South Carolina top rate 6.4% (2024), phasing down to 6.0% by 2027.'],
  },
  VT: {
    stateCode: 'VT', stateName: 'Vermont',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0335, upTo: 45_400  },
      { rate: 0.066,  upTo: 110_050 },
      { rate: 0.076,  upTo: 229_550 },
      { rate: 0.0875, upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.0335, upTo: 75_850  },
      { rate: 0.066,  upTo: 183_400 },
      { rate: 0.076,  upTo: 279_450 },
      { rate: 0.0875, upTo: null    },
    ],
    deductions: { standardDeduction_single: 6_800, standardDeduction_mfj: 13_850 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security: partially excluded based on income', note: 'Vermont excludes some SS benefits for lower-income filers.' },
    ],
    credits: [
      { name: 'VT Earned Income Credit', description: '38% of federal EIC', isRefundable: true },
      { name: 'VT Child and Dependent Care Credit', description: 'Up to $2,400 per dependent', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Vermont top rate 8.75%.'],
  },
  WV: {
    stateCode: 'WV', stateName: 'West Virginia',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0236, upTo: 10_000 },
      { rate: 0.0315, upTo: 25_000 },
      { rate: 0.0354, upTo: 40_000 },
      { rate: 0.0472, upTo: 60_000 },
      { rate: 0.0512, upTo: null   },
    ],
    brackets_mfj: [
      { rate: 0.0236, upTo: 10_000 },
      { rate: 0.0315, upTo: 25_000 },
      { rate: 0.0354, upTo: 40_000 },
      { rate: 0.0472, upTo: 60_000 },
      { rate: 0.0512, upTo: null   },
    ],
    deductions: { personalExemption_single: 2_000, personalExemption_mfj: 4_000, dependentExemption: 2_000 },
    addBacks: [],
    subtractions: [
      { description: 'Social Security benefits: phasing toward full exclusion', note: 'WV is phasing out state taxation of Social Security benefits.' },
    ],
    credits: [
      { name: 'WV Earned Income Credit', description: '25% of federal EIC', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['West Virginia top rate 5.12% (2024), scheduled to decline further.'],
  },
  WI: {
    stateCode: 'WI', stateName: 'Wisconsin',
    conformityType: 'federal_agi_conforming', isFlatTax: false,
    brackets_single: [
      { rate: 0.0354, upTo: 13_810  },
      { rate: 0.0465, upTo: 27_630  },
      { rate: 0.053,  upTo: 304_170 },
      { rate: 0.0765, upTo: null    },
    ],
    brackets_mfj: [
      { rate: 0.0354, upTo: 18_420  },
      { rate: 0.0465, upTo: 36_840  },
      { rate: 0.053,  upTo: 405_550 },
      { rate: 0.0765, upTo: null    },
    ],
    deductions: { standardDeduction_single: 12_720, standardDeduction_mfj: 23_620 },
    addBacks: [],
    subtractions: [
      { description: 'SS benefits: partially excluded based on income', note: 'Wisconsin excludes some SS benefits at lower income levels.' },
      { description: 'Capital gains deduction: 30% of long-term capital gains excluded', note: 'Wisconsin allows 30% exclusion of long-term capital gains.' },
    ],
    credits: [
      { name: 'WI Earned Income Credit', description: '4-34% of federal EIC based on number of children', isRefundable: true },
      { name: 'WI Homestead Credit', description: 'Property tax/rent credit for lower-income filers', isRefundable: true },
    ],
    allocationMethod: 'income_ratio',
    notes: ['Wisconsin top rate 7.65%.'],
  },

  NJ: {
    stateCode: 'NJ', stateName: 'New Jersey',
    conformityType: 'own_rules', isFlatTax: false,
    brackets_single: [
      { rate: 0.014,  upTo: 20_000  },
      { rate: 0.0175, upTo: 35_000  },
      { rate: 0.035,  upTo: 40_000  },
      { rate: 0.05525, upTo: 75_000 },
      { rate: 0.0637,  upTo: 500_000 },
      { rate: 0.0897,  upTo: 1_000_000 },
      { rate: 0.1075,  upTo: null   },
    ],
    brackets_mfj: [
      { rate: 0.014,  upTo: 20_000  },
      { rate: 0.0175, upTo: 50_000  },
      { rate: 0.035,  upTo: 70_000  },
      { rate: 0.05525, upTo: 80_000 },
      { rate: 0.0637,  upTo: 150_000 },
      { rate: 0.0897,  upTo: 500_000 },
      { rate: 0.1075,  upTo: null   },
    ],
    deductions: { standardDeduction_single: 1_000, standardDeduction_mfj: 2_000, dependentExemption: 1_500 },
    addBacks: [
      { description: 'Federal deductions for alimony, IRAs, student loan interest — not allowed in NJ', appliesTo: 'sometimes', note: 'NJ does not conform to most federal above-the-line deductions.' },
    ],
    subtractions: [
      { description: 'NJ pension income exclusion for certain pensions (age 62+, income limits)', maxAmount: 100_000, note: 'Exclusion phases out for gross income above $150,000.' },
      { description: 'Medical expense deduction: expenses > 2% AGI (NJ lower floor than federal)', note: 'NJ allows medical deductions above 2% of gross income (vs 7.5% federal).' },
    ],
    credits: [
      { name: 'NJ Earned Income Tax Credit', description: '40% of federal EIC', isRefundable: true },
      { name: 'NJ Child Tax Credit', description: '$500 per child under 6 (income limits)', isRefundable: true },
      { name: 'NJ Property Tax Deduction/Credit', description: 'Homeowner deduction or $50 tenant credit', isRefundable: false },
    ],
    allocationMethod: 'income_ratio',
    notes: [
      'NJ has its own income tax system — does NOT start from federal AGI.',
      'NJ does not tax Social Security benefits.',
      'NJ treats income in categories: wages, net profits, interest, dividends, capital gains, pensions.',
      'NJ allows medical expense deduction at 2% AGI floor (more generous than federal).',
      'NJ has a separate wage base for NJ SDI and FLI deductions.',
    ],
  },
};

// ─── Lookup ────────────────────────────────────────────────────────────────────

export function getStateRules(stateCode: string, taxYear: number): StateReturnRules | null {
  const base = STATE_RULES[stateCode];
  if (!base) return null;
  return { ...base, taxYear };
}

export function hasStateIncomeTax(stateCode: string): boolean {
  return !NO_TAX_STATES.has(stateCode);
}

export function getAllStateCodesWithTax(): string[] {
  return Object.keys(STATE_RULES).filter(code => hasStateIncomeTax(code) && !code.includes('_placeholder'));
}

// ─── State return computation ─────────────────────────────────────────────────

interface StateComputeInput {
  stateCode: string;
  taxYear: number;
  residencyStatus: 'full_year' | 'part_year' | 'nonresident';
  incomeAllocationPct: number; // 0–100: % of income sourced to this state
  federalAGI: number;
  federalTaxableIncome: number;
  w2Wages: number;
  selfEmploymentIncome: number;
  k1Income: number;
  capitalGains: number;
  interestAndDividends: number;
  retirementIncome: number;
  numDependents: number;
  filingStatus: FilingStatusKey;
  estimatedStatePayments: number;
}

function computeBracketTax(income: number, brackets?: StateTaxBracket[]): number {
  if (!brackets) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const top = b.upTo ?? Infinity;
    if (income <= prev) break;
    const chunk = Math.min(income - prev, top - prev);
    tax += chunk * b.rate;
    prev = top;
  }
  return tax;
}

export function computeStateReturn(input: StateComputeInput): StateReturnResult {
  const rules = getStateRules(input.stateCode, input.taxYear);
  const warnings: string[] = [];
  const notes: string[] = [];

  if (!rules || rules.conformityType === 'no_income_tax') {
    notes.push(rules?.notes[0] ?? `${input.stateCode} has no income tax.`);
    return {
      stateCode: input.stateCode,
      stateName: rules?.stateName ?? input.stateCode,
      taxYear: input.taxYear,
      residencyStatus: input.residencyStatus,
      federalAGI: input.federalAGI,
      stateAdditions: 0, stateSubtractions: 0,
      stateAGI: 0, stateDeduction: 0, stateTaxableIncome: 0,
      stateTaxBeforeCredits: 0, estimatedStateCredits: 0,
      estimatedStateTax: 0, effectiveStateRate: 0,
      notes, warnings,
    };
  }

  // Residency adjustment
  const allocationFactor = input.residencyStatus === 'full_year'
    ? 1.0
    : input.incomeAllocationPct / 100;

  // State AGI — start from federal AGI for conforming states
  const stateAdditions = 0; // simplified — complex add-backs need preparer
  const stateSubtractions = 0; // simplified — retirement exclusions etc.
  const stateAGI = (input.federalAGI + stateAdditions - stateSubtractions) * allocationFactor;

  // Standard deduction / personal exemption
  const sd = rules.deductions;
  let stateDeduction = 0;
  if (input.filingStatus === 'married_filing_jointly') {
    stateDeduction = (sd.standardDeduction_mfj ?? 0) + (sd.personalExemption_mfj ?? 0);
  } else if (input.filingStatus === 'head_of_household') {
    stateDeduction = (sd.standardDeduction_hoh ?? sd.standardDeduction_single ?? 0) + (sd.personalExemption_single ?? 0);
  } else {
    stateDeduction = (sd.standardDeduction_single ?? 0) + (sd.personalExemption_single ?? 0);
  }
  stateDeduction += (sd.dependentExemption ?? 0) * input.numDependents;

  const stateTaxableIncome = Math.max(0, stateAGI - stateDeduction);

  // Tax computation
  let stateTaxBeforeCredits = 0;
  if (rules.isFlatTax && rules.flatRate) {
    stateTaxBeforeCredits = stateTaxableIncome * rules.flatRate;
  } else {
    const brackets = input.filingStatus === 'married_filing_jointly'
      ? (rules.brackets_mfj ?? rules.brackets_single)
      : rules.brackets_single;
    stateTaxBeforeCredits = computeBracketTax(stateTaxableIncome, brackets);
  }

  const estimatedStateCredits = 0; // credits require additional inputs
  const estimatedStateTax = Math.max(0, stateTaxBeforeCredits - estimatedStateCredits - input.estimatedStatePayments);
  const effectiveStateRate  = stateAGI > 0 ? stateTaxBeforeCredits / stateAGI : 0;

  // Notes
  notes.push(...(rules.notes ?? []));
  if (rules.addBacks.length > 0) {
    warnings.push(`${rules.stateName} has add-backs that may affect state income: ${rules.addBacks.map(a => a.description).join('; ')}`);
  }
  if (rules.subtractions.length > 0) {
    notes.push(`${rules.stateName} subtractions available: ${rules.subtractions.map(s => s.description).join('; ')}`);
  }
  if (input.residencyStatus !== 'full_year') {
    notes.push(`Part-year/nonresident: ${(allocationFactor * 100).toFixed(1)}% income allocation used. Verify with state-specific allocation rules.`);
  }

  return {
    stateCode: input.stateCode,
    stateName: rules.stateName,
    taxYear: input.taxYear,
    residencyStatus: input.residencyStatus,
    federalAGI: input.federalAGI,
    stateAdditions, stateSubtractions,
    stateAGI, stateDeduction, stateTaxableIncome,
    stateTaxBeforeCredits, estimatedStateCredits,
    estimatedStateTax, effectiveStateRate,
    notes, warnings,
  };
}

/** List of all 50 states + DC with names for UI dropdowns */
export const ALL_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },       { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },       { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },    { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },   { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'Dist. of Columbia' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },       { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },         { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },       { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },        { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },     { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },      { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },      { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },   { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },       { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },        { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },    { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },      { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },      { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },{ code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },     { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },          { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },      { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];
