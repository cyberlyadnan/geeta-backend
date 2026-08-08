/**
 * Real end-to-end test for the product search the admin create-order screen uses.
 *
 * This deliberately does NOT mock anything: it boots the actual Express app, mints a real staff
 * JWT, seeds real rows, and makes real HTTP requests to `GET /v1/products?search=...`. The bug
 * this covers (search matching a different field than the UI displays) is invisible to a mocked
 * test, because a mock returns whatever you told it to.
 *
 * Every row it creates is removed in `after`, including on the failure path — this runs against
 * the shared dev database and must not leave residue.
 *
 * Run with `npm run test:product-search`. It is deliberately kept out of the default `npm test`
 * suite, which is all in-memory fakes and needs no database or environment file.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { ProductStatus, ProductVisibility } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { createApp } from '../../../app.js';
import { env } from '../../../config/env.js';
import { tokenService } from '../../../services/auth/token.service.js';

const TAG = 'zzqa-search-probe';

interface SearchResponse {
  data?: { items?: Array<{ id: string; name: string; displayName: string | null }> };
  message?: string;
}

let server: Server;
let baseUrl: string;
let authHeader: string;
const createdOfferingIds: string[] = [];

/** Products whose *display* name and *stored* name differ — the exact shape that used to fail. */
const FIXTURES = [
  { name: `${TAG} storage carton`, displayName: `${TAG} Wedding Card Premium`, sku: `${TAG}-SKU-1` },
  { name: `${TAG} plain sheet`, displayName: null, sku: `${TAG}-SKU-2` },
];

async function seed() {
  // Reuse a real series rather than building the whole category tree — the search filter under
  // test doesn't care which series a product hangs off.
  const series = await prisma.productSeries.findFirst({
    where: { deletedAt: null, isActive: true },
    select: { id: true },
  });
  assert.ok(series, 'dev database has no active product series to attach a test product to');

  for (const [index, fixture] of FIXTURES.entries()) {
    const offering = await prisma.productOffering.create({
      data: {
        seriesId: series.id,
        name: fixture.name,
        slug: `${TAG}-${index}-${Date.now()}`,
        sku: fixture.sku,
        displayName: fixture.displayName,
        status: ProductStatus.ACTIVE,
        visibility: ProductVisibility.VENDOR_ONLY,
        isActive: true,
        versions: {
          create: {
            versionNumber: 1,
            versionLabel: 'v1',
            isCurrent: true,
          },
        },
      },
      select: { id: true },
    });
    createdOfferingIds.push(offering.id);
  }
}

async function cleanup() {
  if (createdOfferingIds.length === 0) return;
  await prisma.productOfferingVersion.deleteMany({
    where: { productOfferingId: { in: createdOfferingIds } },
  });
  await prisma.productOffering.deleteMany({ where: { id: { in: createdOfferingIds } } });
  createdOfferingIds.length = 0;
}

async function search(term: string): Promise<SearchResponse> {
  const res = await fetch(`${baseUrl}/products?search=${encodeURIComponent(term)}&limit=50`, {
    headers: { Authorization: authHeader },
  });
  assert.equal(res.status, 200, `search "${term}" returned HTTP ${res.status}`);
  return (await res.json()) as SearchResponse;
}

function names(body: SearchResponse): string[] {
  // Mirrors exactly what the UI renders for each row.
  return (body.data?.items ?? []).map((i) => i.displayName ?? i.name);
}

describe('GET /products?search — real endpoint, real database', () => {
  before(async () => {
    const staff = await prisma.user.findFirst({
      where: { role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] } } },
      select: { id: true, email: true, role: { select: { name: true } } },
    });
    assert.ok(staff, 'dev database has no admin/manager user to authenticate as');

    authHeader = `Bearer ${tokenService.generateAccessToken({
      id: staff.id,
      email: staff.email,
      role: staff.role.name,
    })}`;

    try {
      await seed();
    } catch (error) {
      await cleanup();
      throw error;
    }

    server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const port = (server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}${env.API_PREFIX}/${env.API_VERSION}`;
  });

  after(async () => {
    await cleanup();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  it('returns a real 200 with a usable list shape the frontend can render', async () => {
    const body = await search(TAG);
    assert.ok(Array.isArray(body.data?.items), 'response has no data.items array');
    assert.ok(body.data!.items!.length >= 2, 'seeded products were not returned');
    for (const item of body.data!.items!) {
      assert.ok(item.id, 'every row needs an id to be selectable');
      assert.ok(item.displayName ?? item.name, 'every row needs a label to render');
    }
  });

  // THE REGRESSION. Staff search for what the screen shows them — the display name.
  it('finds a product by the display name the UI actually shows', async () => {
    const body = await search('Wedding Card Premium');
    assert.ok(
      names(body).includes(`${TAG} Wedding Card Premium`),
      'searching the displayed name found nothing — search and display are reading different fields',
    );
  });

  it('still finds a product by its stored name', async () => {
    const body = await search('plain sheet');
    assert.ok(names(body).includes(`${TAG} plain sheet`));
  });

  it('matches words in any order, the way staff actually type', async () => {
    const body = await search('premium wedding');
    assert.ok(
      names(body).includes(`${TAG} Wedding Card Premium`),
      'reordered words found nothing — search is doing a single literal substring match',
    );
  });

  it('is case-insensitive', async () => {
    const upper = await search('WEDDING CARD');
    const lower = await search('wedding card');
    assert.ok(names(upper).includes(`${TAG} Wedding Card Premium`));
    assert.deepEqual(names(upper).sort(), names(lower).sort());
  });

  it('finds a product by SKU, for staff working from a printed sheet', async () => {
    const body = await search(`${TAG}-SKU-1`);
    assert.ok(names(body).includes(`${TAG} Wedding Card Premium`));
  });

  it('returns an empty list — not an error — when nothing matches', async () => {
    const body = await search(`${TAG}-definitely-no-such-product`);
    assert.deepEqual(body.data?.items, [], 'a no-match search must be an empty list, not a failure');
  });

  it('browsing by category returns products without any search text', async () => {
    const category = await prisma.category.findFirst({
      where: { deletedAt: null, isActive: true },
      select: { id: true },
    });
    assert.ok(category, 'dev database has no active category');

    const res = await fetch(`${baseUrl}/products?categoryId=${category.id}&limit=50`, {
      headers: { Authorization: authHeader },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as SearchResponse;
    assert.ok(
      (body.data?.items?.length ?? 0) > 0,
      'browsing a category returned nothing — the browse-first picker would look broken',
    );
  });
});
