# Artwork Preview Engine — Validation Report

**Date:** 2026-07-07  
**Scope:** Vendor order wizard artwork upload, live preview, size validation, overlays

---

## Executive Summary

The artwork preview was using **static print-spec dimensions** (e.g. generic digital sheet artwork size) while vendors selected **sheet-based sizes** (13×19, 12×18). Validation did not receive the selected size, raster EXIF orientation was ignored, and the UI treated finished `UNKNOWN` dimension results as **“Size check pending”**.

Root-cause fixes were applied in backend + frontend (no UI-only workarounds).

---

## Issues Found

| # | Symptom | Root cause |
|---|---------|------------|
| 1 | Preview canvas looked like a tall portrait box unrelated to 13×19 | Overlay aspect ratio came from static `CLIENT_DIGITAL_SHEET` spec (336×489 mm artwork box), not from **selected sheet** (330×483 mm trim + bleed) |
| 2 | Correct 13×19 upload still showed wrong preview | Local preview image used raw file pixels; server preview did not auto-orient EXIF |
| 3 | “Size check pending” never cleared | UI mapped `dimensionCompare.status === "UNKNOWN"` to “pending” even after `processingStatus === COMPLETED"` |
| 4 | 19×13 uploads failed size check | Dimension compare did not treat **rotated match** as valid |
| 5 | Multi-size products always validated against one spec | `validationEngine.validate()` supports `resolvedSize` but upload pipeline never passed selected sheet size |

---

## Architecture (Data Flow)

```
Vendor wizard
  ├─ Print size selector → sizeSelection (sizeCode: 13X19, etc.)
  ├─ Artwork upload → POST /print-jobs/artwork/* with `size` payload
  └─ Poll GET /print-jobs/artwork/:id

Backend
  ├─ registerArtwork → stores selectedSizeContext on ArtworkMetadata.rawMetadata
  ├─ artwork-processing.service → resolves sheet via sizeEngine + validates with resolvedSize
  ├─ getArtworkStatus → rebuilds inspection overlay from selected trim/design mm
  └─ buildArtworkInspection → dimensionCompare (MATCH | MISMATCH | UNKNOWN)

Frontend
  ├─ ArtworkOverlayPreview → canvas aspect = designWidthMm / designHeightMm
  ├─ Image → object-contain inside aspect-matched frame
  └─ Overlays → SVG rects from mm coordinates (bleed / trim / safe)
```

---

## Canvas Calculation

1. **Source of truth for preview frame**  
   `overlay.designWidthMm` and `overlay.designHeightMm` (artwork area **including bleed**).

2. **Sheet-based products (client catalog)**  
   When vendor selects e.g. `13X19`:
   - Trim (finished sheet): **330 × 483 mm** (from `sheet_sizes` master `13X19`)
   - Bleed: **3 mm** per edge
   - Design / artwork canvas: **336 × 489 mm**

3. **Frame sizing (`computeObjectContainFrame`)**  
   - `contentAspect = designWidthMm / designHeightMm`
   - Fits a rectangle with that aspect inside the preview container
   - **No stretch** — letterboxing only if container aspect differs

4. **Embedded wizard preview**  
   Container uses `aspect-[4/3]`; inner frame still respects sheet aspect via `computeObjectContainFrame`, so 13×19 appears as a **portrait sheet**, not stretched to 4:3.

---

## Unit Conversion

| Unit | Conversion |
|------|------------|
| Inch → mm | `value × 25.4` (`size.engine.ts` `toMillimeters`) |
| PDF points → mm | `points / 72 × 25.4` |
| Raster px → mm | `px / dpi × 25.4` (default DPI 300 if missing) |

**Sheet masters (examples):**

| Code | Inches | mm (W×H) |
|------|--------|----------|
| `12X18` | 12 × 18 | 305 × 457 |
| `13X19` | 13 × 19 | 330 × 483 |

No width/height swap at conversion — orientation is handled separately.

---

## Orientation Detection

1. **Raster upload (`sharp`)**  
   - `sharp(buffer).rotate()` applies EXIF orientation before measuring pixels and generating WebP preview.

2. **Validation**  
   - `dimensionsMatch()` accepts direct **or** 90° rotated match within bleed tolerance.
   - `ORIENTATION` check returns SUCCESS when rotated match is detected.

3. **Preview UI**  
   - `dimensionCompare.recommendedRotationDeg` (90 when rotated match) applied in `ArtworkOverlayPreview` so preview aligns with trim overlay.

4. **Supported cases**  
   - 13×19 and 19×13 → **MATCH** (orientation normalized)  
   - 12×18 and 18×12 → same logic

