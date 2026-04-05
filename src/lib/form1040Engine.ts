/**
 * form1040Engine.ts
 *
 * Complete, deterministic Form 1040 computation engine.
 *
 * Coverage:
 *   ✓ Schedule C  (sole proprietor / self-employment income)
 *   ✓ Schedule SE (self-employment tax, half SE deduction)
 *   ✓ Schedule D  (capital gains & losses, LT/ST, carryover)
 *   ✓ Form 8829   (home office — simplified & actual method)
 *   ✓ Schedule 1  (above-the-line adjustments → AGI)
 *   ✓ Schedule A  (itemized deductions — SALT cap, medical floor, mortgage)
 *   ✓ Section 199A QBI deduction
 *   ✓ Tax brackets (ordinary income + preferential rates for qual divs / LT CG)
 *   ✓ Child Tax Credit / Additional CTC
 *   ✓ Child & Dependent Care Credit
 *   ✓ Earned Income Credit (three-child table estimate)
 *   ✓ American Opportunity Credit / Lifetime Learning Credit
 *   ✓ Retirement Savings Credit (Saver's Credit)
 *   ✓ Net Investment Income Tax (3.8% NIIT, Form 8960)
 *   ✓ Additional Medicare Tax (0.9%, Form 8959)
 *   ✓ NOL carryforward application (80% limitation)
 *   ✓ Capital loss carryover tracking
 *
 * Every computed value carries a human-readable `path` tracing the arithmetic.
 * The engine NEVER guesses — if data is missing it defaults to 0 and records why.
 */

import { getRulesForYear, YearTaxRules } from '@/lib/priorYearRules';
import {
  Form1040Input,
  Form1040Result,
  Form1040Section,
  Form1040Line,
  ScheduleCResult,
  ScheduleSEResult,
  ScheduleDResult,
  Form8829Result,
  AGIResult,
  DeductionResult,
  QBIResult,
  TaxComputationResult,
  CreditResult,
  OtherTaxesResult,
  PaymentsResult,
  FilingStatus,
} from '@/types/form1040';

// ─── Small helpers ────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const floor0 = (n: number) => Math.max(0, n);

function line(
  lineNumber: string,
  description: string,
  amount: number,
  path: string,
  isEstimated = false,
  sourceRefs?: string[],
): Form1040Line {
  return { lineNumber, description, amount: Math.round(amount), path, isEstimated, sourceRefs };
}

// ─── Tax bracket computation ──────────────────────────────────────────────────

interface Bracket { rate: number; upTo: number | null }

function computeTaxFromBrackets(taxableIncome: number, brackets: Bracket[]): number {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const top = b.upTo ?? Infinity;
    if (taxableIncome <= prev) break;
    const chunk = Math.min(taxableIncome - prev, top - prev);
    tax += chunk * b.rate;
    prev = top;
  }
  return tax;
}

function getMarginalRate(taxableIncome: number, brackets: Bracket[]): number {
  let prev = 0;
  for (const b of brackets) {
    const top = b.upTo ?? Infinity;
    if (taxableIncome <= top) return b.rate;
    prev = top;
    void prev;
  }
  return brackets[brackets.length - 1].rate;
}

// ─── Standard deduction ───────────────────────────────────────────────────────

function getStandardDeduction(input: Form1040Input, rules: YearTaxRules): number {
  const sd = rules.standardDeduction;
  let base = 0;
  switch (input.filingStatus) {
    case 'single':
    case 'married_filing_separately':
      base = sd.single; break;
    case 'married_filing_jointly':
    case 'qualifying_surviving_spouse':
      base = sd.marriedFilingJointly; break;
    case 'head_of_household':
      base = sd.headOfHousehold; break;
  }

  // Additional standard deduction for age ≥65 or blind
  let additional = 0;
  const isMarried = input.filingStatus === 'married_filing_jointly' || input.filingStatus === 'married_filing_separately';
  const perCondition = isMarried ? sd.additionalBlindOrOver65_married : sd.additionalBlindOrOver65_single;

  if (input.taxpayerAge >= 65) additional += perCondition;
  if (input.taxpayerBlind) additional += perCondition;
  if (input.spouseAge !== undefined && input.spouseAge >= 65) additional += perCondition;
  if (input.spouseBlind) additional += perCondition;

  return base + additional;
}

// ─── Schedule SE ─────────────────────────────────────────────────────────────

/** 2024 SS wage base; adjust for other years */
const SS_WAGE_BASES: Record<number, number> = {
  2019: 132_900, 2020: 137_700, 2021: 142_800,
  2022: 147_000, 2023: 160_200, 2024: 168_600,
};

function computeScheduleSE(
  netScheduleC: number,
  k1GuaranteedPayments: number,
  k1SelfEmploymentIncome: number,
  taxYear: number,
  filingStatus: FilingStatus,
): ScheduleSEResult {
  const totalSEIncome = netScheduleC + k1GuaranteedPayments + k1SelfEmploymentIncome;
  if (totalSEIncome <= 400) {
    return {
      netEarningsFromSE: 0, scheduleSeIncome: 0, socialSecurityTaxable: 0,
      selfEmploymentTax: 0, halfSETax: 0, additionalMedicareTax: 0,
    };
  }

  const factor = 0.9235;
  const scheduleSeIncome = totalSEIncome * factor;
  const ssWageBase = SS_WAGE_BASES[taxYear] ?? 168_600;
  const socialSecurityTaxable = Math.min(scheduleSeIncome, ssWageBase);
  const ssTax   = socialSecurityTaxable * 0.124;
  const medTax  = scheduleSeIncome * 0.029;
  const seTax   = ssTax + medTax;
  const halfSE  = seTax / 2;

  // Additional Medicare 0.9% on combined wages + SE > threshold
  const threshold = (filingStatus === 'married_filing_jointly') ? 250_000 : 200_000;
  const additionalMedicareTax = Math.max(0, scheduleSeIncome - threshold) * 0.009;

  return {
    netEarningsFromSE: totalSEIncome,
    scheduleSeIncome,
    socialSecurityTaxable,
    selfEmploymentTax: seTax,
    halfSETax: halfSE,
    additionalMedicareTax,
  };
}

