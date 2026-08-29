export interface SupplierSummary {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  outstanding: number;
  isActive: boolean;
}

export interface PurchaseBillSummary {
  id: string;
  billNumber: string;
  supplierBillNumber: string;
  supplierName: string;
  billDate: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  outstanding: number;
  status: string;
  overdueDays: number;
}
