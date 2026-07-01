export const QC_PERMISSIONS = {
  INSPECT: 'production.qc.inspect',
  VIEW_ALL: 'production.qc.view.all',
} as const;

export const DEFAULT_QC_CHECKLIST_CODE = 'QC-STANDARD-CHECKLIST';

export const DEFAULT_QC_CHECKLIST_ITEMS = [
  { itemCode: 'COLOR_ACCURACY', label: 'Color Accuracy', sortOrder: 1 },
  { itemCode: 'REGISTRATION', label: 'Registration', sortOrder: 2 },
  { itemCode: 'ALIGNMENT', label: 'Alignment', sortOrder: 3 },
  { itemCode: 'BLEEDING', label: 'Bleeding', sortOrder: 4 },
  { itemCode: 'SAFE_AREA', label: 'Safe Area', sortOrder: 5 },
  { itemCode: 'CUTTING_ACCURACY', label: 'Cutting Accuracy', sortOrder: 6 },
  { itemCode: 'LAMINATION_QUALITY', label: 'Lamination Quality', sortOrder: 7 },
  { itemCode: 'FOILING_QUALITY', label: 'Foiling Quality', sortOrder: 8 },
  { itemCode: 'UV_QUALITY', label: 'UV Quality', sortOrder: 9 },
  { itemCode: 'QUANTITY_VERIFICATION', label: 'Quantity Verification', sortOrder: 10 },
  { itemCode: 'PACKING_READINESS', label: 'Packing Readiness', sortOrder: 11 },
] as const;
