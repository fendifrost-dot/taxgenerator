/**
 * priorYearRules.ts
 *
 * Year-specific tax constants, thresholds, and rules for prior year return
 * completion. Covers 2019 through the current year.
 *
 * Each year's rules are used by the Prior Year Builder to ensure Claude
 * applies the correct limits, rates, and phase-outs for the target year —
 * not the current year's rules.
 *
 * Sources: IRS Rev. Proc. / Publication 17 for each year.
 */

export interface YearTaxRules {
  year: number;

  // Standard deductions
  standardDeduction: {
    single: number;
    marriedFilingJointly: number;
    marriedFilingSeparately: number;
    headOfHousehold: number;
    qualifyingWidow: number;
    additionalBlindOrOver65_single: number;       // extra per qualifying condition
    additionalBlindOrOver65_married: number;
  };

  // Tax brackets (taxable income thresholds for each rate, single filer)
  taxBrackets_single: Array<{ rate: number; upTo: number | null }>;
  taxBrackets_mfj:    Array<{ rate: number; upTo: number | null }>;

  // Capital gains rates (single filer long-term thresholds)
  capitalGains: { rate0_upTo: number; rate15_upTo: number };

  // Contribution limits
  traditionalIRA_limit:  number;
  catchUp_IRA_over50:    number;
  k401_limit:            number;
  catchUp_401k_over50:   number;
  sepIRA_limit:          number;       // lesser of 25% net earnings or this
  hsa_limit_individual:  number;
  hsa_limit_family:      number;

  // Business / self-employment
  selfEmploymentTaxRate:   number;     // 15.3% always, but documented
  mileageRate_cents:       number;     // IRS standard business mileage (cents/mile)
  mileageRate_note?:       string;     // e.g., "two rates in 2022"
  section179_limit:        number;
  bonusDepreciation_pct:   number;     // 100% through 2022, phasing out after

  // Child & dependent credits
  childTaxCredit_perChild:         number;
  childTaxCredit_refundable_limit: number;  // additional child tax credit max
  childCareDependentCredit_limit1: number;  // 1 qualifying person
  childCareDependentCredit_limit2: number;  // 2+ qualifying persons

  // Education credits
  americanOpportunityCredit_max:   number;
  lifetimeLearningCredit_max:      number;

  // Other credits
  earnedIncomeCredit_max_0children: number;
  earnedIncomeCredit_max_1child:    number;
  earnedIncomeCredit_max_2children: number;
  earnedIncomeCredit_max_3plus:     number;

  // Itemized deduction rules
  saltCap:                number;   // state and local tax deduction cap
  mortgageDebtLimit:      number;   // $750k post-2017 TCJA, $1M pre-TCJA

  // Key law notes / special provisions for this year
  specialProvisions: string[];
}

