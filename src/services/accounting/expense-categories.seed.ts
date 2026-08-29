import { ACCOUNT_CODES } from './account-codes.js';

export interface ExpenseCategorySeed {
  code: string;
  name: string;
  ledgerAccountCode: string;
  /** Whether GST paid on this head can be claimed back. Blocked credits are the exceptions. */
  inputCreditEligible: boolean;
  sortOrder: number;
}

/**
 * The expense heads a printing business actually spends against, pre-wired to ledger accounts so
 * the P&L organises itself with no setup.
 *
 * `inputCreditEligible` is set from the law rather than from convenience: staff welfare, food and
 * motor-vehicle expenses are blocked credits under section 17(5), and defaulting them to claimable
 * would quietly overstate the input tax credit every month until an assessment catches it.
 */
export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategorySeed[] = [
  { code: 'PAPER_MATERIAL', name: 'Paper & Material Purchase', ledgerAccountCode: ACCOUNT_CODES.PURCHASE_PAPER_MATERIAL, inputCreditEligible: true, sortOrder: 1 },
  { code: 'INK_CONSUMABLE', name: 'Ink & Consumables', ledgerAccountCode: ACCOUNT_CODES.INK_AND_CONSUMABLES, inputCreditEligible: true, sortOrder: 2 },
  { code: 'JOB_WORK', name: 'Outsourced Printing / Job Work', ledgerAccountCode: ACCOUNT_CODES.OUTSOURCED_PRINTING, inputCreditEligible: true, sortOrder: 3 },
  { code: 'PACKING', name: 'Packing Material', ledgerAccountCode: ACCOUNT_CODES.PACKING_MATERIAL, inputCreditEligible: true, sortOrder: 4 },
  { code: 'MACHINE_RUNNING', name: 'Machine Running & Plates', ledgerAccountCode: ACCOUNT_CODES.MACHINE_RUNNING_COST, inputCreditEligible: true, sortOrder: 5 },
  { code: 'SALARY', name: 'Salaries & Wages', ledgerAccountCode: ACCOUNT_CODES.SALARIES_AND_WAGES, inputCreditEligible: false, sortOrder: 10 },
  { code: 'LABOUR', name: 'Casual / Contract Labour', ledgerAccountCode: ACCOUNT_CODES.DIRECT_LABOUR, inputCreditEligible: true, sortOrder: 11 },
  { code: 'RENT', name: 'Shop / Godown Rent', ledgerAccountCode: ACCOUNT_CODES.RENT, inputCreditEligible: true, sortOrder: 12 },
  { code: 'ELECTRICITY', name: 'Electricity & Water', ledgerAccountCode: ACCOUNT_CODES.ELECTRICITY_AND_UTILITIES, inputCreditEligible: false, sortOrder: 13 },
  { code: 'TRANSPORT', name: 'Transport & Delivery', ledgerAccountCode: ACCOUNT_CODES.TRANSPORT_AND_DELIVERY, inputCreditEligible: true, sortOrder: 14 },
  { code: 'FUEL_VEHICLE', name: 'Fuel & Vehicle Running', ledgerAccountCode: ACCOUNT_CODES.TRANSPORT_AND_DELIVERY, inputCreditEligible: false, sortOrder: 15 },
  { code: 'REPAIRS', name: 'Repairs & Maintenance', ledgerAccountCode: ACCOUNT_CODES.REPAIRS_AND_MAINTENANCE, inputCreditEligible: true, sortOrder: 16 },
  { code: 'MARKETING', name: 'Marketing & Advertising', ledgerAccountCode: ACCOUNT_CODES.MARKETING_AND_PROMOTION, inputCreditEligible: true, sortOrder: 17 },
  { code: 'OFFICE', name: 'Office & Stationery', ledgerAccountCode: ACCOUNT_CODES.OFFICE_AND_ADMIN, inputCreditEligible: true, sortOrder: 18 },
  { code: 'TELECOM_INTERNET', name: 'Telephone & Internet', ledgerAccountCode: ACCOUNT_CODES.OFFICE_AND_ADMIN, inputCreditEligible: true, sortOrder: 19 },
  { code: 'SOFTWARE', name: 'Software & Subscriptions', ledgerAccountCode: ACCOUNT_CODES.OFFICE_AND_ADMIN, inputCreditEligible: true, sortOrder: 20 },
  { code: 'PROFESSIONAL', name: 'CA / Legal / Professional Fees', ledgerAccountCode: ACCOUNT_CODES.PROFESSIONAL_FEES, inputCreditEligible: true, sortOrder: 21 },
  { code: 'BANK_CHARGES', name: 'Bank & Gateway Charges', ledgerAccountCode: ACCOUNT_CODES.BANK_AND_GATEWAY_CHARGES, inputCreditEligible: true, sortOrder: 22 },
  { code: 'STAFF_WELFARE', name: 'Staff Welfare & Refreshment', ledgerAccountCode: ACCOUNT_CODES.OFFICE_AND_ADMIN, inputCreditEligible: false, sortOrder: 23 },
  { code: 'INSURANCE', name: 'Insurance', ledgerAccountCode: ACCOUNT_CODES.OFFICE_AND_ADMIN, inputCreditEligible: true, sortOrder: 24 },
  { code: 'MISC', name: 'Miscellaneous', ledgerAccountCode: ACCOUNT_CODES.MISCELLANEOUS_EXPENSE, inputCreditEligible: false, sortOrder: 99 },
];
