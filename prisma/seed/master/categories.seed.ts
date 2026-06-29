import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

type CategoryNode = {
  name: string;
  slug: string;
  description?: string;
  sortOrder: number;
  children?: CategoryNode[];
};

/** Commercial printing ERP category hierarchy */
export const CATEGORY_TREE: CategoryNode[] = [
  {
    name: 'Business Printing',
    slug: 'business-printing',
    description: 'Corporate stationery and business essentials',
    sortOrder: 1,
    children: [
      { name: 'Visiting Cards', slug: 'visiting-cards', sortOrder: 1 },
      { name: 'Letterheads', slug: 'letterheads', sortOrder: 2 },
      { name: 'Envelopes', slug: 'envelopes', sortOrder: 3 },
      { name: 'Bill Books & Vouchers', slug: 'bill-books', sortOrder: 4 },
      { name: 'ID Cards & Lanyards', slug: 'id-cards', sortOrder: 5 },
    ],
  },
  {
    name: 'Marketing Material',
    slug: 'marketing-material',
    description: 'Promotional and campaign print',
    sortOrder: 2,
    children: [
      { name: 'Brochures', slug: 'brochures', sortOrder: 1 },
      { name: 'Flyers & Leaflets', slug: 'flyers', sortOrder: 2 },
      { name: 'Posters', slug: 'posters', sortOrder: 3 },
      { name: 'Catalogues & Booklets', slug: 'catalogues', sortOrder: 4 },
      { name: 'Menu Cards', slug: 'menu-cards', sortOrder: 5 },
      { name: 'Table Tents', slug: 'table-tents', sortOrder: 6 },
    ],
  },
  {
    name: 'Large Format',
    slug: 'large-format',
    description: 'Banners, boards, and outdoor',
    sortOrder: 3,
    children: [
      { name: 'Flex Banners', slug: 'flex-banners', sortOrder: 1 },
      { name: 'Vinyl Prints', slug: 'vinyl-prints', sortOrder: 2 },
      { name: 'Canvas Prints', slug: 'canvas-prints', sortOrder: 3 },
      { name: 'ACP Boards', slug: 'acp-boards', sortOrder: 4 },
      { name: 'Sunboard & Foam', slug: 'sunboard', sortOrder: 5 },
      { name: 'Glow Sign & LED', slug: 'glow-sign', sortOrder: 6 },
      { name: 'Rollup Stands', slug: 'rollup-stands', sortOrder: 7 },
    ],
  },
  {
    name: 'Labels & Stickers',
    slug: 'labels-stickers',
    sortOrder: 4,
    children: [
      { name: 'Stickers', slug: 'stickers', sortOrder: 1 },
      { name: 'Labels', slug: 'labels', sortOrder: 2 },
      { name: 'Product Labels', slug: 'product-labels', sortOrder: 3 },
    ],
  },
  {
    name: 'Packaging',
    slug: 'packaging',
    sortOrder: 5,
    children: [
      { name: 'Folding Cartons', slug: 'folding-cartons', sortOrder: 1 },
      { name: 'Paper Bags', slug: 'paper-bags', sortOrder: 2 },
      { name: 'Carry Bags', slug: 'carry-bags', sortOrder: 3 },
      { name: 'Rigid Boxes', slug: 'rigid-boxes', sortOrder: 4 },
    ],
  },
  {
    name: 'Specialty Finishing',
    slug: 'specialty-finishing',
    sortOrder: 6,
    children: [
      { name: 'Spot UV Cards', slug: 'spot-uv-cards', sortOrder: 1 },
      { name: 'Raised UV', slug: 'raised-uv', sortOrder: 2 },
      { name: 'Foiling', slug: 'foiling', sortOrder: 3 },
      { name: 'Embossing & Debossing', slug: 'embossing', sortOrder: 4 },
    ],
  },
  {
    name: 'Wedding & Events',
    slug: 'wedding-events',
    sortOrder: 7,
    children: [
      { name: 'Wedding Cards', slug: 'wedding-cards', sortOrder: 1 },
      { name: 'Invitation Cards', slug: 'invitation-cards', sortOrder: 2 },
      { name: 'Certificates', slug: 'certificates', sortOrder: 3 },
    ],
  },
  {
    name: 'Promotional Products',
    slug: 'promotional-products',
    sortOrder: 8,
    children: [
      { name: 'Mouse Pads', slug: 'mouse-pads', sortOrder: 1 },
      { name: 'Photo Prints', slug: 'photo-prints', sortOrder: 2 },
      { name: 'Photo Frames', slug: 'photo-frames', sortOrder: 3 },
      { name: 'Wall Canvas', slug: 'wall-canvas', sortOrder: 4 },
      { name: 'Acrylic Prints', slug: 'acrylic-prints', sortOrder: 5 },
    ],
  },
  {
    name: 'Industrial Printing',
    slug: 'industrial-printing',
    sortOrder: 9,
    children: [
      { name: 'Screen Printing', slug: 'screen-printing', sortOrder: 1 },
      { name: 'Laser Cutting', slug: 'laser-cutting', sortOrder: 2 },
    ],
  },
];

async function upsertCategory(
  ctx: SeedContext,
  node: CategoryNode,
  parentId: string | null,
): Promise<void> {
  const row = await ctx.prisma.category.upsert({
    where: { slug: node.slug },
    update: {
      name: node.name,
      description: node.description,
      parentId,
      sortOrder: node.sortOrder,
      isActive: true,
      deletedAt: null,
    },
    create: {
      name: node.name,
      slug: node.slug,
      description: node.description,
      parentId,
      sortOrder: node.sortOrder,
      isActive: true,
    },
  });
  ctx.registry.categories.set(node.slug, row.id);
  if (node.children) {
    for (const child of node.children) {
      await upsertCategory(ctx, child, row.id);
    }
  }
}

export async function seedCategories(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('categories');
  for (const root of CATEGORY_TREE) {
    await upsertCategory(ctx, root, null);
  }
  const leafCount = CATEGORY_TREE.reduce((acc, r) => acc + (r.children?.length ?? 0), 0);
  log.info(`Upserted ${CATEGORY_TREE.length} root categories, ${leafCount} leaf categories`);
}
