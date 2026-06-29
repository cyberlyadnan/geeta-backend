import ExcelJS from 'exceljs';
import type { RateCatalogProductRatesDto } from './rate-catalog.dto.js';

export async function generateRateCatalogExcel(
  rates: RateCatalogProductRatesDto,
  companyName = 'GEETA PRINT',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName;
  workbook.created = new Date();

  const info = workbook.addWorksheet('Product Information');
  info.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Value', key: 'value', width: 48 },
  ];
  info.addRows([
    { field: 'Product', value: rates.product.name },
    { field: 'Category', value: rates.product.category.name },
    { field: 'Print Process', value: rates.printProcess?.name ?? '—' },
    { field: 'Pricing Strategy', value: rates.pricingStrategy.label },
    { field: 'Price Version', value: rates.version.versionLabel },
    { field: 'Currency', value: rates.currency },
    { field: 'GST Rate', value: `${(rates.gstRate * 100).toFixed(0)}%` },
    { field: 'Generated At', value: new Date(rates.generatedAt).toLocaleString('en-IN') },
    { field: 'Rate List Type', value: rates.rateListType },
  ]);
  info.getRow(1).font = { bold: true };
  info.views = [{ state: 'frozen', ySplit: 1 }];

  const summary = workbook.addWorksheet('Configuration Summary');
  summary.columns = [
    { header: 'Attribute', key: 'label', width: 24 },
    { header: 'Default Value', key: 'value', width: 32 },
  ];
  summary.addRows(
    rates.configurationSummary.map((s) => ({ label: s.label, value: s.defaultLabel })),
  );
  summary.getRow(1).font = { bold: true };
  summary.views = [{ state: 'frozen', ySplit: 1 }];

  const matrix = workbook.addWorksheet('Pricing Matrix');
  const qtyColumns = rates.matrix.columns.filter((c) => c.quantity != null);
  matrix.columns = [
    { header: 'Configuration', key: 'config', width: 36 },
    { header: 'Width', key: 'width', width: 12 },
    { header: 'Height', key: 'height', width: 12 },
    { header: 'Area', key: 'area', width: 18 },
    ...qtyColumns.map((c) => ({
      header: `Qty ${c.label}`,
      key: c.key,
      width: 14,
    })),
    { header: 'Unit Price', key: 'unit', width: 14 },
    { header: 'GST', key: 'gst', width: 12 },
    { header: 'Total incl. GST', key: 'total', width: 16 },
  ];

  for (const row of rates.matrix.rows) {
    const record: Record<string, string | number | null> = {
      config: row.areaLabel ?? row.label,
      width: row.width ?? '',
      height: row.height ?? '',
      area: row.areaLabel ?? '',
    };
    const firstCell = row.cells[0];
    for (const cell of row.cells) {
      if (qtyColumns.some((c) => c.key === cell.columnKey)) {
        record[cell.columnKey] = cell.grandTotal;
      }
    }
    if (firstCell) {
      record['unit'] = firstCell.unitPrice;
      record['gst'] = firstCell.gstAmount;
      record['total'] = firstCell.totalWithGst;
    }
    matrix.addRow(record);
  }

  matrix.getRow(1).font = { bold: true };
  matrix.views = [{ state: 'frozen', ySplit: 1 }];
  for (let i = 2; i <= matrix.rowCount; i++) {
    for (const col of ['unit', 'gst', 'total', ...qtyColumns.map((c) => c.key)]) {
      const cell = matrix.getCell(`${String.fromCharCode(65 + matrix.columns.findIndex((c) => c.key === col))}${i}`);
      if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
    }
  }

  const filters = workbook.addWorksheet('Filters Applied');
  filters.columns = [
    { header: 'Filter', key: 'key', width: 24 },
    { header: 'Value', key: 'value', width: 32 },
  ];
  filters.addRows(
    Object.entries(rates.filtersApplied).map(([key, value]) => ({ key, value })),
  );
  filters.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
