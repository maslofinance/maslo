// ─── Maslo Tax Estimator ─────────────────────────────────────────────────────
// 2024 tax year. Proper progressive brackets for all 50 states + DC.
// Handles W-2 (gross or net), 1099 self-employment, mixed, and business owners.
// NOT a substitute for a licensed CPA — for budgeting / reserve planning only.

export type FilingStatus   = 'single' | 'married_joint' | 'married_separate' | 'head_of_household'
export type EmploymentType = 'w2' | '1099' | 'mixed' | 'business_owner'
export type IncomeType     = 'gross' | 'net'

export interface TaxProfile {
  employmentType: EmploymentType
  incomeType: IncomeType
  w2MonthlyGross: number
  selfEmployedMonthlyGross: number
  filingStatus: FilingStatus
  state: string
  dependents: number
  annualDeductions: number          // pre-tax retirement contributions (401k, IRA, HSA)
  annualBusinessDeductions: number  // Schedule C deductions (home office, mileage, etc.)
}

export interface TaxEstimate {
  monthlyReserve: number
  effectiveRate: number
  annualTaxEstimate: number
  annualBusinessDeductions: number  // total Schedule C deductions applied
  taxSavingsFromDeductions: number  // how much less tax vs no deductions
  breakdown: {
    federalIncome: number
    selfEmploymentTax: number
    stateTax: number
    quarterlyPayment: number
  }
  needsQuarterlyPayments: boolean
  disclaimer: string
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Bracket { rate: number; upTo: number }
type BracketSet = Record<FilingStatus, Bracket[]>

// ── Utility ───────────────────────────────────────────────────────────────────
function calcTax(income: number, brackets: Bracket[]): number {
  if (income <= 0) return 0
  let tax = 0
  let prev = 0
  for (const b of brackets) {
    if (income <= prev) break
    tax += (Math.min(income, b.upTo) - prev) * b.rate
    prev = b.upTo
  }
  return tax
}

// ── 2024 Federal Brackets ─────────────────────────────────────────────────────
const FED_BRACKETS: BracketSet = {
  single: [
    { rate: 0.10, upTo: 11600 },
    { rate: 0.12, upTo: 47150 },
    { rate: 0.22, upTo: 100525 },
    { rate: 0.24, upTo: 191950 },
    { rate: 0.32, upTo: 243725 },
    { rate: 0.35, upTo: 609350 },
    { rate: 0.37, upTo: Infinity },
  ],
  married_joint: [
    { rate: 0.10, upTo: 23200 },
    { rate: 0.12, upTo: 94300 },
    { rate: 0.22, upTo: 201050 },
    { rate: 0.24, upTo: 383900 },
    { rate: 0.32, upTo: 487450 },
    { rate: 0.35, upTo: 731200 },
    { rate: 0.37, upTo: Infinity },
  ],
  married_separate: [
    { rate: 0.10, upTo: 11600 },
    { rate: 0.12, upTo: 47150 },
    { rate: 0.22, upTo: 100525 },
    { rate: 0.24, upTo: 191950 },
    { rate: 0.32, upTo: 243725 },
    { rate: 0.35, upTo: 365600 },
    { rate: 0.37, upTo: Infinity },
  ],
  head_of_household: [
    { rate: 0.10, upTo: 16550 },
    { rate: 0.12, upTo: 63100 },
    { rate: 0.22, upTo: 100500 },
    { rate: 0.24, upTo: 191950 },
    { rate: 0.32, upTo: 243700 },
    { rate: 0.35, upTo: 609350 },
    { rate: 0.37, upTo: Infinity },
  ],
}

const FED_STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single:            14600,
  married_joint:     29200,
  married_separate:  14600,
  head_of_household: 21900,
}

const CHILD_TAX_CREDIT = 2000  // per qualifying dependent

// ── State Tax Data ────────────────────────────────────────────────────────────
// Format: { brackets: Bracket[], standardDeduction: number }
// For flat-rate states, single bracket with upTo: Infinity.
// For no-income-tax states, rate: 0.
// Brackets listed as SINGLE filer. MFJ roughly doubles thresholds (noted where different).
// We use single-filer brackets for budgeting; MFJ/HOH adjustments are minor at this level.