---

## Overlay Generation

Built in `overlay-spec.builder.ts` (backend) and mirrored in `overlay-spec.ts` (frontend fallback).

| Overlay | Meaning | Geometry |
|---------|---------|----------|
| **BLEED** | Full artwork area | 0,0 → designWidth × designHeight |
| **TRIM** | Finished sheet edge | Inset by bleed on all sides |
| **SAFE_AREA** | Text/logo safe zone | Trim inset by `safeAreaMm` (3 mm client catalog) |
| **PRINTABLE** | Same as trim (printable region) | Aligns with trim box |
| **CUT_LINE** | Cutting guide | Same as trim |

Overlays use **configured mm dimensions** from selected sheet + bleed, not uploaded image pixels.

---

## Validation Pipeline

1. Upload includes `size: { sizeCode, strategyType, ... }` from wizard.
2. `registerArtwork` persists `selectedSizeContext` on artwork metadata.
3. `artwork-metadata.extractor` extracts width/height/DPI (PDF, PNG, JPEG; AI/CDR remain vector — no auto dimensions).
4. `validationEngine.validate(metadata, spec, rules, resolvedSize)`:
   - **DIMENSIONS** — compare to design mm (trim + 2×bleed) with tolerance
   - **BLEED** — design vs trim-only detection
   - **ORIENTATION** — landscape/portrait + rotated match
   - **DPI**, **FORMAT**, **COLOR_MODE**, etc.
5. `buildDimensionCompare` for UI:
   - `MATCH` → “Correct size”
   - `MISMATCH` → “Incorrect size” + message
   - `UNKNOWN` → only when dimensions undetectable (e.g. AI/CDR) — **not** “pending”

---

## Scaling Algorithm

```
Container (fixed UI box)
  └─ Frame (aspect = designWidthMm / designHeightMm)  ← computeObjectContainFrame
       └─ <Image className="object-contain" />       ← preserve artwork aspect
            └─ SVG overlays (viewBox 0 0 100 100)    ← mapped from mm rects
```

- **Behavior:** CSS `object-contain` (equivalent to “contain” in design tools).
- **Never:** `object-cover`, non-uniform scale, or stretch-to-fill container.

---

## Format Support

| Format | Preview image | Auto dimensions | Size validation |
|--------|---------------|-----------------|-----------------|
| PNG / JPEG | Yes (WebP preview) | Yes (EXIF-aware) | Yes |
| PDF | No inline preview | Yes (page size) | Yes |
| AI / CDR | No | No (vector) | UNKNOWN — manual review |

---

## Files Changed

### Backend
- `services/artwork-metadata.extractor.ts` — EXIF auto-orient for raster
- `services/print-job.service.ts` — persist selected size; inspection overlay overrides
- `services/artwork-processing.service.ts` — pass `resolvedSize` to validation
- `engines/validation.engine.ts` — rotated match; sheet-aware bleed/orientation
- `artwork-inspection/artwork-inspection.builder.ts` — rotated dimension compare
- `artwork-inspection/requirements-panel.builder.ts` — trim/design overrides
- `print-engine.validation.ts` — `size` on upload schemas
- `__tests__/validation.engine.test.ts` — 13×19 / 19×13 cases

### Frontend
- `artwork-overlay-preview.tsx` — auto-rotation for preview
- `artwork-inspector-slot.tsx` — final size messages; pass size on upload
- `order-artwork-upload-section.tsx` / wizard — pass `selectedSize` into upload
- `print-jobs` service + hooks — `size` in presign/register/proxy upload

---

## Manual QA Checklist

1. Open **Digital Printing → Art Paper → 250 GSM** (or any sheet product).
2. Select **13×19** sheet size.
3. Upload PNG at 336×489 mm @ 300 DPI (or 13×19 inch equivalent).
4. Expect:
   - Portrait canvas matching sheet aspect
   - Green trim/bleed/safe overlays aligned
   - **“Correct size”** (not “pending”)
5. Repeat with **19×13** file → should show **orientation normalized** + MATCH.
6. Repeat with **12×18** and **18×12** on dual-sheet products.
7. Upload AI/CDR → **“Size could not be verified automatically”** (not stuck pending).

---

## Automated Tests

```bash
cd backend
npx tsx --test src/modules/print-engine/__tests__/validation.engine.test.ts
```

Covers exact match, rotated match, and mismatch for 13×19 sheet context.

---

## Residual Notes

- AI/CDR dimension extraction would require dedicated parsers (not in scope); UI clearly states manual verification.
- Re-upload artwork after changing sheet size — size context is stored per artwork version at upload time.