// ─── 2019 ──────────────────────────────────────────────────────────────────────
const rules2019: YearTaxRules = {
  year: 2019,
  standardDeduction: {
    single: 12_200, marriedFilingJointly: 24_400, marriedFilingSeparately: 12_200,
    headOfHousehold: 18_350, qualifyingWidow: 24_400,
    additionalBlindOrOver65_single: 1_650, additionalBlindOrOver65_married: 1_300,
  },
  taxBrackets_single: [
    { rate: 0.10, upTo: 9_700  },
    { rate: 0.12, upTo: 39_475 },
    { rate: 0.22, upTo: 84_200 },
    { rate: 0.24, upTo: 160_725 },
    { rate: 0.32, upTo: 204_100 },
    { rate: 0.35, upTo: 510_300 },
    { rate: 0.37, upTo: null   },
  ],
  taxBrackets_mfj: [
    { rate: 0.10, upTo: 19_400  },
    { rate: 0.12, upTo: 78_950  },
    { rate: 0.22, upTo: 168_400 },
    { rate: 0.24, upTo: 321_450 },
    { rate: 0.32, upTo: 408_200 },
    { rate: 0.35, upTo: 612_350 },
    { rate: 0.37, upTo: null    },
  ],
  capitalGains: { rate0_upTo: 39_375, rate15_upTo: 434_550 },
  traditionalIRA_limit: 6_000, catchUp_IRA_over50: 1_000,
  k401_limit: 19_000, catchUp_401k_over50: 6_000,
  sepIRA_limit: 56_000,
  hsa_limit_individual: 3_500, hsa_limit_family: 7_000,
  selfEmploymentTaxRate: 0.153,
  mileageRate_cents: 58,
  section179_limit: 1_020_000, bonusDepreciation_pct: 100,
  childTaxCredit_perChild: 2_000, childTaxCredit_refundable_limit: 1_400,
  childCareDependentCredit_limit1: 3_000, childCareDependentCredit_limit2: 6_000,
  americanOpportunityCredit_max: 2_500, lifetimeLearningCredit_max: 2_000,
  earnedIncomeCredit_max_0children: 529,  earnedIncomeCredit_max_1child: 3_526,
  earnedIncomeCredit_max_2children: 5_828, earnedIncomeCredit_max_3plus: 6_557,
  saltCap: 10_000, mortgageDebtLimit: 750_000,
  specialProvisions: [
    'QBI deduction (Section 199A): up to 20% of qualified business income for pass-through businesses.',
    'Alimony paid under pre-2019 divorce agreements remains deductible on 1040.',
    'Alimony received under pre-2019 divorce agreements remains taxable income.',
    'Moving expense deduction only available to active duty military.',
  ],
};

// ─── 2020 ──────────────────────────────────────────────────────────────────────
const rules2020: YearTaxRules = {
  year: 2020,
  standardDeduction: {
    single: 12_400, marriedFilingJointly: 24_800, marriedFilingSeparately: 12_400,
    headOfHousehold: 18_650, qualifyingWidow: 24_800,
    additionalBlindOrOver65_single: 1_650, additionalBlindOrOver65_married: 1_300,
  },
  taxBrackets_single: [
    { rate: 0.10, upTo: 9_875  },
    { rate: 0.12, upTo: 40_125 },
    { rate: 0.22, upTo: 85_525 },
    { rate: 0.24, upTo: 163_300 },
    { rate: 0.32, upTo: 207_350 },
    { rate: 0.35, upTo: 518_400 },
    { rate: 0.37, upTo: null   },
  ],
  taxBrackets_mfj: [
    { rate: 0.10, upTo: 19_750  },
    { rate: 0.12, upTo: 80_250  },
    { rate: 0.22, upTo: 171_050 },
    { rate: 0.24, upTo: 326_600 },
    { rate: 0.32, upTo: 414_700 },
    { rate: 0.35, upTo: 622_050 },
    { rate: 0.37, upTo: null    },
  ],
  capitalGains: { rate0_upTo: 40_000, rate15_upTo: 441_450 },
  traditionalIRA_limit: 6_000, catchUp_IRA_over50: 1_000,
  k401_limit: 19_500, catchUp_401k_over50: 6_500,
  sepIRA_limit: 57_000,
  hsa_limit_individual: 3_550, hsa_limit_family: 7_100,
  selfEmploymentTaxRate: 0.153,
  mileageRate_cents: 57.5,
  section179_limit: 1_040_000, bonusDepreciation_pct: 100,
  childTaxCredit_perChild: 2_000, childTaxCredit_refundable_limit: 1_400,
  childCareDependentCredit_limit1: 3_000, childCareDependentCredit_limit2: 6_000,
  americanOpportunityCredit_max: 2_500, lifetimeLearningCredit_max: 2_000,
  earnedIncomeCredit_max_0children: 538,  earnedIncomeCredit_max_1child: 3_584,
  earnedIncomeCredit_max_2children: 5_920, earnedIncomeCredit_max_3plus: 6_660,
  saltCap: 10_000, mortgageDebtLimit: 750_000,
  specialProvisions: [
    'CARES Act: $1,200 stimulus payment ($2,400 MFJ) + $500 per dependent — not taxable income.',
    'CARES Act: Retirement account early withdrawal penalty waived for COVID-related distributions up to $100,000; income spread over 3 years.',
    'CARES Act: Required Minimum Distributions (RMDs) suspended for 2020.',
    'Above-the-line charitable deduction: up to $300 cash donations deductible even if taking standard deduction.',
    'Student loan payments suspended by CARES Act (interest-free deferral).',
    'QBI deduction (Section 199A) continues: up to 20% of qualified business income.',
    'Net operating losses (NOL): CARES Act allows 5-year NOL carryback for 2018, 2019, 2020 losses.',
  ],
};

