# Print Job Configuration Engine

Enterprise print production architecture — database-driven, no hardcoded product logic.

## Architecture

```
Product → ProductOfferingVersion
    ↓
PrintSpecification (formats, DPI, bleed, color mode)
PrintSizeStrategy + SizeConfiguration (FIXED / SHEET / AREA / CUSTOM / ROLL / COVERAGE)
FileRequirement + PrintLayer (front, back, UV layer, foil layer…)
ArtworkRule + CoveragePricingRule
    ↓
Vendor Order Wizard
    ↓
Artwork Upload → BullMQ Processing Pipeline
    ↓
Validation Engine + Coverage Engine + Live Pricing
    ↓
ProductionOrder + OrderArtwork (version pinned)
    ↓
Production APIs (approve / reject / download original)
```

## Backend modules

| Path | Purpose |
|------|---------|
| `src/modules/print-engine/engines/size.engine.ts` | Generic size resolution |
| `src/modules/print-engine/engines/validation.engine.ts` | Artwork validation (SUCCESS/WARNING/ERROR) |
| `src/modules/print-engine/engines/coverage.engine.ts` | Coverage % + pricing |
| `src/modules/print-engine/services/print-job.service.ts` | Vendor orchestration |
| `src/modules/print-engine/services/admin-print-engine.service.ts` | Admin configuration |
| `src/modules/print-engine/services/artwork-processing.service.ts` | File pipeline |
| `src/queues/artwork-processing.queue.ts` | Async processing worker |

## API routes

### Vendor (`/api/v1/print-jobs`)
- `GET /versions/:versionId/context` — full print job context
- `POST /versions/:versionId/resolve-size` — size engine
- `POST /artwork/presign` — R2 presigned upload
- `POST /artwork/register` — register + queue processing
- `GET /artwork/:artworkVersionId` — status, validation, coverage, preview
- `POST /calculate-pricing` — live pricing with size + coverage adjustments

### Admin (`/api/v1/admin/print-engine`)
- `GET /versions/:versionId` — full engine config
- `PUT /versions/:versionId/print-specification`
- `PUT /versions/:versionId/size-strategy`
- `POST /size-strategies/:strategyId/sizes`
- `POST /versions/:versionId/file-requirements`
- `POST /versions/:versionId/print-layers`
- `POST /versions/:versionId/coverage-rules`

### Production (`/api/v1/production/artwork`)
- `GET /order-items/:orderItemId/artwork`
- `PATCH /order-artwork/:id/approval`
- `GET /artwork/:artworkVersionId/download`

## Database

Migration: `prisma/migrations/20260525120000_print_job_engine/`

Models: `PrintSpecification`, `PrintSizeStrategy`, `SizeConfiguration`, `ArtworkRule`, `CoveragePricingRule`, `PrintLayer`, `ArtworkFile`, `ArtworkVersion`, `ArtworkMetadata`, `ArtworkValidation`, `CoverageAnalysis`, `OrderArtwork`, `OrderArtworkVersion`

Apply when DB is reachable:

```bash
npm run prisma:migrate:deploy
```

## File processing pipeline

1. Virus scan (stub — `virusScanPassed: true`, ready for ClamAV)
2. Metadata extraction (`sharp` for raster, `pdf-lib` for PDF)
3. Preview generation (WebP for raster/PDF pages)
4. Validation engine
5. Coverage analysis (raster alpha channel or dimension estimate)
6. Store `ArtworkVersion` + reports

Worker: `npm run dev:worker` (includes `artwork-processing` queue)

## Frontend

- **Vendor wizard** — 6 steps: category → product → name → configure (+ size) → artwork → review/submit
- **Admin** — Print Engine tab on product detail with quick visiting-card setup
- **Components** — `ArtworkUploadSlot`, `PrintSizeSelector`

## Quick admin setup (visiting card)

1. Open `/admin/products/[id]` → **Print engine** tab
2. Click **Quick setup: Visiting Card (90×54 mm)**
3. Configures print spec, fixed size, and front artwork requirement

## Future extension points

- AI validation, auto bleed detection, color profile detection
- PDF preflight / Adobe standards
- Gang sheet / nesting / imposition
- Materialized coverage pricing cache

No architectural changes required — extend `ArtworkRule`, `CoveragePricingRule`, and BullMQ jobs.