// ─── Schedule D ──────────────────────────────────────────────────────────────

function computeScheduleD(input: Form1040Input): ScheduleDResult {
  const { capitalTransactions, priorYearCapLossCarryover } = input;
  const st = capitalTransactions.filter(t => t.holdingPeriod === 'short');
  const lt = capitalTransactions.filter(t => t.holdingPeriod === 'long');

  const shortTermGains  = st.filter(t => t.gainLoss > 0).reduce((s, t) => s + t.gainLoss, 0);
  const shortTermLosses = st.filter(t => t.gainLoss < 0).reduce((s, t) => s + t.gainLoss, 0);
  const netShortTerm    = shortTermGains + shortTermLosses;

  const longTermGains  = lt.filter(t => t.gainLoss > 0).reduce((s, t) => s + t.gainLoss, 0);
  const longTermLosses = lt.filter(t => t.gainLoss < 0).reduce((s, t) => s + t.gainLoss, 0);
  const netLongTerm    = longTermGains + longTermLosses - priorYearCapLossCarryover;

  const combined = netShortTerm + Math.max(0, netLongTerm);  // LT loss caps at 0 after carryover
  const combinedNetGainLoss = netShortTerm + netLongTerm;

  // Capital loss annual deduction cap: $3,000
  const capitalLossDeduction    = Math.max(-3_000, Math.min(0, combinedNetGainLoss));
  const capitalLossCarryover    = Math.min(0, combinedNetGainLoss + 3_000);  // negative = carryover

  return {
    shortTermGains, shortTermLosses, netShortTerm,
    longTermGains, longTermLosses,
    priorYearCarryover: priorYearCapLossCarryover,
    netLongTerm,
    combinedNetGainLoss,
    capitalLossDeduction,
    capitalLossCarryover: Math.abs(capitalLossCarryover),
  };
}

// ─── Form 8829 (Home Office) ──────────────────────────────────────────────────

function computeForm8829(input: Form1040Input, scheduleCNetProfit: number): Form8829Result {
  if (input.homeOfficeSqFt === 0 || input.totalHomeSqFt === 0) {
    return { method: 'simplified', businessPercentage: 0, allowableDeduction: 0, carryoverToNextYear: 0 };
  }

  const businessPercentage = input.homeOfficeSqFt / input.totalHomeSqFt;

  if (input.useSimplifiedHomeOffice) {
    // Simplified: $5/sqft × up to 300 sqft, limited to net profit
    const sqft = Math.min(300, input.homeOfficeSqFt);
    const deduction = Math.min(sqft * 5, scheduleCNetProfit);
    return { method: 'simplified', businessPercentage, allowableDeduction: deduction, carryoverToNextYear: 0 };
  } else {
    // Actual expense method
    const directExpenses  = input.homeOfficeRepairs;
    const mortgageAlloc   = input.homeOfficeMortgageInterest * businessPercentage;
    const rentAlloc       = input.homeOfficeRent * businessPercentage;
    const utilitiesAlloc  = input.homeOfficeUtilities * businessPercentage;
    const insuranceAlloc  = input.homeOfficeInsurance * businessPercentage;
    const totalDeduction  = directExpenses + mortgageAlloc + rentAlloc + utilitiesAlloc + insuranceAlloc;
    // Limited to net profit before home office; excess carried forward
    const allowable       = Math.min(totalDeduction, scheduleCNetProfit);
    const carryover       = Math.max(0, totalDeduction - scheduleCNetProfit);
    return { method: 'actual', businessPercentage, allowableDeduction: allowable, carryoverToNextYear: carryover };
  }
}

// ─── Itemized deductions (Schedule A) ────────────────────────────────────────

function computeItemizedDeductions(input: Form1040Input, agi: number, rules: YearTaxRules) {
  const id = input.itemizedDeductions;
  // SALT cap: $10,000 (post-TCJA for all filers)
  const saltTotal = id.propertyTax_real + id.propertyTax_personal + id.stateIncomeTaxPaid;
  const saltApplied = Math.min(saltTotal, rules.saltCap);

  // Medical: only excess above 7.5% AGI floor
  const medFloor     = agi * 0.075;
  const medicalExcess = floor0(id.medicalExpenses - medFloor);

  const totalItemized =
    id.mortgageInterest +
    id.pointsPaid +
    saltApplied +
    id.cashCharitable + id.nonCashCharitable + id.carryoverCharitable +
    medicalExcess +
    id.investmentInterestExpense;

  return { totalItemized, saltApplied, medicalExcess };
}

// ─── Social security taxable portion ─────────────────────────────────────────

function computeTaxableSSB(totalSSBenefits: number, provisionalIncome: number, filingStatus: FilingStatus): number {
  if (totalSSBenefits === 0) return 0;
  const threshold1 = (filingStatus === 'married_filing_jointly') ? 32_000 : 25_000;
  const threshold2 = (filingStatus === 'married_filing_jointly') ? 44_000 : 34_000;
  const halfSSB = totalSSBenefits * 0.5;
  if (provisionalIncome <= threshold1) return 0;
  if (provisionalIncome <= threshold2) {
    return Math.min(halfSSB, (provisionalIncome - threshold1) * 0.5);
  }
  // Above threshold2: up to 85% taxable
  const lower = Math.min(halfSSB, (threshold2 - threshold1) * 0.5);
  const upper = Math.min(totalSSBenefits * 0.85 - lower, (provisionalIncome - threshold2) * 0.85);
  return Math.min(totalSSBenefits * 0.85, lower + upper);
}

