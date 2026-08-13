import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from 'pdf-lib';

export type InvoiceLine = {
  orderNumber: string;
  description: string;
  attributes?: string[];
  quantity: number;
  amount: number;
  hsnCode?: string;
};

export type CompanyInfo = {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  stateCode: string;
  pan: string;
  cin: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankBranch: string;
  terms: string;
};

export type InvoicePayload = {
  invoiceNumber: string;
  invoiceDate: string;
  billedToName: string;
  billedToAddress?: string;
  billedToState?: string;
  billedToStateCode?: string;
  memberCode?: string;
  gstNumber: string | null;
  shiftLabel: string;
  dispatchDate: string;
  lines: InvoiceLine[];
  subtotal: number;
  deliveryCharge: number;
  gstRate: number;
  gstAmount: number;
  total: number;
  eWayBillNo?: string;
  packedBy?: string;
  company?: CompanyInfo;
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

function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero';

  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);

  function convert(n: number): string {
    if (n < 20) return ones[n]!;
    if (n < 100) return `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
    if (n < 1000) return `${ones[Math.floor(n / 100)]} Hundred ${convert(n % 100)}`.trim();
    if (n < 100000) return `${convert(Math.floor(n / 1000))} Thousand ${convert(n % 1000)}`.trim();
    if (n < 10000000) return `${convert(Math.floor(n / 100000))} Lakh ${convert(n % 100000)}`.trim();
    return `${convert(Math.floor(n / 10000000))} Crore ${convert(n % 10000000)}`.trim();
  }

  let result = `Rupees ${convert(whole)}`;
  if (paise > 0) result += ` and ${convert(paise)} Paise`;
  return result + ' Only';
}

// Color palette
const NAVY = rgb(0.05, 0.12, 0.25);
const DARK_TEXT = rgb(0.1, 0.1, 0.1);
const MED_TEXT = rgb(0.3, 0.3, 0.3);
const LIGHT_TEXT = rgb(0.45, 0.45, 0.45);
const WHITE = rgb(1, 1, 1);
const HEADER_BG = rgb(0.05, 0.12, 0.25);
const ROW_ALT = rgb(0.97, 0.97, 0.98);
const ACCENT = rgb(0.15, 0.35, 0.55);
const BORDER = rgb(0.75, 0.78, 0.82);
export async function buildInvoicePdf(data: InvoicePayload): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const left = 36;
  const right = 559;
  const tableWidth = right - left;
  let y = 810;

  const text = (value: string, x: number, size = 9, bold = false, oblique = false, color: RGB = DARK_TEXT) => {
    let selectedFont = font;
    if (bold) selectedFont = fontBold;
    else if (oblique) selectedFont = fontOblique;
    page.drawText(value, { x, y, size, font: selectedFont, color });
  };

  const rightAligned = (value: string, size = 9, bold = false, oblique = false, color: RGB = DARK_TEXT) => {
    let selectedFont = font;
    if (bold) selectedFont = fontBold;
    else if (oblique) selectedFont = fontOblique;
    const width = selectedFont.widthOfTextAtSize(value, size);
    page.drawText(value, { x: right - width, y, size, font: selectedFont, color });
  };

  const drawRect = (x: number, yPos: number, width: number, height: number, color: RGB = ROW_ALT) => {
    page.drawRectangle({ x, y: yPos, width, height, color });
  };

  const hLine = (yPos: number, thickness = 0.5, color: RGB = BORDER) => {
    page.drawLine({ start: { x: left, y: yPos }, end: { x: right, y: yPos }, thickness, color });
  };

  // ── OUTER BORDER ──
  page.drawRectangle({ x: left - 2, y: 28, width: tableWidth + 4, height: 790, borderWidth: 1.5, borderColor: NAVY, color: rgb(1, 1, 1) });

  // ── HEADER ──
  const co = data.company;
  const coName = co?.companyName || 'GEETA PRINTERS';
  const coTagline = co?.tagline || 'Premium Commercial Printing & Packaging Solutions';
  const coAddress = co?.address || 'Plot No. 42, Okhla Industrial Area, Phase-III, New Delhi - 110020';
  const coCin = co?.cin || '';
  const coEmail = co?.email || 'billing@geetaprinters.in';
  const coPhone = co?.phone || '+91 11 4987 6543';
  const coGstin = co?.gstin || '07AAAAA1234A1Z1';
  const coState = co?.state || 'Delhi';
  const coStateCode = co?.stateCode || '07';
  const coPan = co?.pan || 'AAAAA1234A';

  drawRect(left, y - 6, tableWidth, 30, HEADER_BG);
  y -= 0;
  text(coName.toUpperCase(), left + 10, 16, true, false, WHITE);
  const taxLabel = 'TAX INVOICE';
  const taxW = fontBold.widthOfTextAtSize(taxLabel, 13);
  page.drawText(taxLabel, { x: right - taxW - 10, y: y - 2, size: 13, font: fontBold, color: WHITE });
  y -= 26;

  // ── SUB-HEADER ──
  y -= 6;
  text(coTagline, left + 10, 7.5, false, true, LIGHT_TEXT);
  y -= 10;
  text(coAddress, left + 10, 7.5, false, false, MED_TEXT);
  if (coCin) rightAligned(`CIN: ${coCin}`, 7.5, false, false, MED_TEXT);
  y -= 9;
  text(`Email: ${coEmail}  |  Tel: ${coPhone}`, left + 10, 7.5, false, false, MED_TEXT);
  y -= 9;
  text(`GSTIN: ${coGstin}  |  State: ${coState} (${coStateCode})`, left + 10, 8, true, false, DARK_TEXT);
  if (coPan) rightAligned(`PAN: ${coPan}`, 8, false, false, MED_TEXT);
  y -= 12;

  hLine(y + 4, 1.2, NAVY);
  y -= 6;

  // ── INVOICE DETAILS & BILLED-TO (two-column) ──
  const midCol = left + tableWidth / 2;

  // Left: Billed To
  text('BILLED TO', left + 10, 8, true, false, ACCENT);
  // Right: Invoice details
  page.drawText('Invoice Details', { x: midCol + 10, y, size: 8, font: fontBold, color: ACCENT });
  y -= 12;

  text(data.billedToName, left + 10, 10, true, false, NAVY);
  page.drawText(`Invoice No:`, { x: midCol + 10, y, size: 8, font: font, color: MED_TEXT });
  page.drawText(data.invoiceNumber, { x: midCol + 80, y, size: 9, font: fontBold, color: DARK_TEXT });
  y -= 11;

  if (data.billedToAddress) {
    text(data.billedToAddress, left + 10, 7.5, false, false, MED_TEXT);
  }
  page.drawText(`Invoice Date:`, { x: midCol + 10, y, size: 8, font: font, color: MED_TEXT });
  page.drawText(data.invoiceDate, { x: midCol + 80, y, size: 8.5, font: font, color: DARK_TEXT });
  y -= 11;

  text(data.gstNumber ? `GSTIN: ${data.gstNumber}` : 'GSTIN: Unregistered / Consumer', left + 10, 8, false, false, MED_TEXT);
  page.drawText(`Dispatch:`, { x: midCol + 10, y, size: 8, font: font, color: MED_TEXT });
  page.drawText(`${data.dispatchDate} (${data.shiftLabel})`, { x: midCol + 80, y, size: 8.5, font: font, color: DARK_TEXT });
  y -= 11;

  if (data.memberCode) {
    text(`Member Code: ${data.memberCode}`, left + 10, 8, false, false, MED_TEXT);
  }
  if (data.eWayBillNo) {
    page.drawText(`E-Way Bill:`, { x: midCol + 10, y, size: 8, font: font, color: MED_TEXT });
    page.drawText(data.eWayBillNo, { x: midCol + 80, y, size: 8.5, font: font, color: DARK_TEXT });
  }
  y -= 14;

  hLine(y + 4, 0.8, BORDER);
  y -= 4;

  // ── ORDER TABLE ──
  // Column positions
  const col = {
    sno: left + 4,
    order: left + 28,
    desc: left + 110,
    hsn: left + 300,
    qty: left + 355,
    rate: left + 400,
    amount: right - 8,
  };

  // Table header
  drawRect(left, y - 5, tableWidth, 18, HEADER_BG);
  const th = (label: string, x: number, alignRight = false) => {
    const w = fontBold.widthOfTextAtSize(label, 8);
    page.drawText(label, { x: alignRight ? x - w : x, y: y - 1, size: 8, font: fontBold, color: WHITE });
  };
  th('S.No', col.sno);
  th('Order ID', col.order);
  th('Description', col.desc);
  th('HSN', col.hsn);
  th('Qty', col.qty);
  th('Rate', col.rate);
  th('Amount', col.amount, true);
  y -= 18;

  // Table rows
  for (let i = 0; i < data.lines.length; i++) {
    const line = data.lines[i]!;
    const isAlt = i % 2 === 1;

    y -= 2;
    if (isAlt) {
      drawRect(left, y - 10, tableWidth, 14, ROW_ALT);
    }

    const unitRate = line.quantity > 0 ? line.amount / line.quantity : line.amount;

    page.drawText(String(i + 1), { x: col.sno, y: y - 4, size: 8, font: font, color: DARK_TEXT });
    page.drawText(line.orderNumber, { x: col.order, y: y - 4, size: 7.5, font: font, color: DARK_TEXT });

    const descText = line.description.length > 30 ? `${line.description.slice(0, 28)}...` : line.description;
    page.drawText(descText, { x: col.desc, y: y - 4, size: 8, font: fontBold, color: DARK_TEXT });

    page.drawText(line.hsnCode ?? '4911', { x: col.hsn, y: y - 4, size: 8, font: font, color: DARK_TEXT });
    page.drawText(String(line.quantity), { x: col.qty, y: y - 4, size: 8, font: font, color: DARK_TEXT });

    const rateStr = money(unitRate);
    page.drawText(rateStr, { x: col.rate, y: y - 4, size: 7.5, font: font, color: DARK_TEXT });

    const amtStr = money(line.amount);
    const amtW = font.widthOfTextAtSize(amtStr, 8);
    page.drawText(amtStr, { x: col.amount - amtW, y: y - 4, size: 8, font: font, color: DARK_TEXT });

    y -= 12;

    // Attributes row
    if (line.attributes && line.attributes.length > 0) {
      const attrStr = line.attributes.filter(Boolean).join(', ');
      const truncated = attrStr.length > 80 ? `${attrStr.slice(0, 78)}...` : attrStr;
      page.drawText(truncated, { x: col.desc, y: y - 2, size: 6.5, font: font, color: LIGHT_TEXT });
      y -= 9;
    }

    hLine(y + 2, 0.25, rgb(0.88, 0.88, 0.9));

    if (y < 260) {
      page = pdf.addPage([595, 842]);
      y = 800;
      page.drawRectangle({ x: left - 2, y: 28, width: tableWidth + 4, height: 790, borderWidth: 1.5, borderColor: NAVY, color: WHITE });
      drawRect(left, y - 5, tableWidth, 18, HEADER_BG);
      th('S.No', col.sno); th('Order ID', col.order); th('Description', col.desc);
      th('HSN', col.hsn); th('Qty', col.qty); th('Rate', col.rate); th('Amount', col.amount, true);
      y -= 18;
    }
  }

  y -= 4;
  hLine(y + 2, 1, NAVY);
  y -= 8;

  // ── TOTALS SECTION (split: left = amount in words, right = calculation) ──
  const totalsX = left + 280;
  const halfGst = data.gstAmount / 2;
  const halfGstRate = `${((data.gstRate / 2) * 100).toFixed(1)}%`;

  const totalRow = (label: string, valueStr: string, bold = false, color: RGB = DARK_TEXT) => {
    page.drawText(label, { x: totalsX, y, size: 8.5, font: bold ? fontBold : font, color });
    const vw = (bold ? fontBold : font).widthOfTextAtSize(valueStr, bold ? 9.5 : 8.5);
    page.drawText(valueStr, { x: right - vw, y, size: bold ? 9.5 : 8.5, font: bold ? fontBold : font, color });
    y -= 13;
  };

  // Left side: Amount in words
  text('Amount in Words:', left + 8, 7.5, true, false, ACCENT);
  y -= 10;
  const wordsStr = numberToWords(data.total);
  const wordsLines = splitTextToLines(wordsStr, font, 7, 240);
  for (const wl of wordsLines) {
    text(wl, left + 8, 7, false, true, MED_TEXT);
    y -= 9;
  }

  // Reset y to totals area
  y = y + (wordsLines.length * 9) + 10 + 10;

  totalRow('Subtotal (Items):', money(data.subtotal));
  totalRow('Delivery Charge:', money(data.deliveryCharge));
  totalRow(`CGST @ ${halfGstRate}:`, money(halfGst));
  totalRow(`SGST @ ${halfGstRate}:`, money(halfGst));

  y -= 2;
  page.drawLine({ start: { x: totalsX, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 1.2, color: NAVY });
  y -= 14;
  totalRow('GRAND TOTAL:', money(data.total), true, NAVY);

  // ── RATE-WISE GST CLASSIFICATION ──
  y -= 10;
  hLine(y + 4, 0.5, BORDER);
  y -= 4;

  text('HSN/SAC wise Tax Classification', left + 8, 7.5, true, false, ACCENT);
  y -= 12;

  // Mini table header
  drawRect(left + 4, y - 3, tableWidth - 8, 14, rgb(0.92, 0.93, 0.96));
  const gstColX = { hsn: left + 8, taxable: left + 100, cgstR: left + 200, cgstA: left + 260, sgstR: left + 320, sgstA: left + 380, total: right - 8 };
  const gstTh = (label: string, x: number, rightAlign = false) => {
    const w = fontBold.widthOfTextAtSize(label, 6.5);
    page.drawText(label, { x: rightAlign ? x - w : x, y: y + 1, size: 6.5, font: fontBold, color: DARK_TEXT });
  };
  gstTh('HSN/SAC', gstColX.hsn);
  gstTh('Taxable Amt', gstColX.taxable);
  gstTh('CGST Rate', gstColX.cgstR);
  gstTh('CGST Amt', gstColX.cgstA);
  gstTh('SGST Rate', gstColX.sgstR);
  gstTh('SGST Amt', gstColX.sgstA);
  gstTh('Total Tax', gstColX.total, true);
  y -= 14;

  // Single classification row (printing products = HSN 4911)
  const taxableAmt = data.subtotal + data.deliveryCharge;
  page.drawText('4911', { x: gstColX.hsn, y, size: 7, font: font, color: DARK_TEXT });
  page.drawText(money(taxableAmt), { x: gstColX.taxable, y, size: 7, font: font, color: DARK_TEXT });
  page.drawText(halfGstRate, { x: gstColX.cgstR, y, size: 7, font: font, color: DARK_TEXT });
  page.drawText(money(halfGst), { x: gstColX.cgstA, y, size: 7, font: font, color: DARK_TEXT });
  page.drawText(halfGstRate, { x: gstColX.sgstR, y, size: 7, font: font, color: DARK_TEXT });
  page.drawText(money(halfGst), { x: gstColX.sgstA, y, size: 7, font: font, color: DARK_TEXT });
  const totalTaxStr = money(data.gstAmount);
  const totalTaxW = font.widthOfTextAtSize(totalTaxStr, 7);
  page.drawText(totalTaxStr, { x: gstColX.total - totalTaxW, y, size: 7, font: font, color: DARK_TEXT });
  y -= 14;

  hLine(y + 4, 0.5, BORDER);

  // ── BANK DETAILS & TERMS (two-column) ──
  y -= 10;
  const bankX = left + 8;
  const termsX = midCol + 10;

  text('BANK DETAILS', bankX, 7.5, true, false, ACCENT);
  text('TERMS & CONDITIONS', termsX, 7.5, true, false, ACCENT);
  y -= 10;

  const bankLine = (label: string, value: string) => {
    page.drawText(label, { x: bankX, y, size: 7, font: fontBold, color: MED_TEXT });
    page.drawText(value, { x: bankX + 70, y, size: 7, font: font, color: DARK_TEXT });
    y -= 9;
  };

  // Terms on right side
  const termsY = y;
  const termsStr = co?.terms || '1. Goods once sold will not be taken back.\n2. Subject to Delhi jurisdiction only.\n3. Interest @ 18% p.a. on delayed payments.\n4. Computer-generated invoice, no signature required.';
  const termsLines = termsStr.split('\n').filter(Boolean);
  let ty = termsY;
  for (const term of termsLines) {
    const trimmed = term.length > 60 ? `${term.slice(0, 58)}...` : term;
    page.drawText(trimmed, { x: termsX, y: ty, size: 6.5, font: font, color: LIGHT_TEXT });
    ty -= 8;
  }

  bankLine('Bank:', co?.bankName || 'State Bank of India');
  bankLine('A/C No:', co?.bankAccount || '1234 5678 9012 3456');
  bankLine('IFSC:', co?.bankIfsc || 'SBIN0012345');
  bankLine('Branch:', co?.bankBranch || 'Okhla Industrial Area');

  y -= 4;

  if (data.packedBy) {
    text(`Packed By: ${data.packedBy}`, bankX, 7, false, true, MED_TEXT);
    y -= 10;
  }

  // ── FOOTER / SIGNATURE ──
  y = Math.min(y, 58);
  hLine(y + 4, 0.8, NAVY);
  y -= 10;
  text('This is a system-generated tax invoice.', left + 8, 7, false, true, LIGHT_TEXT);
  rightAligned(`For ${coName.toUpperCase()}`, 8.5, true, false, NAVY);
  y -= 10;
  rightAligned('(Authorized Signatory)', 7, false, true, LIGHT_TEXT);

  return pdf.save();
}

function splitTextToLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
