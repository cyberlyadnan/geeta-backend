/**
 * Sync current versions to ACTIVE when the product is ACTIVE.
 * Run: npx dotenv -e .env -e .env.local -- tsx scripts/fix-active-product-versions.ts
 */
import { PrismaClient, ProductOfferingVersionStatus, ProductStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.productOfferingVersion.updateMany({
    where: {
      isCurrent: true,
      deletedAt: null,
      status: ProductOfferingVersionStatus.DRAFT,
      productOffering: { status: ProductStatus.ACTIVE, deletedAt: null },
    },
    data: {
      status: ProductOfferingVersionStatus.ACTIVE,
      publishedAt: new Date(),
    },
  });
  console.log(`✔ Activated ${result.count} current version(s) for ACTIVE products`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
