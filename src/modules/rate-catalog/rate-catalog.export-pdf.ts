import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { RateCatalogProductRatesDto, RateMatrixColumnDto, RateMatrixRowDto } from './rate-catalog.dto.js';

const BRAND = {
  primary: rgb(0.06, 0.16, 0.28),
  primaryLight: rgb(0.12, 0.28, 0.45),
  accent: rgb(0.85, 0.65, 0.13),
  text: rgb(0.12, 0.12, 0.14),
  muted: rgb(0.45, 0.45, 0.5),
  border: rgb(0.82, 0.84, 0.88),
  headerBg: rgb(0.06, 0.16, 0.28),
  headerText: rgb(1, 1, 1),
  rowAlt: rgb(0.96, 0.97, 0.98),
  rowBase: rgb(1, 1, 1),
};

const MARGIN = 36;
const FOOTER_H = 32;
const ROW_PAD = 6;
const FONT_BODY = 8;
const FONT_HEADER = 8.5;
const LINE_H = 10;

function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** WinAnsi-safe text for StandardFonts */
function sanitize(text: string): string {
  return text
    .replace(/₹/g, 'Rs ')
    .replace(/[^\x20-\x7E]/g, (ch) => {
      if (ch === '·') return ' | ';
      if (ch === '×') return 'x';
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const safe = sanitize(text);
  if (!safe) return [''];
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return [safe];

  const words = safe.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          const next = chunk + ch;
          if (font.widthOfTextAtSize(next, size) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = next;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [safe.slice(0, 40)];
}

function resolvePriceColumns(columns: RateMatrixColumnDto[], mode: string): RateMatrixColumnDto[] {
  if (mode === 'area_based') {
    return columns.filter((c) => c.quantity != null || ['width', 'height', 'area'].includes(c.key));
  }
  return columns.filter((c) => c.quantity != null && !['width', 'height', 'area'].includes(c.key));
}

interface TableLayout {
  configWidth: number;
  priceWidths: number[];
  tableWidth: number;
  priceColumns: RateMatrixColumnDto[];
}

function buildTableLayout(pageWidth: number, priceColumns: RateMatrixColumnDto[]): TableLayout {
  const tableWidth = pageWidth - MARGIN * 2;
  const minPriceCol = 58;
  const configWidth = Math.min(220, Math.max(160, tableWidth * 0.32));
  const remaining = tableWidth - configWidth;
  const count = Math.max(priceColumns.length, 1);
  const priceColWidth = Math.max(minPriceCol, remaining / count);
  const priceWidths = priceColumns.map(() => priceColWidth);
  const actualTableWidth = configWidth + priceWidths.reduce((a, b) => a + b, 0);

  return { configWidth, priceWidths, tableWidth: actualTableWidth, priceColumns };
}

class RatePdfBuilder {
  private pdf: PDFDocument;
  private font: PDFFont;
  private fontBold: PDFFont;
  private pageWidth: number;
  private pageHeight: number;
  private page!: PDFPage;
  private y = 0;
  private pageNum = 0;
  private footerLeft = '';
  private footerRight = '';

  constructor(
    private rates: RateCatalogProductRatesDto,
    private companyName: string,
    pageWidth = 842,
    pageHeight = 595,
  ) {
    this.pdf = null as unknown as PDFDocument;
    this.font = null as unknown as PDFFont;
    this.fontBold = null as unknown as PDFFont;
    this.pageWidth = pageWidth;
    this.pageHeight = pageHeight;
  }

  async init(): Promise<void> {
    this.pdf = await PDFDocument.create();
    this.pdf.setTitle(`${this.rates.product.name} - Rate Catalogue`);
    this.pdf.setAuthor(this.companyName);
    this.font = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.fontBold = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    this.footerLeft = this.companyName;
    this.footerRight = `Generated ${new Date(this.rates.generatedAt).toLocaleString('en-IN')}`;
    this.addPage();
  }

  private addPage(): void {
    this.page = this.pdf.addPage([this.pageWidth, this.pageHeight]);
    this.pageNum += 1;
    this.y = this.pageHeight - MARGIN;
  }

  private drawFooter(): void {
    const footerY = 18;
    this.page.drawLine({
      start: { x: MARGIN, y: FOOTER_H + 4 },
      end: { x: this.pageWidth - MARGIN, y: FOOTER_H + 4 },
      thickness: 0.5,
      color: BRAND.border,
    });
    this.page.drawText(sanitize(this.footerLeft), {
      x: MARGIN,
      y: footerY,
      size: 7,
      font: this.font,
      color: BRAND.muted,
    });
    const pageLabel = `Page ${this.pageNum}`;
    const pageLabelW = this.font.widthOfTextAtSize(pageLabel, 7);
    this.page.drawText(pageLabel, {
      x: (this.pageWidth - pageLabelW) / 2,
      y: footerY,
      size: 7,
      font: this.font,
      color: BRAND.muted,
    });
    const right = sanitize(this.footerRight);
    const rightW = this.font.widthOfTextAtSize(right, 7);
    this.page.drawText(right, {
      x: this.pageWidth - MARGIN - rightW,
      y: footerY,
      size: 7,
      font: this.font,
      color: BRAND.muted,
    });
    this.page.drawText('Generated by GEETA PRINT ERP', {
      x: MARGIN,
      y: 8,
      size: 6.5,
      font: this.font,
      color: BRAND.muted,
    });
  }

  private ensureSpace(needed: number): void {
    if (this.y - needed < MARGIN + FOOTER_H) {
      this.drawFooter();
      this.addPage();
    }
  }

  private drawHeaderBand(): void {
    const bandH = 52;
    this.page.drawRectangle({
      x: 0,
      y: this.pageHeight - bandH,
      width: this.pageWidth,
      height: bandH,
      color: BRAND.primary,
    });
    this.page.drawText(sanitize(this.companyName.toUpperCase()), {
      x: MARGIN,
      y: this.pageHeight - 22,
      size: 14,
      font: this.fontBold,
      color: BRAND.headerText,
    });
    this.page.drawText('VENDOR RATE CATALOGUE', {
      x: MARGIN,
      y: this.pageHeight - 38,
      size: 9,
      font: this.font,
      color: rgb(0.75, 0.82, 0.92),
    });
    const docLabel = 'PRICE LIST';
    const docW = this.fontBold.widthOfTextAtSize(docLabel, 9);
    this.page.drawText(docLabel, {
      x: this.pageWidth - MARGIN - docW,
      y: this.pageHeight - 30,
      size: 9,
      font: this.fontBold,
      color: BRAND.accent,
    });
    this.y = this.pageHeight - bandH - 16;
  }

  private drawMetaBlock(): void {
    const { rates } = this;
    const boxH = 72;
    this.ensureSpace(boxH + 12);

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - boxH,
      width: this.pageWidth - MARGIN * 2,
      height: boxH,
      borderColor: BRAND.border,
      borderWidth: 0.75,
      color: rgb(0.98, 0.99, 1),
    });

    const col1X = MARGIN + 12;
    const col2X = MARGIN + (this.pageWidth - MARGIN * 2) / 2 + 8;
    let leftY = this.y - 16;
    let rightY = this.y - 16;

    const leftRows: [string, string][] = [
      ['Product', rates.product.name],
      ['Category', rates.product.category.name],
      ['Print Process', rates.printProcess?.name ?? '-'],
    ];
    const rightRows: [string, string][] = [
      ['Pricing Strategy', rates.pricingStrategy.label],
      ['Price Version', rates.version.versionLabel],
      ['GST / Currency', `${(rates.gstRate * 100).toFixed(0)}% / ${rates.currency}`],
    ];

    for (const [label, value] of leftRows) {
      this.page.drawText(sanitize(label), { x: col1X, y: leftY, size: 7, font: this.fontBold, color: BRAND.muted });
      this.page.drawText(sanitize(value), { x: col1X + 82, y: leftY, size: 8, font: this.font, color: BRAND.text });
      leftY -= 14;
    }
    for (const [label, value] of rightRows) {
      this.page.drawText(sanitize(label), { x: col2X, y: rightY, size: 7, font: this.fontBold, color: BRAND.muted });
      this.page.drawText(sanitize(value), { x: col2X + 88, y: rightY, size: 8, font: this.font, color: BRAND.text });
      rightY -= 14;
    }

    this.y -= boxH + 18;
  }

  private drawConfigSummary(): void {
    const items = this.rates.configurationSummary.slice(0, 8);
    if (items.length === 0) return;

    this.ensureSpace(24);
    this.page.drawText('CONFIGURATION DEFAULTS', {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.fontBold,
      color: BRAND.primary,
    });
    this.y -= 14;

    const cols = 4;
    const cellW = (this.pageWidth - MARGIN * 2) / cols;
    const rowH = 28;
    const rows = Math.ceil(items.length / cols);
    this.ensureSpace(rows * rowH + 8);

    items.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = MARGIN + col * cellW;
      const yPos = this.y - row * rowH;

      this.page.drawText(sanitize(item.label), {
        x: x + 4,
        y: yPos - 10,
        size: 7,
        font: this.fontBold,
        color: BRAND.muted,
      });
      this.page.drawText(sanitize(item.defaultLabel), {
        x: x + 4,
        y: yPos - 22,
        size: 8,
        font: this.font,
        color: BRAND.text,
      });
    });

    this.y -= rows * rowH + 14;
  }

  private drawTableHeader(layout: TableLayout, headerRowH: number): void {
    const { configWidth, priceWidths, priceColumns } = layout;
    let x = MARGIN;

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - headerRowH,
      width: layout.tableWidth,
      height: headerRowH,
      color: BRAND.headerBg,
    });

    this.page.drawText('Configuration', {
      x: x + ROW_PAD,
      y: this.y - headerRowH + ROW_PAD + 2,
      size: FONT_HEADER,
      font: this.fontBold,
      color: BRAND.headerText,
    });
    x += configWidth;

    priceColumns.forEach((col, i) => {
      const label =
        col.quantity != null
          ? `Qty ${col.label}`
          : col.key === 'width'
            ? 'Width'
            : col.key === 'height'
              ? 'Height'
              : col.key === 'area'
                ? 'Area'
                : col.label;
      const labelSafe = sanitize(label);
      const labelW = this.fontBold.widthOfTextAtSize(labelSafe, FONT_HEADER);
      const colW = priceWidths[i] ?? 58;
      const textX = x + colW - ROW_PAD - labelW;
      this.page.drawText(labelSafe, {
        x: Math.max(x + ROW_PAD, textX),
        y: this.y - headerRowH + ROW_PAD + 2,
        size: FONT_HEADER,
        font: this.fontBold,
        color: BRAND.headerText,
      });
      x += colW;
    });

    this.y -= headerRowH;
  }

  private drawTableRow(
    layout: TableLayout,
    row: RateMatrixRowDto,
    rowIndex: number,
    rowHeight: number,
  ): void {
    const { configWidth, priceWidths, priceColumns } = layout;
    const label = sanitize(row.areaLabel ?? row.label);
    const labelLines = wrapText(label, configWidth - ROW_PAD * 2, this.font, FONT_BODY);
    const bg = rowIndex % 2 === 0 ? BRAND.rowBase : BRAND.rowAlt;

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - rowHeight,
      width: layout.tableWidth,
      height: rowHeight,
      color: bg,
      borderColor: BRAND.border,
      borderWidth: 0.5,
    });

    let lineY = this.y - ROW_PAD - FONT_BODY;
    for (const line of labelLines.slice(0, 3)) {
      this.page.drawText(line, {
        x: MARGIN + ROW_PAD,
        y: lineY,
        size: FONT_BODY,
        font: this.font,
        color: BRAND.text,
      });
      lineY -= LINE_H;
    }

    let x = MARGIN + configWidth;
    priceColumns.forEach((col, i) => {
      const cell = row.cells.find((c) => c.columnKey === col.key);
      const colW = priceWidths[i] ?? 58;
      const val = cell
        ? this.rates.gstRate > 0
          ? formatInr(cell.totalWithGst)
          : formatInr(cell.grandTotal)
        : '-';
      const valSafe = sanitize(val);
      const valW = this.font.widthOfTextAtSize(valSafe, FONT_BODY);
      this.page.drawText(valSafe, {
        x: x + colW - ROW_PAD - valW,
        y: this.y - ROW_PAD - FONT_BODY,
        size: FONT_BODY,
        font: this.font,
        color: BRAND.text,
      });

      if (i < priceColumns.length - 1) {
        this.page.drawLine({
          start: { x, y: this.y },
          end: { x, y: this.y - rowHeight },
          thickness: 0.5,
          color: BRAND.border,
        });
      }
      x += colW;
    });

    this.page.drawLine({
      start: { x: MARGIN + configWidth, y: this.y },
      end: { x: MARGIN + configWidth, y: this.y - rowHeight },
      thickness: 0.5,
      color: BRAND.border,
    });

    this.y -= rowHeight;
  }

  private drawPricingMatrix(): void {
    const priceColumns = resolvePriceColumns(this.rates.matrix.columns, this.rates.matrix.mode);
    if (priceColumns.length === 0 || this.rates.matrix.rows.length === 0) {
      this.ensureSpace(40);
      this.page.drawText('No pricing data available for export.', {
        x: MARGIN,
        y: this.y,
        size: 9,
        font: this.font,
        color: BRAND.muted,
      });
      return;
    }

    const layout = buildTableLayout(this.pageWidth, priceColumns);
    const headerRowH = 22;

    this.ensureSpace(30);
    this.page.drawText('PRICING MATRIX (INR, incl. GST where applicable)', {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.fontBold,
      color: BRAND.primary,
    });
    this.y -= 16;

    this.ensureSpace(headerRowH + 20);
    this.drawTableHeader(layout, headerRowH);

    this.rates.matrix.rows.forEach((row, idx) => {
      const label = sanitize(row.areaLabel ?? row.label);
      const lines = wrapText(label, layout.configWidth - ROW_PAD * 2, this.font, FONT_BODY);
      const rowHeight = Math.max(22, Math.min(lines.length, 3) * LINE_H + ROW_PAD * 2);

      this.ensureSpace(rowHeight + 4);
      this.drawTableRow(layout, row, idx, rowHeight);
    });

    this.y -= 8;
    this.page.drawText(
      sanitize(
        `Effective version: ${this.rates.version.versionLabel} | Prices computed by pricing engine | Subject to change`,
      ),
      {
        x: MARGIN,
        y: this.y,
        size: 7,
        font: this.font,
        color: BRAND.muted,
      },
    );
    this.y -= 12;
  }

  async build(): Promise<Uint8Array> {
    await this.init();
    this.drawHeaderBand();
    this.drawMetaBlock();
    this.drawConfigSummary();
    this.drawPricingMatrix();
    this.drawFooter();
    return this.pdf.save();
  }
}

export async function generateRateCatalogPdf(
  rates: RateCatalogProductRatesDto,
  companyName = 'GEETA PRINT',
): Promise<Uint8Array> {
  const builder = new RatePdfBuilder(rates, companyName, 842, 595);
  return builder.build();
}
