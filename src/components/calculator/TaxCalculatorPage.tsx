import { useState, useMemo } from "react";
import {
  ChevronRight,
  ChevronLeft,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  X,
  CheckCircle,
  AlertTriangle,
  Building2,
  GraduationCap,
  Briefcase,
  FileText,
  Calculator,
  BarChart3,
} from "lucide-react";

// ─── 2024 Tax Constants ───
const STANDARD_DEDUCTION = { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 };
const TAX_BRACKETS = {
  single: [[0, 11600, 0.10], [11600, 47150, 0.12], [47150, 100525, 0.22], [100525, 191950, 0.24], [191950, 243725, 0.32], [243725, 609350, 0.35], [609350, Infinity, 0.37]],
  mfj: [[0, 23200, 0.10], [23200, 94300, 0.12], [94300, 201050, 0.22], [201050, 383900, 0.24], [383900, 487450, 0.32], [487450, 731200, 0.35], [731200, Infinity, 0.37]],
  mfs: [[0, 11600, 0.10], [11600, 47150, 0.12], [47150, 100525, 0.22], [100525, 191950, 0.24], [191950, 243725, 0.32], [243725, 365600, 0.35], [365600, Infinity, 0.37]],
  hoh: [[0, 16550, 0.10], [16550, 63100, 0.12], [63100, 100500, 0.22], [100500, 191950, 0.24], [191950, 243700, 0.32], [243700, 609350, 0.35], [609350, Infinity, 0.37]]
};
const QUAL_DIV_THRESHOLDS = { single: 47025, mfj: 94050, mfs: 47025, hoh: 63000 };
const SE_TAX_RATE = 0.9235;
const SE_RATE = 0.153;
const SE_CAP = 168600;
const IL_TAX_RATE = 0.0495;
const IL_EXEMPTION = { single: 2425, mfj: 4850, mfs: 2425, hoh: 2425 };
const AOC_MAX_EXPENSES = 4000;

// ─── Tax Calculation Engine ───
function calcFederalTax(taxableIncome, filingStatus) {
  if (taxableIncome <= 0) return 0;
  const brackets = TAX_BRACKETS[filingStatus] || TAX_BRACKETS.single;
  let tax = 0;
  for (const [lo, hi, rate] of brackets) {
    if (taxableIncome <= lo) break;
    tax += (Math.min(taxableIncome, hi) - lo) * rate;
  }
  return Math.round(tax);
}

function calcQualDivTax(qualDividends, taxableIncome, filingStatus) {
  const threshold = QUAL_DIV_THRESHOLDS[filingStatus] || 47025;
  if (taxableIncome <= threshold) return 0;
  const taxableAtRate = Math.min(qualDividends, Math.max(0, taxableIncome - threshold));
  return Math.round(taxableAtRate * 0.15);
}

function calcSETax(netBusinessIncome) {
  if (netBusinessIncome <= 0) return 0;
  const seEarnings = netBusinessIncome * SE_TAX_RATE;
  const taxable = Math.min(seEarnings, SE_CAP);
  return Math.round(taxable * SE_RATE);
}

function calcAOC(expenses) {
  if (expenses <= 0) return { total: 0, nonrefundable: 0, refundable: 0 };
  const capped = Math.min(expenses, AOC_MAX_EXPENSES);
  const base = Math.min(capped, 2000);
  const remaining = Math.max(0, capped - 2000);
  const total = base + remaining * 0.25;
  const refundable = Math.round(total * 0.4);
  const nonrefundable = Math.round(total * 0.6);
  return { total: Math.round(total), nonrefundable, refundable };
}

// ─── Currency Formatter ───
const fmt = (n) => {
  const abs = Math.abs(Math.round(n));
  const str = "$" + abs.toLocaleString("en-US");
  return n < 0 ? `(${str})` : str;
};

