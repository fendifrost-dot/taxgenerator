import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertCircle, ChevronRight, ChevronLeft, DollarSign, TrendingUp, TrendingDown, Lightbulb, X, CheckCircle, Info, AlertTriangle, Building2, GraduationCap, Briefcase, FileText, Calculator, BarChart3, Plus, Trash2, Save, FolderOpen, Users, Edit3, Copy, ArrowLeft } from "lucide-react";

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// SECTION 1: MULTI-YEAR TAX CONSTANTS (2022â2025)
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const TAX_DATA = {
  2022: {
    standardDeduction: { single: 12950, mfj: 25900, mfs: 12950, hoh: 19400 },
    brackets: {
      single: [[0,10275,.10],[10275,41775,.12],[41775,89075,.22],[89075,170050,.24],[170050,215950,.32],[215950,539900,.35],[539900,Infinity,.37]],
      mfj: [[0,20550,.10],[20550,83550,.12],[83550,178150,.22],[178150,340100,.24],[340100,431900,.32],[431900,647850,.35],[647850,Infinity,.37]],
      mfs: [[0,10275,.10],[10275,41775,.12],[41775,89075,.22],[89075,170050,.24],[170050,215950,.32],[215950,323925,.35],[323925,Infinity,.37]],
      hoh: [[0,14650,.10],[14650,55900,.12],[55900,89050,.22],[89050,170050,.24],[170050,215950,.32],[215950,539900,.35],[539900,Infinity,.37]],
    },
    qualDivThresholds: { single: 41675, mfj: 83350, mfs: 41675, hoh: 55800 },
    seCap: 147000, ilRate: 0.0495,
    ilExemption: { single: 2425, mfj: 4850, mfs: 2425, hoh: 2425 },
  },
  2023: {
    standardDeduction: { single: 13850, mfj: 27700, mfs: 13850, hoh: 20800 },
    brackets: {
      single: [[0,11000,.10],[11000,44725,.12],[44725,95375,.22],[95375,182100,.24],[182100,231250,.32],[231250,578125,.35],[578125,Infinity,.37]],
      mfj: [[0,22000,.10],[22000,89450,.12],[89450,190750,.22],[190750,364200,.24],[364200,462500,.32],[462500,693750,.35],[693750,Infinity,.37]],
      mfs: [[0,11000,.10],[11000,44725,.12],[44725,95375,.22],[95375,182100,.24],[182100,231250,.32],[231250,346875,.35],[346875,Infinity,.37]],
      hoh: [[0,15700,.10],[15700,59850,.12],[59850,95350,.22],[95350,182100,.24],[182100,231250,.32],[231250,578100,.35],[578100,Infinity,.37]],
    },
    qualDivThresholds: { single: 44625, mfj: 89250, mfs: 44625, hoh: 59750 },
    seCap: 160200, ilRate: 0.0495,
    ilExemption: { single: 2425, mfj: 4850, mfs: 2425, hoh: 2425 },
  },
  2024: {
    standardDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 },
    brackets: {
      single: [[0,11600,.10],[11600,47150,.12],[47150,100525,.22],[100525,191950,.24],[191950,243725,.32],[243725,609350,.35],[609350,Infinity,.37]],
      mfj: [[0,23200,.10],[23200,94300,.12],[94300,201050,.22],[201050,383900,.24],[383900,487450,.32],[487450,731200,.35],[731200,Infinity,.37]],
      mfs: [[0,11600,.10],[11600,47150,.12],[47150,100525,.22],[100525,191950,.24],[191950,243725,.32],[243725,365600,.35],[365600,Infinity,.37]],
      hoh: [[0,16550,.10],[16550,63100,.12],[63100,100500,.22],[100500,191950,.24],[191950,243700,.32],[243700,609350,.35],[609350,Infinity,.37]],
    },
    qualDivThresholds: { single: 47025, mfj: 94050, mfs: 47025, hoh: 63000 },
    seCap: 168600, ilRate: 0.0495,
    ilExemption: { single: 2425, mfj: 4850, mfs: 2425, hoh: 2425 },
  },
  2025: {
    standardDeduction: { single: 15000, mfj: 30000, mfs: 15000, hoh: 22500 },
    brackets: {
      single: [[0,11925,.10],[11925,48475,.12],[48475,103350,.22],[103350,197300,.24],[197300,250525,.32],[250525,626350,.35],[626350,Infinity,.37]],
      mfj: [[0,23850,.10],[23850,96950,.12],[96950,206700,.22],[206700,394600,.24],[394600,501050,.32],[501050,751600,.35],[751600,Infinity,.37]],
      mfs: [[0,11925,.10],[11925,48475,.12],[48475,103350,.22],[103350,197300,.24],[197300,250525,.32],[250525,375800,.35],[375800,Infinity,.37]],
      hoh: [[0,17000,.10],[17000,64850,.12],[64850,103350,.22],[103350,197300,.24],[197300,250500,.32],[250500,626350,.35],[626350,Infinity,.37]],
    },
    qualDivThresholds: { single: 48350, mfj: 96700, mfs: 48350, hoh: 64750 },
    seCap: 176100, ilRate: 0.0495,
    ilExemption: { single: 2625, mfj: 5250, mfs: 2625, hoh: 2625 },
  },
};

const SE_TAX_RATE = 0.9235;
const SE_RATE = 0.153;
const AOC_MAX_EXPENSES = 4000;

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// SECTION 2: TAX CALCULATION ENGINE
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function getYearData(year) { return TAX_DATA[year] || TAX_DATA[2024]; }

function calcFederalTax(taxableIncome, filingStatus, year) {
  if (taxableIncome <= 0) return 0;
  const brackets = getYearData(year).brackets[filingStatus] || getYearData(year).brackets.single;
  let tax = 0;
  for (const [lo, hi, rate] of brackets) {
    if (taxableIncome <= lo) break;
    tax += (Math.min(taxableIncome, hi) - lo) * rate;
  }
  return Math.round(tax);
}

