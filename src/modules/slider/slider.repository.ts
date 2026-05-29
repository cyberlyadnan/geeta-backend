import { SlideStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { GLOBAL_SLIDER_KEY } from './slider.constants.js';
import type { ListAdminSlidesQuery } from './slider.validation.js';

export class SliderRepository {
  findActiveBySliderKey(sliderKey: string = GLOBAL_SLIDER_KEY) {
    return prisma.sliderSlide.findMany({
      where: {
        sliderKey,
        status: { not: SlideStatus.INACTIVE },
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  findById(id: string) {
    return prisma.sliderSlide.findUnique({ where: { id } });
  }

  async listAdmin(query: ListAdminSlidesQuery) {
    const { page, limit, search, status, sortBy, sortOrder, sliderKey } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SliderSlideWhereInput = {
      sliderKey,
      ...(status && { status }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.sliderSlide.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.sliderSlide.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  create(data: Prisma.SliderSlideCreateInput) {
    return prisma.sliderSlide.create({ data });
  }

  update(id: string, data: Prisma.SliderSlideUpdateInput) {
    return prisma.sliderSlide.update({ where: { id }, data });
  }

  delete(id: string) {
    return prisma.sliderSlide.delete({ where: { id } });
  }

  async getMaxDisplayOrder(sliderKey: string) {
    const result = await prisma.sliderSlide.aggregate({
      where: { sliderKey },
      _max: { displayOrder: true },
    });
    return result._max.displayOrder ?? -1;
  }

  async reorder(sliderKey: string, orderedIds: string[]) {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.sliderSlide.update({
          where: { id },
          data: { displayOrder: index, sliderKey },
        }),
      ),
    );
  }

  markExpiredSlides(now: Date = new Date()) {
    return prisma.sliderSlide.updateMany({
      where: {
        status: { notIn: [SlideStatus.INACTIVE, SlideStatus.EXPIRED] },
        endDate: { lt: now },
      },
      data: { status: SlideStatus.EXPIRED },
    });
  }

  updateStatus(id: string, status: SlideStatus, updatedById: string) {
    return prisma.sliderSlide.update({
      where: { id },
      data: { status, updatedById },
    });
  }

  bulkUpdateStatus(ids: string[], status: SlideStatus, updatedById: string) {
    return prisma.sliderSlide.updateMany({
      where: { id: { in: ids } },
      data: { status, updatedById },
    });
  }
}

export const sliderRepository = new SliderRepository();