// ─── 2021 ──────────────────────────────────────────────────────────────────────
const rules2021: YearTaxRules = {
  year: 2021,
  standardDeduction: {
    single: 12_550, marriedFilingJointly: 25_100, marriedFilingSeparately: 12_550,
    headOfHousehold: 18_800, qualifyingWidow: 25_100,
    additionalBlindOrOver65_single: 1_700, additionalBlindOrOver65_married: 1_350,
  },
  taxBrackets_single: [
    { rate: 0.10, upTo: 9_950  },
    { rate: 0.12, upTo: 40_525 },
    { rate: 0.22, upTo: 86_375 },
    { rate: 0.24, upTo: 164_925 },
    { rate: 0.32, upTo: 209_425 },
    { rate: 0.35, upTo: 523_600 },
    { rate: 0.37, upTo: null   },
  ],
  taxBrackets_mfj: [
    { rate: 0.10, upTo: 19_900  },
    { rate: 0.12, upTo: 81_050  },
    { rate: 0.22, upTo: 172_750 },
    { rate: 0.24, upTo: 329_850 },
    { rate: 0.32, upTo: 418_850 },
    { rate: 0.35, upTo: 628_300 },
    { rate: 0.37, upTo: null    },
  ],
  capitalGains: { rate0_upTo: 40_400, rate15_upTo: 445_850 },
  traditionalIRA_limit: 6_000, catchUp_IRA_over50: 1_000,
  k401_limit: 19_500, catchUp_401k_over50: 6_500,
  sepIRA_limit: 58_000,
  hsa_limit_individual: 3_600, hsa_limit_family: 7_200,
  selfEmploymentTaxRate: 0.153,
  mileageRate_cents: 56,
  section179_limit: 1_050_000, bonusDepreciation_pct: 100,
  childTaxCredit_perChild: 3_000,          // ARPA expansion: $3,000 ages 6-17, $3,600 under 6
  childTaxCredit_refundable_limit: 3_600,  // fully refundable in 2021 (ARPA)
  childCareDependentCredit_limit1: 8_000,  // ARPA expanded: was $3k, now $8k
  childCareDependentCredit_limit2: 16_000, // ARPA expanded: was $6k, now $16k
  americanOpportunityCredit_max: 2_500, lifetimeLearningCredit_max: 2_000,
  earnedIncomeCredit_max_0children: 1_502, // ARPA temporarily expanded EIC for childless workers
  earnedIncomeCredit_max_1child: 3_618,
  earnedIncomeCredit_max_2children: 5_980, earnedIncomeCredit_max_3plus: 6_728,
  saltCap: 10_000, mortgageDebtLimit: 750_000,
  specialProvisions: [
    'ARPA: Child Tax Credit expanded to $3,000 per child ages 6-17; $3,600 per child under 6. Fully refundable.',
    'ARPA: Child and Dependent Care Credit expanded — up to 50% of $8,000 (1 child) or $16,000 (2+ children). Refundable for taxpayers with AGI ≤ $125,000.',
    'ARPA: EIC expanded for childless workers — minimum age lowered to 19, upper age cap removed.',
    'Advance Child Tax Credit payments distributed July–December 2021 — must reconcile on Schedule 8812.',
    '$1,400 stimulus payment (ARP) per person + $1,400 per dependent — not taxable, reconcile via Recovery Rebate Credit.',
    'Above-the-line charitable deduction expanded: up to $600 cash donations for MFJ (still $300 for single).',
    'QBI deduction (Section 199A) continues.',
  ],
};