interface StateData {
  brackets: Bracket[]
  standardDeduction: number  // single filer
  noIncomeTax: boolean
}

const STATE_TAX: Record<string, StateData> = {
  // ── No income tax states ──
  AK: { brackets: [], standardDeduction: 0, noIncomeTax: true },
  FL: { brackets: [], standardDeduction: 0, noIncomeTax: true },
  NV: { brackets: [], standardDeduction: 0, noIncomeTax: true },
  NH: { brackets: [], standardDeduction: 0, noIncomeTax: true },   // No tax on wages (interest/dividends only)
  SD: { brackets: [], standardDeduction: 0, noIncomeTax: true },
  TN: { brackets: [], standardDeduction: 0, noIncomeTax: true },   // No tax on wages since 2021
  TX: { brackets: [], standardDeduction: 0, noIncomeTax: true },
  WA: { brackets: [], standardDeduction: 0, noIncomeTax: true },
  WY: { brackets: [], standardDeduction: 0, noIncomeTax: true },

  // ── Flat rate states ──
  CO: { brackets: [{ rate: 0.044,  upTo: Infinity }], standardDeduction: 14600, noIncomeTax: false },
  IL: { brackets: [{ rate: 0.0495, upTo: Infinity }], standardDeduction: 0,     noIncomeTax: false },  // No std deduction
  IN: { brackets: [{ rate: 0.0305, upTo: Infinity }], standardDeduction: 0,     noIncomeTax: false },  // 2024 rate
  KY: { brackets: [{ rate: 0.04,   upTo: Infinity }], standardDeduction: 3160,  noIncomeTax: false },  // 2024 reduced to 4%
  MA: { brackets: [{ rate: 0.05,   upTo: Infinity }], standardDeduction: 0,     noIncomeTax: false },
  MI: { brackets: [{ rate: 0.0425, upTo: Infinity }], standardDeduction: 5400,  noIncomeTax: false },
  MS: { brackets: [{ rate: 0.047,  upTo: Infinity }], standardDeduction: 2300,  noIncomeTax: false },  // 2024 rate
  NC: { brackets: [{ rate: 0.0475, upTo: Infinity }], standardDeduction: 10750, noIncomeTax: false },
  PA: { brackets: [{ rate: 0.0307, upTo: Infinity }], standardDeduction: 0,     noIncomeTax: false },
  UT: { brackets: [{ rate: 0.0465, upTo: Infinity }], standardDeduction: 14600, noIncomeTax: false },
  AZ: { brackets: [{ rate: 0.025,  upTo: Infinity }], standardDeduction: 14600, noIncomeTax: false },  // Flat since 2023
  ID: { brackets: [{ rate: 0.058,  upTo: Infinity }], standardDeduction: 14600, noIncomeTax: false },  // Flat 2023+
  GA: { brackets: [{ rate: 0.0549, upTo: Infinity }], standardDeduction: 12000, noIncomeTax: false },  // 2024 transitional
  ND: { brackets: [{ rate: 0.0195, upTo: Infinity }], standardDeduction: 14600, noIncomeTax: false },  // 2024 flat

  // ── Progressive states ──
  AL: {
    brackets: [
      { rate: 0.02, upTo: 500 },
      { rate: 0.04, upTo: 3000 },
      { rate: 0.05, upTo: Infinity },
    ],
    standardDeduction: 3000, noIncomeTax: false,
  },
  AR: {
    brackets: [
      { rate: 0.02,  upTo: 4300 },
      { rate: 0.04,  upTo: 8500 },
      { rate: 0.049, upTo: Infinity },
    ],
    standardDeduction: 2200, noIncomeTax: false,
  },
  CA: {
    brackets: [
      { rate: 0.01,   upTo: 10756 },
      { rate: 0.02,   upTo: 25499 },
      { rate: 0.04,   upTo: 40245 },
      { rate: 0.06,   upTo: 55866 },
      { rate: 0.08,   upTo: 70606 },
      { rate: 0.093,  upTo: 360659 },
      { rate: 0.103,  upTo: 432787 },
      { rate: 0.113,  upTo: 721314 },
      { rate: 0.123,  upTo: 1000000 },
      { rate: 0.133,  upTo: Infinity },  // +1% Mental Health Services Tax
    ],
    standardDeduction: 5202, noIncomeTax: false,
  },
  CT: {
    brackets: [
      { rate: 0.02,   upTo: 10000 },
      { rate: 0.045,  upTo: 50000 },
      { rate: 0.055,  upTo: 100000 },
      { rate: 0.06,   upTo: 200000 },
      { rate: 0.065,  upTo: 250000 },
      { rate: 0.069,  upTo: 500000 },
      { rate: 0.0699, upTo: Infinity },
    ],
    standardDeduction: 15000, noIncomeTax: false,
  },
  DE: {
    brackets: [
      { rate: 0.00,  upTo: 2000 },
      { rate: 0.022, upTo: 5000 },
      { rate: 0.039, upTo: 10000 },
      { rate: 0.048, upTo: 20000 },
      { rate: 0.052, upTo: 25000 },
      { rate: 0.0555, upTo: 60000 },
      { rate: 0.066, upTo: Infinity },
    ],
    standardDeduction: 3250, noIncomeTax: false,
  },
  DC: {
    brackets: [
      { rate: 0.04,   upTo: 10000 },
      { rate: 0.06,   upTo: 40000 },
      { rate: 0.065,  upTo: 60000 },
      { rate: 0.085,  upTo: 250000 },
      { rate: 0.0925, upTo: 500000 },
      { rate: 0.0975, upTo: 1000000 },
      { rate: 0.1075, upTo: Infinity },
    ],
    standardDeduction: 14600, noIncomeTax: false,
  },
  HI: {
    brackets: [
      { rate: 0.014, upTo: 2400 },
      { rate: 0.032, upTo: 4800 },
      { rate: 0.055, upTo: 9600 },
      { rate: 0.064, upTo: 14400 },
      { rate: 0.068, upTo: 19200 },
      { rate: 0.072, upTo: 24000 },
      { rate: 0.076, upTo: 36000 },
      { rate: 0.079, upTo: 48000 },
      { rate: 0.0825, upTo: 150000 },
      { rate: 0.09,  upTo: 175000 },
      { rate: 0.10,  upTo: 200000 },
      { rate: 0.11,  upTo: Infinity },
    ],
    standardDeduction: 2200, noIncomeTax: false,
  },
  IA: {
    brackets: [
      { rate: 0.044,  upTo: 6000 },
      { rate: 0.0482, upTo: 30000 },
      { rate: 0.057,  upTo: Infinity },
    ],
    standardDeduction: 14600, noIncomeTax: false,
  },
  KS: {
    brackets: [
      { rate: 0.031, upTo: 15000 },
      { rate: 0.0525, upTo: 30000 },
      { rate: 0.057, upTo: Infinity },
    ],
    standardDeduction: 3500, noIncomeTax: false,
  },
  LA: {
    brackets: [
      { rate: 0.0185, upTo: 12500 },
      { rate: 0.035,  upTo: 50000 },
      { rate: 0.0425, upTo: Infinity },
    ],
    standardDeduction: 4500, noIncomeTax: false,
  },
  ME: {
    brackets: [
      { rate: 0.058,  upTo: 24500 },
      { rate: 0.0675, upTo: 58050 },
      { rate: 0.0715, upTo: Infinity },
    ],
    standardDeduction: 14600, noIncomeTax: false,
  },
  MD: {
    brackets: [
      { rate: 0.02,   upTo: 1000 },
      { rate: 0.03,   upTo: 2000 },
      { rate: 0.04,   upTo: 3000 },
      { rate: 0.0475, upTo: 100000 },
      { rate: 0.05,   upTo: 125000 },
      { rate: 0.0525, upTo: 150000 },
      { rate: 0.055,  upTo: 250000 },
      { rate: 0.0575, upTo: Infinity },
    ],
    standardDeduction: 2550, noIncomeTax: false,  // Maryland std ded is limited
  },
  MN: {
    brackets: [
      { rate: 0.0535, upTo: 30070 },
      { rate: 0.068,  upTo: 98760 },
      { rate: 0.0785, upTo: 183340 },
      { rate: 0.0985, upTo: Infinity },
    ],
    standardDeduction: 14575, noIncomeTax: false,
  },
  MO: {
    brackets: [
      { rate: 0.02,   upTo: 1121 },
      { rate: 0.025,  upTo: 2242 },
      { rate: 0.03,   upTo: 3363 },
      { rate: 0.035,  upTo: 4484 },
      { rate: 0.04,   upTo: 5605 },
      { rate: 0.045,  upTo: 6726 },
      { rate: 0.0495, upTo: Infinity },
    ],
    standardDeduction: 14600, noIncomeTax: false,
  },
  MT: {
    brackets: [
      { rate: 0.047, upTo: 20500 },
      { rate: 0.059, upTo: Infinity },
    ],
    standardDeduction: 14600, noIncomeTax: false,
  },
  NE: {
    brackets: [
      { rate: 0.0246, upTo: 3700 },
      { rate: 0.0351, upTo: 22170 },
      { rate: 0.0501, upTo: 35730 },
      { rate: 0.0664, upTo: Infinity },
    ],
    standardDeduction: 7900, noIncomeTax: false,
  },
  NJ: {
    brackets: [
      { rate: 0.014,  upTo: 20000 },
      { rate: 0.0175, upTo: 35000 },
      { rate: 0.035,  upTo: 40000 },
      { rate: 0.05525, upTo: 75000 },
      { rate: 0.0637, upTo: 500000 },
      { rate: 0.0897, upTo: 1000000 },
      { rate: 0.1075, upTo: Infinity },
    ],
    standardDeduction: 0, noIncomeTax: false,
  },
  NM: {
    brackets: [
      { rate: 0.017, upTo: 5500 },
      { rate: 0.032, upTo: 11000 },
      { rate: 0.047, upTo: 16000 },
      { rate: 0.049, upTo: 210000 },
      { rate: 0.059, upTo: Infinity },
    ],
    standardDeduction: 14600, noIncomeTax: false,
  },
  NY: {
    brackets: [
      { rate: 0.04,   upTo: 8500 },
      { rate: 0.045,  upTo: 11700 },
      { rate: 0.0525, upTo: 13900 },
      { rate: 0.055,  upTo: 21400 },
      { rate: 0.06,   upTo: 80650 },
      { rate: 0.0685, upTo: 215400 },
      { rate: 0.0965, upTo: 1077550 },
      { rate: 0.103,  upTo: 5000000 },
      { rate: 0.109,  upTo: Infinity },
    ],
    standardDeduction: 8000, noIncomeTax: false,
  },
  OH: {
    brackets: [
      { rate: 0.00,   upTo: 26050 },
      { rate: 0.0275, upTo: 100000 },
      { rate: 0.035,  upTo: Infinity },
    ],
    standardDeduction: 0, noIncomeTax: false,
  },
  OK: {
    brackets: [
      { rate: 0.0025, upTo: 1000 },
      { rate: 0.0075, upTo: 2500 },
      { rate: 0.0175, upTo: 3750 },
      { rate: 0.0275, upTo: 4900 },
      { rate: 0.0375, upTo: 7200 },
      { rate: 0.0475, upTo: Infinity },
    ],
    standardDeduction: 6350, noIncomeTax: false,
  },
  OR: {
    brackets: [
      { rate: 0.0475, upTo: 10200 },
      { rate: 0.0675, upTo: 25750 },
      { rate: 0.0875, upTo: 125000 },
      { rate: 0.099,  upTo: Infinity },
    ],
    standardDeduction: 2420, noIncomeTax: false,
  },
  RI: {
    brackets: [
      { rate: 0.0375, upTo: 77450 },
      { rate: 0.0475, upTo: 176050 },
      { rate: 0.0599, upTo: Infinity },
    ],
    standardDeduction: 10550, noIncomeTax: false,
  },
  SC: {
    brackets: [
      { rate: 0.00,  upTo: 3460 },
      { rate: 0.03,  upTo: 17330 },
      { rate: 0.064, upTo: Infinity },
    ],
    standardDeduction: 14600, noIncomeTax: false,
  },
  VA: {
    brackets: [
      { rate: 0.02,   upTo: 3000 },
      { rate: 0.03,   upTo: 5000 },
      { rate: 0.05,   upTo: 17000 },
      { rate: 0.0575, upTo: Infinity },
    ],
    standardDeduction: 8500, noIncomeTax: false,
  },
  VT: {
    brackets: [
      { rate: 0.0335, upTo: 45400 },
      { rate: 0.066,  upTo: 110050 },
      { rate: 0.076,  upTo: 229550 },
      { rate: 0.0875, upTo: Infinity },
    ],
    standardDeduction: 14600, noIncomeTax: false,
  },
  WI: {
    brackets: [
      { rate: 0.0354, upTo: 13810 },
      { rate: 0.0465, upTo: 27630 },
      { rate: 0.053,  upTo: 304170 },
      { rate: 0.0765, upTo: Infinity },
    ],
    standardDeduction: 12160, noIncomeTax: false,
  },
  WV: {
    brackets: [
      { rate: 0.0236, upTo: 10000 },
      { rate: 0.0315, upTo: 25000 },
      { rate: 0.0354, upTo: 40000 },
      { rate: 0.0472, upTo: 60000 },
      { rate: 0.0512, upTo: Infinity },
    ],
    standardDeduction: 0, noIncomeTax: false,
  },
}

