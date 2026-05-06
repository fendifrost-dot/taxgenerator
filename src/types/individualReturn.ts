import type { EntityReturnInput, EntityReturnSummary } from '@/types/businessEntity';

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';

export interface IndividualReturnInput {
  taxpayerName: string;
  taxpayerSSN: string;
  spouseName?: string;
  spouseSSN?: string;
  filingStatus: FilingStatus;
  homeAddress: string;
  homeCityStateZip: string;
  occupation?: string;
  dependents?: number;

  scheduleC?: EntityReturnInput;
  scheduleCSummary?: EntityReturnSummary;

  w2Wages?: number;
  taxableInterest?: number;
  ordinaryDividends?: number;
  estimatedPaymentsMade?: number;
  federalWithholding?: number;

  taxYear: 2024 | 2025;
}

/** Aggregates returned by computeIndividualReturn() — mirrors Form 1040 / Sch 1–2 / SE / 8959 wiring */
export interface IndividualReturnSummary {
  scheduleCNetProfit: number;
  seEarnings: number;
  ssTax: number;
  medicareTax: number;
  seTotalTax: number;
  halfSEDeduction: number;
  additionalMedicareTax: number;
  agi: number;
  standardDeduction: number;
  qbiDeduction: number;
  taxableIncome: number;
  federalIncomeTax: number;
  schedule2Total: number;
  totalTax: number;
  totalPayments: number;
  amountOwed: number;
  form1040: {
    w2Wages: number;
    line1z: number;
    line2b: number;
    line3a: number;
    line3b: number;
    line4b: number;
    line5b: number;
    line6aGross: number;
    line6bTaxable: number;
    line7: number;
    line8: number;
    line8z: number;
    line9: number;
    line10: number;
    line11: number;
    line12: number;
    line13: number;
    line14: number;
    line15: number;
    line16: number;
    line17sched2line3: number;
    line23sched2line21: number;
    line24: number;
    line25a: number;
    line25d: number;
    line26: number;
    line33: number;
    line34: number;
    line37: number;
  };
}