// ─── 2022 ──────────────────────────────────────────────────────────────────────
const rules2022: YearTaxRules = {
  year: 2022,
  standardDeduction: {
    single: 12_950, marriedFilingJointly: 25_900, marriedFilingSeparately: 12_950,
    headOfHousehold: 19_400, qualifyingWidow: 25_900,
    additionalBlindOrOver65_single: 1_750, additionalBlindOrOver65_married: 1_400,
  },
  taxBrackets_single: [
    { rate: 0.10, upTo: 10_275 },
    { rate: 0.12, upTo: 41_775 },
    { rate: 0.22, upTo: 89_075 },
    { rate: 0.24, upTo: 170_050 },
    { rate: 0.32, upTo: 215_950 },
    { rate: 0.35, upTo: 539_900 },
    { rate: 0.37, upTo: null   },
  ],
  taxBrackets_mfj: [
    { rate: 0.10, upTo: 20_550  },
    { rate: 0.12, upTo: 83_550  },
    { rate: 0.22, upTo: 178_150 },
    { rate: 0.24, upTo: 340_100 },
    { rate: 0.32, upTo: 431_900 },
    { rate: 0.35, upTo: 647_850 },
    { rate: 0.37, upTo: null    },
  ],
  capitalGains: { rate0_upTo: 41_675, rate15_upTo: 459_750 },
  traditionalIRA_limit: 6_000, catchUp_IRA_over50: 1_000,
  k401_limit: 20_500, catchUp_401k_over50: 6_500,
  sepIRA_limit: 61_000,
  hsa_limit_individual: 3_650, hsa_limit_family: 7_300,
  selfEmploymentTaxRate: 0.153,
  mileageRate_cents: 62.5, // Jan–Jun: 58.5 cents; Jul–Dec: 62.5 cents (IRS mid-year increase)
  mileageRate_note: 'IRS issued a mid-year increase: 58.5 cents/mile Jan–Jun; 62.5 cents/mile Jul–Dec.',
  section179_limit: 1_080_000, bonusDepreciation_pct: 100,
  childTaxCredit_perChild: 2_000, childTaxCredit_refundable_limit: 1_500, // reverted from 2021 ARPA expansion
  childCareDependentCredit_limit1: 3_000, childCareDependentCredit_limit2: 6_000,
  americanOpportunityCredit_max: 2_500, lifetimeLearningCredit_max: 2_000,
  earnedIncomeCredit_max_0children: 560,  earnedIncomeCredit_max_1child: 3_733,
  earnedIncomeCredit_max_2children: 6_164, earnedIncomeCredit_max_3plus: 6_935,
  saltCap: 10_000, mortgageDebtLimit: 750_000,
  specialProvisions: [
    'Child Tax Credit reverted to pre-ARPA levels: $2,000 per qualifying child (not fully refundable).',
    'Inflation Reduction Act signed Aug 2022: Residential Clean Energy Credit (30%) and Energy Efficient Home Improvement Credit apply for qualifying 2022 expenditures.',
    'IRA mileage rate raised mid-year — track miles by period.',
    'QBI deduction (Section 199A) continues.',
    'SECURE 2.0 Act signed Dec 2022 — affects RMD age starting 2023.',
  ],
};