// ── Main estimator ────────────────────────────────────────────────────────────
export function estimateTaxes(profile: TaxProfile): TaxEstimate {
  const {
    employmentType,
    incomeType,
    w2MonthlyGross,
    selfEmployedMonthlyGross,
    filingStatus,
    state,
    dependents,
    annualDeductions,
    annualBusinessDeductions,
  } = profile

  // W-2 net → employer already withheld everything, no reserve needed
  if (employmentType === 'w2' && incomeType === 'net') {
    return {
      monthlyReserve: 0,
      effectiveRate: 0,
      annualTaxEstimate: 0,
      annualBusinessDeductions: 0,
      taxSavingsFromDeductions: 0,
      breakdown: { federalIncome: 0, selfEmploymentTax: 0, stateTax: 0, quarterlyPayment: 0 },
      needsQuarterlyPayments: false,
      disclaimer: 'Your employer handles withholding. No reserve needed.',
    }
  }

  const annualW2    = w2MonthlyGross * 12
  const annualSE    = selfEmployedMonthlyGross * 12
  const annualGross = annualW2 + annualSE

  // ── Schedule C business deductions ────────────────────────────────
  // Applied against SE income BEFORE calculating SE tax and income tax.
  // IRS Schedule C: net profit = gross SE income − business expenses
  const bizDeds      = Math.min(annualBusinessDeductions, annualSE)  // can't deduct more than you earned
  const netSEIncome  = Math.max(annualSE - bizDeds, 0)

  // ── Self-employment tax ────────────────────────────────────────────
  // IRS: SE tax = 15.3% × 92.35% of net Schedule C profit (after business deductions)
  const seNetEarnings     = netSEIncome * 0.9235
  const selfEmploymentTax = seNetEarnings * 0.153
  // Half of SE tax is deductible above-the-line
  const seDeduction = selfEmploymentTax / 2

  // ── Federal income tax ─────────────────────────────────────────────
  // Taxable income = W-2 + net SE income (after biz deductions) − standard ded − se deduction − retirement
  const fedStdDed          = FED_STANDARD_DEDUCTION[filingStatus]
  const totalFedDeds       = fedStdDed + seDeduction + Math.min(annualDeductions, 66000)
  const childCredit        = Math.min(dependents, 3) * CHILD_TAX_CREDIT
  const federalTaxableIncome = Math.max(annualW2 + netSEIncome - totalFedDeds, 0)

  let federalTax = calcTax(federalTaxableIncome, FED_BRACKETS[filingStatus])
  federalTax = Math.max(federalTax - childCredit, 0)

  // Back out employer W-2 withholding
  let federalAlreadyWithheld = 0
  if (employmentType === 'w2' && incomeType === 'gross') {
    federalAlreadyWithheld = federalTax
  } else if (employmentType === 'mixed') {
    const w2Share = (annualW2 + netSEIncome) > 0 ? annualW2 / (annualW2 + netSEIncome) : 0
    federalAlreadyWithheld = federalTax * w2Share
  }
  const federalOwed = Math.max(federalTax - federalAlreadyWithheld, 0)

  // ── State income tax ───────────────────────────────────────────────
  const stateCode = state.toUpperCase()
  const stateData = STATE_TAX[stateCode]
  let stateTaxOwed = 0

  if (stateData && !stateData.noIncomeTax) {
    const stateStdDed  = stateData.standardDeduction
    const stateTaxable = Math.max(annualW2 + netSEIncome - stateStdDed - seDeduction, 0)
    const fullStateTax = calcTax(stateTaxable, stateData.brackets)

    let stateWithheld = 0
    if (employmentType === 'w2' && incomeType === 'gross') {
      stateWithheld = fullStateTax
    } else if (employmentType === 'mixed') {
      const w2Share = (annualW2 + netSEIncome) > 0 ? annualW2 / (annualW2 + netSEIncome) : 0
      stateWithheld = fullStateTax * w2Share
    }
    stateTaxOwed = Math.max(fullStateTax - stateWithheld, 0)
  }

  // ── Tax savings from business deductions ──────────────────────────
  // Calculate what tax would be WITHOUT deductions to show the savings
  const seNetNoDeds    = annualSE * 0.9235
  const seTaxNoDeds    = seNetNoDeds * 0.153
  const seDedNoDeds    = seTaxNoDeds / 2
  const fedTaxableNoDeds = Math.max(annualW2 + annualSE - fedStdDed - seDedNoDeds - Math.min(annualDeductions, 66000), 0)
  let fedTaxNoDeds     = Math.max(calcTax(fedTaxableNoDeds, FED_BRACKETS[filingStatus]) - childCredit, 0)
  if (employmentType === 'mixed') {
    const w2Share = annualGross > 0 ? annualW2 / annualGross : 0
    fedTaxNoDeds = fedTaxNoDeds * (1 - w2Share)
  }
  const totalNoDeds    = fedTaxNoDeds + seTaxNoDeds
  const taxSavings     = Math.max(Math.round(totalNoDeds) - Math.round(federalOwed + selfEmploymentTax), 0)

  // ── Totals ─────────────────────────────────────────────────────────
  const annualTaxEstimate = Math.round(federalOwed + selfEmploymentTax + stateTaxOwed)
  const monthlyReserve    = Math.round(annualTaxEstimate / 12)
  const effectiveRate     = annualGross > 0 ? annualTaxEstimate / annualGross : 0
  const quarterlyPayment  = Math.round(annualTaxEstimate / 4)
  const needsQuarterlyPayments = employmentType !== 'w2' || incomeType === 'gross'

  return {
    monthlyReserve,
    effectiveRate,
    annualTaxEstimate,
    annualBusinessDeductions: Math.round(bizDeds),
    taxSavingsFromDeductions: taxSavings,
    breakdown: {
      federalIncome:      Math.round(federalOwed),
      selfEmploymentTax:  Math.round(selfEmploymentTax),
      stateTax:           Math.round(stateTaxOwed),
      quarterlyPayment,
    },
    needsQuarterlyPayments,
    disclaimer: 'Estimate for budgeting purposes only. Consult a licensed CPA for filing.',
  }
}

// ── US State list ─────────────────────────────────────────────────────────────
export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'Washington D.C.' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
]
