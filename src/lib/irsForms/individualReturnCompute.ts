import type { IndividualReturnInput, IndividualReturnSummary } from '@/types/individualReturn';
import { computeForm1040, computeTaxableSSB } from '@/lib/form1040Engine';
import type { Form1040Input, FilingStatus as EngineFilingStatus } from '@/types/form1040';

function mapFilingStatus(s: IndividualReturnInput['filingStatus']): EngineFilingStatus {
  switch (s) {
    case 'single':
      return 'single';
    case 'mfj':
      return 'married_filing_jointly';
    case 'mfs':
      return 'married_filing_separately';
    case 'hoh':
      return 'head_of_household';
    case 'qss':
      return 'qualifying_surviving_spouse';
    default:
      return 'single';
  }
}

/** Deterministic 1040 outcome for Schedule C sole proprietor packets (uses form1040Engine). */
export function computeIndividualReturn(input: IndividualReturnInput): IndividualReturnSummary {
  const net = input.scheduleCSummary?.ordinaryBusinessIncome ?? 0;

  const base: Form1040Input = {
    taxYear: input.taxYear,
    filingStatus: mapFilingStatus(input.filingStatus),
    taxpayerAge: 40,
    taxpayerBlind: false,
    qualifyingChildren: [],
    otherDependents: [],
    w2WagesTotal: input.w2Wages ?? 0,
    w2WithholdingTotal: input.federalWithholding ?? 0,
    w2StateWithholdingTotal: 0,
    w2RetirementPlanContrib: 0,
    taxableInterest: input.taxableInterest ?? 0,
    taxExemptInterest: 0,
    ordinaryDividends: input.ordinaryDividends ?? 0,
    qualifiedDividends: 0,
    k1OrdinaryIncome: 0,
    k1GuaranteedPayments: 0,
    k1RentalIncome: 0,
    k1OtherIncome: 0,
    scheduleCNetProfit: net,
    capitalTransactions: [],
    priorYearCapLossCarryover: 0,
    rentalProperties: [],
    iRADistributions: 0,
    pensionAnnuity: 0,
    socialSecurityBenefits: 0,
    alimonyReceived: 0,
    gamblingWinnings: 0,
    otherIncome: 0,
    unemploymentCompensation: 0,
    educatorExpenses: 0,
    studentLoanInterest: 0,
    alimonyPaid: 0,
    iraDeduction: 0,
    sepSimpleContribution: 0,
    selfEmployedHealthInsurance: 0,
    halfSETax: 0,
    hsaDeduction: 0,
    armedForcesMovingExpenses: 0,
    charitableContribForStdDeduction: 0,
    homeOfficeSqFt: 0,
    totalHomeSqFt: 0,
    homeOfficeMortgageInterest: 0,
    homeOfficeRent: 0,
    homeOfficeUtilities: 0,
    homeOfficeInsurance: 0,
    homeOfficeRepairs: 0,
    useSimplifiedHomeOffice: true,
    useItemizedDeductions: false,
    itemizedDeductions: {
      mortgageInterest: 0,
      pointsPaid: 0,
      mortgageInsurancePremiums: 0,
      propertyTax_real: 0,
      propertyTax_personal: 0,
      stateIncomeTaxPaid: 0,
      foreignTaxesPaid: 0,
      cashCharitable: 0,
      nonCashCharitable: 0,
      carryoverCharitable: 0,
      medicalExpenses: 0,
      investmentInterestExpense: 0,
      miscellaneous: 0,
    },
    qbiIncome: net,
    estimatedTaxPayments: input.estimatedPaymentsMade ?? 0,
    priorYearOverpaymentApplied: 0,
    nolCarryforward: 0,
  };

  const r = computeForm1040(base);

  const ssWageBase = input.taxYear === 2025 ? 176_100 : 168_600;
  const seInc = r.scheduleSE.scheduleSeIncome;
  const ssTax = Math.round(Math.min(seInc, ssWageBase) * 0.124);
  const medicareTax = Math.round(seInc * 0.029);

  const schCNetAfterHo = r.scheduleC.netProfit;
  const w2 = base.w2WagesTotal;
  const scheduleCInc = schCNetAfterHo;
  const capitalGainInc = Math.max(0, r.scheduleD.combinedNetGainLoss);
  const capitalLossDed = r.scheduleD.capitalLossDeduction;
  const taxableSSB = computeTaxableSSB(
    base.socialSecurityBenefits,
    w2 +
      base.taxableInterest +
      base.ordinaryDividends +
      base.socialSecurityBenefits * 0.5 +
      scheduleCInc +
      base.iRADistributions,
    mapFilingStatus(input.filingStatus),
  );
  const schedule1Additions =
    base.k1OrdinaryIncome +
    base.k1RentalIncome +
    base.k1OtherIncome +
    base.rentalProperties.reduce((s, x) => s + x.netIncomeLoss, 0) +
    base.iRADistributions +
    base.pensionAnnuity +
    taxableSSB +
    base.alimonyReceived +
    base.unemploymentCompensation +
    base.gamblingWinnings +
    base.otherIncome;

  const totalIncome =
    w2 +
    base.taxableInterest +
    base.ordinaryDividends +
    capitalGainInc +
    capitalLossDed +
    scheduleCInc +
    schedule1Additions;

  const totalAdjustments = r.agi.adjustments;

  const line25d = base.w2WithholdingTotal;
  const line26 = base.estimatedTaxPayments;
  const line33 = line25d + line26 + r.credits.totalRefundableCredits;
  const line34 = Math.max(0, line33 - r.totalTax);

  return {
    scheduleCNetProfit: net,
    seEarnings: seInc,
    ssTax,
    medicareTax,
    seTotalTax: r.scheduleSE.selfEmploymentTax,
    halfSEDeduction: r.scheduleSE.halfSETax,
    additionalMedicareTax: r.scheduleSE.additionalMedicareTax,
    agi: r.agi.agi,
    standardDeduction: r.deduction.standardDeduction,
    qbiDeduction: r.qbi.qbiDeduction,
    taxableIncome: r.taxableIncome,
    federalIncomeTax: r.taxComp.totalTax,
    schedule2Total:
      r.otherTaxes.selfEmploymentTax + r.otherTaxes.additionalMedicareTax + r.otherTaxes.netInvestmentIncomeTax,
    totalTax: r.totalTax,
    totalPayments: r.totalPayments,
    amountOwed: Math.max(0, r.refundOrAmountDue),
    form1040: {
      w2Wages: w2,
      line1z: w2,
      line2b: base.taxableInterest,
      line3a: base.qualifiedDividends,
      line3b: base.ordinaryDividends,
      line4b: base.iRADistributions + base.pensionAnnuity,
      line5b: taxableSSB,
      line6aGross: base.socialSecurityBenefits,
      line6bTaxable: taxableSSB,
      line7: capitalGainInc + capitalLossDed,
      line8: scheduleCInc,
      line8z: schedule1Additions,
      line9: totalIncome,
      line10: totalAdjustments,
      line11: r.agi.agi,
      line12: r.deduction.chosenDeduction,
      line13: r.qbi.qbiDeduction,
      line14: r.taxableIncome,
      line15: r.taxableIncome,
      line16: r.taxComp.totalTax,
      line17sched2line3: 0,
      line23sched2line21:
        r.otherTaxes.selfEmploymentTax + r.otherTaxes.additionalMedicareTax + r.otherTaxes.netInvestmentIncomeTax,
      line24: r.totalTax,
      line25a: line25d,
      line25d,
      line26,
      line33,
      line34,
      line37: Math.max(0, r.refundOrAmountDue),
    },
  };
}
