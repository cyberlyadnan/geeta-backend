export interface SalesRegisterRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  gstNumber: string | null;
  customerType: string;
  orderNumbers: string[];
  subtotal: number;
  deliveryCharge: number;
  gstAmount: number;
  total: number;
  amountReceived: number;
  outstanding: number;
}

export interface GroupedAmountRow {
  key: string;
  label: string;
  amount: number;
  count: number;
  /** Share of the group total, so a chart or a bar can be drawn without recomputing. */
  percentage: number;
}
