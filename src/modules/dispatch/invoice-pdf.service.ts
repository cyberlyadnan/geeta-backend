import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type InvoiceLine = {
  orderNumber: string;
  description: string;
  quantity: number;
  amount: number;
};

export type InvoicePayload = {
  invoiceNumber: string;
  invoiceDate: string;
  billedToName: string;
  gstNumber: string | null;
  shiftLabel: string;
  dispatchDate: string;
  lines: InvoiceLine[];
  subtotal: number;
  deliveryCharge: number;
  gstRate: number;
  gstAmount: number;
  total: number;
};

/**
 * StandardFonts are WinAnsi-encoded and cannot render the rupee sign (U+20B9) — embedding it
 * throws at draw time. Amounts are prefixed "Rs." for that reason; do not swap in ₹ here
 * without also embedding a Unicode font.
 */
function money(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, decimals] = fixed.split('.');
  // Indian grouping: last 3 digits, then pairs (12,34,567.00).
  const lastThree = whole!.slice(-3);
  const rest = whole!.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  return `${amount < 0 ? '-' : ''}Rs. ${grouped}.${decimals}`;
}

export async function buildInvoicePdf(data: InvoicePayload): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const left = 40;
  const right = 555;
  let y = 800;

  const text = (value: string, x: number, size = 10, bold = false) => {
    page.drawText(value, { x, y, size, font: bold ? fontBold : font, color: rgb(0.1, 0.1, 0.1) });
  };

  const rightAligned = (value: string, size = 10, bold = false) => {
    const activeFont = bold ? fontBold : font;
    const width = activeFont.widthOfTextAtSize(value, size);
    text(value, right - width, size, bold);
  };

  const rule = () => {
    page.drawLine({
      start: { x: left, y: y + 4 },
      end: { x: right, y: y + 4 },
      thickness: 0.75,
      color: rgb(0.75, 0.75, 0.75),
    });
  };

  text('GEETA PRINT', left, 18, true);
  y -= 20;
  text('TAX INVOICE', left, 12, true);
  rightAligned(data.invoiceNumber, 12, true);
  y -= 16;
  text(`Date: ${data.invoiceDate}`, left, 9);
  rightAligned(`Dispatch: ${data.dispatchDate} · ${data.shiftLabel}`, 9);
  y -= 20;

  rule();
  y -= 14;
  text('Billed To', left, 10, true);
  y -= 14;
  text(data.billedToName, left, 10);
  y -= 12;
  text(data.gstNumber ? `GSTIN: ${data.gstNumber}` : 'GSTIN: Unregistered', left, 9);
  y -= 20;

  rule();
  y -= 14;
  text('Order', left, 9, true);
  text('Description', left + 110, 9, true);
  text('Qty', left + 360, 9, true);
  rightAligned('Amount', 9, true);
  y -= 6;
  rule();
  y -= 14;

  for (const line of data.lines) {
    text(line.orderNumber, left, 9);
    text(line.description.slice(0, 44), left + 110, 9);
    text(String(line.quantity), left + 360, 9);
    rightAligned(money(line.amount), 9);
    y -= 14;

    if (y < 140) {
      // Long batches continue on a fresh page rather than overprinting the totals block.
      page = pdf.addPage([595, 842]);
      y = 800;
    }
  }

  y -= 2;
  rule();
  y -= 16;

  const totalRow = (label: string, amount: number, bold = false) => {
    text(label, left + 300, 10, bold);
    rightAligned(money(amount), 10, bold);
    y -= 15;
  };

  totalRow('Subtotal (orders)', data.subtotal);
  totalRow('Delivery charge', data.deliveryCharge);
  totalRow(`GST @ ${(data.gstRate * 100).toFixed(0)}%`, data.gstAmount);
  y -= 2;
  rule();
  y -= 16;
  totalRow('Total', data.total, true);

  y -= 14;
  text(
    'Order amounts were charged at the time each order was placed. Only the delivery charge is',
    left,
    8,
  );
  y -= 10;
  text('billed at dispatch. This invoice consolidates both for the shipment above.', left, 8);
  y -= 18;
  text('This is a computer-generated invoice.', left, 8);

  return pdf.save();
}
