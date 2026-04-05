/**
 * txfExport.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Generates a TXF (Tax Exchange Format v042) file from workflow data.
 *
 * TXF is the ANSI-standard import format accepted by TurboTax, H&R Block,
 * TaxAct, Drake, and most professional tax software. It is primarily used
 * for structured financial data: W-2 wages, 1099 income items, and
 * investment transactions (Schedule D / Form 8949).
 *
 * Reference: TXF Standard v042 (widely documented; not IRS-controlled)
 *
 * File structure:
 *   Line 1:  V042                         (version header)
 *   Line 2:  A {software name}            (application)
 *   Line 3:  D {creation date MM/DD/YYYY} (date)
 *   Line 4:  ^                            (end of file header)
 *   Then N-records, each ending with ^
 *
 * N-record structure (one per income/transaction item):
 *   N{category_code}   e.g. N521 = W-2 Box 1 wages
 *   C{copy_number}
 *   L{lot_number}
 *   P{description/payer}
 *   D{date_acq MM/DD/YYYY}   (for investments)
 *   D${date_sold MM/DD/YYYY} (for investments)
 *   ${amount}                (dollar amount, no $ sign — just the number)
 *   ^                        (end of record)
 *
 * TXF N-codes used in this module:
 *   N521  W-2 Box 1  Wages
 *   N522  W-2 Box 2  Federal tax withheld
 *   N523  W-2 Box 4  Social Security tax withheld
 *   N524  W-2 Box 6  Medicare tax withheld
 *   N286  1099-INT   Box 1  Interest income
 *   N287  1099-INT   Box 4  Federal tax withheld
 *   N330  1099-DIV   Box 1a Total ordinary dividends
 *   N331  1099-DIV   Box 1b Qualified dividends
 *   N332  1099-DIV   Box 2a Total capital gain distributions
 *   N333  1099-DIV   Box 4  Federal tax withheld
 *   N16   1099-NEC / Sch C gross receipts
 *   N281  1099-MISC  Box 3  Other income
 *   N680  1099-R     Box 1  Gross distribution
 *   N681  1099-R     Box 2a Taxable amount
 *   N682  1099-R     Box 4  Federal tax withheld
 *   N323  Sch D short-term gain/loss (from 1099-B)
 *   N324  Sch D long-term gain/loss (from 1099-B)
 */

import { Document, IncomeReconciliation, TaxYear } from '@/types/tax';

export interface TxfExportInput {
  taxYear: TaxYear;
  taxpayerName: string;
  documents: Document[];
  incomeReconciliations: IncomeReconciliation[];
}

export interface TxfRecord {
  nCode: string;           // e.g. "N521"
  description: string;
  amount: number;
  dateAcquired?: string;   // MM/DD/YYYY — for investments
  dateSold?: string;       // MM/DD/YYYY — for investments
  copyNumber?: number;
}

export interface TxfExportResult {
  content: string;         // Full TXF file content (ready to save as .txf)
  recordCount: number;
  warnings: string[];
  supportedItems: string[];
  unsupportedItems: string[];
}

// ===== HELPERS ===========================================================

