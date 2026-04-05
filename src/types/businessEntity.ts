/**
 * businessEntity.ts
 *
 * Types for all business entity return types:
 *  - Schedule C       (sole proprietor / single-member LLC — already in 1040)
 *  - Form 1120-S      (S Corporation)
 *  - Form 1065        (Partnership / Multi-member LLC / LLLP / LP)
 *  - Form 1120        (C Corporation)
 *
 * K-1 pass-through amounts from S Corp / Partnership automatically
 * flow back to the owner's individual 1040.
 */

// ─── Entity classification ─────────────────────────────────────────────────────

export type EntityType =
  | 'schedule_c'       // Sole proprietor / single-member LLC (reported on 1040)
  | 's_corp'           // S Corporation — Form 1120-S
  | 'partnership'      // General or Limited Partnership — Form 1065
  | 'llp'              // Limited Liability Partnership — Form 1065
  | 'lllp'             // Limited Liability Limited Partnership — Form 1065
  | 'llc_partnership'  // Multi-member LLC taxed as partnership — Form 1065
  | 'llc_s_corp'       // LLC with S Corp election — Form 1120-S
  | 'c_corp';          // C Corporation — Form 1120

export const ENTITY_LABELS: Record<EntityType, string> = {
  schedule_c:      'Sole Proprietor / Single-Member LLC (Schedule C)',
  s_corp:          'S Corporation (Form 1120-S)',
  partnership:     'Partnership (Form 1065)',
  llp:             'Limited Liability Partnership — LLP (Form 1065)',
  lllp:            'Limited Liability Limited Partnership — LLLP (Form 1065)',
  llc_partnership: 'Multi-Member LLC / Partnership (Form 1065)',
  llc_s_corp:      'LLC Elected S Corp (Form 1120-S)',
  c_corp:          'C Corporation (Form 1120)',
};

export const ENTITY_FORMS: Record<EntityType, string> = {
  schedule_c:      'Schedule C / Form 1040',
  s_corp:          'Form 1120-S',
  partnership:     'Form 1065',
  llp:             'Form 1065',
  lllp:            'Form 1065',
  llc_partnership: 'Form 1065',
  llc_s_corp:      'Form 1120-S',
  c_corp:          'Form 1120',
};

/** Which entity types produce K-1s that flow to owner's 1040 */
export const PASS_THROUGH_ENTITIES: EntityType[] = [
  's_corp', 'partnership', 'llp', 'lllp', 'llc_partnership', 'llc_s_corp',
];

/** Which entity types have their own separate tax liability */
export const ENTITY_LEVEL_TAX: EntityType[] = ['c_corp'];

// ─── Owner / Partner / Shareholder ────────────────────────────────────────────

export interface EntityOwner {
  id: string;
  name: string;
  ownershipPct: number;          // 0–100
  isGeneralPartner?: boolean;    // partnerships
  isShareholder?: boolean;       // corps
  k1Items?: K1Item[];            // populated after return generation
}

// ─── K-1 line items ───────────────────────────────────────────────────────────

/** Schedule K-1 (Form 1065) boxes */
export type K1_1065_Box =
  | '1_ordinary_income'
  | '2_net_rental_real_estate'
  | '3_other_net_rental_income'
  | '4_guaranteed_payments_services'
  | '5_guaranteed_payments_capital'
  | '6a_net_stcg'
  | '9a_net_ltcg'
  | '11_other_income'
  | '12_section_179'
  | '13_other_deductions'
  | '14_se_earnings'
  | '15_credits'
  | '16_foreign_transactions'
  | '17_alt_min_tax'
  | '18_tax_exempt_income'
  | '19_distributions'
  | '20_other';

