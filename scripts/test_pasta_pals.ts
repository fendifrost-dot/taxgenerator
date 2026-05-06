/**
 * Smoke test: generate Schedule C / Form 1040 federal PDF packet (merged)
 * Run: npx tsx scripts/test_pasta_pals.ts
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { generateScheduleCFederalPdfPacket } from '../src/lib/irsForms/index';
import type { IndividualReturnInput } from '../src/types/individualReturn';
import type { EntityReturnInput, EntityReturnSummary } from '../src/types/businessEntity';

function pastaPalsEntityInput(taxYear: 2024 | 2025): EntityReturnInput {
  return {
    entityType: 'schedule_c',
    entityName: 'Pasta Pals LLC',
    ein: '12-3456789',
    stateOfFormation: 'CA',
    taxYear,
    isInitialReturn: false,
    isFinalReturn: false,
    accountingMethod: 'cash',
    owners: [{ id: '1', name: 'Jamie Owner', ownershipPct: 100 }],
    grossReceipts: 185_000,
    returnsAndAllowances: 2_500,
    costOfGoodsSold: 42_000,
    otherIncome: [{ description: 'Refunds', amount: 400 }],
    compensation: 0,
    salariesAndWages: 18_000,
    repairs: 2_200,
    badDebts: 0,
    rents: 14_400,
    taxesAndLicenses: 3_100,
    interest: 0,
    depreciation: 8_900,
    depletion: 0,
    advertising: 6_500,
    pensionAndProfitSharing: 0,
    benefitPrograms: 2_800,
    otherDeductions: [
      { category: 'contract labor', description: 'Freelance cooks', amount: 22_000 },
      { category: 'supplies', description: 'Kitchen supplies', amount: 9_200 },
      { category: 'utilities', description: 'Gas & electric', amount: 4_800 },
      { category: 'software', description: 'POS subscription', amount: 1_800 },
    ],
    assets: [],
    preparerNotes: 'Fixture for smoke test',
    homeAddress: '100 Noodle Lane',
    homeCityStateZip: 'San Francisco, CA 94102',
  };
}

function pastaPalsEntitySummary(input: EntityReturnInput): EntityReturnSummary {
  const grossIncome =
    input.grossReceipts -
    input.returnsAndAllowances -
    input.costOfGoodsSold +
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
    claudeModel: 'fixture',
  };
}

function buildIndividual(taxYear: 2024 | 2025): IndividualReturnInput {
  const scheduleC = pastaPalsEntityInput(taxYear);
  const scheduleCSummary = pastaPalsEntitySummary(scheduleC);

  return {
    taxpayerName: 'Jamie Owner',
    taxpayerSSN: '123-45-6789',
    filingStatus: 'single',
    homeAddress: '200 Marinara Ave',
    homeCityStateZip: 'San Francisco, CA 94103',
    occupation: 'Chef / Restaurateur',
    taxYear,
    scheduleC,
    scheduleCSummary,
    w2Wages: 24_000,
    taxableInterest: 120,
    ordinaryDividends: 0,
    federalWithholding: 5_500,
    estimatedPaymentsMade: 6_000,
  };
}

async function main() {
  const outDir = path.join(process.cwd(), 'dist');
  await mkdir(outDir, { recursive: true });

  for (const year of [2024, 2025] as const) {
    const pdf = await generateScheduleCFederalPdfPacket({
      individual: buildIndividual(year),
    });
    const outPath = path.join(outDir, `pasta_pals_federal_${year}.pdf`);
    await writeFile(outPath, pdf);
    console.log(`Wrote ${outPath} (${pdf.byteLength} bytes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