function mmddyyyy(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatAmount(n: number): string {
  // TXF uses plain decimal, no $ sign, negative for losses
  return n.toFixed(2);
}

function record(rec: TxfRecord): string {
  const lines: string[] = [];
  lines.push(rec.nCode);
  lines.push(`C${rec.copyNumber ?? 1}`);
  lines.push('L1');
  lines.push(`P${rec.description}`);
  if (rec.dateAcquired) lines.push(`D${rec.dateAcquired}`);
  if (rec.dateSold) lines.push(`D$${rec.dateSold}`);
  lines.push(`$${formatAmount(rec.amount)}`);
  lines.push('^');
  return lines.join('\n');
}

// ===== DOCUMENT → RECORDS ================================================

function recordsFromW2(doc: Document): TxfRecord[] {
  if (!doc.parsedData) return [];
  const a = doc.parsedData.amounts;
  const payer = doc.parsedData.payer ?? 'Employer';
  const records: TxfRecord[] = [];

  // Keys match documentMapper.ts mapW2() output (camelCase); snake_case kept as legacy fallback
  if (a['box1_wages'] ?? a['wages']) {
    records.push({ nCode: 'N521', description: `W-2 Wages — ${payer}`, amount: a['box1_wages'] ?? a['wages'] });
  }
  if (a['box2_federalWithholding'] ?? a['box2_federal_withheld'] ?? a['federal_withheld']) {
    records.push({ nCode: 'N522', description: `W-2 Federal Withheld — ${payer}`, amount: a['box2_federalWithholding'] ?? a['box2_federal_withheld'] ?? a['federal_withheld'] });
  }
  if (a['box4_socialSecurityTax'] ?? a['box4_ss_withheld'] ?? a['ss_withheld']) {
    records.push({ nCode: 'N523', description: `W-2 SS Withheld — ${payer}`, amount: a['box4_socialSecurityTax'] ?? a['box4_ss_withheld'] ?? a['ss_withheld'] });
  }
  if (a['box6_medicareTax'] ?? a['box6_medicare_withheld'] ?? a['medicare_withheld']) {
    records.push({ nCode: 'N524', description: `W-2 Medicare Withheld — ${payer}`, amount: a['box6_medicareTax'] ?? a['box6_medicare_withheld'] ?? a['medicare_withheld'] });
  }
  return records;
}

function recordsFrom1099Int(doc: Document): TxfRecord[] {
  if (!doc.parsedData) return [];
  const a = doc.parsedData.amounts;
  const payer = doc.parsedData.payer ?? 'Payer';
  const records: TxfRecord[] = [];

  if (a['box1_interest'] ?? a['interest']) {
    records.push({ nCode: 'N286', description: `1099-INT Interest — ${payer}`, amount: a['box1_interest'] ?? a['interest'] });
  }
  if (a['box4_federal_withheld'] ?? a['federal_withheld']) {
    records.push({ nCode: 'N287', description: `1099-INT Withheld — ${payer}`, amount: a['box4_federal_withheld'] ?? a['federal_withheld'] });
  }
  return records;
}

function recordsFrom1099Div(doc: Document): TxfRecord[] {
  if (!doc.parsedData) return [];
  const a = doc.parsedData.amounts;
  const payer = doc.parsedData.payer ?? 'Payer';
  const records: TxfRecord[] = [];

  if (a['box1a_total_dividends'] ?? a['total_dividends']) {
    records.push({ nCode: 'N330', description: `1099-DIV Total Dividends — ${payer}`, amount: a['box1a_total_dividends'] ?? a['total_dividends'] });
  }
  if (a['box1b_qualified_dividends'] ?? a['qualified_dividends']) {
    records.push({ nCode: 'N331', description: `1099-DIV Qualified Dividends — ${payer}`, amount: a['box1b_qualified_dividends'] ?? a['qualified_dividends'] });
  }
  if (a['box2a_capital_gain_dist'] ?? a['cap_gain_distributions']) {
    records.push({ nCode: 'N332', description: `1099-DIV Cap Gain Distributions — ${payer}`, amount: a['box2a_capital_gain_dist'] ?? a['cap_gain_distributions'] });
  }
  if (a['box4_federal_withheld'] ?? a['federal_withheld']) {
    records.push({ nCode: 'N333', description: `1099-DIV Withheld — ${payer}`, amount: a['box4_federal_withheld'] ?? a['federal_withheld'] });
  }
  return records;
}

function recordsFrom1099Nec(doc: Document): TxfRecord[] {
  if (!doc.parsedData) return [];
  const a = doc.parsedData.amounts;
  const payer = doc.parsedData.payer ?? 'Payer';
  const records: TxfRecord[] = [];

  if (a['box1_nonemployee_comp'] ?? a['nonemployee_comp']) {
    records.push({ nCode: 'N16', description: `1099-NEC NEC — ${payer}`, amount: a['box1_nonemployee_comp'] ?? a['nonemployee_comp'] });
  }
  return records;
}

function recordsFrom1099R(doc: Document): TxfRecord[] {
  if (!doc.parsedData) return [];
  const a = doc.parsedData.amounts;
  const payer = doc.parsedData.payer ?? 'Payer';
  const records: TxfRecord[] = [];

  // Keys match documentMapper.ts map1099R() output (camelCase); snake_case kept as legacy fallback
  if (a['box1_grossDistribution'] ?? a['box1_gross_distribution'] ?? a['gross_distribution']) {
    records.push({ nCode: 'N680', description: `1099-R Gross Distribution — ${payer}`, amount: a['box1_grossDistribution'] ?? a['box1_gross_distribution'] ?? a['gross_distribution'] });
  }
  if (a['box2a_taxableAmount'] ?? a['box2a_taxable_amount'] ?? a['taxable_amount']) {
    records.push({ nCode: 'N681', description: `1099-R Taxable Amount — ${payer}`, amount: a['box2a_taxableAmount'] ?? a['box2a_taxable_amount'] ?? a['taxable_amount'] });
  }
  if (a['box4_federalWithholding'] ?? a['box4_federal_withheld'] ?? a['federal_withheld']) {
    records.push({ nCode: 'N682', description: `1099-R Federal Withheld — ${payer}`, amount: a['box4_federalWithholding'] ?? a['box4_federal_withheld'] ?? a['federal_withheld'] });
  }
  return records;
}

function recordsFrom1099Misc(doc: Document): TxfRecord[] {
  if (!doc.parsedData) return [];
  const a = doc.parsedData.amounts;
  const payer = doc.parsedData.payer ?? 'Payer';
  const records: TxfRecord[] = [];

  const other = a['box3_other_income'] ?? a['other_income'];
  if (other) {
    records.push({ nCode: 'N281', description: `1099-MISC Other Income — ${payer}`, amount: other });
  }
  return records;
}

// ===== MAIN EXPORT =======================================================

/**
 * Builds a complete TXF file string from the workflow data.
 * Save the result as "{taxpayer}_{year}_TurboTax_Import.txf"
 */
export function buildTxf(input: TxfExportInput): TxfExportResult {
  const { taxYear, taxpayerName, documents, incomeReconciliations } = input;
  const warnings: string[] = [];
  const supportedItems: string[] = [];
  const unsupportedItems: string[] = [];
  const allRecords: TxfRecord[] = [];

  // Process documents by type
  for (const doc of documents) {
    if (doc.taxYear !== taxYear) continue;

    switch (doc.type) {
      case 'w2': {
        const recs = recordsFromW2(doc);
        if (recs.length > 0) {
          allRecords.push(...recs);
          supportedItems.push(`W-2: ${doc.parsedData?.payer ?? doc.fileName}`);
        } else {
          warnings.push(`W-2 "${doc.fileName}" has no parsed data — parse it first`);
        }
        break;
      }
      case '1099_int': {
        const recs = recordsFrom1099Int(doc);
        if (recs.length > 0) {
          allRecords.push(...recs);
          supportedItems.push(`1099-INT: ${doc.parsedData?.payer ?? doc.fileName}`);
        }
        break;
      }
      case '1099_div': {
        const recs = recordsFrom1099Div(doc);
        if (recs.length > 0) {
          allRecords.push(...recs);
          supportedItems.push(`1099-DIV: ${doc.parsedData?.payer ?? doc.fileName}`);
        }
        break;
      }
      case '1099_nec': {
        const recs = recordsFrom1099Nec(doc);
        if (recs.length > 0) {
          allRecords.push(...recs);
          supportedItems.push(`1099-NEC: ${doc.parsedData?.payer ?? doc.fileName}`);
        }
        break;
      }
      case '1099_r': {
        const recs = recordsFrom1099R(doc);
        if (recs.length > 0) {
          allRecords.push(...recs);
          supportedItems.push(`1099-R: ${doc.parsedData?.payer ?? doc.fileName}`);
        }
        break;
      }
      case '1099_misc': {
        const recs = recordsFrom1099Misc(doc);
        if (recs.length > 0) {
          allRecords.push(...recs);
          supportedItems.push(`1099-MISC: ${doc.parsedData?.payer ?? doc.fileName}`);
        }
        break;
      }
      case '1099_b':
      case 'schedule_d':
        unsupportedItems.push(`${doc.type.toUpperCase()} "${doc.fileName}" — investment transactions require full 1099-B detail; enter manually in TurboTax`);
        break;
      case 'k1_1065':
      case 'k1_1120s':
      case 'k1_1041':
        unsupportedItems.push(`${doc.type.toUpperCase()} "${doc.fileName}" — K-1 items must be entered through TurboTax's K-1 interview (TXF does not support K-1)`);
        break;
      default:
        // bank_statement, receipt, etc. — not exported
        break;
    }
  }

  if (allRecords.length === 0 && warnings.length === 0) {
    warnings.push('No parsed documents found. Parse your documents first before generating a TXF export.');
  }

  if (unsupportedItems.length > 0) {
    warnings.push(`${unsupportedItems.length} item(s) require manual entry in TurboTax (see Unsupported Items list).`);
  }

  // Schedule C note
  const hasScheduleC = documents.some(d => d.type === '1099_nec' && d.taxYear === taxYear);
  if (hasScheduleC) {
    warnings.push('Schedule C expenses cannot be imported via TXF — enter business expenses manually in TurboTax\'s "Business Income & Expenses" section.');
  }

  // Build TXF file content
  const today = mmddyyyy(new Date());
  const header = [
    'V042',
    `A Tax Forensics — ${taxpayerName} TY${taxYear}`,
    `D${today}`,
    '^',
  ].join('\n');

  const body = allRecords.map(r => record(r)).join('\n');
  const content = header + '\n' + body;

  return {
    content,
    recordCount: allRecords.length,
    warnings,
    supportedItems,
    unsupportedItems,
  };
}

/**
 * Generates a human-readable TurboTax Interview Cheat Sheet as plain text.
 * This companion document maps every data point to the TurboTax interview
 * screen where it must be entered (for items TXF cannot carry).
 */
export function buildTurboTaxCheatSheet(input: TxfExportInput): string {
  const { taxYear, taxpayerName, documents } = input;
  const lines: string[] = [
    `TURBOTAX INTERVIEW GUIDE — ${taxpayerName.toUpperCase()} — TAX YEAR ${taxYear}`,
    '='.repeat(70),
    '',
    'INSTRUCTIONS:',
    '1. Import the accompanying .txf file first: TurboTax → File → Import → From TXF file',
    '2. Then complete each section below manually in the TurboTax interview.',
    '3. Verify every imported amount matches — TurboTax may round differently.',
    '',
  ];

  // W-2 section
  const w2s = documents.filter(d => d.type === 'w2' && d.taxYear === taxYear);
  if (w2s.length > 0) {
    lines.push('─'.repeat(70));
    lines.push('W-2 WAGES (TurboTax: Federal > Wages & Salaries)');
    lines.push('NOTE: These import via TXF. Verify in "Wages & Salaries" interview.');
    lines.push('');
    for (const doc of w2s) {
      const a = doc.parsedData?.amounts ?? {};
      lines.push(`  Employer: ${doc.parsedData?.payer ?? doc.fileName}`);
      lines.push(`    Box 1  Wages:              $${(a['box1_wages'] ?? a['wages'] ?? 0).toLocaleString()}`);
      lines.push(`    Box 2  Federal Withheld:   $${(a['box2_federalWithholding'] ?? a['box2_federal_withheld'] ?? a['federal_withheld'] ?? 0).toLocaleString()}`);
      lines.push(`    Box 12 Codes:              ${a['box12_code'] ?? 'N/A'} — enter manually if present`);
      lines.push(`    Box 14 Other:              ${a['box14'] ?? 'N/A'} — enter manually if present`);
      lines.push(`    State/Local wages:         Enter W-2 Box 15–17 manually`);
      lines.push('');
    }
  }

  // 1099 sections
  const divs = documents.filter(d => d.type === '1099_div' && d.taxYear === taxYear);
  if (divs.length > 0) {
    lines.push('─'.repeat(70));
    lines.push('1099-DIV DIVIDENDS (TurboTax: Federal > Investment Income > Dividends)');
    lines.push('NOTE: Imports via TXF. Verify each payer in the Dividends interview.');
    lines.push('');
    for (const doc of divs) {
      const a = doc.parsedData?.amounts ?? {};
      lines.push(`  Payer: ${doc.parsedData?.payer ?? doc.fileName}`);
      lines.push(`    Box 1a Total Dividends:    $${(a['box1a_total_dividends'] ?? a['total_dividends'] ?? 0).toLocaleString()}`);
      lines.push(`    Box 1b Qualified Divs:     $${(a['box1b_qualified_dividends'] ?? a['qualified_dividends'] ?? 0).toLocaleString()}`);
      lines.push(`    Box 2a Cap Gain Dist:      $${(a['box2a_capital_gain_dist'] ?? 0).toLocaleString()}`);
      lines.push('');
    }
  }

  const rirs = documents.filter(d => d.type === '1099_r' && d.taxYear === taxYear);
  if (rirs.length > 0) {
    lines.push('─'.repeat(70));
    lines.push('1099-R RETIREMENT DISTRIBUTIONS (TurboTax: Federal > Retirement Plans)');
    lines.push('NOTE: Imports via TXF. CRITICAL: Enter Box 7 Distribution Code manually.');
    lines.push('');
    for (const doc of rirs) {
      const a = doc.parsedData?.amounts ?? {};
      const bf = doc.parsedData?.boxFields ?? {};
      lines.push(`  Payer: ${doc.parsedData?.payer ?? doc.fileName}`);
      lines.push(`    Box 1  Gross Distribution: $${(a['box1_grossDistribution'] ?? a['box1_gross_distribution'] ?? a['gross_distribution'] ?? 0).toLocaleString()}`);
      lines.push(`    Box 2a Taxable Amount:     $${(a['box2a_taxableAmount'] ?? a['box2a_taxable_amount'] ?? a['taxable_amount'] ?? 0).toLocaleString()}`);
      lines.push(`    Box 7  Distribution Code:  ${bf['box7_distributionCode'] ?? '??'} ← MUST ENTER MANUALLY`);
      lines.push(`    Box 4  Federal Withheld:   $${(a['box4_federalWithholding'] ?? a['box4_federal_withheld'] ?? a['federal_withheld'] ?? 0).toLocaleString()}`);
      lines.push('');
    }
  }

  const necs = documents.filter(d => d.type === '1099_nec' && d.taxYear === taxYear);
  if (necs.length > 0) {
    lines.push('─'.repeat(70));
    lines.push('SCHEDULE C — SELF-EMPLOYMENT (TurboTax: Federal > Self-Employment)');
    lines.push('NOTE: 1099-NEC gross imports via TXF. Enter ALL expenses manually.');
    lines.push('');
    for (const doc of necs) {
      const a = doc.parsedData?.amounts ?? {};
      lines.push(`  Payer/Platform: ${doc.parsedData?.payer ?? doc.fileName}`);
      lines.push(`    Box 1 NEC: $${(a['box1_nonemployee_comp'] ?? a['nonemployee_comp'] ?? 0).toLocaleString()}`);
      lines.push('');
    }
    lines.push('  EXPENSES — Enter in TurboTax "Business Expenses" interview:');
    lines.push('  (Refer to the preparer audit trail document for categorized amounts)');
    lines.push('');
  }

  const k1s = documents.filter(d => ['k1_1065', 'k1_1120s', 'k1_1041'].includes(d.type) && d.taxYear === taxYear);
  if (k1s.length > 0) {
    lines.push('─'.repeat(70));
    lines.push('K-1 PASS-THROUGH INCOME (TurboTax: Federal > Schedule K-1)');
    lines.push('NOTE: TXF DOES NOT support K-1. Enter every box manually.');
    lines.push('');
    for (const doc of k1s) {
      const a = doc.parsedData?.amounts ?? {};
      const bf = doc.parsedData?.boxFields ?? {};
      lines.push(`  Entity: ${doc.parsedData?.payer ?? doc.fileName} (${doc.type.toUpperCase()})`);
      lines.push(`    Box 1 Ordinary Income: $${(a['box1_ordinary_income'] ?? 0).toLocaleString()}`);
      lines.push(`    All other boxes: refer to the parsed document detail`);
      lines.push('');
    }
  }

  // Investment note
  const hasBrokerage = documents.some(d => ['1099_b', 'schedule_d'].includes(d.type) && d.taxYear === taxYear);
  if (hasBrokerage) {
    lines.push('─'.repeat(70));
    lines.push('SCHEDULE D / FORM 8949 — INVESTMENT TRANSACTIONS');
    lines.push('(TurboTax: Federal > Investment Income > Stocks, Crypto, Mutual Funds)');
    lines.push('');
    lines.push('  Option A: Import 1099-B directly from your broker in TurboTax');
    lines.push('    → "Import from financial institution" — supports most major brokers');
    lines.push('');
    lines.push('  Option B: Upload a CSV from your broker');
    lines.push('    → TurboTax supports CSV upload for most consolidated 1099-B statements');
    lines.push('');
    lines.push('  Option C: Enter manually (for small numbers of transactions)');
    lines.push('');
  }

  lines.push('─'.repeat(70));
  lines.push('CREDITS — Enter manually in TurboTax (TXF does not carry credits):');
  lines.push('  • American Opportunity Credit (Form 8863): TurboTax > Education Credits');
  lines.push('  • Child Tax Credit: TurboTax > Deductions & Credits > Children');
  lines.push('  • Earned Income Credit: TurboTax > Review Income section');
  lines.push('  • Premium Tax Credit (Form 8962): TurboTax > Health Insurance');
  lines.push('');
  lines.push('─'.repeat(70));
  lines.push(`Generated by Tax Forensics on ${new Date().toLocaleDateString()}`);
  lines.push('This is a preparer-produced guide. Verify all amounts before filing.');

  return lines.join('\n');
}
