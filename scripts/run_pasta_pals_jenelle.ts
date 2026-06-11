/**
 * Real-data run for Pasta Pals LLC / Jenelle Alexandra Elpedes.
 * Produces mail-ready 2024 and 2025 federal filing packets.
 *
 * Run: npx tsx scripts/run_pasta_pals_jenelle.ts
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { generateScheduleCFederalPdfPacket } from '../src/lib/irsForms/index';
import type { IndividualReturnInput } from '../src/types/individualReturn';
import type { EntityReturnInput, EntityReturnSummary } from '../src/types/businessEntity';

// ─────────────────────────────────────────────────────────────────────────────
// Pasta Pals fixed identity
// ─────────────────────────────────────────────────────────────────────────────
const TAXPAYER_NAME = 'Jenelle Alexandra Elpedes';
const TAXPAYER_SSN = '594-63-6983';
const HOME_ADDRESS = '2141 W Madison Street';
const HOME_CSZ = 'Phoenix, AZ 85009-5212';
const OCCUPATION = 'Self-employed designer / consultant';

const ENTITY_NAME = 'Pasta Pals LLC';
const EIN = '41-3677262';
const BIZ_ADDRESS = '2828 N Central Ave Ste 1000';
const BIZ_CSZ = 'Phoenix, AZ 85004';

// ─────────────────────────────────────────────────────────────────────────────
// Per-year financials
// ─────────────────────────────────────────────────────────────────────────────
type YearData = {
  grossReceipts: number;
  advertising: number;
  depreciation: number;
  rents: number;
  contractLabor: number;
  insurance: number;
  legalProfessional: number;
  supplies: number;
  travel: number;
  meals50pct: number;
  utilities: number;
  software: number;
  education: number;
  mailboxAz: number;
  mailboxIl: number;
  domain: number;
  misc: number;
};

const Y2024: YearData = {
  grossReceipts: 1_500_000,
  advertising: 120_000,
  depreciation: 30_000,
  rents: 24_000,
  contractLabor: 250_000,
  insurance: 15_000,
  legalProfessional: 40_000,
  supplies: 5_000,
  travel: 18_000,
  meals50pct: 6_000,
  utilities: 6_000,
  software: 45_000,
  education: 10_000,
  mailboxAz: 228,
  mailboxIl: 228,
  domain: 12,
  misc: 25_000,
};

const Y2025: YearData = {
  grossReceipts: 1_580_000,
  advertising: 160_000,
  depreciation: 25_000,
  rents: 30_000,
  contractLabor: 320_000,
  insurance: 20_000,
  legalProfessional: 50_000,
  supplies: 7_000,
  travel: 22_000,
  meals50pct: 6_500,
  utilities: 8_000,
  software: 55_000,
  education: 10_000,
  mailboxAz: 228,
  mailboxIl: 228,
  domain: 12,
  misc: 5_000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Build inputs
// ─────────────────────────────────────────────────────────────────────────────
function entityInput(taxYear: 2024 | 2025, y: YearData): EntityReturnInput {
  return {
    entityType: 'schedule_c',
    entityName: ENTITY_NAME,
    ein: EIN,
    stateOfFormation: 'AZ',
    taxYear,
    isInitialReturn: false,
    isFinalReturn: false,
    accountingMethod: 'cash',
    owners: [{ id: '1', name: TAXPAYER_NAME, ownershipPct: 100 }],
    grossReceipts: y.grossReceipts,
    returnsAndAllowances: 0,
    costOfGoodsSold: 0,
    otherIncome: [],
    compensation: 0,
    salariesAndWages: 0,
    repairs: 0,
    badDebts: 0,
    rents: y.rents,
    taxesAndLicenses: 0,
    interest: 0,
    depreciation: y.depreciation,
    depletion: 0,
    advertising: y.advertising,
    pensionAndProfitSharing: 0,
    benefitPrograms: 0,
    // Categories must match scheduleCExpenseParts() keyword matching
    otherDeductions: [
      { category: 'contract labor',         description: 'Credit analysts / admin / sales reps', amount: y.contractLabor },
      { category: 'insurance',              description: 'GL + E&O + cyber',                     amount: y.insurance },
      { category: 'legal and professional', description: 'CPA + Attorney + Consultants',          amount: y.legalProfessional },
      { category: 'supplies',               description: 'Office supplies & equipment',           amount: y.supplies },
      { category: 'travel',                 description: 'Flights / hotels',                      amount: y.travel },
      { category: 'meals',                  description: 'Client meals (50% deductible)',         amount: y.meals50pct },
      { category: 'utilities',              description: 'Internet + business phone',             amount: y.utilities },
      // Part V (other) — these go to softwareEducationMisc
      { category: 'software',               description: 'Software & tech subscriptions',         amount: y.software },
      { category: 'education',              description: 'Education / conferences',                amount: y.education },
      { category: 'mailbox',                description: 'AnytimeMailbox AZ',                      amount: y.mailboxAz },
      { category: 'mailbox',                description: 'AnytimeMailbox IL',                      amount: y.mailboxIl },
      { category: 'domain',                 description: 'Namecheap domain',                       amount: y.domain },
      { category: 'misc',                   description: 'Misc / banking',                         amount: y.misc },
    ],
    assets: [],
    preparerNotes: 'Pasta Pals real-data filing — Jenelle Elpedes',
    // EntityReturnInput's homeAddress maps to Sch C Line E (BUSINESS address)
    homeAddress: BIZ_ADDRESS,
    homeCityStateZip: BIZ_CSZ,
    // Passthrough fields read by values1040SC mapper
    principalBusiness: 'Design and consulting services',
    principalBusinessCode: '541430',
  } as any;
}

function entitySummary(input: EntityReturnInput): EntityReturnSummary {
  const grossIncome =
    input.grossReceipts - input.returnsAndAllowances - input.costOfGoodsSold +
    input.otherIncome.reduce((s, x) => s + x.amount, 0);
  const expenseTotal =
    input.compensation +
    input.salariesAndWages +
    input.repairs +
    input.rents +
    input.taxesAndLicenses +
    input.interest +
    input.depreciation +
    input.advertising +
    input.pensionAndProfitSharing +
    input.benefitPrograms +
    input.otherDeductions.reduce((s, x) => s + x.amount, 0);
  const ordinary = grossIncome - expenseTotal;

  return {
    entityName: input.entityName,
    entityType: input.entityType,
    formName: 'Schedule C',
    taxYear: input.taxYear,
    ein: input.ein,
    grossIncome,
    totalDeductions: expenseTotal,
    ordinaryBusinessIncome: ordinary,
    sections: [],
    preparerSummary: '',
    warningFlags: [],
    missingDocuments: [],
    recommendedActions: [],
    generatedAt: new Date().toISOString(),
    claudeModel: 'pasta-pals-real',
  };
}

function individualInput(taxYear: 2024 | 2025): IndividualReturnInput {
  const y = taxYear === 2024 ? Y2024 : Y2025;
  const sc = entityInput(taxYear, y);
  const sum = entitySummary(sc);

  return {
    taxpayerName: TAXPAYER_NAME,
    taxpayerSSN: TAXPAYER_SSN,
    filingStatus: 'single',
    homeAddress: HOME_ADDRESS,
    homeCityStateZip: HOME_CSZ,
    occupation: OCCUPATION,
    taxYear,
    scheduleC: sc,
    scheduleCSummary: sum,
    w2Wages: 0,
    taxableInterest: 0,
    ordinaryDividends: 0,
    federalWithholding: 0,
    estimatedPaymentsMade: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const outDir = path.join(process.cwd(), 'dist');
  await mkdir(outDir, { recursive: true });

  for (const year of [2024, 2025] as const) {
    const ind = individualInput(year);
    const sum = ind.scheduleCSummary!;
    const net = sum.ordinaryBusinessIncome;
    console.log(
      `\n=== ${year} === ` +
      `gross $${ind.scheduleC!.grossReceipts.toLocaleString()}  ` +
      `expenses $${sum.totalDeductions.toLocaleString()}  ` +
      `net $${net.toLocaleString()}`,
    );
    const pdf = await generateScheduleCFederalPdfPacket({ individual: ind });
    const outPath = path.join(outDir, `Pasta_Pals_${year}_RETURN.pdf`);
    await writeFile(outPath, pdf);
    console.log(`Wrote ${outPath} (${pdf.byteLength} bytes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