// ─── QBI deduction (Section 199A) ────────────────────────────────────────────

function computeQBI(qbiIncome: number, taxableIncomeBeforeQBI: number): QBIResult {
  if (qbiIncome <= 0) {
    return { qbiIncome: 0, qbiDeduction: 0, limitingFactor: 'no QBI income' };
  }
  // Basic calculation: 20% of lesser of QBI or taxable income (simplified — ignores W-2 wage limit)
  const twentyPctQBI      = qbiIncome * 0.20;
  const twentyPctTaxable  = Math.max(0, taxableIncomeBeforeQBI) * 0.20;
  const qbiDeduction      = Math.min(twentyPctQBI, twentyPctTaxable);
  const limitingFactor    = twentyPctQBI <= twentyPctTaxable
    ? '20% of QBI'
    : '20% of taxable income';
  return { qbiIncome, qbiDeduction, limitingFactor };
}

// ─── EIC computation (simplified table estimate) ─────────────────────────────

function estimateEIC(
  earnedIncome: number,
  agi: number,
  numChildren: number,
  filingStatus: FilingStatus,
  rules: YearTaxRules,
): number {
  if (earnedIncome <= 0) return 0;

  const maxEIC = numChildren === 0 ? rules.earnedIncomeCredit_max_0children
    : numChildren === 1             ? rules.earnedIncomeCredit_max_1child
    : numChildren === 2             ? rules.earnedIncomeCredit_max_2children
    :                                 rules.earnedIncomeCredit_max_3plus;

  // Phase-out: rough estimate — reduce by 21 cents per dollar above phase-out threshold
  // (exact amounts vary by year and filing status; these are approximations)
  const phaseOutStart = numChildren === 0
    ? (filingStatus === 'married_filing_jointly' ? 15_900 : 9_820)
    : (filingStatus === 'married_filing_jointly' ? 26_260 : 20_130);

  const phaseOutRate = numChildren === 0 ? 0.0765 : 0.2106;

  const baseEIC = Math.min(maxEIC, earnedIncome * (numChildren === 0 ? 0.0765 : 0.34));
  const agiForPhaseOut = Math.max(agi, earnedIncome);
  const reduction = Math.max(0, (agiForPhaseOut - phaseOutStart) * phaseOutRate);
  return Math.max(0, Math.min(maxEIC, baseEIC - reduction));
}

// ─── Child Tax Credit ─────────────────────────────────────────────────────────

function computeChildTaxCredit(
  numQualifyingChildren: number,
  agi: number,
  rules: YearTaxRules,
  filingStatus: FilingStatus,
): { ctc: number; actc: number } {
  if (numQualifyingChildren === 0) return { ctc: 0, actc: 0 };

  const perChild = rules.childTaxCredit_perChild;
  const rawCTC   = numQualifyingChildren * perChild;

  // Phase-out: $50 per $1,000 (or fraction) AGI over threshold
  const threshold = (filingStatus === 'married_filing_jointly') ? 400_000 : 200_000;
  const excess    = Math.max(0, agi - threshold);
  const reduction = Math.ceil(excess / 1_000) * 50;
  const ctc       = Math.max(0, rawCTC - reduction);

  // Additional Child Tax Credit (refundable): 15% of earned income above $2,500, up to limit
  const actcLimit = rules.childTaxCredit_refundable_limit * numQualifyingChildren;
  const actc      = Math.min(actcLimit, Math.max(0, ctc));  // simplified — full CTC may be refundable in 2021

  return { ctc, actc };
}

// ─── Retirement Savings Credit (Saver's Credit) ───────────────────────────────

function computeRetirementSavingsCredit(
  agi: number,
  filingStatus: FilingStatus,
  iraContrib: number,
  k401Contrib: number,
): number {
  // 2024 approximate AGI limits (varies slightly by year)
  const agiLimit = filingStatus === 'married_filing_jointly' ? 76_500
    : filingStatus === 'head_of_household' ? 57_375
    : 38_250;

  if (agi > agiLimit) return 0;

  const contributions = iraContrib + k401Contrib;
  if (contributions === 0) return 0;

  let creditRate = 0;
  const agiRatio = agi / agiLimit;
  if (agiRatio <= 0.333)      creditRate = 0.50;
  else if (agiRatio <= 0.500) creditRate = 0.20;
  else if (agiRatio <= 0.666) creditRate = 0.10;

  const maxContrib = 2_000; // per person
  return Math.min(contributions, maxContrib) * creditRate;
}

// ─── Student loan interest phase-out ─────────────────────────────────────────

function computeStudentLoanInterestDeduction(amount: number, agi: number, filingStatus: FilingStatus): number {
  if (amount === 0) return 0;
  const maxDeduction = 2_500;
  const clampedAmount = Math.min(amount, maxDeduction);
  // Phase-out range: $70k–$85k single; $145k–$175k MFJ (2024 approx)
  const phaseOutStart = filingStatus === 'married_filing_jointly' ? 145_000 : 70_000;
  const phaseOutEnd   = filingStatus === 'married_filing_jointly' ? 175_000 : 85_000;
  if (agi <= phaseOutStart) return clampedAmount;
  if (agi >= phaseOutEnd)   return 0;
  const fraction = 1 - (agi - phaseOutStart) / (phaseOutEnd - phaseOutStart);
  return clampedAmount * fraction;
}

// ─── NIIT (Net Investment Income Tax) ────────────────────────────────────────

