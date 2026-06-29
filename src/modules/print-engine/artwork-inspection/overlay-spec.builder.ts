import type { OverlayCanvasSpec, OverlaySpec } from './artwork-inspection.types.js';

export interface PrintDimensionsInput {
  finishedWidthMm?: number | null;
  finishedHeightMm?: number | null;
  artworkWidthMm?: number | null;
  artworkHeightMm?: number | null;
  bleedMm?: number | null;
  safeAreaMm?: number | null;
  safeAreaWidthMm?: number | null;
  safeAreaHeightMm?: number | null;
}

const OVERLAY_COLORS = {
  BLEED: '#22c55e',
  TRIM: '#ef4444',
  SAFE_AREA: '#3b82f6',
  PRINTABLE: '#a855f7',
  MARGIN: '#f59e0b',
  CUT_LINE: '#dc2626',
} as const;

export function buildOverlaySpec(input: PrintDimensionsInput): OverlayCanvasSpec | null {
  const designW = input.artworkWidthMm ?? null;
  const designH = input.artworkHeightMm ?? null;
  if (!designW || !designH) return null;

  const bleed = input.bleedMm ?? 0;
  const trimW = input.finishedWidthMm ?? designW - bleed * 2;
  const trimH = input.finishedHeightMm ?? designH - bleed * 2;

  const bleedInsetX = (designW - trimW) / 2;
  const bleedInsetY = (designH - trimH) / 2;

  let safeW = input.safeAreaWidthMm ?? null;
  let safeH = input.safeAreaHeightMm ?? null;
  const safeInset = input.safeAreaMm ?? 0;

  if (!safeW || !safeH) {
    safeW = Math.max(trimW - safeInset * 2, 0);
    safeH = Math.max(trimH - safeInset * 2, 0);
  }

  const safeX = bleedInsetX + (trimW - safeW) / 2;
  const safeY = bleedInsetY + (trimH - safeH) / 2;

  const overlays: OverlaySpec[] = [
    {
      kind: 'BLEED',
      label: 'Bleed area',
      color: OVERLAY_COLORS.BLEED,
      strokeWidth: 1.5,
      dash: [6, 4],
      rect: { x: 0, y: 0, width: designW, height: designH },
      zIndex: 1,
    },
    {
      kind: 'TRIM',
      label: 'Trim line',
      color: OVERLAY_COLORS.TRIM,
      strokeWidth: 2,
      rect: { x: bleedInsetX, y: bleedInsetY, width: trimW, height: trimH },
      zIndex: 2,
    },
    {
      kind: 'SAFE_AREA',
      label: 'Safe area',
      color: OVERLAY_COLORS.SAFE_AREA,
      strokeWidth: 2,
      dash: [4, 3],
      rect: { x: safeX, y: safeY, width: safeW, height: safeH },
      zIndex: 3,
    },
    {
      kind: 'PRINTABLE',
      label: 'Printable area',
      color: OVERLAY_COLORS.PRINTABLE,
      strokeWidth: 1,
      dash: [2, 2],
      rect: { x: bleedInsetX, y: bleedInsetY, width: trimW, height: trimH },
      zIndex: 0,
    },
    {
      kind: 'CUT_LINE',
      label: 'Cutting line',
      color: OVERLAY_COLORS.CUT_LINE,
      strokeWidth: 1,
      rect: { x: bleedInsetX, y: bleedInsetY, width: trimW, height: trimH },
      zIndex: 4,
    },
  ];

  return {
    designWidthMm: designW,
    designHeightMm: designH,
    overlays,
  };
}

export function extractSpecMetadata(metadata: Record<string, unknown> | null | undefined) {
  const meta = metadata ?? {};
  const productNotes = Array.isArray(meta['productNotes'])
    ? (meta['productNotes'] as Array<string | Record<string, unknown>>).map((item, i) => {
        if (typeof item === 'string') {
          return { id: `note-${i}`, label: item };
        }
        return {
          id: String(item['id'] ?? `note-${i}`),
          label: String(item['label'] ?? item['title'] ?? 'Note'),
          icon: item['icon'] ? String(item['icon']) : null,
        };
      })
    : [];

  const printingTips = Array.isArray(meta['printingTips'])
    ? (meta['printingTips'] as Array<Record<string, unknown>>).map((tip, i) => ({
        id: String(tip['id'] ?? `tip-${i}`),
        title: String(tip['title'] ?? tip['label'] ?? 'Tip'),
        description: String(tip['description'] ?? tip['text'] ?? ''),
        icon: tip['icon'] ? String(tip['icon']) : null,
      }))
    : [];

  const maxResolutionPx =
    typeof meta['maxResolutionPx'] === 'number'
      ? meta['maxResolutionPx']
      : typeof meta['maxResolution'] === 'number'
        ? meta['maxResolution']
        : null;

  const safeAreaWidthMm =
    typeof meta['safeAreaWidthMm'] === 'number' ? meta['safeAreaWidthMm'] : null;
  const safeAreaHeightMm =
    typeof meta['safeAreaHeightMm'] === 'number' ? meta['safeAreaHeightMm'] : null;

  return { productNotes, printingTips, maxResolutionPx, safeAreaWidthMm, safeAreaHeightMm };
}
