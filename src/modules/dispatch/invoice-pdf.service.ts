import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type InvoiceLine = {
  orderNumber: string;
  description: string;
  attributes?: string[];
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
 * StandardFonts are WinAnsi-encoded and cannot render the rupee sign (U+20B9).
 * Amounts are prefixed "Rs." for that reason.
 */
function money(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, decimals] = fixed.split('.');
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
  const fontOblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const left = 40;
  const right = 555;
  let y = 800;

  const text = (value: string, x: number, size = 9, bold = false, oblique = false, color = rgb(0.1, 0.1, 0.1)) => {
    let selectedFont = font;
    if (bold) selectedFont = fontBold;
    else if (oblique) selectedFont = fontOblique;
    page.drawText(value, { x, y, size, font: selectedFont, color });
  };

  const rightAligned = (value: string, size = 9, bold = false, oblique = false, color = rgb(0.1, 0.1, 0.1)) => {
    let selectedFont = font;
    if (bold) selectedFont = fontBold;
    else if (oblique) selectedFont = fontOblique;
    const width = selectedFont.widthOfTextAtSize(value, size);
    page.drawText(value, { x: right - width, y, size, font: selectedFont, color });
  };

  const drawRect = (x: number, yPos: number, width: number, height: number, color = rgb(0.95, 0.95, 0.95)) => {
    page.drawRectangle({ x, y: yPos, width, height, color });
  };

  const rule = (thickness = 0.5, color = rgb(0.8, 0.8, 0.8)) => {
    page.drawLine({
      start: { x: left, y: y + 4 },
      end: { x: right, y: y + 4 },
      thickness,
      color,
    });
  };

  // Header Box / Branding
  text('GEETA PRINTERS', left, 20, true, false, rgb(0.05, 0.15, 0.3));
  rightAligned('TAX INVOICE', 14, true, false, rgb(0.05, 0.15, 0.3));
  y -= 14;
  text('Premium Commercial Printing & Packaging Solutions', left, 8.5, false, true, rgb(0.4, 0.4, 0.4));
  y -= 12;
  
  // Business Address & Contact Info
  text('Plot No. 42, Okhla Industrial Area, Phase-III, New Delhi - 110020', left, 8.5, false, false, rgb(0.3, 0.3, 0.3));
  rightAligned(`Invoice No: ${data.invoiceNumber}`, 9.5, true);
  y -= 10;
  text('Email: billing@geetaprinters.in  |  Tel: +91 11 4987 6543  |  Web: www.geetaprinters.in', left, 8.5, false, false, rgb(0.3, 0.3, 0.3));
  rightAligned(`Date: ${data.invoiceDate}`, 9, false);
  y -= 10;
  text('GSTIN: 07AAAAA1234A1Z1', left, 9, true, false, rgb(0.1, 0.1, 0.1));
  rightAligned(`Dispatch Shift: ${data.dispatchDate} (${data.shiftLabel})`, 8.5, false, true);
  y -= 16;

  rule(1.5, rgb(0.05, 0.15, 0.3));
  y -= 16;

  // Billed To Column vs Invoice details
  text('BILLED TO:', left, 9, true, false, rgb(0.4, 0.4, 0.4));
  y -= 12;
  text(data.billedToName, left, 11, true, false, rgb(0.05, 0.15, 0.3));
  y -= 12;
  text(data.gstNumber ? `GSTIN: ${data.gstNumber}` : 'GSTIN: Unregistered / Consumer', left, 9, false, false, rgb(0.2, 0.2, 0.2));
  y -= 22;

  // Table Header Background
  drawRect(left, y - 4, right - left, 18, rgb(0.05, 0.15, 0.3));
  text('Order ID', left + 8, 9, true, false, rgb(1, 1, 1));
  text('Description', left + 120, 9, true, false, rgb(1, 1, 1));
  text('Quantity', left + 370, 9, true, false, rgb(1, 1, 1));
  rightAligned('Amount', 9, true, false, rgb(1, 1, 1));
  y -= 18;

  // Table Body
  for (const line of data.lines) {
    // Alternating rows background
    y -= 4;
    text(line.orderNumber, left + 8, 8.5);
    text(line.description.length > 50 ? `${line.description.slice(0, 48)}...` : line.description, left + 120, 8.5, true);
    text(String(line.quantity), left + 370, 8.5);
    rightAligned(money(line.amount), 8.5);
    y -= 12;

    if (line.attributes && line.attributes.length > 0) {
      const maxAttrWidth = 240;
      let currentLine = "";
      for (const attr of line.attributes) {
        if (!attr) continue;
        const nextPart = currentLine ? `, ${attr}` : attr;
        const width = font.widthOfTextAtSize(currentLine + nextPart, 7.5);
        if (width > maxAttrWidth) {
          if (currentLine) {
            text(currentLine, left + 120, 7.5, false, false, rgb(0.3, 0.3, 0.3));
            y -= 10;
          }
          currentLine = attr;
        } else {
          currentLine += nextPart;
        }
      }
      if (currentLine) {
        text(currentLine, left + 120, 7.5, false, false, rgb(0.3, 0.3, 0.3));
        y -= 10;
      }
      y -= 2;
    }

    rule(0.25, rgb(0.9, 0.9, 0.9));

    if (y < 180) {
      // Long batches roll over to next page
      page = pdf.addPage([595, 842]);
      y = 800;
      // Redraw simple headers on new page
      drawRect(left, y - 4, right - left, 18, rgb(0.05, 0.15, 0.3));
      text('Order ID', left + 8, 9, true, false, rgb(1, 1, 1));
      text('Description', left + 120, 9, true, false, rgb(1, 1, 1));
      text('Quantity', left + 370, 9, true, false, rgb(1, 1, 1));
      rightAligned('Amount', 9, true, false, rgb(1, 1, 1));
      y -= 18;
    }
  }

  y -= 8;
  rule(1, rgb(0.05, 0.15, 0.3));
  y -= 16;

  // Calculation Breakdown Columns
  const halfGst = data.gstAmount / 2;
  const halfGstRateLabel = `${((data.gstRate / 2) * 100).toFixed(1)}%`;

  const totalRow = (label: string, valueStr: string, bold = false) => {
    text(label, left + 280, 9.5, bold);
    rightAligned(valueStr, 9.5, bold);
    y -= 14;
  };

  totalRow('Subtotal (Items):', money(data.subtotal));
  totalRow('Delivery Charge:', money(data.deliveryCharge));
  totalRow(`CGST @ ${halfGstRateLabel}:`, money(halfGst));
  totalRow(`SGST @ ${halfGstRateLabel}:`, money(halfGst));
  
  y -= 2;
  page.drawLine({
    start: { x: left + 280, y: y + 4 },
    end: { x: right, y: y + 4 },
    thickness: 1,
    color: rgb(0.05, 0.15, 0.3),
  });
  y -= 14;
  totalRow('Grand Total:', money(data.total), true);

  // Bottom Notice
  y -= 20;
  drawRect(left, y - 24, right - left, 34, rgb(0.96, 0.98, 1));
  y -= 12;
  text('Note: Individual items were paid at the time of order placement.', left + 10, 8, false, true, rgb(0.2, 0.3, 0.5));
  y -= 10;
  text('Only the Delivery Charge & associated GST are debited from your wallet during dispatch.', left + 10, 8, false, true, rgb(0.2, 0.3, 0.5));
  
  // Terms & Conditions Block
  y -= 36;
  text('TERMS & CONDITIONS:', left, 8.5, true, false, rgb(0.3, 0.3, 0.3));
  y -= 12;
  text('1. Goods once sold will not be taken back or exchanged.', left, 7.5, false, false, rgb(0.4, 0.4, 0.4));
  y -= 9;
  text('2. All disputes are subject to local jurisdiction of Delhi courts only.', left, 7.5, false, false, rgb(0.4, 0.4, 0.4));
  y -= 9;
  text('3. This is a computer-generated tax invoice and does not require a physical signature.', left, 7.5, false, false, rgb(0.4, 0.4, 0.4));

  // Footer Signature Line
  y -= 20;
  rightAligned('For GEETA PRINTERS', 9, true, false, rgb(0.05, 0.15, 0.3));
  y -= 15;
  rightAligned('(Authorized Signatory)', 8, false, true, rgb(0.4, 0.4, 0.4));

  return pdf.save();
}