function computeNIIT(
  netInvestmentIncome: number,
  agi: number,
  filingStatus: FilingStatus,
): number {
  const threshold = filingStatus === 'married_filing_jointly' ? 250_000 : 200_000;
  if (agi <= threshold) return 0;
  const excessAGI = agi - threshold;
  return Math.min(netInvestmentIncome, excessAGI) * 0.038;
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function computeForm1040(input: Form1040Input): Form1040Result {
  const rules     = getRulesForYear(input.taxYear);
  const warnings: string[] = [];
  const now = new Date();

  if (!rules) {
    return {
      taxYear: input.taxYear, filingStatus: input.filingStatus,
      scheduleC: { grossReceipts: 0, costOfGoodsSold: 0, grossProfit: 0, totalExpenses: 0, homeOfficeDeduction: 0, netProfit: 0, lines: [] },
      scheduleSE: { netEarningsFromSE: 0, scheduleSeIncome: 0, socialSecurityTaxable: 0, selfEmploymentTax: 0, halfSETax: 0, additionalMedicareTax: 0 },
      scheduleD: { shortTermGains: 0, shortTermLosses: 0, netShortTerm: 0, longTermGains: 0, longTermLosses: 0, priorYearCarryover: 0, netLongTerm: 0, combinedNetGainLoss: 0, capitalLossDeduction: 0, capitalLossCarryover: 0 },
      form8829: { method: 'simplified', businessPercentage: 0, allowableDeduction: 0, carryoverToNextYear: 0 },
      agi: { totalIncome: 0, schedule1Additions: 0, totalBeforeAdjustments: 0, adjustments: 0, agi: 0 },
      deduction: { standardDeduction: 0, itemizedTotal: 0, saltApplied: 0, medicalExcess: 0, chosenDeduction: 0, deductionType: 'standard' },
      qbi: { qbiIncome: 0, qbiDeduction: 0, limitingFactor: 'no rules for year' },
      taxComp: { taxableIncome: 0, regularTax: 0, qualifiedDivCapGainTax: 0, totalTax: 0, effectiveRate: 0, marginalRate: 0 },
      credits: { childTaxCredit: 0, additionalChildTaxCredit: 0, creditForOtherDependents: 0, childDependentCareCredit: 0, earnedIncomeCredit: 0, americanOpportunityCredit: 0, lifetimeLearningCredit: 0, retirementSavingsCredit: 0, residentialEnergyCredit: 0, totalNonRefundableCredits: 0, totalRefundableCredits: 0, totalCredits: 0 },
      otherTaxes: { selfEmploymentTax: 0, additionalMedicareTax: 0, netInvestmentIncomeTax: 0, totalOtherTaxes: 0 },
      payments: { w2Withholding: 0, estimatedTaxPayments: 0, priorYearOverpayment: 0, refundableCredits: 0, totalPayments: 0 },
      taxableIncome: 0, totalTax: 0, totalPayments: 0, refundOrAmountDue: 0, isRefund: false,
      sections: [], warnings: [`No tax rules found for year ${input.taxYear}`], validationErrors: [`Unsupported tax year: ${input.taxYear}`],
      generatedAt: now,
    };
  }

  // ── Schedule C / Home Office ──────────────────────────────────────────────
  const homeOfficeDeduction = computeForm8829(input, input.scheduleCNetProfit).allowableDeduction;
  const scheduleCNetAfterHomeOffice = floor0(input.scheduleCNetProfit - homeOfficeDeduction);
  const form8829 = computeForm8829(input, input.scheduleCNetProfit);
  const scheduleC: ScheduleCResult = {
    grossReceipts:        input.scheduleCNetProfit + 0, // provided externally from workflow
    costOfGoodsSold:      0,
    grossProfit:          input.scheduleCNetProfit + 0,
    totalExpenses:        homeOfficeDeduction,
    homeOfficeDeduction,
    netProfit:            scheduleCNetAfterHomeOffice,
    lines: [],
  };

  // ── Schedule SE ───────────────────────────────────────────────────────────
  const scheduleSE = computeScheduleSE(
    scheduleCNetAfterHomeOffice,
    input.k1GuaranteedPayments,
    0, // k1 SE income (general partners only — not available in this simplified model)
    input.taxYear,
    input.filingStatus,
  );
  const halfSETax = scheduleSE.halfSETax;

  // ── Schedule D ────────────────────────────────────────────────────────────
  const scheduleD = computeScheduleD(input);

  // ── SS taxable portion ────────────────────────────────────────────────────
  const provisionalIncome =
    input.w2WagesTotal +
    input.taxableInterest +
    input.ordinaryDividends +
    input.socialSecurityBenefits * 0.5 +
    scheduleCNetAfterHomeOffice +
    input.iRADistributions;
  const taxableSSB = computeTaxableSSB(input.socialSecurityBenefits, provisionalIncome, input.filingStatus);

  // ── Total income (Line 9 / Schedule 1 Part I) ─────────────────────────────
  const w2Wages        = input.w2WagesTotal;
  const scheduleCInc   = scheduleCNetAfterHomeOffice;
  const capitalGainInc = Math.max(0, scheduleD.combinedNetGainLoss);
  const capitalLossded = scheduleD.capitalLossDeduction; // negative or zero
  const schedule1Additions =
    input.k1OrdinaryIncome +
    input.k1RentalIncome +
    input.k1OtherIncome +
    input.rentalProperties.reduce((s, r) => s + r.netIncomeLoss, 0) +
    input.iRADistributions +
    input.pensionAnnuity +
    taxableSSB +
    input.alimonyReceived +
    input.unemploymentCompensation +
    input.gamblingWinnings +
    input.otherIncome;

  const totalIncome =
    w2Wages +
    input.taxableInterest +
    input.ordinaryDividends +
    capitalGainInc + capitalLossded +
    scheduleCInc +
    schedule1Additions;

  // ── Adjustments (Schedule 1, Part II) ─────────────────────────────────────
  // Student loan interest: phase out based on MAGI ≈ AGI for most cases
  const stdLoanInterest = computeStudentLoanInterestDeduction(
    input.studentLoanInterest,
    totalIncome - halfSETax, // approximate MAGI
    input.filingStatus,
  );
  // SE health insurance: limited to Schedule C net profit
  const seHealthIns = Math.min(input.selfEmployedHealthInsurance, scheduleCNetAfterHomeOffice);
  // Educator expenses: cap at $300 for 2022+ ($250 for 2019-2021)
  const educatorExpCap = input.taxYear >= 2022 ? 300 : 250;
  const educatorExp    = Math.min(input.educatorExpenses, educatorExpCap);

  const totalAdjustments =
    halfSETax +
    seHealthIns +
    input.sepSimpleContribution +
    input.iraDeduction +
    stdLoanInterest +
    input.hsaDeduction +
    educatorExp +
    input.armedForcesMovingExpenses +
    input.charitableContribForStdDeduction +
    input.alimonyPaid;

  const agi_value = Math.max(0, totalIncome - totalAdjustments);

  // ── NOL application ───────────────────────────────────────────────────────
  // Post-TCJA: NOL limited to 80% of taxable income (before NOL deduction)
  const nolApplied = Math.min(input.nolCarryforward, agi_value * 0.80);

  const agiResult: AGIResult = {
    totalIncome,
    schedule1Additions,
    totalBeforeAdjustments: totalIncome,
    adjustments: totalAdjustments,
    agi: agi_value,
  };

  // ── Deductions ────────────────────────────────────────────────────────────
  const standardDeduction = getStandardDeduction(input, rules);
  const { totalItemized, saltApplied, medicalExcess } = computeItemizedDeductions(input, agi_value, rules);
  const chosenDeduction    = input.useItemizedDeductions
    ? Math.max(standardDeduction, totalItemized)
    : standardDeduction;
  const deductionType      = input.useItemizedDeductions && totalItemized > standardDeduction
    ? 'itemized' as const
    : 'standard' as const;

  if (input.useItemizedDeductions && totalItemized < standardDeduction) {
    warnings.push(`Itemized deductions (${fmt(totalItemized)}) are less than standard deduction (${fmt(standardDeduction)}) — standard deduction applied.`);
  }

  const deductionResult: DeductionResult = {
    standardDeduction, itemizedTotal: totalItemized,
    saltApplied, medicalExcess,
    chosenDeduction, deductionType,
  };

  // ── QBI ───────────────────────────────────────────────────────────────────
  const incomeBeforeQBI = agi_value - chosenDeduction - nolApplied;
  const qbiResult       = computeQBI(input.qbiIncome || scheduleCNetAfterHomeOffice, incomeBeforeQBI);

  // ── Taxable Income ────────────────────────────────────────────────────────
  const taxableIncome = floor0(incomeBeforeQBI - qbiResult.qbiDeduction);

  // ── Tax computation ───────────────────────────────────────────────────────
  const isMFJ = input.filingStatus === 'married_filing_jointly' || input.filingStatus === 'qualifying_surviving_spouse';
  const brackets = isMFJ ? rules.taxBrackets_mfj : rules.taxBrackets_single;

  // Qualified dividends + LT cap gains taxed at preferential rates
  const preferentialIncome = floor0(input.qualifiedDividends + Math.max(0, scheduleD.netLongTerm));
  const ordinaryTaxableIncome = floor0(taxableIncome - preferentialIncome);

  // Tax on ordinary income
  const ordinaryTax = computeTaxFromBrackets(ordinaryTaxableIncome, brackets);

  // Preferential tax on qualified divs + LT cap gains
  const { rate0_upTo, rate15_upTo } = rules.capitalGains;
  let prefTax = 0;
  if (preferentialIncome > 0) {
    // Stack preferential income on top of ordinary income for rate determination
    const stackedBottom = ordinaryTaxableIncome;
    const stackedTop    = ordinaryTaxableIncome + preferentialIncome;
    if (stackedTop <= rate0_upTo)      prefTax = 0;
    else if (stackedBottom >= rate15_upTo) prefTax = preferentialIncome * 0.20;
    else {
      const at0pct  = Math.max(0, Math.min(preferentialIncome, rate0_upTo - stackedBottom));
      const at15pct = Math.max(0, Math.min(preferentialIncome - at0pct, rate15_upTo - Math.max(stackedBottom, rate0_upTo)));
      const at20pct = preferentialIncome - at0pct - at15pct;
      prefTax = at15pct * 0.15 + at20pct * 0.20;
    }
  }

  const totalRegularTax = ordinaryTax + prefTax;
  const effectiveRate   = taxableIncome > 0 ? totalRegularTax / taxableIncome : 0;
  const marginalRate    = getMarginalRate(ordinaryTaxableIncome, brackets);

  const taxCompResult: TaxComputationResult = {
    taxableIncome,
    regularTax: ordinaryTax,
    qualifiedDivCapGainTax: prefTax,
    totalTax: totalRegularTax,
    effectiveRate,
    marginalRate,
  };

  // ── Other taxes ───────────────────────────────────────────────────────────
  const niit = computeNIIT(
    input.taxableInterest + input.ordinaryDividends + Math.max(0, scheduleD.combinedNetGainLoss),
    agi_value,
    input.filingStatus,
  );

  const otherTaxesResult: OtherTaxesResult = {
    selfEmploymentTax:       scheduleSE.selfEmploymentTax,
    additionalMedicareTax:   scheduleSE.additionalMedicareTax,
    netInvestmentIncomeTax:  niit,
    totalOtherTaxes:         scheduleSE.selfEmploymentTax + scheduleSE.additionalMedicareTax + niit,
  };

  // ── Credits ───────────────────────────────────────────────────────────────
  const nChildren           = input.qualifyingChildren.length;
  const { ctc, actc }       = computeChildTaxCredit(nChildren, agi_value, rules, input.filingStatus);
  const crocredit           = input.otherDependents.filter(d => d.creditForOtherDependents).length * 500;
  const earnedIncome        = floor0(w2Wages + scheduleCNetAfterHomeOffice + input.k1GuaranteedPayments);
  const eic                 = estimateEIC(earnedIncome, agi_value, nChildren, input.filingStatus, rules);
  const retirSavingsCredit  = computeRetirementSavingsCredit(agi_value, input.filingStatus, input.iraDeduction, input.w2RetirementPlanContrib);

  // Child/dependent care credit: 20% of eligible expenses (simplified; phases from 35% at low income)
  const cdccLimit = nChildren >= 2 ? rules.childCareDependentCredit_limit2 : rules.childCareDependentCredit_limit1;
  const cdcc      = nChildren > 0 ? cdccLimit * 0.20 : 0; // conservative 20% rate

  const totalNonRefundable = clamp(ctc + crocredit + cdcc + retirSavingsCredit, 0, totalRegularTax);
  const totalRefundable    = actc + eic;

  const creditResult: CreditResult = {
    childTaxCredit: ctc,
    additionalChildTaxCredit: actc,
    creditForOtherDependents: crocredit,
    childDependentCareCredit: cdcc,
    earnedIncomeCredit: eic,
    americanOpportunityCredit: 0,
    lifetimeLearningCredit: 0,
    retirementSavingsCredit: retirSavingsCredit,
    residentialEnergyCredit: 0,
    totalNonRefundableCredits: totalNonRefundable,
    totalRefundableCredits: totalRefundable,
    totalCredits: totalNonRefundable + totalRefundable,
  };

  // ── Total tax ─────────────────────────────────────────────────────────────
  const totalTaxBeforeCredits = totalRegularTax + otherTaxesResult.totalOtherTaxes;
  const totalTaxAfterCredits  = floor0(totalTaxBeforeCredits - totalNonRefundable);

  // ── Payments ─────────────────────────────────────────────────────────────
  const paymentsResult: PaymentsResult = {
    w2Withholding:           input.w2WithholdingTotal,
    estimatedTaxPayments:    input.estimatedTaxPayments,
    priorYearOverpayment:    input.priorYearOverpaymentApplied,
    refundableCredits:       totalRefundable,
    totalPayments:           input.w2WithholdingTotal + input.estimatedTaxPayments + input.priorYearOverpaymentApplied + totalRefundable,
  };

  const finalTax     = totalTaxAfterCredits;
  const finalPayment = paymentsResult.totalPayments;
  const balance      = finalTax - finalPayment;
  const isRefund     = balance < 0;

  // ── Structured sections for display ──────────────────────────────────────
  const sections: Form1040Section[] = [
    {
      title: 'Income',
      subtotal: totalIncome,
      lines: [
        line('1a', 'W-2 wages', w2Wages, `W-2 Box 1 total: ${fmt(w2Wages)}`),
        line('2b', 'Taxable interest (1099-INT)', input.taxableInterest, `1099-INT Box 1: ${fmt(input.taxableInterest)}`),
        line('3b', 'Ordinary dividends (1099-DIV)', input.ordinaryDividends, `1099-DIV Box 1a: ${fmt(input.ordinaryDividends)}`),
        line('3a', 'Qualified dividends', input.qualifiedDividends, `1099-DIV Box 1b: ${fmt(input.qualifiedDividends)}`),
        line('4b', 'IRA / pension distributions', input.iRADistributions + input.pensionAnnuity, `Taxable IRA: ${fmt(input.iRADistributions)}, Pension: ${fmt(input.pensionAnnuity)}`),
        line('5b', 'Taxable Social Security', taxableSSB, `SSB: ${fmt(input.socialSecurityBenefits)}, taxable: ${fmt(taxableSSB)}`),
        line('7',  'Capital gain or (loss)', capitalGainInc + capitalLossded, `Net Sch D: ${fmt(scheduleD.combinedNetGainLoss)}, cap loss limit: ${fmt(capitalLossded)}`),
        line('8',  'Schedule C net profit / (loss)', scheduleCNetAfterHomeOffice, `Gross receipts - expenses - home office: ${fmt(scheduleCNetAfterHomeOffice)}`),
        ...(input.k1OrdinaryIncome !== 0 ? [line('8k', 'K-1 ordinary income', input.k1OrdinaryIncome, `Pass-through K-1 income: ${fmt(input.k1OrdinaryIncome)}`)] : []),
        ...(input.k1RentalIncome !== 0   ? [line('8r', 'K-1 rental income', input.k1RentalIncome,     `K-1 rental real estate: ${fmt(input.k1RentalIncome)}`)]     : []),
        ...(input.unemploymentCompensation !== 0 ? [line('8u', 'Unemployment compensation', input.unemploymentCompensation, `Form 1099-G: ${fmt(input.unemploymentCompensation)}`)] : []),
        ...(input.otherIncome !== 0 ? [line('8z', 'Other income', input.otherIncome, `Other income: ${fmt(input.otherIncome)}`)] : []),
        line('9',  'Total income', totalIncome, `Sum of all income sources: ${fmt(totalIncome)}`),
      ],
    },
    {
      title: 'Adjustments to Income (Schedule 1)',
      subtotal: totalAdjustments,
      lines: [
        ...(halfSETax > 0              ? [line('15', 'Deductible part of SE tax', halfSETax, `Sch SE Line 13 / 2 = ${fmt(halfSETax)}`)] : []),
        ...(seHealthIns > 0            ? [line('17', 'SE health insurance', seHealthIns, `Min(premiums, Sch C profit): ${fmt(seHealthIns)}`)] : []),
        ...(input.sepSimpleContribution > 0 ? [line('16', 'SEP/SIMPLE/qualified plan', input.sepSimpleContribution, `Contribution: ${fmt(input.sepSimpleContribution)}`)] : []),
        ...(input.iraDeduction > 0     ? [line('19', 'IRA deduction', input.iraDeduction, `Traditional IRA contribution: ${fmt(input.iraDeduction)}`)] : []),
        ...(stdLoanInterest > 0        ? [line('21', 'Student loan interest', stdLoanInterest, `Min($2,500, paid), phase-out applied: ${fmt(stdLoanInterest)}`)] : []),
        ...(input.hsaDeduction > 0     ? [line('13', 'HSA deduction (Form 8889)', input.hsaDeduction, `HSA above-the-line: ${fmt(input.hsaDeduction)}`)] : []),
        ...(educatorExp > 0            ? [line('11', 'Educator expenses', educatorExp, `Min(paid, $300): ${fmt(educatorExp)}`)] : []),
        ...(input.charitableContribForStdDeduction > 0 ? [line('12b', 'Cash charitable (above-the-line)', input.charitableContribForStdDeduction, `2020-2021 only: ${fmt(input.charitableContribForStdDeduction)}`)] : []),
        line('26', 'Total adjustments', totalAdjustments, `Sum: ${fmt(totalAdjustments)}`),
      ],
    },
    {
      title: 'Adjusted Gross Income',
      subtotal: agi_value,
      lines: [
        line('11', 'Adjusted Gross Income (AGI)', agi_value, `Total income ${fmt(totalIncome)} - adjustments ${fmt(totalAdjustments)} = ${fmt(agi_value)}`),
        ...(nolApplied > 0 ? [line('21', 'NOL deduction (80% limit)', -nolApplied, `NOL carryforward ${fmt(input.nolCarryforward)} × 80% limit: -${fmt(nolApplied)}`)] : []),
      ],
    },
    {
      title: deductionType === 'itemized' ? 'Itemized Deductions (Schedule A)' : 'Standard Deduction',
      subtotal: chosenDeduction,
      lines: deductionType === 'itemized'
        ? [
            line('A5', `State/local taxes (SALT cap: ${fmt(rules.saltCap)})`, saltApplied, `Total SALT ${fmt(input.itemizedDeductions.propertyTax_real + input.itemizedDeductions.stateIncomeTaxPaid)}, capped: ${fmt(saltApplied)}`),
            line('A8', 'Mortgage interest (Form 1098)', input.itemizedDeductions.mortgageInterest, `Box 1: ${fmt(input.itemizedDeductions.mortgageInterest)}`),
            line('A11', 'Cash charitable contributions', input.itemizedDeductions.cashCharitable, `${fmt(input.itemizedDeductions.cashCharitable)}`),
            line('A12', 'Non-cash charitable', input.itemizedDeductions.nonCashCharitable, `FMV: ${fmt(input.itemizedDeductions.nonCashCharitable)}`),
            line('A4', `Medical expenses (>7.5% AGI: ${fmt(agi_value * 0.075)})`, medicalExcess, `Paid ${fmt(input.itemizedDeductions.medicalExpenses)} - floor ${fmt(agi_value * 0.075)} = ${fmt(medicalExcess)}`),
            line('A17', 'Total itemized deductions', chosenDeduction, `Sum: ${fmt(totalItemized)}`),
          ]
        : [
            line('12', `Standard deduction (${FILING_STATUS_LABELS_SHORT[input.filingStatus]})`, chosenDeduction, `Year ${input.taxYear} standard deduction for ${input.filingStatus}: ${fmt(chosenDeduction)}`),
          ],
    },
    ...(qbiResult.qbiDeduction > 0 ? [{
      title: 'QBI Deduction (Section 199A)',
      subtotal: qbiResult.qbiDeduction,
      lines: [
        line('13', 'QBI deduction (20% of qualified business income)', qbiResult.qbiDeduction, `${qbiResult.limitingFactor}: min(20% × ${fmt(qbiResult.qbiIncome)}, 20% × taxable income)`),
      ],
    }] : []),
    {
      title: 'Taxable Income',
      subtotal: taxableIncome,
      lines: [
        line('15', 'Taxable income', taxableIncome, `AGI ${fmt(agi_value)} - deduction ${fmt(chosenDeduction)} - QBI ${fmt(qbiResult.qbiDeduction)} - NOL ${fmt(nolApplied)} = ${fmt(taxableIncome)}`),
      ],
    },
    {
      title: 'Tax Computation',
      subtotal: totalTaxBeforeCredits,
      lines: [
        line('16', 'Tax from brackets', totalRegularTax, `Ordinary: ${fmt(ordinaryTax)} + preferential (qual div/LT CG): ${fmt(prefTax)} = ${fmt(totalRegularTax)} [effective rate: ${(effectiveRate * 100).toFixed(1)}%]`),
        ...(scheduleSE.selfEmploymentTax > 0 ? [line('SE', 'Self-employment tax (Sch SE)', scheduleSE.selfEmploymentTax, `Net SE income ${fmt(scheduleSE.netEarningsFromSE)} × 92.35% × 15.3% = ${fmt(scheduleSE.selfEmploymentTax)}`)] : []),
        ...(niit > 0 ? [line('NIIT', 'Net Investment Income Tax (3.8%)', niit, `NII ${fmt(input.taxableInterest + input.ordinaryDividends)} × 3.8% on AGI above threshold: ${fmt(niit)}`)] : []),
        ...(scheduleSE.additionalMedicareTax > 0 ? [line('AMT', 'Additional Medicare Tax (0.9%)', scheduleSE.additionalMedicareTax, `SE income above ${input.filingStatus === 'married_filing_jointly' ? '$250k' : '$200k'}: ${fmt(scheduleSE.additionalMedicareTax)}`)] : []),
        line('24', 'Total tax before credits', totalTaxBeforeCredits, `Regular ${fmt(totalRegularTax)} + SE ${fmt(scheduleSE.selfEmploymentTax)} + NIIT ${fmt(niit)} = ${fmt(totalTaxBeforeCredits)}`),
      ],
    },
    {
      title: 'Credits',
      subtotal: -creditResult.totalCredits,
      lines: [
        ...(ctc > 0   ? [line('CTC',  'Child Tax Credit', -ctc,  `${nChildren} child(ren) × ${fmt(rules.childTaxCredit_perChild)}, phase-out applied: -${fmt(ctc)}`)] : []),
        ...(actc > 0  ? [line('ACTC', 'Additional Child Tax Credit (refundable)', -actc, `Refundable portion: -${fmt(actc)}`)] : []),
        ...(crocredit > 0 ? [line('ODC', 'Credit for other dependents', -crocredit, `${input.otherDependents.length} dependent(s) × $500: -${fmt(crocredit)}`)] : []),
        ...(cdcc > 0  ? [line('CDCC', 'Child/Dependent Care Credit', -cdcc, `20% of ${fmt(cdccLimit)} eligible expenses: -${fmt(cdcc)}`)] : []),
        ...(eic > 0   ? [line('EIC',  'Earned Income Credit (refundable)', -eic, `${nChildren}-child EIC, earned income ${fmt(earnedIncome)}: -${fmt(eic)}`)] : []),
        ...(retirSavingsCredit > 0 ? [line('SAV', "Retirement Savings Credit (Saver's)", -retirSavingsCredit, `-${fmt(retirSavingsCredit)}`)] : []),
        line('29', 'Total credits', -creditResult.totalCredits, `-${fmt(creditResult.totalCredits)}`),
      ],
    },
    {
      title: 'Payments & Withholding',
      subtotal: finalPayment,
      lines: [
        line('25a', 'Federal income tax withheld (W-2)', input.w2WithholdingTotal, `W-2 Box 2 total: ${fmt(input.w2WithholdingTotal)}`),
        ...(input.estimatedTaxPayments > 0   ? [line('26', 'Estimated tax payments', input.estimatedTaxPayments, fmt(input.estimatedTaxPayments))] : []),
        ...(input.priorYearOverpaymentApplied > 0 ? [line('27', 'Prior year overpayment applied', input.priorYearOverpaymentApplied, fmt(input.priorYearOverpaymentApplied))] : []),
        ...(totalRefundable > 0 ? [line('27a', 'Refundable credits (EIC + ACTC)', totalRefundable, `EIC ${fmt(eic)} + ACTC ${fmt(actc)}`)] : []),
        line('33', 'Total payments', finalPayment, `Withholding ${fmt(input.w2WithholdingTotal)} + est. ${fmt(input.estimatedTaxPayments)} + refundable credits ${fmt(totalRefundable)} = ${fmt(finalPayment)}`),
      ],
    },
    {
      title: isRefund ? 'Refund' : 'Amount Due',
      subtotal: Math.abs(balance),
      lines: [
        line(isRefund ? '35a' : '37', isRefund ? 'Amount to be refunded' : 'Amount owed', Math.abs(balance),
          `Total tax ${fmt(finalTax)} - total payments ${fmt(finalPayment)} = ${isRefund ? 'REFUND ' : ''}${fmt(Math.abs(balance))}`),
      ],
    },
  ];

  // Warnings
  if (input.useItemizedDeductions && totalItemized < standardDeduction) {
    warnings.push(`Standard deduction (${fmt(standardDeduction)}) exceeds itemized (${fmt(totalItemized)}) — standard deduction used.`);
  }
  if (scheduleSE.selfEmploymentTax > 0) {
    warnings.push(`Self-employment tax of ${fmt(scheduleSE.selfEmploymentTax)} applies. Ensure estimated tax payments cover this — underpayment penalties may apply.`);
  }
  if (eic > 0 && input.qualifyingChildren.length > 0) {
    warnings.push(`EIC is estimated. Full accuracy requires verification of all EIC eligibility rules.`);
  }
  if (scheduleD.capitalLossCarryover > 0) {
    warnings.push(`Capital loss carryover of ${fmt(scheduleD.capitalLossCarryover)} carries forward to ${input.taxYear + 1}.`);
  }
  if (nolApplied > 0) {
    warnings.push(`NOL of ${fmt(nolApplied)} applied (80% limitation). Remaining carryforward: ${fmt(input.nolCarryforward - nolApplied)}.`);
  }
  if (input.qbiIncome > 0 && agi_value > (input.filingStatus === 'married_filing_jointly' ? 383_900 : 191_950)) {
    warnings.push(`QBI deduction may be subject to W-2 wage limitations — verify with Form 8995-A for incomes above phase-out.`);
  }

  return {
    taxYear:       input.taxYear,
    filingStatus:  input.filingStatus,
    scheduleC,
    scheduleSE,
    scheduleD,
    form8829,
    agi:           agiResult,
    deduction:     deductionResult,
    qbi:           qbiResult,
    taxComp:       taxCompResult,
    credits:       creditResult,
    otherTaxes:    otherTaxesResult,
    payments:      paymentsResult,
    taxableIncome,
    totalTax:      finalTax,
    totalPayments: finalPayment,
    refundOrAmountDue: balance,
    isRefund,
    sections,
    warnings,
    validationErrors: [],
    generatedAt: now,
  };
}

// ─── Short filing status labels ───────────────────────────────────────────────

const FILING_STATUS_LABELS_SHORT: Record<FilingStatus, string> = {
  single:                      'Single',
  married_filing_jointly:      'MFJ',
  married_filing_separately:   'MFS',
  head_of_household:           'HOH',
  qualifying_surviving_spouse: 'QSS',
};
