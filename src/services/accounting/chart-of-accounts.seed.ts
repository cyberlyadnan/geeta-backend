import { AccountSubType, AccountType, NormalBalance, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ACCOUNT_CODES } from './account-codes.js';

export interface AccountSeed {
  code: string;
  name: string;
  type: AccountType;
  subType: AccountSubType;
  parentCode?: string;
  description?: string;
  sortOrder?: number;
}

/** Debit-normal for what the business owns and spends, credit-normal for what it owes and earns. */
export function normalBalanceFor(type: AccountType): NormalBalance {
  return type === AccountType.ASSET || type === AccountType.EXPENSE
    ? NormalBalance.DEBIT
    : NormalBalance.CREDIT;
}

const A = AccountType;
const S = AccountSubType;

/**
 * The default chart. Group headers (1000/2000/…) exist so reports can render a tree; they are
 * never posted to directly — the posting rules only ever name a leaf.
 */
export const CHART_OF_ACCOUNTS_SEED: AccountSeed[] = [
  // Groups
  { code: '1000', name: 'Assets', type: A.ASSET, subType: S.OTHER_CURRENT_ASSET, sortOrder: 10 },
  { code: '2000', name: 'Liabilities', type: A.LIABILITY, subType: S.OTHER_CURRENT_LIABILITY, sortOrder: 20 },
  { code: '3000', name: 'Equity', type: A.EQUITY, subType: S.OWNERS_CAPITAL, sortOrder: 30 },
  { code: '4000', name: 'Income', type: A.INCOME, subType: S.SALES_REVENUE, sortOrder: 40 },
  { code: '5000', name: 'Cost of Sales', type: A.EXPENSE, subType: S.COST_OF_GOODS_SOLD, sortOrder: 50 },
  { code: '6000', name: 'Operating Expenses', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, sortOrder: 60 },

  // Assets
  { code: ACCOUNT_CODES.CASH_IN_HAND, name: 'Cash in Hand', type: A.ASSET, subType: S.CASH, parentCode: '1000', sortOrder: 1, description: 'Counter cash drawer.' },
  { code: ACCOUNT_CODES.PETTY_CASH, name: 'Petty Cash', type: A.ASSET, subType: S.CASH, parentCode: '1000', sortOrder: 2 },
  { code: ACCOUNT_CODES.BANK_ACCOUNTS, name: 'Bank Accounts', type: A.ASSET, subType: S.BANK, parentCode: '1000', sortOrder: 3 },
  { code: ACCOUNT_CODES.PAYMENT_GATEWAY_RECEIVABLE, name: 'Payment Gateway Receivable', type: A.ASSET, subType: S.PAYMENT_GATEWAY, parentCode: '1000', sortOrder: 4, description: 'Collected online but not yet settled to the bank.' },
  { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: 'Accounts Receivable (Sundry Debtors)', type: A.ASSET, subType: S.ACCOUNTS_RECEIVABLE, parentCode: '1000', sortOrder: 5 },
  { code: ACCOUNT_CODES.UDHAR_RECEIVABLE, name: 'Udhar (Credit) Receivable', type: A.ASSET, subType: S.CREDIT_RECEIVABLE, parentCode: '1000', sortOrder: 6 },
  { code: ACCOUNT_CODES.INPUT_CGST, name: 'Input CGST', type: A.ASSET, subType: S.INPUT_TAX, parentCode: '1000', sortOrder: 7 },
  { code: ACCOUNT_CODES.INPUT_SGST, name: 'Input SGST', type: A.ASSET, subType: S.INPUT_TAX, parentCode: '1000', sortOrder: 8 },
  { code: ACCOUNT_CODES.INPUT_IGST, name: 'Input IGST', type: A.ASSET, subType: S.INPUT_TAX, parentCode: '1000', sortOrder: 9 },
  { code: ACCOUNT_CODES.INPUT_TAX_INELIGIBLE, name: 'Ineligible Input Tax', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, parentCode: '6000', sortOrder: 45 },
  { code: ACCOUNT_CODES.INVENTORY_MATERIALS, name: 'Inventory — Paper & Materials', type: A.ASSET, subType: S.INVENTORY, parentCode: '1000', sortOrder: 10 },
  { code: ACCOUNT_CODES.ADVANCE_TO_SUPPLIERS, name: 'Advances to Suppliers', type: A.ASSET, subType: S.ADVANCE_TO_SUPPLIER, parentCode: '1000', sortOrder: 11 },
  { code: ACCOUNT_CODES.PREPAID_EXPENSES, name: 'Prepaid Expenses', type: A.ASSET, subType: S.PREPAID_EXPENSE, parentCode: '1000', sortOrder: 12 },
  { code: ACCOUNT_CODES.TDS_RECEIVABLE, name: 'TDS Receivable', type: A.ASSET, subType: S.OTHER_CURRENT_ASSET, parentCode: '1000', sortOrder: 13 },
  { code: ACCOUNT_CODES.FIXED_ASSETS_MACHINERY, name: 'Printing Machinery', type: A.ASSET, subType: S.FIXED_ASSET, parentCode: '1000', sortOrder: 20 },
  { code: ACCOUNT_CODES.FIXED_ASSETS_FURNITURE, name: 'Furniture & Fixtures', type: A.ASSET, subType: S.FIXED_ASSET, parentCode: '1000', sortOrder: 21 },
  { code: ACCOUNT_CODES.FIXED_ASSETS_COMPUTERS, name: 'Computers & Equipment', type: A.ASSET, subType: S.FIXED_ASSET, parentCode: '1000', sortOrder: 22 },
  { code: ACCOUNT_CODES.ACCUMULATED_DEPRECIATION, name: 'Accumulated Depreciation', type: A.ASSET, subType: S.ACCUMULATED_DEPRECIATION, parentCode: '1000', sortOrder: 23 },
  { code: ACCOUNT_CODES.SUSPENSE, name: 'Suspense', type: A.ASSET, subType: S.OTHER_CURRENT_ASSET, parentCode: '1000', sortOrder: 99, description: 'Holding account for opening balances and unattributed differences. Should read zero once the books are clean.' },

  // Liabilities
  { code: ACCOUNT_CODES.ACCOUNTS_PAYABLE, name: 'Accounts Payable (Sundry Creditors)', type: A.LIABILITY, subType: S.ACCOUNTS_PAYABLE, parentCode: '2000', sortOrder: 1 },
  { code: ACCOUNT_CODES.EXPENSES_PAYABLE, name: 'Expenses Payable', type: A.LIABILITY, subType: S.ACCRUED_LIABILITY, parentCode: '2000', sortOrder: 2 },
  { code: ACCOUNT_CODES.OUTPUT_CGST, name: 'Output CGST Payable', type: A.LIABILITY, subType: S.OUTPUT_TAX, parentCode: '2000', sortOrder: 3 },
  { code: ACCOUNT_CODES.OUTPUT_SGST, name: 'Output SGST Payable', type: A.LIABILITY, subType: S.OUTPUT_TAX, parentCode: '2000', sortOrder: 4 },
  { code: ACCOUNT_CODES.OUTPUT_IGST, name: 'Output IGST Payable', type: A.LIABILITY, subType: S.OUTPUT_TAX, parentCode: '2000', sortOrder: 5 },
  { code: ACCOUNT_CODES.OUTPUT_CESS, name: 'Output Cess Payable', type: A.LIABILITY, subType: S.OUTPUT_TAX, parentCode: '2000', sortOrder: 6 },
  { code: ACCOUNT_CODES.CUSTOMER_WALLET_LIABILITY, name: 'Customer Wallet Balances', type: A.LIABILITY, subType: S.CUSTOMER_WALLET_LIABILITY, parentCode: '2000', sortOrder: 7, description: 'Prepaid money held on behalf of customers. Never income.' },
  { code: ACCOUNT_CODES.CUSTOMER_ADVANCES, name: 'Customer Advances (Unbilled Orders)', type: A.LIABILITY, subType: S.CUSTOMER_ADVANCE, parentCode: '2000', sortOrder: 8, description: 'Money taken against orders not yet invoiced. Converts to revenue at invoice.' },
  { code: ACCOUNT_CODES.TDS_PAYABLE, name: 'TDS Payable', type: A.LIABILITY, subType: S.TAX_PAYABLE, parentCode: '2000', sortOrder: 9 },
  { code: ACCOUNT_CODES.SALARY_PAYABLE, name: 'Salary Payable', type: A.LIABILITY, subType: S.ACCRUED_LIABILITY, parentCode: '2000', sortOrder: 10 },
  { code: ACCOUNT_CODES.LOANS_PAYABLE, name: 'Loans Payable', type: A.LIABILITY, subType: S.LOAN, parentCode: '2000', sortOrder: 11 },

  // Equity
  { code: ACCOUNT_CODES.OWNERS_CAPITAL, name: "Owner's Capital", type: A.EQUITY, subType: S.OWNERS_CAPITAL, parentCode: '3000', sortOrder: 1 },
  { code: ACCOUNT_CODES.RETAINED_EARNINGS, name: 'Retained Earnings', type: A.EQUITY, subType: S.RETAINED_EARNINGS, parentCode: '3000', sortOrder: 2 },
  { code: ACCOUNT_CODES.DRAWINGS, name: 'Drawings', type: A.EQUITY, subType: S.DRAWINGS, parentCode: '3000', sortOrder: 3 },

  // Income
  { code: ACCOUNT_CODES.SALES_PRINTING, name: 'Printing Sales', type: A.INCOME, subType: S.SALES_REVENUE, parentCode: '4000', sortOrder: 1 },
  { code: ACCOUNT_CODES.SALES_DESIGN_SERVICE, name: 'Design Service Income', type: A.INCOME, subType: S.SERVICE_REVENUE, parentCode: '4000', sortOrder: 2 },
  { code: ACCOUNT_CODES.DELIVERY_INCOME, name: 'Delivery Charges Collected', type: A.INCOME, subType: S.SERVICE_REVENUE, parentCode: '4000', sortOrder: 3 },
  { code: ACCOUNT_CODES.OTHER_INCOME, name: 'Other Income', type: A.INCOME, subType: S.OTHER_INCOME, parentCode: '4000', sortOrder: 4 },
  { code: ACCOUNT_CODES.SALES_RETURNS_AND_ALLOWANCES, name: 'Sales Returns & Allowances', type: A.INCOME, subType: S.SALES_RETURN, parentCode: '4000', sortOrder: 9, description: 'Contra-revenue. Credit notes post here so gross sales stays visible.' },

  // Cost of sales
  { code: ACCOUNT_CODES.PURCHASE_PAPER_MATERIAL, name: 'Paper & Material Purchases', type: A.EXPENSE, subType: S.COST_OF_GOODS_SOLD, parentCode: '5000', sortOrder: 1 },
  { code: ACCOUNT_CODES.OUTSOURCED_PRINTING, name: 'Outsourced Printing & Job Work', type: A.EXPENSE, subType: S.COST_OF_GOODS_SOLD, parentCode: '5000', sortOrder: 2 },
  { code: ACCOUNT_CODES.INK_AND_CONSUMABLES, name: 'Ink & Consumables', type: A.EXPENSE, subType: S.COST_OF_GOODS_SOLD, parentCode: '5000', sortOrder: 3 },
  { code: ACCOUNT_CODES.DIRECT_LABOUR, name: 'Direct Labour', type: A.EXPENSE, subType: S.DIRECT_EXPENSE, parentCode: '5000', sortOrder: 4 },
  { code: ACCOUNT_CODES.MACHINE_RUNNING_COST, name: 'Machine Running Cost', type: A.EXPENSE, subType: S.DIRECT_EXPENSE, parentCode: '5000', sortOrder: 5 },
  { code: ACCOUNT_CODES.PACKING_MATERIAL, name: 'Packing Material', type: A.EXPENSE, subType: S.DIRECT_EXPENSE, parentCode: '5000', sortOrder: 6 },

  // Operating expenses
  { code: ACCOUNT_CODES.SALARIES_AND_WAGES, name: 'Salaries & Wages', type: A.EXPENSE, subType: S.PAYROLL_EXPENSE, parentCode: '6000', sortOrder: 1 },
  { code: ACCOUNT_CODES.RENT, name: 'Rent', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, parentCode: '6000', sortOrder: 2 },
  { code: ACCOUNT_CODES.ELECTRICITY_AND_UTILITIES, name: 'Electricity & Utilities', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, parentCode: '6000', sortOrder: 3 },
  { code: ACCOUNT_CODES.TRANSPORT_AND_DELIVERY, name: 'Transport & Delivery', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, parentCode: '6000', sortOrder: 4 },
  { code: ACCOUNT_CODES.REPAIRS_AND_MAINTENANCE, name: 'Repairs & Maintenance', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, parentCode: '6000', sortOrder: 5 },
  { code: ACCOUNT_CODES.MARKETING_AND_PROMOTION, name: 'Marketing & Promotion', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, parentCode: '6000', sortOrder: 6 },
  { code: ACCOUNT_CODES.CUSTOMER_INCENTIVES, name: 'Customer Incentives & Promotional Credit', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, parentCode: '6000', sortOrder: 7 },
  { code: ACCOUNT_CODES.OFFICE_AND_ADMIN, name: 'Office & Administration', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, parentCode: '6000', sortOrder: 8 },
  { code: ACCOUNT_CODES.PROFESSIONAL_FEES, name: 'Professional & Legal Fees', type: A.EXPENSE, subType: S.OPERATING_EXPENSE, parentCode: '6000', sortOrder: 9 },
  { code: ACCOUNT_CODES.BANK_AND_GATEWAY_CHARGES, name: 'Bank & Payment Gateway Charges', type: A.EXPENSE, subType: S.FINANCE_COST, parentCode: '6000', sortOrder: 10 },
  { code: ACCOUNT_CODES.DEPRECIATION_EXPENSE, name: 'Depreciation', type: A.EXPENSE, subType: S.DEPRECIATION, parentCode: '6000', sortOrder: 11 },
  { code: ACCOUNT_CODES.BAD_DEBTS, name: 'Bad Debts Written Off', type: A.EXPENSE, subType: S.OTHER_EXPENSE, parentCode: '6000', sortOrder: 12 },
  { code: ACCOUNT_CODES.ROUNDING_DIFFERENCE, name: 'Rounding Difference', type: A.EXPENSE, subType: S.OTHER_EXPENSE, parentCode: '6000', sortOrder: 90 },
  { code: ACCOUNT_CODES.MISCELLANEOUS_EXPENSE, name: 'Miscellaneous Expenses', type: A.EXPENSE, subType: S.OTHER_EXPENSE, parentCode: '6000', sortOrder: 99 },
];

