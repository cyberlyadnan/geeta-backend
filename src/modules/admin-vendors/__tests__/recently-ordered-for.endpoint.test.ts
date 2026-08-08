/**
 * Real end-to-end test for the "recently ordered for" vendor strip on the admin create-order
 * screen. Boots the real app, mints a real staff token, hits the real route. Read-only — it
 * creates nothing, so there is nothing to clean up.
 *
 * Run with `npm run test:product-search` (same DB-backed group).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { prisma } from '../../../config/database.js';
import { createApp } from '../../../app.js';
import { env } from '../../../config/env.js';
import { tokenService } from '../../../services/auth/token.service.js';

let server: Server;
let baseUrl: string;
let authHeader: string;

interface RecentResponse {
  data?: {
    items?: Array<{ id: string; businessName: string; user: { id: string }; lastOrderedAt: string | null }>;
  };
}

describe('GET /admin/vendors/recently-ordered-for — real endpoint', () => {
  before(async () => {
    const staff = await prisma.user.findFirst({
      where: { role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] } } },
      select: { id: true, email: true, role: { select: { name: true } } },
    });
    assert.ok(staff, 'dev database has no admin/manager user');
    authHeader = `Bearer ${tokenService.generateAccessToken({
      id: staff.id,
      email: staff.email,
      role: staff.role.name,
    })}`;

    server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const port = (server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}${env.API_PREFIX}/${env.API_VERSION}`;
  });

  after(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  it('is reachable and returns a list the picker can render', async () => {
    const res = await fetch(`${baseUrl}/admin/vendors/recently-ordered-for`, {
      headers: { Authorization: authHeader },
    });
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);

    const body = (await res.json()) as RecentResponse;
    assert.ok(Array.isArray(body.data?.items), 'response has no items array');

    for (const item of body.data!.items!) {
      assert.ok(item.businessName, 'each tile needs a business name to show');
      // The picker submits `user.id` as the vendorId — a missing one would break placement.
      assert.ok(item.user?.id, 'each vendor must expose its user id');
    }
  });

  it('does not collide with the /:id route', async () => {
    // Regression guard: registered after '/:id', Express would treat the literal path segment as
    // a vendor id and 404.
    const res = await fetch(`${baseUrl}/admin/vendors/recently-ordered-for?limit=3`, {
      headers: { Authorization: authHeader },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as RecentResponse;
    assert.ok((body.data?.items?.length ?? 0) <= 3, 'limit was ignored');
  });

  it('returns each vendor at most once', async () => {
    const res = await fetch(`${baseUrl}/admin/vendors/recently-ordered-for?limit=20`, {
      headers: { Authorization: authHeader },
    });
    const body = (await res.json()) as RecentResponse;
    const ids = (body.data?.items ?? []).map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, 'the same vendor appeared twice in the strip');
  });
});
