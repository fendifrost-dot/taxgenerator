/**
 * estimatedTaxEngine.ts
 *
 * Calculates Form 1040-ES quarterly estimated tax payments.
 *
 * Safe Harbor Rules (IRC §6654):
 *   • 100% of prior year tax liability (if prior year AGI ≤ $150,000)
 *   • 110% of prior year tax liability (if prior year AGI > $150,000)
 *   • 90% of current year actual liability
 *   The required annual payment is the LESSER of the two applicable safe-harbor amounts.
 *   To avoid underpayment penalty, pay the lesser amount in equal quarterly installments.
 *
 * Annualized Income Installment Method (Form 2210-AI) is NOT computed here
 * (too complex for estimates — flag for preparer attention when income is lumpy).
 *
 * TY2025 due dates:
 *   Q1: April 15, 2025
 *   Q2: June 16, 2025
 *   Q3: September 15, 2025
 *   Q4: January 15, 2026
 *
 * Sources: IRS Pub 505, IRC §6654, Rev. Proc. 2024-40 (TY2025 thresholds).
 */

export interface EstimatedTaxInput {
  taxYear: number;                    // Current tax year (year being planned)

  // Current year projected figures (may be partial/estimated)
  projectedAGI: number;
  projectedTaxableIncome: number;
  projectedTaxLiability: number;      // Before withholding and estimated payments
  projectedW2Withholding: number;     // Federal withholding from paychecks expected this year
  projectedSelfEmploymentIncome: number; // Net SE income for SE tax computation

  // Prior year actuals (from prior 1040)
  priorYearAGI: number;
  priorYearTaxLiability: number;      // Total tax from prior year Form 1040 line 24

  // Payments already made this year
  q1PaidAlready: number;
  q2PaidAlready: number;
  q3PaidAlready: number;
  q4PaidAlready: number;
}

export interface QuarterlyPayment {
  quarter: 1 | 2 | 3 | 4;
  label: string;
  dueDate: string;
  requiredPayment: number;     // Required for this quarter under safe harbor
  alreadyPaid: number;
  balanceDue: number;          // Max(0, required - paid)
  isOverpaid: boolean;
}

export interface EstimatedTaxResult {
  taxYear: number;

  // Safe harbor computations
  safeHarbor_100pct: number;          // 100% of prior year tax
  safeHarbor_110pct: number;          // 110% of prior year tax (high-income)
  safeHarbor_90pct_currentYear: number; // 90% of projected current year tax
  highIncomeRule: boolean;            // True if prior year AGI > $150,000
  requiredAnnualPayment: number;      // Minimum to avoid underpayment penalty
  requiredFromWithholding: number;    // Amount covered by W-2 withholding
  requiredFromEstimatedPayments: number; // Annual ES payment target

  // Per-quarter breakdown
  quarters: QuarterlyPayment[];

  // Total projected position
  projectedTotalLiability: number;
  projectedTotalPayments: number;     // Withholding + all 4 ES payments
  projectedRefundOrOwed: number;      // Positive = refund, negative = owe

  // Warnings and notes
  warnings: string[];
  notes: string[];
}

// ─── Due dates by tax year ────────────────────────────────────────────────────

interface QuarterMeta {
  quarter: 1 | 2 | 3 | 4;
  label: string;
  dueDate: string;
  period: string;
}

function getQuarterMeta(taxYear: number): QuarterMeta[] {
  // Q4 of year N is due Jan 15 of year N+1
  return [
    { quarter: 1, label: 'Q1', dueDate: `April 15, ${taxYear}`,   period: `Jan 1 – Mar 31, ${taxYear}` },
    { quarter: 2, label: 'Q2', dueDate: `June 16, ${taxYear}`,    period: `Apr 1 – May 31, ${taxYear}` },
    { quarter: 3, label: 'Q3', dueDate: `Sept 15, ${taxYear}`,    period: `Jun 1 – Aug 31, ${taxYear}` },
    { quarter: 4, label: 'Q4', dueDate: `Jan 15, ${taxYear + 1}`, period: `Sep 1 – Dec 31, ${taxYear}` },
  ];
}

// ─── Main computation ─────────────────────────────────────────────────────────