/**
 * Idempotent installer. Safe to run on every boot and from the seed script: existing accounts keep
 * whatever name the admin gave them, only missing ones are created. Parents are resolved in a
 * second pass so seed order does not matter.
 */
export async function ensureChartOfAccounts(
  db: Pick<Prisma.TransactionClient, 'chartOfAccount'> = prisma,
): Promise<{ created: number; total: number }> {
  const existing = await db.chartOfAccount.findMany({ select: { code: true } });
  const have = new Set(existing.map((a) => a.code));
  let created = 0;

  for (const seed of CHART_OF_ACCOUNTS_SEED) {
    if (have.has(seed.code)) continue;
    await db.chartOfAccount.create({
      data: {
        code: seed.code,
        name: seed.name,
        type: seed.type,
        subType: seed.subType,
        normalBalance: normalBalanceFor(seed.type),
        description: seed.description ?? null,
        sortOrder: seed.sortOrder ?? 0,
        isSystem: true,
        isActive: true,
      },
    });
    created += 1;
  }

  // Second pass: wire parents now that every node exists.
  const all = await db.chartOfAccount.findMany({ select: { id: true, code: true, parentId: true } });
  const byCode = new Map(all.map((a) => [a.code, a]));
  for (const seed of CHART_OF_ACCOUNTS_SEED) {
    if (!seed.parentCode) continue;
    const node = byCode.get(seed.code);
    const parent = byCode.get(seed.parentCode);
    if (!node || !parent || node.parentId === parent.id) continue;
    await db.chartOfAccount.update({ where: { id: node.id }, data: { parentId: parent.id } });
  }

  return { created, total: all.length };
}
