import ExcelJS from 'exceljs';

export type CellValue = string | number | Date | null | undefined;

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  /** 'money' right-aligns and applies the Indian two-decimal accounting format. */
  format?: 'money' | 'number' | 'percent' | 'date' | 'text';
}

export interface SheetSpec {
  name: string;
  /** Rendered above the table as a title block — company name, report name, period. */
  title?: string;
  subtitle?: string;
  columns: SheetColumn[];
  /** Any object shape — columns pick fields by `key`. Typed loosely on purpose so report
   *  interfaces can be handed straight in without declaring an index signature. */
  rows: readonly object[];
  /** A bolded, top-bordered totals row. */
  totalsRow?: object;
  /** Free-text notes rendered under the table — used for the CA-facing caveats. */
  notes?: string[];
  freezeHeader?: boolean;
}

const MONEY_FORMAT = '#,##,##0.00';
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F3A5F' },
};

/**
 * Builds the Excel workbooks the business hands to its CA.
 *
 * Formatting is not decoration here. A CA opens dozens of these a week, and the things that make a
 * file usable — a title block naming the company and the exact period, frozen headers, real
 * numbers rather than text, the Indian lakh/crore digit grouping, and an explicit totals row that
 * ties to the report on screen — are the difference between a file they can work from and one they
 * re-key by hand.
 */
export class WorkbookBuilder {
  private readonly workbook = new ExcelJS.Workbook();

  constructor(private readonly meta: { companyName: string; gstin?: string | null; generatedBy?: string }) {
    this.workbook.creator = meta.companyName;
    this.workbook.created = new Date();
  }

  addSheet(spec: SheetSpec): this {
    const sheet = this.workbook.addWorksheet(spec.name.slice(0, 31), {
      views: spec.freezeHeader === false ? undefined : [{ state: 'frozen', ySplit: spec.title ? 4 : 1 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const columnCount = spec.columns.length;
    let rowCursor = 1;

    if (spec.title) {
      const titleRow = sheet.getRow(rowCursor);
      titleRow.getCell(1).value = spec.title;
      titleRow.getCell(1).font = { bold: true, size: 14 };
      sheet.mergeCells(rowCursor, 1, rowCursor, Math.max(columnCount, 2));
      rowCursor += 1;

      const metaRow = sheet.getRow(rowCursor);
      metaRow.getCell(1).value = [
        this.meta.companyName,
        this.meta.gstin ? `GSTIN ${this.meta.gstin}` : null,
        spec.subtitle,
      ]
        .filter(Boolean)
        .join('  ·  ');
      metaRow.getCell(1).font = { size: 10, color: { argb: 'FF555555' } };
      sheet.mergeCells(rowCursor, 1, rowCursor, Math.max(columnCount, 2));
      rowCursor += 2;
    }

    const headerRow = sheet.getRow(rowCursor);
    spec.columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = HEADER_FILL;
      cell.alignment = { vertical: 'middle', horizontal: this.alignFor(column), wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF1F3A5F' } } };
      sheet.getColumn(index + 1).width = column.width ?? this.defaultWidth(column);
    });
    headerRow.height = 22;
    rowCursor += 1;

    for (const row of spec.rows) {
      const sheetRow = sheet.getRow(rowCursor);
      spec.columns.forEach((column, index) => {
        const cell = sheetRow.getCell(index + 1);
        cell.value = this.coerce((row as Record<string, CellValue>)[column.key], column);
        cell.numFmt = this.numberFormat(column);
        cell.alignment = { horizontal: this.alignFor(column) };
      });
      rowCursor += 1;
    }

    if (spec.totalsRow) {
      const totals = sheet.getRow(rowCursor);
      spec.columns.forEach((column, index) => {
        const cell = totals.getCell(index + 1);
        cell.value = this.coerce((spec.totalsRow as Record<string, CellValue> | undefined)?.[column.key], column);
        cell.numFmt = this.numberFormat(column);
        cell.font = { bold: true };
        cell.alignment = { horizontal: this.alignFor(column) };
        cell.border = { top: { style: 'double', color: { argb: 'FF1F3A5F' } } };
      });
      rowCursor += 1;
    }

    if (spec.notes?.length) {
      rowCursor += 1;
      for (const note of spec.notes) {
        const noteRow = sheet.getRow(rowCursor);
        noteRow.getCell(1).value = note;
        noteRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
        sheet.mergeCells(rowCursor, 1, rowCursor, Math.max(columnCount, 2));
        rowCursor += 1;
      }
    }

    if (spec.rows.length > 0) {
      sheet.autoFilter = {
        from: { row: spec.title ? 4 : 1, column: 1 },
        to: { row: spec.title ? 4 : 1, column: columnCount },
      };
    }

    return this;
  }

  async toBuffer(): Promise<Buffer> {
    const data = await this.workbook.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  private coerce(value: CellValue, column: SheetColumn): string | number | Date | null {
    if (value === null || value === undefined) return column.format === 'money' ? 0 : null;
    if (column.format === 'money' || column.format === 'number' || column.format === 'percent') {
      const numeric = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    if (column.format === 'date') {
      return value instanceof Date ? value : String(value);
    }
    return value instanceof Date ? value : String(value);
  }

  private numberFormat(column: SheetColumn): string {
    switch (column.format) {
      case 'money':
        return MONEY_FORMAT;
      case 'number':
        return '#,##0';
      case 'percent':
        return '0.00"%"';
      case 'date':
        return 'dd-mmm-yyyy';
      default:
        return '@';
    }
  }

  private alignFor(column: SheetColumn): 'left' | 'right' | 'center' {
    if (column.format === 'money' || column.format === 'number' || column.format === 'percent') return 'right';
    if (column.format === 'date') return 'center';
    return 'left';
  }

  private defaultWidth(column: SheetColumn): number {
    if (column.format === 'money') return 16;
    if (column.format === 'date') return 14;
    return Math.min(40, Math.max(14, column.header.length + 4));
  }
}

/** CSV fallback for anything that needs to open in a plain text tool. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const cell = (value: unknown): string =>
    value == null ? '' : `"${String(value as string).replace(/"/g, '""')}"`;
  const lines = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))];
  // BOM so Excel on Windows reads UTF-8 correctly — these files get opened there. Written as an
  // escape rather than a literal character so it survives copy-paste and shows up in review.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