// ─── 2023 ──────────────────────────────────────────────────────────────────────
const rules2023: YearTaxRules = {
  year: 2023,
  standardDeduction: {
    single: 13_850, marriedFilingJointly: 27_700, marriedFilingSeparately: 13_850,
    headOfHousehold: 20_800, qualifyingWidow: 27_700,
    additionalBlindOrOver65_single: 1_850, additionalBlindOrOver65_married: 1_500,
  },
  taxBrackets_single: [
    { rate: 0.10, upTo: 11_000 },
    { rate: 0.12, upTo: 44_725 },
    { rate: 0.22, upTo: 95_375 },
    { rate: 0.24, upTo: 182_050 },
    { rate: 0.32, upTo: 231_250 },
    { rate: 0.35, upTo: 578_125 },
    { rate: 0.37, upTo: null   },
  ],
  taxBrackets_mfj: [
    { rate: 0.10, upTo: 22_000  },
    { rate: 0.12, upTo: 89_450  },
    { rate: 0.22, upTo: 190_750 },
    { rate: 0.24, upTo: 364_200 },
    { rate: 0.32, upTo: 462_500 },
    { rate: 0.35, upTo: 693_750 },
    { rate: 0.37, upTo: null    },
  ],
  capitalGains: { rate0_upTo: 44_625, rate15_upTo: 492_300 },
  traditionalIRA_limit: 6_500, catchUp_IRA_over50: 1_000,
  k401_limit: 22_500, catchUp_401k_over50: 7_500,
  sepIRA_limit: 66_000,
  hsa_limit_individual: 3_850, hsa_limit_family: 7_750,
  selfEmploymentTaxRate: 0.153,
  mileageRate_cents: 65.5,
  section179_limit: 1_160_000, bonusDepreciation_pct: 80, // phasing out: 80% in 2023
  childTaxCredit_perChild: 2_000, childTaxCredit_refundable_limit: 1_600,
  childCareDependentCredit_limit1: 3_000, childCareDependentCredit_limit2: 6_000,
  americanOpportunityCredit_max: 2_500, lifetimeLearningCredit_max: 2_000,
  earnedIncomeCredit_max_0children: 600,  earnedIncomeCredit_max_1child: 3_995,
  earnedIncomeCredit_max_2children: 6_604, earnedIncomeCredit_max_3plus: 7_430,
  saltCap: 10_000, mortgageDebtLimit: 750_000,
  specialProvisions: [
    'SECURE 2.0 Act: RMD age increased to 73 (was 72). New Roth 401(k) — no RMD required starting 2024.',
    'Bonus depreciation phasing down: 80% in 2023 (was 100% through 2022).',
    'Residential Clean Energy Credit: 30% for solar, wind, geothermal, battery storage.',
    'Energy Efficient Home Improvement Credit: up to $1,200 per year ($2,000 for heat pumps).',
    'QBI deduction (Section 199A) continues.',
    'Clean Vehicle Credit (EV): up to $7,500 for qualifying new EVs; $4,000 for used EVs.',
  ],
};

