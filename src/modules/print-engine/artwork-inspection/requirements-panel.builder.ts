import type { PrintJobContextDto } from '../types/print-engine.types.js';
import type {
  ArtworkInspectionContextDto,
  ArtworkRequirementsPanelDto,
  PrintingTipDto,
  ProductNoteDto,
} from './artwork-inspection.types.js';
import { buildOverlaySpec, extractSpecMetadata } from './overlay-spec.builder.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function buildRequirementsPanel(
  productName: string,
  productDisplayName: string | null | undefined,
  printSpec: Record<string, unknown> | null,
  fileRequirements: PrintJobContextDto['fileRequirements'],
): ArtworkRequirementsPanelDto {
  const spec = printSpec ?? {};
  const meta = extractSpecMetadata(asRecord(spec['metadata']));

  const maxFromReq = fileRequirements.reduce<number | null>((max, req) => {
    if (!req.maxFileSizeMb) return max;
    return max == null ? req.maxFileSizeMb : Math.min(max, req.maxFileSizeMb);
  }, null);

  return {
    productName,
    productDisplayName,
    trimSize:
      num(spec['finishedWidthMm']) && num(spec['finishedHeightMm'])
        ? { widthMm: num(spec['finishedWidthMm'])!, heightMm: num(spec['finishedHeightMm'])! }
        : null,
    designSize:
      num(spec['artworkWidthMm']) && num(spec['artworkHeightMm'])
        ? { widthMm: num(spec['artworkWidthMm'])!, heightMm: num(spec['artworkHeightMm'])! }
        : null,
    safeArea: meta.safeAreaWidthMm && meta.safeAreaHeightMm
      ? { widthMm: meta.safeAreaWidthMm, heightMm: meta.safeAreaHeightMm }
      : num(spec['finishedWidthMm']) && num(spec['safeAreaMm'])
        ? {
            widthMm: Math.max(num(spec['finishedWidthMm'])! - num(spec['safeAreaMm'])! * 2, 0),
            heightMm: Math.max(num(spec['finishedHeightMm'])! - num(spec['safeAreaMm'])! * 2, 0),
          }
        : null,
    bleedMm: num(spec['bleedMm']),
    minDpi: typeof spec['minDpi'] === 'number' ? spec['minDpi'] : null,
    colorMode: spec['colorMode'] ? String(spec['colorMode']) : null,
    requiredPages: typeof spec['requiredPages'] === 'number' ? spec['requiredPages'] : null,
    pageNames: Array.isArray(spec['pageNames']) ? (spec['pageNames'] as string[]) : [],
    allowedFormats: Array.isArray(spec['allowedFormats'])
      ? (spec['allowedFormats'] as string[])
      : fileRequirements.flatMap((r) => r.allowedFileTypes.map(String)),
    maxFileSizeMb: num(spec['maxFileSizeMb']) ?? maxFromReq,
    maxResolutionPx: meta.maxResolutionPx,
  };
}

export function buildInspectionContext(
  context: PrintJobContextDto,
  productName: string,
  productDisplayName?: string | null,
): ArtworkInspectionContextDto {
  const printSpec = asRecord(context.printSpecification);
  const meta = extractSpecMetadata(printSpec?.['metadata'] as Record<string, unknown> | undefined);

  const defaultTips: PrintingTipDto[] = [
    {
      id: 'safe-area',
      title: 'Keep text inside safe area',
      description: 'Important text and logos should stay inside the blue safe zone to avoid trimming.',
      icon: 'shield',
    },
    {
      id: 'bleed',
      title: 'Extend background to bleed',
      description: 'Background colours and images should reach the outer bleed edge.',
      icon: 'expand',
    },
    {
      id: 'resolution',
      title: 'Use print resolution',
      description: 'Raster images should meet the minimum DPI shown in requirements.',
      icon: 'scan',
    },
  ];

  const defaultNotes: ProductNoteDto[] = context.printProcess
    ? [{ id: 'process', label: context.printProcess.name, icon: 'printer' }]
    : [];

  const requirements = buildRequirementsPanel(
    productName,
    productDisplayName,
    printSpec,
    context.fileRequirements,
  );

  const overlay = buildOverlaySpec({
    finishedWidthMm: requirements.trimSize?.widthMm,
    finishedHeightMm: requirements.trimSize?.heightMm,
    artworkWidthMm: requirements.designSize?.widthMm,
    artworkHeightMm: requirements.designSize?.heightMm,
    bleedMm: requirements.bleedMm,
    safeAreaMm: num(printSpec?.['safeAreaMm']),
    safeAreaWidthMm: meta.safeAreaWidthMm,
    safeAreaHeightMm: meta.safeAreaHeightMm,
  });

  return {
    requirements,
    productNotes: meta.productNotes.length > 0 ? meta.productNotes : defaultNotes,
    printingTips: meta.printingTips.length > 0 ? meta.printingTips : defaultTips,
    overlay,
    fileRequirements: context.fileRequirements.map((r) => ({
      code: r.code,
      label: r.label,
      requirementType: r.requirementType,
      printLayer: r.printLayer
        ? { code: r.printLayer.code, label: r.printLayer.label, role: r.printLayer.role }
        : null,
    })),
  };
}