export function computeEstimatedTax(input: EstimatedTaxInput): EstimatedTaxResult {
  const warnings: string[] = [];
  const notes: string[] = [];

  // Safe harbor: 110% rule kicks in when prior year AGI > $150,000
  const highIncomeRule = input.priorYearAGI > 150_000;
  const safeHarbor_100pct = Math.round(input.priorYearTaxLiability);
  const safeHarbor_110pct = Math.round(input.priorYearTaxLiability * 1.10);
  const safeHarborPriorYear = highIncomeRule ? safeHarbor_110pct : safeHarbor_100pct;

  const safeHarbor_90pct_currentYear = Math.round(input.projectedTaxLiability * 0.90);

  // Required annual payment = lesser of prior-year safe harbor and 90% of current year
  const requiredAnnualPayment = Math.min(safeHarborPriorYear, safeHarbor_90pct_currentYear);

  // Portion covered by W-2 withholding (counts toward annual payment requirement)
  const requiredFromWithholding = Math.min(input.projectedW2Withholding, requiredAnnualPayment);
  const requiredFromEstimatedPayments = Math.max(0, requiredAnnualPayment - requiredFromWithholding);

  // Divide ES requirement evenly across 4 quarters
  const perQuarter = Math.ceil(requiredFromEstimatedPayments / 4);

  const paidByQuarter: Record<1 | 2 | 3 | 4, number> = {
    1: input.q1PaidAlready,
    2: input.q2PaidAlready,
    3: input.q3PaidAlready,
    4: input.q4PaidAlready,
  };

  const quarters: QuarterlyPayment[] = getQuarterMeta(input.taxYear).map(meta => {
    const q = meta.quarter as 1 | 2 | 3 | 4;
    const alreadyPaid = paidByQuarter[q];
    const balanceDue = Math.max(0, perQuarter - alreadyPaid);
    return {
      quarter: q,
      label: meta.label,
      dueDate: meta.dueDate,
      requiredPayment: perQuarter,
      alreadyPaid,
      balanceDue,
      isOverpaid: alreadyPaid > perQuarter,
    };
  });

  // Total projected position
  const totalESPaid = input.q1PaidAlready + input.q2PaidAlready + input.q3PaidAlready + input.q4PaidAlready;
  const projectedTotalPayments = input.projectedW2Withholding + totalESPaid;
  const projectedRefundOrOwed = projectedTotalPayments - input.projectedTaxLiability;

  // Warnings
  if (input.priorYearTaxLiability === 0) {
    warnings.push('Prior year tax liability is $0 — verify this is correct. If it was actually higher, safe harbor calculations will be understated.');
  }
  if (input.projectedSelfEmploymentIncome > 400) {
    const seTax = Math.round(input.projectedSelfEmploymentIncome * 0.9235 * 0.153);
    notes.push(`Estimated self-employment tax on $${input.projectedSelfEmploymentIncome.toLocaleString()} net SE income: ~$${seTax.toLocaleString()}. This is included in your projected tax liability above.`);
  }
  if (highIncomeRule) {
    notes.push(`110% safe harbor applies because prior year AGI ($${input.priorYearAGI.toLocaleString()}) exceeded $150,000. You must pay 110% of last year's tax (not just 100%) to be safe-harbored.`);
  }
  if (input.projectedTaxLiability - input.projectedW2Withholding < 1_000) {
    notes.push('Projected tax owed after withholding is under $1,000. Estimated tax payments may not be required (IRC §6654(e)(1) de minimis exception).');
  }
  if (requiredFromEstimatedPayments === 0 && input.projectedW2Withholding >= requiredAnnualPayment) {
    notes.push('W-2 withholding covers the full safe harbor amount. No quarterly estimated payments are required if withholding is applied evenly throughout the year.');
  }
  if (input.projectedAGI > 200_000 || (input.projectedAGI > 250_000)) {
    notes.push('Net Investment Income Tax (3.8%) and/or Additional Medicare Tax (0.9%) may apply. These are factored into projected tax liability if entered in the federal return.');
  }

  return {
    taxYear: input.taxYear,
    safeHarbor_100pct,
    safeHarbor_110pct,
    safeHarbor_90pct_currentYear,
    highIncomeRule,
    requiredAnnualPayment,
    requiredFromWithholding,
    requiredFromEstimatedPayments,
    quarters,
    projectedTotalLiability: input.projectedTaxLiability,
    projectedTotalPayments,
    projectedRefundOrOwed,
    warnings,
    notes,
  };
}

// ─── Voucher helpers ──────────────────────────────────────────────────────────

export interface VoucherInfo {
  quarter: 1 | 2 | 3 | 4;
  amount: number;
  dueDate: string;
  mailingAddress: string;
  note: string;
}

/**
 * Returns mailing address for 1040-ES vouchers by filing state.
 * Defaults to the general IRS address for the given state.
 */
export function get1040ESMailingAddress(residenceState: string): string {
  // IRS 1040-ES mailing addresses by state grouping (2025)
  const stateGroup: Record<string, string> = {
    AL: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    AK: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    AZ: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    AR: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    CA: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    CO: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    CT: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    DE: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    FL: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    GA: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    HI: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    ID: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    IL: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    IN: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    IA: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    KS: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    KY: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    LA: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    ME: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    MD: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    MA: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    MI: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    MN: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    MS: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    MO: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    MT: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    NE: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    NV: 'Internal Revenue Service\nP.O. Box 7704\nSan Francisco, CA 94120-7704',
    NH: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    NJ: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    NM: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    NY: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    NC: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    ND: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    OH: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    OK: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    OR: 'Internal Revenue Service\nP.O. Box 7704\nSan Francisco, CA 94120-7704',
    PA: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    RI: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    SC: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    SD: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    TN: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    TX: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    UT: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    VT: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    VA: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    WA: 'Internal Revenue Service\nP.O. Box 7704\nSan Francisco, CA 94120-7704',
    WV: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
    WI: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    WY: 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501',
    DC: 'Internal Revenue Service\nP.O. Box 37008\nHartford, CT 06176-7008',
  };
  return stateGroup[residenceState.toUpperCase()] ?? 'Internal Revenue Service\nP.O. Box 802501\nCincinnati, OH 45280-2501';
}

export function buildVouchers(result: EstimatedTaxResult, residenceState: string): VoucherInfo[] {
  const address = get1040ESMailingAddress(residenceState);
  return result.quarters
    .filter(q => q.balanceDue > 0)
    .map(q => ({
      quarter: q.quarter,
      amount: q.balanceDue,
      dueDate: q.dueDate,
      mailingAddress: address,
      note: `Form 1040-ES — ${result.taxYear} Payment ${q.quarter} of 4`,
    }));
}