// ─── 2024 ──────────────────────────────────────────────────────────────────────
const rules2024: YearTaxRules = {
  year: 2024,
  standardDeduction: {
    single: 14_600, marriedFilingJointly: 29_200, marriedFilingSeparately: 14_600,
    headOfHousehold: 21_900, qualifyingWidow: 29_200,
    additionalBlindOrOver65_single: 1_950, additionalBlindOrOver65_married: 1_550,
  },
  taxBrackets_single: [
    { rate: 0.10, upTo: 11_600 },
    { rate: 0.12, upTo: 47_150 },
    { rate: 0.22, upTo: 100_525 },
    { rate: 0.24, upTo: 191_950 },
    { rate: 0.32, upTo: 243_725 },
    { rate: 0.35, upTo: 609_350 },
    { rate: 0.37, upTo: null   },
  ],
  taxBrackets_mfj: [
    { rate: 0.10, upTo: 23_200  },
    { rate: 0.12, upTo: 94_300  },
    { rate: 0.22, upTo: 201_050 },
    { rate: 0.24, upTo: 383_900 },
    { rate: 0.32, upTo: 487_450 },
    { rate: 0.35, upTo: 731_200 },
    { rate: 0.37, upTo: null    },
  ],
  capitalGains: { rate0_upTo: 47_025, rate15_upTo: 518_900 },
  traditionalIRA_limit: 7_000, catchUp_IRA_over50: 1_000,
  k401_limit: 23_000, catchUp_401k_over50: 7_500,
  sepIRA_limit: 69_000,
  hsa_limit_individual: 4_150, hsa_limit_family: 8_300,
  selfEmploymentTaxRate: 0.153,
  mileageRate_cents: 67,
  section179_limit: 1_220_000, bonusDepreciation_pct: 60, // 60% in 2024
  childTaxCredit_perChild: 2_000, childTaxCredit_refundable_limit: 1_700,
  childCareDependentCredit_limit1: 3_000, childCareDependentCredit_limit2: 6_000,
  americanOpportunityCredit_max: 2_500, lifetimeLearningCredit_max: 2_000,
  earnedIncomeCredit_max_0children: 632,  earnedIncomeCredit_max_1child: 4_213,
  earnedIncomeCredit_max_2children: 6_960, earnedIncomeCredit_max_3plus: 7_830,
  saltCap: 10_000, mortgageDebtLimit: 750_000,
  specialProvisions: [
    'Bonus depreciation: 60% in 2024 (declining toward 0% by 2027 under current law).',
    'SECURE 2.0: Super catch-up contributions for ages 60-63 available in defined contribution plans.',
    'QBI deduction (Section 199A) continues — set to expire after 2025 under current law.',
    'Residential Clean Energy Credit: 30% through 2032.',
    'Clean Vehicle Credit continues with income/price limitations.',
    'Tax Cuts and Jobs Act (TCJA) provisions expire after 2025 — many rates, deductions, and credits revert.',
  ],
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const ALL_RULES: Record<number, YearTaxRules> = {
  2019: rules2019,
  2020: rules2020,
  2021: rules2021,
  2022: rules2022,
  2023: rules2023,
  2024: rules2024,
};

export function getRulesForYear(year: number): YearTaxRules | null {
  return ALL_RULES[year] ?? null;
}

/** Returns an array of years available for prior year return building.
 *  Goes back 5 years from (currentYear - 1). */
export function getAvailablePriorYears(currentYear: number): number[] {
  const mostRecent = currentYear - 1;
  return Array.from({ length: 5 }, (_, i) => mostRecent - i)
    .filter(y => ALL_RULES[y] != null);
}

/** Human-readable summary of key limits for a year (used in Claude prompt) */
export function formatRulesForPrompt(rules: YearTaxRules): string {
  const r = rules;
  return `
TAX YEAR ${r.year} — KEY RULES & LIMITS
========================================
Standard Deduction:
  • Single:               $${r.standardDeduction.single.toLocaleString()}
  • Married Filing Jointly: $${r.standardDeduction.marriedFilingJointly.toLocaleString()}
  • Head of Household:    $${r.standardDeduction.headOfHousehold.toLocaleString()}
  • Additional (blind/65+, single): $${r.standardDeduction.additionalBlindOrOver65_single.toLocaleString()}

Tax Brackets (Single):
${r.taxBrackets_single.map(b => `  • ${(b.rate * 100).toFixed(0)}%  up to ${b.upTo != null ? '$' + b.upTo.toLocaleString() : '(top bracket)'}`).join('\n')}

Contribution Limits:
  • Traditional IRA:      $${r.traditionalIRA_limit.toLocaleString()} ($${(r.traditionalIRA_limit + r.catchUp_IRA_over50).toLocaleString()} if age 50+)
  • 401(k):               $${r.k401_limit.toLocaleString()} ($${(r.k401_limit + r.catchUp_401k_over50).toLocaleString()} if age 50+)
  • SEP-IRA:              up to $${r.sepIRA_limit.toLocaleString()} (or 25% of net SE income)
  • HSA:                  $${r.hsa_limit_individual.toLocaleString()} individual / $${r.hsa_limit_family.toLocaleString()} family

Business / Self-Employment:
  • Mileage rate:         ${r.mileageRate_cents} cents/mile${r.mileageRate_note ? ' (' + r.mileageRate_note + ')' : ''}
  • Section 179 limit:    $${r.section179_limit.toLocaleString()}
  • Bonus depreciation:   ${r.bonusDepreciation_pct}%

Credits:
  • Child Tax Credit:     $${r.childTaxCredit_perChild.toLocaleString()} per child
  • Child & Dependent Care: up to $${r.childCareDependentCredit_limit2.toLocaleString()} (2+ persons)
  • American Opportunity: up to $${r.americanOpportunityCredit_max.toLocaleString()}
  • SALT cap:             $${r.saltCap.toLocaleString()}

Special Provisions for ${r.year}:
${r.specialProvisions.map(p => '  • ' + p).join('\n')}
`.trim();
}