// ─── Tip Engine ───
function generateTips(data, calc) {
  const tips = [];
  const fs = data.filingStatus;

  // Income tips
  if (data.wages > 0 && data.fedWithheld / Math.max(data.wages, 1) < 0.05) {
    tips.push({ type: "warning", section: "income", title: "Low W-2 Withholding", message: `Your federal withholding rate is only ${(data.fedWithheld / Math.max(data.wages, 1) * 100).toFixed(1)}%. Consider updating your W-4 to avoid underpayment penalties next year.` });
  }

  // Dividend tips
  if (data.qualDividends > 0) {
    const threshold = QUAL_DIV_THRESHOLDS[fs] || 47025;
    if (calc.taxableIncome <= threshold) {
      tips.push({ type: "success", section: "income", title: "0% Qualified Dividend Rate", message: `Your taxable income (${fmt(calc.taxableIncome)}) is below the ${fmt(threshold)} threshold. All ${fmt(data.qualDividends)} in qualified dividends are taxed at 0%!` });
    } else {
      tips.push({ type: "info", section: "income", title: "Consider Tax-Loss Harvesting", message: `Some of your qualified dividends may be taxed at 15%. Consider harvesting capital losses to reduce taxable income below ${fmt(threshold)}.` });
    }
  }

  // Business tips
  if (data.grossReceipts > 0 || data.cogs > 0 || data.bizExpenses > 0) {
    const netBiz = data.grossReceipts - data.cogs - data.bizExpenses;
    if (netBiz < 0 && Math.abs(netBiz) > data.grossReceipts * 3) {
      tips.push({ type: "warning", section: "business", title: "Hobby Loss Risk (IRC §183)", message: `Your business loss (${fmt(netBiz)}) is much larger than revenue. The IRS requires a profit motive — document your business plan, marketing efforts, and steps toward profitability. A business must show profit in 3 of 5 years.` });
    }
    if (netBiz > 0) {
      tips.push({ type: "info", section: "business", title: "Self-Employment Tax Applies", message: `Net business income of ${fmt(netBiz)} is subject to ${(SE_RATE * 100).toFixed(1)}% self-employment tax (${fmt(calcSETax(netBiz))}). Consider: retirement plan contributions (SEP-IRA up to 25%), health insurance deduction, or S-Corp election to reduce SE tax.` });
    }
    if (netBiz > 0 && calc.qbiDeduction > 0) {
      tips.push({ type: "success", section: "business", title: "QBI Deduction Available", message: `You qualify for a ${fmt(calc.qbiDeduction)} Qualified Business Income deduction (20% of net business income), reducing your taxable income.` });
    }
    if (data.qbiLossCarryforward > 0) {
      tips.push({ type: "info", section: "business", title: "QBI Loss Carryforward", message: `You have a ${fmt(data.qbiLossCarryforward)} QBI loss carryforward that will offset future business profits before any QBI deduction applies.` });
    }
    if (data.beginInventory > 10000 && data.grossReceipts < data.beginInventory * 0.1) {
      tips.push({ type: "warning", section: "business", title: "High Inventory vs. Low Sales", message: `Beginning inventory (${fmt(data.beginInventory)}) greatly exceeds sales. Consider the §471 small business exception to simplify accounting, or document why inventory levels are appropriate.` });
    }
  }

  // Deduction tips
  if (fs === "single" && calc.itemizedTotal > STANDARD_DEDUCTION.single) {
    tips.push({ type: "success", section: "deductions", title: "Itemizing Saves You Money", message: `Your itemized deductions (${fmt(calc.itemizedTotal)}) exceed the standard deduction (${fmt(STANDARD_DEDUCTION[fs])}). You save ${fmt(calc.itemizedTotal - STANDARD_DEDUCTION[fs])} by itemizing.` });
  } else if (calc.itemizedTotal > 0 && calc.itemizedTotal <= STANDARD_DEDUCTION[fs]) {
    tips.push({ type: "info", section: "deductions", title: "Standard Deduction is Better", message: `Your itemized deductions (${fmt(calc.itemizedTotal)}) are less than the standard deduction (${fmt(STANDARD_DEDUCTION[fs])}). Consider bunching deductions — make 2 years of charitable contributions in one year to exceed the threshold.` });
  }

  // Education tips
  if (data.educationExpenses > 0) {
    const aoc = calcAOC(data.educationExpenses);
    tips.push({ type: "success", section: "credits", title: "American Opportunity Credit", message: `Your ${fmt(data.educationExpenses)} in education expenses generate a ${fmt(aoc.total)} credit: ${fmt(aoc.nonrefundable)} nonrefundable + ${fmt(aoc.refundable)} refundable. The refundable portion is paid to you even if you owe $0 in tax!` });
    if (data.educationExpenses < AOC_MAX_EXPENSES) {
      tips.push({ type: "info", section: "credits", title: "Maximize Education Credit", message: `You can claim up to $4,000 in education expenses. Adding ${fmt(AOC_MAX_EXPENSES - data.educationExpenses)} more would increase your credit by up to ${fmt(Math.round((AOC_MAX_EXPENSES - data.educationExpenses) * 0.25))}.` });
    }
  }

  // Refund / balance tips
  if (calc.balanceDue > 0) {
    tips.push({ type: "warning", section: "summary", title: "Balance Due", message: `You owe ${fmt(calc.balanceDue)}. Consider: increasing W-4 withholding, making quarterly estimated payments (Form 1040-ES), or contributing to a traditional IRA (up to $7,000) to reduce taxable income.` });
    if (calc.balanceDue > 1000) {
      tips.push({ type: "warning", section: "summary", title: "Underpayment Penalty Risk", message: `Owing more than $1,000 may trigger an underpayment penalty. Safe harbor: pay at least 100% of prior year tax or 90% of current year tax through withholding/estimates.` });
    }
  }
  if (calc.refund > 3000) {
    tips.push({ type: "info", section: "summary", title: "Large Refund — Adjust Withholding?", message: `A ${fmt(calc.refund)} refund means you overpaid throughout the year. Consider adjusting your W-4 to keep more money in each paycheck — that's your money working for you sooner.` });
  }

  // Illinois tips
  if (data.includeIL) {
    tips.push({ type: "info", section: "state", title: "Illinois Flat Tax", message: `Illinois taxes all income at a flat 4.95% rate. There are limited state-level deductions, but IL does not tax Social Security or retirement income.` });
  }

  return tips;
}

