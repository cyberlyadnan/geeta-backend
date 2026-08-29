/**
 * Canonical chart-of-accounts codes.
 *
 * Posting rules resolve accounts by these codes, never by name and never by id, so the codes are
 * part of the system's contract: renaming an account in the UI is safe, changing its code is not
 * (which is why every account listed here is seeded with `isSystem: true` and the API refuses to
 * re-code it).
 *
 * Numbering follows the convention an Indian CA expects on sight:
 *   1xxx assets · 2xxx liabilities · 3xxx equity · 4xxx income · 5xxx cost of sales · 6xxx expenses
 */
export const ACCOUNT_CODES = {
  // ── Assets ────────────────────────────────────────────────────────────────
  CASH_IN_HAND: '1100',
  PETTY_CASH: '1110',
  BANK_ACCOUNTS: '1200',
  /** Money Razorpay has collected but not yet settled into the bank. */
  PAYMENT_GATEWAY_RECEIVABLE: '1250',
  ACCOUNTS_RECEIVABLE: '1300',
  /** Udhar outstanding — legally a receivable, tracked apart so the risk is visible. */
  UDHAR_RECEIVABLE: '1310',
  INPUT_CGST: '1410',
  INPUT_SGST: '1420',
  INPUT_IGST: '1430',
  /** GST paid on purchases that is not claimable — expensed at period close. */
  INPUT_TAX_INELIGIBLE: '1440',
  INVENTORY_MATERIALS: '1500',
  ADVANCE_TO_SUPPLIERS: '1520',
  PREPAID_EXPENSES: '1530',
  TDS_RECEIVABLE: '1540',
  FIXED_ASSETS_MACHINERY: '1610',
  FIXED_ASSETS_FURNITURE: '1620',
  FIXED_ASSETS_COMPUTERS: '1630',
  ACCUMULATED_DEPRECIATION: '1690',
  /** Balancing account for opening balances and for any projection that cannot be attributed. */
  SUSPENSE: '1900',

  // ── Liabilities ───────────────────────────────────────────────────────────
  ACCOUNTS_PAYABLE: '2100',
  EXPENSES_PAYABLE: '2110',
  /** Customer wallet money the business holds — a liability, not income. */
  CUSTOMER_WALLET_LIABILITY: '2300',
  /** Money received against an order not yet invoiced. Becomes revenue at invoice. */
  CUSTOMER_ADVANCES: '2310',
  OUTPUT_CGST: '2210',
  OUTPUT_SGST: '2220',
  OUTPUT_IGST: '2230',
  OUTPUT_CESS: '2240',
  TDS_PAYABLE: '2400',
  SALARY_PAYABLE: '2410',
  LOANS_PAYABLE: '2500',

  // ── Equity ────────────────────────────────────────────────────────────────
  OWNERS_CAPITAL: '3100',
  RETAINED_EARNINGS: '3200',
  DRAWINGS: '3300',

  // ── Income ────────────────────────────────────────────────────────────────
  SALES_PRINTING: '4100',
  SALES_DESIGN_SERVICE: '4110',
  DELIVERY_INCOME: '4200',
  OTHER_INCOME: '4300',
  /** Contra-revenue: credit notes land here so gross sales stays intact on the P&L. */
  SALES_RETURNS_AND_ALLOWANCES: '4900',

  // ── Cost of sales ─────────────────────────────────────────────────────────
  PURCHASE_PAPER_MATERIAL: '5100',
  OUTSOURCED_PRINTING: '5200',
  INK_AND_CONSUMABLES: '5300',
  DIRECT_LABOUR: '5400',
  MACHINE_RUNNING_COST: '5500',
  PACKING_MATERIAL: '5600',

  // ── Operating expenses ────────────────────────────────────────────────────
  SALARIES_AND_WAGES: '6100',
  RENT: '6200',
  ELECTRICITY_AND_UTILITIES: '6300',
  TRANSPORT_AND_DELIVERY: '6400',
  REPAIRS_AND_MAINTENANCE: '6500',
  MARKETING_AND_PROMOTION: '6600',
  /** Promotional wallet credit the business gives away — a marketing cost, not a discount. */
  CUSTOMER_INCENTIVES: '6610',
  OFFICE_AND_ADMIN: '6700',
  PROFESSIONAL_FEES: '6800',
  BANK_AND_GATEWAY_CHARGES: '6900',
  DEPRECIATION_EXPENSE: '6950',
  BAD_DEBTS: '6960',
  ROUNDING_DIFFERENCE: '6990',
  MISCELLANEOUS_EXPENSE: '6999',
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];
