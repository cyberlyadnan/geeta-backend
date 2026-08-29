import type { FinanceSettings, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

type Db = Pick<Prisma.TransactionClient, 'financeSettings'>;

const DEFAULTS = {
  id: 'default',
  homeStateCode: '24',
  defaultGstRatePercent: 18,
  defaultHsnCode: '4911',
  fiscalYearStartMonth: 4,
  autoPostingEnabled: true,
} as const;

/**
 * Single-row settings for the accounting engine, cached for the life of the process with a short
 * TTL. Every posting rule reads it (home state code decides CGST/SGST vs IGST on every single
 * document), so a database round trip per line would be wasteful, but a deploy-free toggle is
 * worth more than perfect freshness.
 */
class FinanceSettingsService {
  private cached: FinanceSettings | null = null;
  private cachedAt = 0;
  private readonly ttlMs = 60_000;

  invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
  }

  async get(db: Db = prisma): Promise<FinanceSettings> {
    if (this.cached && Date.now() - this.cachedAt < this.ttlMs) return this.cached;
    const row = await db.financeSettings.upsert({
      where: { id: DEFAULTS.id },
      update: {},
      create: { id: DEFAULTS.id },
    });
    this.cached = row;
    this.cachedAt = Date.now();
    return row;
  }

  async update(data: Prisma.FinanceSettingsUpdateInput, db: Db = prisma): Promise<FinanceSettings> {
    const row = await db.financeSettings.upsert({
      where: { id: DEFAULTS.id },
      update: data,
      create: { id: DEFAULTS.id, ...(data as Prisma.FinanceSettingsCreateInput) },
    });
    this.invalidate();
    this.cached = row;
    this.cachedAt = Date.now();
    return row;
  }
}

export const financeSettingsService = new FinanceSettingsService();