// ─── UI Components ───

function CurrencyInput({ label, value, onChange, placeholder = "0", helpText }: { label: any; value: any; onChange: any; placeholder?: string; helpText?: string }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input
          type="number"
          value={value || ""}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          placeholder={placeholder}
          className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>
      {helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
    </div>
  );
}

function TipPopup({ tip, onClose }) {
  const colors = {
    success: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", title: "text-emerald-800" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", title: "text-amber-800" },
    info: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", title: "text-blue-800" },
  };
  const c = colors[tip.type] || colors.info;
  const Icon = tip.type === "success" ? CheckCircle : tip.type === "warning" ? AlertTriangle : Lightbulb;

  return (
    <div className={`${c.bg} ${c.border} border rounded-lg p-4 mb-3 relative animate-in`}>
      <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
        <X size={16} />
      </button>
      <div className="flex gap-3">
        <Icon size={20} className={`${c.icon} flex-shrink-0 mt-0.5`} />
        <div>
          <p className={`font-semibold text-sm ${c.title}`}>{tip.title}</p>
          <p className="text-sm text-gray-700 mt-1 leading-relaxed">{tip.message}</p>
        </div>
      </div>
    </div>
  );
}

function RefundTracker({ refund, balanceDue, step, totalSteps }) {
  const isRefund = refund > 0;
  const amount = isRefund ? refund : balanceDue;

  return (
    <div className={`sticky top-0 z-50 ${isRefund ? "bg-gradient-to-r from-emerald-600 to-emerald-700" : balanceDue > 0 ? "bg-gradient-to-r from-red-600 to-red-700" : "bg-gradient-to-r from-gray-600 to-gray-700"} text-white shadow-lg`}>
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRefund ? <TrendingUp size={24} /> : balanceDue > 0 ? <TrendingDown size={24} /> : <DollarSign size={24} />}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">
              {isRefund ? "Estimated Refund" : balanceDue > 0 ? "Estimated Balance Due" : "Tax Summary"}
            </p>
            <p className="text-2xl font-bold tracking-tight">
              {amount > 0 ? fmt(amount) : "$0"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs opacity-80">Step {step} of {totalSteps}</p>
          <div className="w-32 h-2 bg-white/20 rounded-full mt-1">
            <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${(step / totalSteps) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepNav({ step, setStep, totalSteps, canProceed = true }) {
  return (
    <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
      {step > 1 ? (
        <button onClick={() => setStep(step - 1)} className="flex items-center gap-2 px-5 py-2.5 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition text-sm font-medium">
          <ChevronLeft size={18} /> Back
        </button>
      ) : <div />}
      {step < totalSteps ? (
        <button onClick={() => canProceed && setStep(step + 1)} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg transition text-sm font-medium ${canProceed ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}>
          Continue <ChevronRight size={18} />
        </button>
      ) : null}
    </div>
  );
}

// ─── STEP COMPONENTS ───

function Step1_Filing({ data, setData }) {
  const statuses = [
    { value: "single", label: "Single", desc: "Unmarried or legally separated" },
    { value: "mfj", label: "Married Filing Jointly", desc: "Married, filing one return together" },
    { value: "mfs", label: "Married Filing Separately", desc: "Married, each files own return" },
    { value: "hoh", label: "Head of Household", desc: "Unmarried, paid >50% of household costs" },
  ];
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg"><FileText size={24} className="text-blue-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Filing Status</h2>
          <p className="text-sm text-gray-500">Select the filing status for this return</p>
        </div>
      </div>
      <div className="space-y-3">
        {statuses.map(s => (
          <button key={s.value} onClick={() => setData({ ...data, filingStatus: s.value })}
            className={`w-full text-left p-4 rounded-lg border-2 transition ${data.filingStatus === s.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
            <p className="font-medium text-gray-900">{s.label}</p>
            <p className="text-sm text-gray-500">{s.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Step2_Income({ data, setData, tips }) {
  const sectionTips = tips.filter(t => t.section === "income");
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-100 rounded-lg"><DollarSign size={24} className="text-green-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Income</h2>
          <p className="text-sm text-gray-500">Enter all sources of income</p>
        </div>
      </div>
      {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => { }} />)}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Briefcase size={16} /> W-2 Employment Income</h3>
        <CurrencyInput label="Wages, Salaries, Tips (Line 1a)" value={data.wages} onChange={v => setData({ ...data, wages: v })} helpText="From Box 1 of your W-2" />
        <CurrencyInput label="Federal Income Tax Withheld" value={data.fedWithheld} onChange={v => setData({ ...data, fedWithheld: v })} helpText="From Box 2 of your W-2" />
        <CurrencyInput label="State Income Tax Withheld (IL)" value={data.stateWithheld} onChange={v => setData({ ...data, stateWithheld: v })} helpText="From Box 17 of your W-2" />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><BarChart3 size={16} /> Investment Income</h3>
        <CurrencyInput label="Taxable Interest (Line 2b)" value={data.taxableInterest} onChange={v => setData({ ...data, taxableInterest: v })} />
        <CurrencyInput label="Ordinary Dividends (Line 3b)" value={data.ordinaryDividends} onChange={v => setData({ ...data, ordinaryDividends: v })} helpText="From 1099-DIV Box 1a" />
        <CurrencyInput label="Qualified Dividends (Line 3a)" value={data.qualDividends} onChange={v => setData({ ...data, qualDividends: v })} helpText="From 1099-DIV Box 1b — taxed at lower rates" />
        <CurrencyInput label="Capital Gains / (Losses) (Line 7)" value={data.capitalGains} onChange={v => setData({ ...data, capitalGains: v })} helpText="Net from Schedule D. Enter negative for losses." />
        <CurrencyInput label="1099 Federal Withholding" value={data.otherWithheld} onChange={v => setData({ ...data, otherWithheld: v })} helpText="Backup withholding from 1099s" />
      </div>
    </div>
  );
}

function Step3_Business({ data, setData, tips }) {
  const sectionTips = tips.filter(t => t.section === "business");
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg"><Building2 size={24} className="text-purple-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Schedule C — Business Income</h2>
          <p className="text-sm text-gray-500">Self-employment and small business</p>
        </div>
      </div>
      <label className="flex items-center gap-3 mb-5 cursor-pointer">
        <input type="checkbox" checked={data.hasBusiness} onChange={e => setData({ ...data, hasBusiness: e.target.checked })}
          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <span className="text-sm font-medium text-gray-700">I have self-employment or business income</span>
      </label>
      {data.hasBusiness && (
        <>
          {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => { }} />)}
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">Part I — Revenue</h3>
            <CurrencyInput label="Gross Receipts / Sales (Line 1)" value={data.grossReceipts} onChange={v => setData({ ...data, grossReceipts: v })} />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">Part III — Cost of Goods Sold</h3>
            <CurrencyInput label="Beginning Inventory (Line 35)" value={data.beginInventory} onChange={v => setData({ ...data, beginInventory: v })} />
            <CurrencyInput label="Cost of Labor (Line 37)" value={data.costLabor} onChange={v => setData({ ...data, costLabor: v })} />
            <CurrencyInput label="Other COGS Costs (Lines 38-39)" value={data.otherCOGS} onChange={v => setData({ ...data, otherCOGS: v })} />
            <CurrencyInput label="Ending Inventory (Line 41)" value={data.endInventory} onChange={v => setData({ ...data, endInventory: v })} />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">Part II — Expenses</h3>
            <CurrencyInput label="Advertising (Line 8)" value={data.bizAdvertising} onChange={v => setData({ ...data, bizAdvertising: v })} />
            <CurrencyInput label="Office Expense (Line 18)" value={data.bizOffice} onChange={v => setData({ ...data, bizOffice: v })} />
            <CurrencyInput label="Repairs & Maintenance (Line 21)" value={data.bizRepairs} onChange={v => setData({ ...data, bizRepairs: v })} />
            <CurrencyInput label="Travel (Line 24a)" value={data.bizTravel} onChange={v => setData({ ...data, bizTravel: v })} />
            <CurrencyInput label="Deductible Meals (Line 24b)" value={data.bizMeals} onChange={v => setData({ ...data, bizMeals: v })} />
            <CurrencyInput label="Other Expenses (Line 27)" value={data.bizOther} onChange={v => setData({ ...data, bizOther: v })} />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3">QBI Loss Carryforward</h3>
            <CurrencyInput label="Prior Year QBI Loss Carryforward" value={data.qbiLossCarryforward} onChange={v => setData({ ...data, qbiLossCarryforward: v })} helpText="From prior year Form 8995 Line 16. Reduces future QBI deductions." />
          </div>
        </>
      )}
    </div>
  );
}

function Step4_Deductions({ data, setData, tips, calc }) {
  const sectionTips = tips.filter(t => t.section === "deductions");
  const fs = data.filingStatus;
  const stdDed = STANDARD_DEDUCTION[fs] || 14600;
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-orange-100 rounded-lg"><Calculator size={24} className="text-orange-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Deductions</h2>
          <p className="text-sm text-gray-500">Standard deduction or itemized — we'll pick the best one</p>
        </div>
      </div>
      <div className={`p-4 rounded-lg border-2 mb-5 ${calc.useItemized ? "border-orange-300 bg-orange-50" : "border-emerald-300 bg-emerald-50"}`}>
        <p className="text-sm font-medium text-gray-800">
          {calc.useItemized
            ? `Itemizing saves you ${fmt(calc.itemizedTotal - stdDed)} over the standard deduction`
            : `Standard deduction (${fmt(stdDed)}) is best — it exceeds your itemized deductions by ${fmt(stdDed - calc.itemizedTotal)}`
          }
        </p>
      </div>
      {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => { }} />)}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-3">Itemized Deductions (for comparison)</h3>
        <CurrencyInput label="Medical Expenses (exceeding 7.5% of AGI)" value={data.medicalExpenses} onChange={v => setData({ ...data, medicalExpenses: v })} />
        <CurrencyInput label="State & Local Taxes (SALT, max $10,000)" value={data.saltDeduction} onChange={v => setData({ ...data, saltDeduction: v })} />
        <CurrencyInput label="Mortgage Interest" value={data.mortgageInterest} onChange={v => setData({ ...data, mortgageInterest: v })} />
        <CurrencyInput label="Charitable Contributions" value={data.charitableContrib} onChange={v => setData({ ...data, charitableContrib: v })} />
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Itemized Total: <span className="font-semibold">{fmt(calc.itemizedTotal)}</span></p>
          <p className="text-sm text-gray-600">Standard Deduction: <span className="font-semibold">{fmt(stdDed)}</span></p>
          <p className="text-sm font-semibold text-gray-800 mt-1">Using: {calc.useItemized ? "Itemized" : "Standard"} ({fmt(calc.deduction)})</p>
        </div>
      </div>
    </div>
  );
}

function Step5_Credits({ data, setData, tips }) {
  const sectionTips = tips.filter(t => t.section === "credits");
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-teal-100 rounded-lg"><GraduationCap size={24} className="text-teal-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Credits</h2>
          <p className="text-sm text-gray-500">Tax credits reduce your tax dollar-for-dollar</p>
        </div>
      </div>
      {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => { }} />)}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">Education Credits</h3>
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <input type="checkbox" checked={data.hasEducation} onChange={e => setData({ ...data, hasEducation: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm font-medium text-gray-700">I have qualified education expenses (AOC)</span>
        </label>
        {data.hasEducation && (
          <>
            <CurrencyInput label="Qualified Education Expenses" value={data.educationExpenses} onChange={v => setData({ ...data, educationExpenses: v })} helpText="Tuition, fees, books — max $4,000 for AOC" />
            <div className="p-3 bg-teal-50 rounded-lg mt-2">
              <p className="text-xs text-teal-700">AOC: Up to $2,500 credit. 60% nonrefundable, 40% refundable. Available for first 4 years of postsecondary education.</p>
            </div>
          </>
        )}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-3">Other Credits</h3>
        <CurrencyInput label="Child Tax Credit (per qualifying child)" value={data.childTaxCredit} onChange={v => setData({ ...data, childTaxCredit: v })} />
        <CurrencyInput label="Other Nonrefundable Credits" value={data.otherCredits} onChange={v => setData({ ...data, otherCredits: v })} />
        <CurrencyInput label="Other Refundable Credits" value={data.otherRefundableCredits} onChange={v => setData({ ...data, otherRefundableCredits: v })} />
      </div>
    </div>
  );
}

function Step6_State({ data, setData, tips, calc }) {
  const sectionTips = tips.filter(t => t.section === "state");
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-100 rounded-lg"><Building2 size={24} className="text-indigo-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Illinois State Tax</h2>
          <p className="text-sm text-gray-500">IL uses a flat 4.95% tax rate on federal AGI</p>
        </div>
      </div>
      <label className="flex items-center gap-3 mb-5 cursor-pointer">
        <input type="checkbox" checked={data.includeIL} onChange={e => setData({ ...data, includeIL: e.target.checked })}
          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <span className="text-sm font-medium text-gray-700">Include Illinois state tax calculation</span>
      </label>
      {data.includeIL && (
        <>
          {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => { }} />)}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Federal AGI</span><span className="font-medium">{fmt(calc.agi)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Personal Exemption</span><span className="font-medium">({fmt(IL_EXEMPTION[data.filingStatus] || 2425)})</span></div>
              <div className="flex justify-between border-t pt-2"><span className="text-gray-600">IL Taxable Income</span><span className="font-medium">{fmt(calc.ilTaxableIncome)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Tax @ 4.95%</span><span className="font-medium">{fmt(calc.ilTax)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">IL Withholding</span><span className="font-medium">({fmt(data.stateWithheld)})</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>{calc.ilBalanceDue > 0 ? "IL Balance Due" : "IL Refund"}</span>
                <span className={calc.ilBalanceDue > 0 ? "text-red-600" : "text-emerald-600"}>
                  {fmt(Math.abs(calc.ilBalanceDue > 0 ? calc.ilBalanceDue : calc.ilRefund))}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Step7_Summary({ data, calc, tips }) {
  const allTips = tips;
  const netBiz = data.hasBusiness ? data.grossReceipts - data.cogs - data.bizExpenses : 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg"><BarChart3 size={24} className="text-blue-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tax Return Summary</h2>
          <p className="text-sm text-gray-500">Complete breakdown of your federal return</p>
        </div>
      </div>

      <div className={`rounded-xl p-6 mb-6 text-center ${calc.refund > 0 ? "bg-emerald-50 border-2 border-emerald-200" : calc.balanceDue > 0 ? "bg-red-50 border-2 border-red-200" : "bg-gray-50 border-2 border-gray-200"}`}>
        <p className="text-sm font-medium text-gray-600 uppercase tracking-wider mb-1">
          {calc.refund > 0 ? "Your Federal Refund" : calc.balanceDue > 0 ? "Federal Amount Owed" : "Federal Tax Due"}
        </p>
        <p className={`text-4xl font-bold ${calc.refund > 0 ? "text-emerald-700" : calc.balanceDue > 0 ? "text-red-700" : "text-gray-700"}`}>
          {fmt(calc.refund > 0 ? calc.refund : calc.balanceDue)}
        </p>
        {data.includeIL && (
          <p className="text-sm text-gray-500 mt-2">
            Illinois: {calc.ilRefund > 0 ? `Refund ${fmt(calc.ilRefund)}` : calc.ilBalanceDue > 0 ? `Owed ${fmt(calc.ilBalanceDue)}` : "$0"} |
            Combined: {fmt((calc.refund || 0) - (calc.balanceDue || 0) + (calc.ilRefund || 0) - (calc.ilBalanceDue || 0))}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">Income</h3>
        <div className="space-y-2 text-sm">
          {data.wages > 0 && <div className="flex justify-between"><span className="text-gray-600">W-2 Wages</span><span>{fmt(data.wages)}</span></div>}
          {data.taxableInterest > 0 && <div className="flex justify-between"><span className="text-gray-600">Taxable Interest</span><span>{fmt(data.taxableInterest)}</span></div>}
          {data.ordinaryDividends > 0 && <div className="flex justify-between"><span className="text-gray-600">Ordinary Dividends</span><span>{fmt(data.ordinaryDividends)}</span></div>}
          {data.capitalGains !== 0 && <div className="flex justify-between"><span className="text-gray-600">Capital Gains/(Losses)</span><span>{fmt(data.capitalGains)}</span></div>}
          {data.hasBusiness && <div className="flex justify-between"><span className="text-gray-600">Schedule C Net</span><span>{fmt(netBiz)}</span></div>}
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Income</span><span>{fmt(calc.totalIncome)}</span></div>
          {calc.aboveLineAdj > 0 && <div className="flex justify-between"><span className="text-gray-600">Above-Line Adjustments</span><span>({fmt(calc.aboveLineAdj)})</span></div>}
          <div className="flex justify-between font-semibold"><span>Adjusted Gross Income</span><span>{fmt(calc.agi)}</span></div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">Tax Computation</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">AGI</span><span>{fmt(calc.agi)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">{calc.useItemized ? "Itemized" : "Standard"} Deduction</span><span>({fmt(calc.deduction)})</span></div>
          {calc.qbiDeduction > 0 && <div className="flex justify-between"><span className="text-gray-600">QBI Deduction</span><span>({fmt(calc.qbiDeduction)})</span></div>}
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Taxable Income</span><span>{fmt(calc.taxableIncome)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Income Tax</span><span>{fmt(calc.incomeTax)}</span></div>
          {calc.seTax > 0 && <div className="flex justify-between"><span className="text-gray-600">Self-Employment Tax</span><span>{fmt(calc.seTax)}</span></div>}
          {calc.totalNonrefundableCredits > 0 && <div className="flex justify-between"><span className="text-gray-600">Nonrefundable Credits</span><span>({fmt(calc.totalNonrefundableCredits)})</span></div>}
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Tax</span><span>{fmt(calc.totalTax)}</span></div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">Payments & Refundable Credits</h3>
        <div className="space-y-2 text-sm">
          {data.fedWithheld > 0 && <div className="flex justify-between"><span className="text-gray-600">W-2 Withholding</span><span>{fmt(data.fedWithheld)}</span></div>}
          {data.otherWithheld > 0 && <div className="flex justify-between"><span className="text-gray-600">1099 Withholding</span><span>{fmt(data.otherWithheld)}</span></div>}
          {calc.aoc.refundable > 0 && <div className="flex justify-between"><span className="text-gray-600">Refundable AOC (40%)</span><span>{fmt(calc.aoc.refundable)}</span></div>}
          {(data.otherRefundableCredits || 0) > 0 && <div className="flex justify-between"><span className="text-gray-600">Other Refundable Credits</span><span>{fmt(data.otherRefundableCredits)}</span></div>}
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Payments</span><span>{fmt(calc.totalPayments)}</span></div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Lightbulb size={18} className="text-amber-500" /> Tax Optimization Recommendations</h3>
        {allTips.length === 0 ? (
          <p className="text-sm text-gray-500">No specific recommendations at this time.</p>
        ) : (
          <div className="space-y-3">
            {allTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => { }} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ───
export function TaxCalculatorPage() {
  const [step, setStep] = useState(1);
  const totalSteps = 7;

  const [data, setData] = useState({
    filingStatus: "single",
    wages: 0, fedWithheld: 0, stateWithheld: 0,
    taxableInterest: 0, ordinaryDividends: 0, qualDividends: 0,
    capitalGains: 0, otherWithheld: 0,
    hasBusiness: false, grossReceipts: 0,
    beginInventory: 0, costLabor: 0, otherCOGS: 0, endInventory: 0,
    bizAdvertising: 0, bizOffice: 0, bizRepairs: 0, bizTravel: 0, bizMeals: 0, bizOther: 0,
    qbiLossCarryforward: 0,
    medicalExpenses: 0, saltDeduction: 0, mortgageInterest: 0, charitableContrib: 0,
    hasEducation: false, educationExpenses: 0,
    childTaxCredit: 0, otherCredits: 0, otherRefundableCredits: 0,
    includeIL: false,
  });

  const calc = useMemo(() => {
    const fs = data.filingStatus;
    const cogs = Math.max(0, data.beginInventory + data.costLabor + data.otherCOGS - data.endInventory);
    const bizExpenses = data.bizAdvertising + data.bizOffice + data.bizRepairs + data.bizTravel + data.bizMeals + data.bizOther;
    const netBiz = data.hasBusiness ? data.grossReceipts - cogs - bizExpenses : 0;

    const totalIncome = data.wages + data.taxableInterest + data.ordinaryDividends + data.capitalGains + netBiz;

    // Self-employment tax & above-line deduction
    const seTax = data.hasBusiness ? calcSETax(Math.max(0, netBiz)) : 0;
    const seDeduction = Math.round(seTax / 2);
    const aboveLineAdj = seDeduction;

    const agi = Math.max(0, totalIncome - aboveLineAdj);

    // Deductions
    const stdDed = STANDARD_DEDUCTION[fs] || 14600;
    const medAllowable = Math.max(0, data.medicalExpenses - agi * 0.075);
    const saltCapped = Math.min(data.saltDeduction, 10000);
    const itemizedTotal = medAllowable + saltCapped + data.mortgageInterest + data.charitableContrib;
    const useItemized = itemizedTotal > stdDed;
    const deduction = useItemized ? itemizedTotal : stdDed;

    // QBI deduction
    let qbiDeduction = 0;
    if (data.hasBusiness && netBiz > 0) {
      const qbiAfterCarryforward = Math.max(0, netBiz - data.qbiLossCarryforward);
      qbiDeduction = Math.round(qbiAfterCarryforward * 0.20);
    }

    const taxableIncome = Math.max(0, agi - deduction - qbiDeduction);

    // Tax computation with qualified dividends
    const ordinaryIncome = Math.max(0, taxableIncome - data.qualDividends);
    const incomeTax = calcFederalTax(ordinaryIncome, fs) + calcQualDivTax(data.qualDividends, taxableIncome, fs);

    // Credits
    const aoc = data.hasEducation ? calcAOC(data.educationExpenses) : { total: 0, nonrefundable: 0, refundable: 0 };
    const totalNonrefundableCredits = Math.min(incomeTax, aoc.nonrefundable + data.childTaxCredit + data.otherCredits);
    const taxAfterCredits = Math.max(0, incomeTax - totalNonrefundableCredits);
    const totalTax = taxAfterCredits + seTax;

    // Payments
    const totalWithholding = data.fedWithheld + data.otherWithheld;
    const totalRefundableCredits = aoc.refundable + (data.otherRefundableCredits || 0);
    const totalPayments = totalWithholding + totalRefundableCredits;

    const refund = Math.max(0, totalPayments - totalTax);
    const balanceDue = Math.max(0, totalTax - totalPayments);

    // Illinois
    const ilExemption = IL_EXEMPTION[fs] || 2425;
    const ilTaxableIncome = Math.max(0, agi - ilExemption);
    const ilTax = Math.round(ilTaxableIncome * IL_TAX_RATE);
    const ilRefund = Math.max(0, data.stateWithheld - ilTax);
    const ilBalanceDue = Math.max(0, ilTax - data.stateWithheld);

    return {
      cogs, bizExpenses: bizExpenses, netBiz, totalIncome, seTax, seDeduction, aboveLineAdj, agi,
      stdDed, itemizedTotal, useItemized, deduction, qbiDeduction, taxableIncome,
      incomeTax, aoc, totalNonrefundableCredits, totalTax, totalPayments, refund, balanceDue,
      ilTaxableIncome, ilTax, ilRefund, ilBalanceDue,
    };
  }, [data]);

  const tips = useMemo(() => generateTips({ ...data, cogs: calc.cogs, bizExpenses: calc.bizExpenses }, calc), [data, calc]);

  const renderStep = () => {
    switch (step) {
      case 1: return <Step1_Filing data={data} setData={setData} />;
      case 2: return <Step2_Income data={data} setData={setData} tips={tips} />;
      case 3: return <Step3_Business data={data} setData={setData} tips={tips} />;
      case 4: return <Step4_Deductions data={data} setData={setData} tips={tips} calc={calc} />;
      case 5: return <Step5_Credits data={data} setData={setData} tips={tips} />;
      case 6: return <Step6_State data={data} setData={setData} tips={tips} calc={calc} />;
      case 7: return <Step7_Summary data={data} calc={calc} tips={tips} />;
      default: return null;
    }
  };

  const stepLabels = ["Filing", "Income", "Business", "Deductions", "Credits", "State", "Summary"];

  return (
    <div className="min-h-screen bg-gray-50">
      <RefundTracker refund={calc.refund} balanceDue={calc.balanceDue} step={step} totalSteps={totalSteps} />

      {/* Step indicator */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex justify-between">
            {stepLabels.map((label, i) => (
              <button key={i} onClick={() => setStep(i + 1)}
                className={`text-xs font-medium px-2 py-1 rounded transition ${step === i + 1 ? "bg-blue-100 text-blue-700" : i + 1 < step ? "text-emerald-600" : "text-gray-400"}`}>
                {i + 1 < step ? "✓ " : ""}{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-gray-50 min-h-[500px]">
          {renderStep()}
          <StepNav step={step} setStep={setStep} totalSteps={totalSteps} />
        </div>
        <p className="text-center text-xs text-gray-400 mt-8">TaxGen AI Calculator • 2024 Tax Year • For estimation purposes only</p>
      </div>

      <style>{`
        .animate-in { animation: slideIn 0.3s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}
