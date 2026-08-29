import type { Prisma, SupportSettings } from '@prisma/client';
import { prisma } from '../../config/database.js';

type Db = Pick<Prisma.TransactionClient, 'supportSettings'>;

const SETTINGS_ID = 'default';

/**
 * Runtime configuration for the support desk.
 *
 * The reprint window is the reason this is a table rather than a constant: the business tightens
 * or relaxes it seasonally, and that must not need a deploy. Cached with a short TTL because the
 * eligibility check runs on every reprint page load, while the value changes a few times a year.
 */
export class SupportSettingsService {
  private cached: SupportSettings | null = null;
  private cachedAt = 0;
  private readonly ttlMs = 60_000;

  invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
  }

  async get(db: Db = prisma): Promise<SupportSettings> {
    if (this.cached && Date.now() - this.cachedAt < this.ttlMs) return this.cached;
    const row = await db.supportSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    this.cached = row;
    this.cachedAt = Date.now();
    return row;
  }

  async update(data: Prisma.SupportSettingsUpdateInput, db: Db = prisma): Promise<SupportSettings> {
    const row = await db.supportSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...(data as Prisma.SupportSettingsCreateInput) },
    });
    this.invalidate();
    this.cached = row;
    this.cachedAt = Date.now();
    return row;
  }
}

export const supportSettingsService = new SupportSettingsService();