function calcQualDivTax(qualDividends, taxableIncome, filingStatus, year) {
  const threshold = getYearData(year).qualDivThresholds[filingStatus] || 47025;
  if (taxableIncome <= threshold) return 0;
  const taxableAtRate = Math.min(qualDividends, Math.max(0, taxableIncome - threshold));
  return Math.round(taxableAtRate * 0.15);
}

function calcSETax(netBusinessIncome, year) {
  if (netBusinessIncome <= 0) return 0;
  const seEarnings = netBusinessIncome * SE_TAX_RATE;
  const taxable = Math.min(seEarnings, getYearData(year).seCap);
  return Math.round(taxable * SE_RATE);
}

function calcAOC(expenses) {
  if (expenses <= 0) return { total: 0, nonrefundable: 0, refundable: 0 };
  const capped = Math.min(expenses, AOC_MAX_EXPENSES);
  const base = Math.min(capped, 2000);
  const remaining = Math.max(0, capped - 2000);
  const total = Math.round(base + remaining * 0.25);
  const refundable = Math.round(total * 0.4);
  const nonrefundable = total - refundable; // Subtraction ensures parts sum to total
  return { total, nonrefundable, refundable };
}

// Safe number coercion â guards against strings, NaN, undefined, null
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

const fmt = (n) => {
  const safe = num(n);
  const abs = Math.abs(Math.round(safe));
  const str = "$" + abs.toLocaleString("en-US");
  return safe < 0 ? `(${str})` : str;
};

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// SECTION 3: TIP ENGINE
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function generateTips(data, calc) {
  const tips = [];
  const fs = data.filingStatus;
  const year = data.taxYear || 2024;
  const yd = getYearData(year);
  const totalWages = (data.w2s || []).reduce((s, w) => s + (w.wages || 0), 0);
  const totalFedWithheld = (data.w2s || []).reduce((s, w) => s + (w.fedWithheld || 0), 0);

  if (totalWages > 0 && totalFedWithheld / Math.max(totalWages, 1) < 0.05) {
    tips.push({ type: "warning", section: "income", title: "Low W-2 Withholding", message: `Federal withholding rate is only ${(totalFedWithheld / Math.max(totalWages, 1) * 100).toFixed(1)}%. Consider updating W-4 to avoid underpayment penalties.` });
  }
  if (data.qualDividends > 0) {
    const threshold = yd.qualDivThresholds[fs] || 47025;
    if (calc.taxableIncome <= threshold) {
      tips.push({ type: "success", section: "income", title: "0% Qualified Dividend Rate", message: `Taxable income (${fmt(calc.taxableIncome)}) is below the ${fmt(threshold)} threshold. All ${fmt(data.qualDividends)} in qualified dividends are taxed at 0%!` });
    }
  }
  if (data.hasBusiness) {
    const netBiz = calc.netBiz;
    if (netBiz < 0 && data.grossReceipts > 0 && Math.abs(netBiz) > data.grossReceipts * 3) {
      tips.push({ type: "warning", section: "business", title: "Hobby Loss Risk (IRC \u00A7183)", message: `Business loss (${fmt(netBiz)}) is much larger than revenue. Document your business plan and steps toward profitability. A business must show profit in 3 of 5 years.` });
    }
    if (netBiz > 0) {
      tips.push({ type: "info", section: "business", title: "Self-Employment Tax Applies", message: `Net business income of ${fmt(netBiz)} is subject to ${(SE_RATE * 100).toFixed(1)}% self-employment tax (${fmt(calc.seTax)}). Consider: SEP-IRA (up to 25%), health insurance deduction, or S-Corp election.` });
    }
    if (netBiz > 0 && calc.qbiDeduction > 0) {
      tips.push({ type: "success", section: "business", title: "QBI Deduction Available", message: `You qualify for a ${fmt(calc.qbiDeduction)} Qualified Business Income deduction (20% of net business income).` });
    }
    if (data.beginInventory > 10000 && data.grossReceipts < data.beginInventory * 0.1) {
      tips.push({ type: "warning", section: "business", title: "High Inventory vs. Low Sales", message: `Beginning inventory (${fmt(data.beginInventory)}) greatly exceeds sales. Consider the \u00A7471 small business exception.` });
    }
  }
  const stdDed = yd.standardDeduction[fs] || 14600;
  if (calc.itemizedTotal > stdDed) {
    tips.push({ type: "success", section: "deductions", title: "Itemizing Saves You Money", message: `Itemized deductions (${fmt(calc.itemizedTotal)}) exceed the standard deduction (${fmt(stdDed)}). You save ${fmt(calc.itemizedTotal - stdDed)} by itemizing.` });
  } else if (calc.itemizedTotal > 0 && calc.itemizedTotal <= stdDed) {
    tips.push({ type: "info", section: "deductions", title: "Standard Deduction is Better", message: `Itemized deductions (${fmt(calc.itemizedTotal)}) are less than the standard deduction (${fmt(stdDed)}). Consider bunching deductions.` });
  }
  if (data.educationExpenses > 0 && data.hasEducation) {
    const aoc = calcAOC(data.educationExpenses);
    tips.push({ type: "success", section: "credits", title: "American Opportunity Credit", message: `${fmt(data.educationExpenses)} in education expenses generate a ${fmt(aoc.total)} credit: ${fmt(aoc.nonrefundable)} nonrefundable + ${fmt(aoc.refundable)} refundable.` });
  }
  if (calc.balanceDue > 1000) {
    tips.push({ type: "warning", section: "summary", title: "Underpayment Penalty Risk", message: `Owing more than $1,000 may trigger an underpayment penalty. Safe harbor: pay at least 100% of prior year tax or 90% of current year tax.` });
  }
  if (calc.refund > 3000) {
    tips.push({ type: "info", section: "summary", title: "Large Refund \u2014 Adjust Withholding?", message: `A ${fmt(calc.refund)} refund means you overpaid throughout the year. Consider adjusting your W-4 to keep more per paycheck.` });
  }
  if (data.includeIL) {
    tips.push({ type: "info", section: "state", title: "Illinois Flat Tax", message: `Illinois taxes all income at a flat ${(yd.ilRate * 100).toFixed(2)}% rate. IL does not tax Social Security or retirement income.` });
  }
  return tips;
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// SECTION 4: UI COMPONENTS
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function CurrencyInput({ label, value, onChange, placeholder = "0", helpText = "" }: { label: string; value: any; onChange: (v: any) => any; placeholder?: string; helpText?: string }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input type="number" value={value || ""} onChange={e => onChange(num(e.target.value))} placeholder={placeholder}
          className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
      </div>
      {helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder = "", helpText }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
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
      <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"><X size={16} /></button>
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

function RefundTracker({ refund, balanceDue, step, totalSteps, clientName, taxYear }) {
  const isRefund = refund > 0;
  const amount = isRefund ? refund : balanceDue;
  return (
    <div className={`sticky top-0 z-50 ${isRefund ? "bg-gradient-to-r from-emerald-600 to-emerald-700" : balanceDue > 0 ? "bg-gradient-to-r from-red-600 to-red-700" : "bg-gradient-to-r from-gray-600 to-gray-700"} text-white shadow-lg`}>
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRefund ? <TrendingUp size={24} /> : balanceDue > 0 ? <TrendingDown size={24} /> : <DollarSign size={24} />}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">
              {clientName ? `${clientName} (${taxYear}) \u2014 ` : ""}{isRefund ? "Estimated Refund" : balanceDue > 0 ? "Estimated Balance Due" : "Tax Summary"}
            </p>
            <p className="text-2xl font-bold tracking-tight">{amount > 0 ? fmt(amount) : "$0"}</p>
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

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// SECTION 5: CLIENT MANAGEMENT
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const STORAGE_KEY = "taxgen_clients";

function loadClients() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

function saveClients(clients) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function createBlankClient(name = "", taxYear = 2024) {
  return {
    id: makeId(), clientName: name, taxYear,
    filingStatus: "single",
    w2s: [{ employer: "", wages: 0, fedWithheld: 0, stateWithheld: 0 }],
    taxableInterest: 0, ordinaryDividends: 0, qualDividends: 0, capitalGains: 0, otherWithheld: 0,
    hasBusiness: false, businessName: "", businessCode: "",
    grossReceipts: 0, beginInventory: 0, costLabor: 0, otherCOGS: 0, endInventory: 0,
    bizAdvertising: 0, bizOffice: 0, bizRepairs: 0, bizTravel: 0, bizMeals: 0, bizOther: 0,
    bizVehicle: 0, bizInsurance: 0, bizSupplies: 0, bizPhone: 0,
    qbiLossCarryforward: 0,
    medicalExpenses: 0, saltDeduction: 0, mortgageInterest: 0, charitableContrib: 0,
    hasEducation: false, educationExpenses: 0,
    childTaxCredit: 0, otherCredits: 0, otherRefundableCredits: 0,
    includeIL: false,
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

// Pre-seed Leon Dorsett's verified data
function seedLeonDorsett() {
  return {
    ...createBlankClient("Leon Dorsett", 2024),
    filingStatus: "single",
    w2s: [{ employer: "W-2 Employer", wages: 75500, fedWithheld: 1630, stateWithheld: 0 }],
    ordinaryDividends: 26300, qualDividends: 26300, otherWithheld: 13150,
    hasBusiness: true, businessName: "Leon's Catering", businessCode: "722300",
    grossReceipts: 2200, beginInventory: 48600, costLabor: 1430, endInventory: 1200,
    bizAdvertising: 1870, bizOffice: 1760, bizRepairs: 1870, bizTravel: 1480, bizMeals: 1720,
    hasEducation: true, educationExpenses: 3965,
    includeIL: true,
    notes: "Verified against filed 2024 return. Refund should be $15,776. IP PIN: 961511. Bank: Routing 256074974 / Account 7170770940 (Checking). School: Kennedy King College, EIN 36-2606236.",
  };
}

// Pre-seed Sam Higgins data for each tax year (2023-current per Fendi)
function seedSamHiggins2023() {
  return {
    ...createBlankClient("Sam Higgins", 2023),
    filingStatus: "single",
    w2s: [{ employer: "", wages: 0, fedWithheld: 0, stateWithheld: 0 }],
    hasBusiness: true, businessName: "Rideshare (Lyft)", businessCode: "485300",
    grossReceipts: 1370, // Lyft 1099-K: $1,369.66
    includeIL: true,
    notes: "SAMUEL BANKS JOHNSON HIGGINS. SSN: XXX-XX-6139. Address: 4226 s Ellis Ave #4S, Chicago IL 60653 (Lyft) / 2138 S Indiana Ave #1707, Chicago IL 60616 (Uber). LYFT 2023 1099-K: $1,369.66 (low activity year). W-2s and exact expenses TBD. NOTE: 2023 tax return PDF in folder is Ashley A Murray's, NOT Sam's.",
  };
}

function seedSamHiggins2024() {
  return {
    ...createBlankClient("Sam Higgins", 2024),
    filingStatus: "single",
    w2s: [{ employer: "", wages: 0, fedWithheld: 0, stateWithheld: 0 }],
    hasBusiness: true, businessName: "Rideshare (Uber + Lyft)", businessCode: "485300",
    grossReceipts: 132175, // Uber $112,248.42 + Lyft $19,926.30 = $132,174.72
    includeIL: true,
    notes: "SAMUEL BANKS JOHNSON HIGGINS. Address: 2138 S Indiana Ave #1707, Chicago IL 60616. UBER 2024 1099-K: $112,248.42 (2,205 trans). LYFT 2024 1099-K: $19,926.30. COMBINED GROSS: $132,174.72. W-2s and exact expenses TBD.",
  };
}

function seedSamHiggins2025() {
  return {
    ...createBlankClient("Sam Higgins", 2025),
    filingStatus: "single",
    w2s: [{ employer: "", wages: 0, fedWithheld: 0, stateWithheld: 0 }],
    hasBusiness: true, businessName: "Rideshare (Uber + Lyft)", businessCode: "485300",
    grossReceipts: 118781, // Uber $106,637.59 + Lyft $12,143.07 = $118,780.66
    includeIL: true,
    notes: "SAMUEL BANKS JOHNSON HIGGINS. Address: 2138 S Indiana Ave #1707, Chicago IL 60616. UBER 2025 1099-K: $106,637.59 (2,930 trans). LYFT 2025 1099-K: $12,143.07 (224 trans). COMBINED GROSS: $118,780.66. W-2s and exact expenses TBD.",
  };
}

function ClientDashboard({ onSelectClient, onNewClient }) {
  const [clients, setClients] = useState([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    let c = loadClients();
    if (c.length === 0 && !seeded) {
      // Pre-seed clients on first load
      c = [seedLeonDorsett(), seedSamHiggins2023(), seedSamHiggins2024(), seedSamHiggins2025()];
      saveClients(c);
      setSeeded(true);
    }
    setClients(c);
  }, [seeded]);

  const deleteClient = (id) => {
    const updated = clients.filter(c => c.id !== id);
    saveClients(updated);
    setClients(updated);
  };

  const duplicateClient = (client) => {
    const copy = { ...client, id: makeId(), clientName: client.clientName + " (Copy)", w2s: [...(client.w2s || []).map(w => ({...w}))], updatedAt: new Date().toISOString() };
    const updated = [...clients, copy];
    saveClients(updated);
    setClients(updated);
  };

  // Group by client name
  const grouped = {};
  clients.forEach(c => {
    const key = c.clientName || "Unnamed";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-2">
            <Users size={32} />
            <h1 className="text-3xl font-bold">TaxGen AI</h1>
          </div>
          <p className="text-blue-200">Client Management Dashboard</p>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Saved Clients ({clients.length})</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const json = JSON.stringify(clients, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `taxgen_clients_${new Date().toISOString().slice(0,10)}.json`;
              a.click(); URL.revokeObjectURL(url);
            }} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition" title="Export all clients as JSON backup">
              <Save size={16} /> Export
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition cursor-pointer" title="Import clients from JSON backup">
              <FolderOpen size={16} /> Import
              <input type="file" accept=".json" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const imported = JSON.parse(ev.target?.result as string);
                    if (!Array.isArray(imported)) { alert("Invalid file format"); return; }
                    const existing = loadClients();
                    const existingIds = new Set(existing.map(c => c.id));
                    const newClients = imported.filter(c => !existingIds.has(c.id));
                    const merged = [...existing, ...newClients.map(c => ({ ...c, id: makeId() }))];
                    saveClients(merged);
                    setClients(merged);
                    alert(`Imported ${newClients.length} new client(s). ${imported.length - newClients.length} duplicate(s) skipped.`);
                  } catch { alert("Error reading file. Make sure it's a valid TaxGen export."); }
                };
                reader.readAsText(file);
                e.target.value = "";
              }} />
            </label>
            <button onClick={onNewClient}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
              <Plus size={18} /> New Client
            </button>
          </div>
        </div>

        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Users size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">No clients yet. Click "New Client" to get started.</p>
          </div>
        )}

        {Object.entries(grouped).map(([name, yearClients]) => (
          <div key={name} className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Briefcase size={18} className="text-blue-500" /> {name}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(yearClients as any[]).sort((a: any, b: any) => (b.taxYear || 0) - (a.taxYear || 0)).map((client: any) => {
                // Quick calc for display
                const totalWages = (client.w2s || []).reduce((s, w) => s + (w.wages || 0), 0);
                const totalIncome = totalWages + (client.ordinaryDividends || 0) + (client.capitalGains || 0) + (client.grossReceipts || 0);
                return (
                  <div key={client.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <div onClick={() => onSelectClient(client)} className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{client.taxYear}</span>
                          <span className="text-xs text-gray-500 capitalize">{client.filingStatus === "mfj" ? "MFJ" : client.filingStatus === "mfs" ? "MFS" : client.filingStatus === "hoh" ? "HOH" : "Single"}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {totalIncome > 0 ? `Income: ${fmt(totalIncome)}` : "No income entered yet"}
                          {client.hasBusiness ? ` | Biz: ${client.businessName || "Schedule C"}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={(e) => { e.stopPropagation(); duplicateClient(client); }} className="p-1.5 text-gray-400 hover:text-blue-500 rounded" title="Duplicate">
                          <Copy size={14} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${name} (${client.taxYear})?`)) deleteClient(client.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div onClick={() => onSelectClient(client)} className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-400">Updated: {new Date(client.updatedAt).toLocaleDateString()}</span>
                      <span className="text-xs text-blue-500 font-medium flex items-center gap-1">Open <ChevronRight size={12} /></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// SECTION 6: STEP COMPONENTS
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function Step1_Filing({ data, setData }) {
  const statuses = [
    { value: "single", label: "Single", desc: "Unmarried or legally separated" },
    { value: "mfj", label: "Married Filing Jointly", desc: "Married, filing one return together" },
    { value: "mfs", label: "Married Filing Separately", desc: "Married, each files own return" },
    { value: "hoh", label: "Head of Household", desc: "Unmarried, paid >50% of household costs" },
  ];
  const years = [2025, 2024, 2023, 2022];
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg"><FileText size={24} className="text-blue-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Filing Status & Tax Year</h2>
          <p className="text-sm text-gray-500">Select the filing status and tax year for this return</p>
        </div>
      </div>

      {/* Client Name */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">Client Information</h3>
        <TextInput label="Client Name" value={data.clientName} onChange={v => setData({ ...data, clientName: v })} placeholder="e.g. Leon Dorsett" />
      </div>

      {/* Tax Year */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">Tax Year</h3>
        <div className="flex gap-3">
          {years.map(y => (
            <button key={y} onClick={() => setData({ ...data, taxYear: y })}
              className={`flex-1 py-3 rounded-lg border-2 font-bold text-lg transition ${data.taxYear === y ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Filing Status */}
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
  const w2s = data.w2s || [{ employer: "", wages: 0, fedWithheld: 0, stateWithheld: 0 }];

  const updateW2 = (index, field, value) => {
    const updated = [...w2s];
    updated[index] = { ...updated[index], [field]: value };
    setData({ ...data, w2s: updated });
  };

  const addW2 = () => {
    setData({ ...data, w2s: [...w2s, { employer: "", wages: 0, fedWithheld: 0, stateWithheld: 0 }] });
  };

  const removeW2 = (index) => {
    if (w2s.length <= 1) return;
    const updated = w2s.filter((_, i) => i !== index);
    setData({ ...data, w2s: updated });
  };

  const totalWages = w2s.reduce((s, w) => s + (w.wages || 0), 0);
  const totalFedWithheld = w2s.reduce((s, w) => s + (w.fedWithheld || 0), 0);
  const totalStateWithheld = w2s.reduce((s, w) => s + (w.stateWithheld || 0), 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-100 rounded-lg"><DollarSign size={24} className="text-green-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Income</h2>
          <p className="text-sm text-gray-500">Enter all sources of income</p>
        </div>
      </div>
      {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => {}} />)}

      {/* W-2s */}
      {w2s.map((w2, idx) => (
        <div key={idx} className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Briefcase size={16} /> W-2 #{idx + 1}
            </h3>
            {w2s.length > 1 && (
              <button onClick={() => removeW2(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
            )}
          </div>
          <TextInput label="Employer Name" value={w2.employer} onChange={v => updateW2(idx, "employer", v)} placeholder="Company name" />
          <CurrencyInput label="Wages, Salaries, Tips (Box 1)" value={w2.wages} onChange={v => updateW2(idx, "wages", v)} helpText="From Box 1 of W-2" />
          <CurrencyInput label="Federal Tax Withheld (Box 2)" value={w2.fedWithheld} onChange={v => updateW2(idx, "fedWithheld", v)} helpText="From Box 2 of W-2" />
          <CurrencyInput label="State Tax Withheld (Box 17)" value={w2.stateWithheld} onChange={v => updateW2(idx, "stateWithheld", v)} helpText="From Box 17 of W-2" />
        </div>
      ))}
      <button onClick={addW2} className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition text-sm font-medium mb-4 w-full justify-center">
        <Plus size={16} /> Add Another W-2
      </button>
      {w2s.length > 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm">
          <p className="font-medium text-blue-800">W-2 Totals: Wages {fmt(totalWages)} | Fed Withheld {fmt(totalFedWithheld)} | State Withheld {fmt(totalStateWithheld)}</p>
        </div>
      )}

      {/* Investment Income */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><BarChart3 size={16} /> Investment Income</h3>
        <CurrencyInput label="Taxable Interest (Line 2b)" value={data.taxableInterest} onChange={v => setData({ ...data, taxableInterest: v })} />
        <CurrencyInput label="Ordinary Dividends (Line 3b)" value={data.ordinaryDividends} onChange={v => setData({ ...data, ordinaryDividends: v })} helpText="From 1099-DIV Box 1a" />
        <CurrencyInput label="Qualified Dividends (Line 3a)" value={data.qualDividends} onChange={v => setData({ ...data, qualDividends: v })} helpText="From 1099-DIV Box 1b" />
        <CurrencyInput label="Capital Gains / (Losses) (Line 7)" value={data.capitalGains} onChange={v => setData({ ...data, capitalGains: v })} helpText="Net from Schedule D. Enter negative for losses." />
        <CurrencyInput label="1099 Federal Withholding" value={data.otherWithheld} onChange={v => setData({ ...data, otherWithheld: v })} helpText="Backup withholding from 1099s (Box 4)" />
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
          <h2 className="text-xl font-bold text-gray-900">Schedule C \u2014 Business Income</h2>
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
          {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => {}} />)}
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">Business Info</h3>
            <TextInput label="Business Name" value={data.businessName} onChange={v => setData({ ...data, businessName: v })} placeholder="e.g. Leon's Catering" />
            <TextInput label="Business Code (NAICS)" value={data.businessCode} onChange={v => setData({ ...data, businessCode: v })} placeholder="e.g. 722300" helpText="6-digit code from Schedule C instructions" />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">Part I \u2014 Revenue</h3>
            <CurrencyInput label="Gross Receipts / Sales (Line 1)" value={data.grossReceipts} onChange={v => setData({ ...data, grossReceipts: v })} helpText="Total from all 1099-K / 1099-NEC + cash income" />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">Part III \u2014 Cost of Goods Sold</h3>
            <CurrencyInput label="Beginning Inventory (Line 35)" value={data.beginInventory} onChange={v => setData({ ...data, beginInventory: v })} />
            <CurrencyInput label="Cost of Labor (Line 37)" value={data.costLabor} onChange={v => setData({ ...data, costLabor: v })} />
            <CurrencyInput label="Other COGS Costs (Lines 38-39)" value={data.otherCOGS} onChange={v => setData({ ...data, otherCOGS: v })} />
            <CurrencyInput label="Ending Inventory (Line 41)" value={data.endInventory} onChange={v => setData({ ...data, endInventory: v })} />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">Part II \u2014 Expenses</h3>
            <CurrencyInput label="Advertising (Line 8)" value={data.bizAdvertising} onChange={v => setData({ ...data, bizAdvertising: v })} />
            <CurrencyInput label="Car & Truck Expenses (Line 9)" value={data.bizVehicle} onChange={v => setData({ ...data, bizVehicle: v })} helpText="Actual expenses or standard mileage rate" />
            <CurrencyInput label="Insurance (Line 15)" value={data.bizInsurance} onChange={v => setData({ ...data, bizInsurance: v })} />
            <CurrencyInput label="Office Expense (Line 18)" value={data.bizOffice} onChange={v => setData({ ...data, bizOffice: v })} />
            <CurrencyInput label="Supplies (Line 22)" value={data.bizSupplies} onChange={v => setData({ ...data, bizSupplies: v })} />
            <CurrencyInput label="Repairs & Maintenance (Line 21)" value={data.bizRepairs} onChange={v => setData({ ...data, bizRepairs: v })} />
            <CurrencyInput label="Travel (Line 24a)" value={data.bizTravel} onChange={v => setData({ ...data, bizTravel: v })} />
            <CurrencyInput label="Deductible Meals (Line 24b)" value={data.bizMeals} onChange={v => setData({ ...data, bizMeals: v })} />
            <CurrencyInput label="Utilities / Phone (Line 25)" value={data.bizPhone} onChange={v => setData({ ...data, bizPhone: v })} />
            <CurrencyInput label="Other Expenses (Line 27)" value={data.bizOther} onChange={v => setData({ ...data, bizOther: v })} />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3">QBI Loss Carryforward</h3>
            <CurrencyInput label="Prior Year QBI Loss Carryforward" value={data.qbiLossCarryforward} onChange={v => setData({ ...data, qbiLossCarryforward: v })} helpText="From prior year Form 8995 Line 16" />
          </div>
        </>
      )}
    </div>
  );
}

function Step4_Deductions({ data, setData, tips, calc }) {
  const sectionTips = tips.filter(t => t.section === "deductions");
  const yd = getYearData(data.taxYear || 2024);
  const stdDed = yd.standardDeduction[data.filingStatus] || 14600;
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-orange-100 rounded-lg"><Calculator size={24} className="text-orange-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Deductions</h2>
          <p className="text-sm text-gray-500">Standard deduction or itemized \u2014 we'll pick the best one</p>
        </div>
      </div>
      <div className={`p-4 rounded-lg border-2 mb-5 ${calc.useItemized ? "border-orange-300 bg-orange-50" : "border-emerald-300 bg-emerald-50"}`}>
        <p className="text-sm font-medium text-gray-800">
          {calc.useItemized
            ? `Itemizing saves you ${fmt(calc.itemizedTotal - stdDed)} over the standard deduction`
            : `Standard deduction (${fmt(stdDed)}) is best \u2014 it exceeds your itemized deductions by ${fmt(stdDed - calc.itemizedTotal)}`}
        </p>
      </div>
      {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => {}} />)}
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
      {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => {}} />)}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">Education Credits</h3>
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <input type="checkbox" checked={data.hasEducation} onChange={e => setData({ ...data, hasEducation: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm font-medium text-gray-700">I have qualified education expenses (AOC)</span>
        </label>
        {data.hasEducation && (
          <>
            <CurrencyInput label="Qualified Education Expenses" value={data.educationExpenses} onChange={v => setData({ ...data, educationExpenses: v })} helpText="Tuition, fees, books \u2014 max $4,000 for AOC" />
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
  const yd = getYearData(data.taxYear || 2024);
  const totalStateWithheld = (data.w2s || []).reduce((s, w) => s + (w.stateWithheld || 0), 0);
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-100 rounded-lg"><Building2 size={24} className="text-indigo-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Illinois State Tax</h2>
          <p className="text-sm text-gray-500">IL uses a flat {(yd.ilRate * 100).toFixed(2)}% tax rate on federal AGI</p>
        </div>
      </div>
      <label className="flex items-center gap-3 mb-5 cursor-pointer">
        <input type="checkbox" checked={data.includeIL} onChange={e => setData({ ...data, includeIL: e.target.checked })}
          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <span className="text-sm font-medium text-gray-700">Include Illinois state tax calculation</span>
      </label>
      {data.includeIL && (
        <>
          {sectionTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => {}} />)}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Federal AGI</span><span className="font-medium">{fmt(calc.agi)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Personal Exemption</span><span className="font-medium">({fmt(yd.ilExemption[data.filingStatus] || 2425)})</span></div>
              <div className="flex justify-between border-t pt-2"><span className="text-gray-600">IL Taxable Income</span><span className="font-medium">{fmt(calc.ilTaxableIncome)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Tax @ {(yd.ilRate * 100).toFixed(2)}%</span><span className="font-medium">{fmt(calc.ilTax)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">IL Withholding (from W-2s)</span><span className="font-medium">({fmt(totalStateWithheld)})</span></div>
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
  const totalWages = (data.w2s || []).reduce((s, w) => s + (w.wages || 0), 0);
  const totalFedWithheld = (data.w2s || []).reduce((s, w) => s + (w.fedWithheld || 0), 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg"><BarChart3 size={24} className="text-blue-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tax Return Summary \u2014 {data.clientName || "Client"} ({data.taxYear})</h2>
          <p className="text-sm text-gray-500">Complete breakdown of federal return</p>
        </div>
      </div>

      {/* Big refund/owe card */}
      <div className={`rounded-xl p-6 mb-6 text-center ${calc.refund > 0 ? "bg-emerald-50 border-2 border-emerald-200" : calc.balanceDue > 0 ? "bg-red-50 border-2 border-red-200" : "bg-gray-50 border-2 border-gray-200"}`}>
        <p className="text-sm font-medium text-gray-600 uppercase tracking-wider mb-1">
          {calc.refund > 0 ? "Federal Refund" : calc.balanceDue > 0 ? "Federal Amount Owed" : "Federal Tax Due"}
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

      {/* Income breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">Income</h3>
        <div className="space-y-2 text-sm">
          {totalWages > 0 && <div className="flex justify-between"><span className="text-gray-600">W-2 Wages ({(data.w2s || []).length} form{(data.w2s || []).length > 1 ? "s" : ""})</span><span>{fmt(totalWages)}</span></div>}
          {data.taxableInterest > 0 && <div className="flex justify-between"><span className="text-gray-600">Taxable Interest</span><span>{fmt(data.taxableInterest)}</span></div>}
          {data.ordinaryDividends > 0 && <div className="flex justify-between"><span className="text-gray-600">Ordinary Dividends</span><span>{fmt(data.ordinaryDividends)}</span></div>}
          {data.capitalGains !== 0 && <div className="flex justify-between"><span className="text-gray-600">Capital Gains/(Losses)</span><span>{fmt(data.capitalGains)}</span></div>}
          {data.hasBusiness && <div className="flex justify-between"><span className="text-gray-600">Schedule C Net ({data.businessName || "Business"})</span><span>{fmt(calc.netBiz)}</span></div>}
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Income</span><span>{fmt(calc.totalIncome)}</span></div>
          {calc.aboveLineAdj > 0 && <div className="flex justify-between"><span className="text-gray-600">Above-Line Adjustments (1/2 SE tax)</span><span>({fmt(calc.aboveLineAdj)})</span></div>}
          <div className="flex justify-between font-semibold"><span>Adjusted Gross Income</span><span>{fmt(calc.agi)}</span></div>
        </div>
      </div>

      {/* Tax computation */}
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

      {/* Payments */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3">Payments & Refundable Credits</h3>
        <div className="space-y-2 text-sm">
          {totalFedWithheld > 0 && <div className="flex justify-between"><span className="text-gray-600">W-2 Withholding</span><span>{fmt(totalFedWithheld)}</span></div>}
          {data.otherWithheld > 0 && <div className="flex justify-between"><span className="text-gray-600">1099 Withholding</span><span>{fmt(data.otherWithheld)}</span></div>}
          {calc.aoc.refundable > 0 && <div className="flex justify-between"><span className="text-gray-600">Refundable AOC (40%)</span><span>{fmt(calc.aoc.refundable)}</span></div>}
          {(data.otherRefundableCredits || 0) > 0 && <div className="flex justify-between"><span className="text-gray-600">Other Refundable Credits</span><span>{fmt(data.otherRefundableCredits)}</span></div>}
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Payments</span><span>{fmt(calc.totalPayments)}</span></div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Edit3 size={16} /> Client Notes</h3>
        <textarea value={data.notes || ""} onChange={e => {/* notes handled by parent */}}
          className="w-full p-3 border border-gray-300 rounded-lg text-sm min-h-[80px]" placeholder="Add notes about this client/return..."
          readOnly />
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Lightbulb size={18} className="text-amber-500" /> Tax Optimization Recommendations</h3>
        {allTips.length === 0 ? (
          <p className="text-sm text-gray-500">No specific recommendations at this time.</p>
        ) : (
          <div className="space-y-3">
            {allTips.map((t, i) => <TipPopup key={i} tip={t} onClose={() => {}} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// SECTION 7: MAIN COMPONENT
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export function TaxCalculatorPage() {
  const [view, setView] = useState("dashboard"); // "dashboard" | "calculator"
  const [step, setStep] = useState(1);
  const totalSteps = 7;
  const [data, setData] = useState(createBlankClient());
  const [saveStatus, setSaveStatus] = useState("");

  // Auto-save timer
  useEffect(() => {
    if (view !== "calculator" || !data.id) return;
    const timer = setTimeout(() => {
      const clients = loadClients();
      const idx = clients.findIndex(c => c.id === data.id);
      const updated = { ...data, updatedAt: new Date().toISOString() };
      if (idx >= 0) { clients[idx] = updated; } else { clients.push(updated); }
      saveClients(clients);
    }, 2000); // auto-save after 2s of inactivity
    return () => clearTimeout(timer);
  }, [data, view]);

  const handleSelectClient = (client) => {
    // Ensure w2s array exists (backward compat)
    if (!client.w2s) {
      client.w2s = [{ employer: "", wages: client.wages || 0, fedWithheld: client.fedWithheld || 0, stateWithheld: client.stateWithheld || 0 }];
    }
    setData(client);
    setStep(1);
    setView("calculator");
  };

  const handleNewClient = () => {
    const blank = createBlankClient();
    setData(blank);
    setStep(1);
    setView("calculator");
  };

  const handleSave = () => {
    const clients = loadClients();
    const idx = clients.findIndex(c => c.id === data.id);
    const updated = { ...data, updatedAt: new Date().toISOString() };
    if (idx >= 0) { clients[idx] = updated; } else { clients.push(updated); }
    saveClients(clients);
    setData(updated);
    setSaveStatus("Saved!");
    setTimeout(() => setSaveStatus(""), 2000);
  };

  const handleBackToDashboard = () => {
    handleSave(); // save before leaving
    setView("dashboard");
  };

  // ââ Calculation Engine ââ
  const calc = useMemo(() => {
    const fs = data.filingStatus;
    const year = data.taxYear || 2024;
    const yd = getYearData(year);

    // Sum W-2s
    const totalWages = (data.w2s || []).reduce((s, w) => s + num(w.wages), 0);
    const totalFedWithheld = (data.w2s || []).reduce((s, w) => s + num(w.fedWithheld), 0);
    const totalStateWithheld = (data.w2s || []).reduce((s, w) => s + num(w.stateWithheld), 0);

    // Business (use num() to guard against string/NaN contamination from form inputs)
    const cogs = Math.max(0, num(data.beginInventory) + num(data.costLabor) + num(data.otherCOGS) - num(data.endInventory));
    const bizExpenses = num(data.bizAdvertising) + num(data.bizOffice) + num(data.bizRepairs) + num(data.bizTravel) + num(data.bizMeals) + num(data.bizOther) + num(data.bizVehicle) + num(data.bizInsurance) + num(data.bizSupplies) + num(data.bizPhone);
    const netBiz = data.hasBusiness ? num(data.grossReceipts) - cogs - bizExpenses : 0;

    const totalIncome = totalWages + num(data.taxableInterest) + num(data.ordinaryDividends) + num(data.capitalGains) + netBiz;

    // Self-employment tax
    const seTax = data.hasBusiness ? calcSETax(Math.max(0, num(netBiz)), year) : 0;
    const seDeduction = Math.round(seTax / 2);
    const aboveLineAdj = seDeduction;
    const agi = Math.max(0, totalIncome - aboveLineAdj);

    // Deductions
    const stdDed = yd.standardDeduction[fs] || 14600;
    const medAllowable = Math.max(0, num(data.medicalExpenses) - agi * 0.075);
    const saltCapped = Math.min(num(data.saltDeduction), 10000);
    const itemizedTotal = medAllowable + saltCapped + num(data.mortgageInterest) + num(data.charitableContrib);
    const useItemized = itemizedTotal > stdDed;
    const deduction = useItemized ? itemizedTotal : stdDed;

    // QBI deduction
    let qbiDeduction = 0;
    if (data.hasBusiness && netBiz > 0) {
      const qbiAfterCarryforward = Math.max(0, netBiz - num(data.qbiLossCarryforward));
      qbiDeduction = Math.round(qbiAfterCarryforward * 0.20);
    }

    const taxableIncome = Math.max(0, agi - deduction - qbiDeduction);

    // Tax computation with qualified dividends
    const qualDiv = num(data.qualDividends);
    const ordinaryIncome = Math.max(0, taxableIncome - qualDiv);
    const incomeTax = calcFederalTax(ordinaryIncome, fs, year) + calcQualDivTax(qualDiv, taxableIncome, fs, year);

    // Credits
    const aoc = data.hasEducation ? calcAOC(num(data.educationExpenses)) : { total: 0, nonrefundable: 0, refundable: 0 };
    const totalNonrefundableCredits = Math.min(incomeTax, aoc.nonrefundable + num(data.childTaxCredit) + num(data.otherCredits));
    const taxAfterCredits = Math.max(0, incomeTax - totalNonrefundableCredits);
    const totalTax = taxAfterCredits + seTax;

    // Payments
    const totalWithholding = totalFedWithheld + num(data.otherWithheld);
    const totalRefundableCredits = aoc.refundable + num(data.otherRefundableCredits);
    const totalPayments = totalWithholding + totalRefundableCredits;

    const refund = Math.max(0, totalPayments - totalTax);
    const balanceDue = Math.max(0, totalTax - totalPayments);

    // Illinois
    const ilExemption = yd.ilExemption[fs] || 2425;
    const ilTaxableIncome = Math.max(0, agi - ilExemption);
    const ilTax = Math.round(ilTaxableIncome * yd.ilRate);
    const ilRefund = Math.max(0, totalStateWithheld - ilTax);
    const ilBalanceDue = Math.max(0, ilTax - totalStateWithheld);

    return {
      cogs, bizExpenses, netBiz, totalIncome, seTax, seDeduction, aboveLineAdj, agi,
      stdDed, itemizedTotal, useItemized, deduction, qbiDeduction, taxableIncome,
      incomeTax, aoc, totalNonrefundableCredits, totalTax, totalPayments, refund, balanceDue,
      ilTaxableIncome, ilTax, ilRefund, ilBalanceDue,
    };
  }, [data]);

  const tips = useMemo(() => generateTips(data, calc), [data, calc]);

  // ââ Dashboard View ââ
  if (view === "dashboard") {
    return <ClientDashboard onSelectClient={handleSelectClient} onNewClient={handleNewClient} />;
  }

  // ââ Calculator View ââ
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
      <RefundTracker refund={calc.refund} balanceDue={calc.balanceDue} step={step} totalSteps={totalSteps} clientName={data.clientName} taxYear={data.taxYear} />

      {/* Top bar with save/back */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between">
          <button onClick={handleBackToDashboard} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 transition">
            <ArrowLeft size={16} /> All Clients
          </button>
          <div className="flex items-center gap-3">
            {saveStatus && <span className="text-xs text-emerald-600 font-medium">{saveStatus}</span>}
            <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition">
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex justify-between">
            {stepLabels.map((label, i) => (
              <button key={i} onClick={() => setStep(i + 1)}
                className={`text-xs font-medium px-2 py-1 rounded transition ${step === i + 1 ? "bg-blue-100 text-blue-700" : i + 1 < step ? "text-emerald-600" : "text-gray-400"}`}>
                {i + 1 < step ? "\u2713 " : ""}{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notes editor (always accessible) */}
      {step === 7 && (
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <label className="block text-xs font-medium text-amber-800 mb-1">Client Notes (editable)</label>
            <textarea value={data.notes || ""} onChange={e => setData({ ...data, notes: e.target.value })}
              className="w-full p-2 border border-amber-200 rounded text-sm min-h-[60px] bg-white" placeholder="Add filing notes, IP PINs, bank info..." />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-gray-50 min-h-[500px]">
          {renderStep()}
          <StepNav step={step} setStep={setStep} totalSteps={totalSteps} />
        </div>
        <p className="text-center text-xs text-gray-400 mt-8">TaxGen AI Calculator \u2022 {data.taxYear || 2024} Tax Year \u2022 For estimation purposes only</p>
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