/** Schedule K-1 (Form 1120-S) boxes */
export type K1_1120S_Box =
  | '1_ordinary_income'
  | '2_net_rental_real_estate'
  | '3_other_net_rental_income'
  | '4_interest_income'
  | '5a_ordinary_dividends'
  | '6_royalties'
  | '7_net_stcg'
  | '8a_net_ltcg'
  | '9_net_section_1231_gain'
  | '10_other_income'
  | '11_section_179'
  | '12_other_deductions'
  | '13_credits'
  | '14_foreign_transactions'
  | '15_alt_min_tax'
  | '16_items_affecting_basis'
  | '17_other_info';

export interface K1Item {
  box: K1_1065_Box | K1_1120S_Box;
  description: string;
  amount: number;
}

// ─── Entity return input ───────────────────────────────────────────────────────

export interface EntityIncomeItem {
  description: string;
  amount: number;
}

export interface EntityDeductionItem {
  category: string;
  description: string;
  amount: number;
  formLine?: string;
}

export interface EntityAsset {
  description: string;
  dateAcquired: string;
  cost: number;
  priorDepreciation: number;
  method: string; // 'MACRS' | 'SL' | 'Sec179' | 'BonusDepreciation'
  life: number;   // years
}

export interface EntityReturnInput {
  // Entity info
  entityType: EntityType;
  entityName: string;
  ein: string;                   // XX-XXXXXXX
  stateOfFormation: string;
  taxYear: number;
  isInitialReturn: boolean;
  isFinalReturn: boolean;
  accountingMethod: 'cash' | 'accrual';

  // Owners
  owners: EntityOwner[];

  // Income
  grossReceipts: number;
  returnsAndAllowances: number;
  costOfGoodsSold: number;
  otherIncome: EntityIncomeItem[];

  // Deductions
  compensation: number;          // officers/partners
  salariesAndWages: number;      // employees
  repairs: number;
  badDebts: number;
  rents: number;
  taxesAndLicenses: number;
  interest: number;
  depreciation: number;
  depletion: number;
  advertising: number;
  pensionAndProfitSharing: number;
  benefitPrograms: number;
  otherDeductions: EntityDeductionItem[];

  // S Corp specific
  shareholderLoans?: number;
  distributionsToShareholders?: number;
  reasonableCompensation?: number;  // W-2 wages paid to S Corp shareholders

  // C Corp specific
  dividendsPaid?: number;
  taxableIncome?: number;           // for 1120 flat 21% rate

  // Partnership specific
  guaranteedPayments?: number;
  partnerDistributions?: number;
  selfRentals?: number;

  // Balance sheet (Schedule L) — optional but recommended
  totalAssets?: number;
  totalLiabilities?: number;
  partnersCapital?: number;

  // Assets for depreciation schedule
  assets: EntityAsset[];

  // Notes / additional context for Claude
  preparerNotes: string;
}

// ─── Entity return output ──────────────────────────────────────────────────────

export interface EntityReturnLineItem {
  lineNumber: string;
  description: string;
  amount: number;
  isEstimated: boolean;
  note?: string;
}

export interface EntityReturnSection {
  title: string;
  lines: EntityReturnLineItem[];
  subtotal?: number;
}

export interface EntityK1Summary {
  ownerName: string;
  ownershipPct: number;
  k1Items: K1Item[];
  ordinaryIncome: number;
  guaranteedPayments?: number;
  selfEmploymentIncome?: number;   // partnerships / LLPs (not S corps)
  distributions: number;
  basisImpact: number;
}

export interface EntityReturnSummary {
  entityName: string;
  entityType: EntityType;
  formName: string;
  taxYear: number;
  ein: string;

  // Income/deduction totals
  grossIncome: number;
  totalDeductions: number;
  ordinaryBusinessIncome: number;  // net income/loss before entity-level tax
  entityTaxLiability?: number;     // C Corps only (21% flat)

  // Sections
  sections: EntityReturnSection[];

  // K-1 summaries (pass-through entities)
  k1Summaries?: EntityK1Summary[];

  // Compliance notes
  preparerSummary: string;
  warningFlags: string[];
  missingDocuments: string[];
  recommendedActions: string[];
  estimatedValuesNote?: string;

  // Metadata
  generatedAt: string;
  claudeModel: string;
}
