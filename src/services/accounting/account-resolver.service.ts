import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { ensureChartOfAccounts } from './chart-of-accounts.seed.js';

type Db = Pick<Prisma.TransactionClient, 'chartOfAccount'>;

/**
 * Code → id lookup for the posting rules.
 *
 * Posting happens on nearly every write path in the finance domain, and the chart of accounts
 * changes about once a year, so the map is cached process-wide and invalidated explicitly by the
 * chart-of-accounts admin service. The cache is a plain Map rather than Redis on purpose: it is
 * tiny, and a stale entry on one instance is corrected on its next chart write or restart.
 */
class AccountResolver {
  private codeToId = new Map<string, string>();
  private loaded = false;
  private loading: Promise<void> | null = null;

  invalidate(): void {
    this.loaded = false;
    this.loading = null;
    this.codeToId.clear();
  }

  async load(db: Db = prisma): Promise<void> {
    if (this.loaded) return;
    // Collapse concurrent cold starts onto a single query.
    this.loading ??= (async () => {
      let accounts = await db.chartOfAccount.findMany({ select: { id: true, code: true } });
      if (accounts.length === 0) {
        // First boot on a fresh database: install the default chart rather than failing every
        // posting attempt with "account not found".
        await ensureChartOfAccounts(db);
        accounts = await db.chartOfAccount.findMany({ select: { id: true, code: true } });
      }
      this.codeToId = new Map(accounts.map((a) => [a.code, a.id]));
      this.loaded = true;
    })().finally(() => {
      this.loading = null;
    });
    await this.loading;
  }

  /** Throws rather than returning null — a posting rule naming a missing account is a bug. */
  async idFor(code: string, db: Db = prisma): Promise<string> {
    await this.load(db);
    const id = this.codeToId.get(code);
    if (id) return id;

    // A code the cache has not seen may have been created since load; check once before failing.
    const fresh = await db.chartOfAccount.findUnique({ where: { code }, select: { id: true } });
    if (!fresh) {
      throw ApiError.internal(
        `Chart of accounts is missing account "${code}". Run the accounting seed before posting.`,
      );
    }
    this.codeToId.set(code, fresh.id);
    return fresh.id;
  }

  async idsFor(codes: string[], db: Db = prisma): Promise<Map<string, string>> {
    await this.load(db);
    const out = new Map<string, string>();
    for (const code of codes) out.set(code, await this.idFor(code, db));
    return out;
  }
}

export const accountResolver = new AccountResolver();
