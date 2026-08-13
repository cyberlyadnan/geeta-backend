import { prisma } from '../config/database.js';
import { TtlCache } from '../common/cache/ttl-cache.js';
import { loadOncePerRequest } from '../common/cache/request-cache-accessor.js';

export type CompanyProfileRow = {
  id: string;
  companyName: string;
  tagline: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  cin: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankBranch: string;
  terms: string;
  updatedAt: Date;
};

const localCache = new TtlCache<CompanyProfileRow>(60_000);

export class CompanyProfileRepository {
  async getOrCreate(): Promise<CompanyProfileRow> {
    return loadOncePerRequest('company:profile', () =>
      localCache.getOrLoad(async () => {
        const row = await prisma.companyProfile.findUnique({ where: { id: 'default' } });
        if (row) return row;
        return prisma.companyProfile.create({ data: { id: 'default' } });
      }),
    );
  }

  invalidateCache(): void {
    localCache.invalidate();
  }

  async update(
    data: Partial<Omit<CompanyProfileRow, 'id' | 'updatedAt'>>,
    updatedById: string,
  ) {
    const row = await prisma.companyProfile.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data, updatedById },
      update: { ...data, updatedById },
      include: {
        updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    this.invalidateCache();
    return row;
  }
}

export const companyProfileRepository = new CompanyProfileRepository();
