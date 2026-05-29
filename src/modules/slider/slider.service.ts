import { SlideStatus } from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';
import { storageService } from '../../services/storage/index.js';
import { GLOBAL_SLIDER_KEY } from './slider.constants.js';
import { sliderRepository } from './slider.repository.js';
import {
  computeEffectiveSlideStatus,
  mapSlideToDto,
  mapSlideToPublicDto,
  resolveStatusOnSave,
} from './slider.utils.js';
import type {
  BulkSlideStatusInput,
  CreateSlideInput,
  ListAdminSlidesQuery,
  ReorderSlidesInput,
  UpdateSlideInput,
} from './slider.validation.js';

export class SliderService {
  async refreshExpiredSlides() {
    return sliderRepository.markExpiredSlides();
  }

  async listPublic(sliderKey: string = GLOBAL_SLIDER_KEY) {
    await this.refreshExpiredSlides();
    const slides = await sliderRepository.findActiveBySliderKey(sliderKey);
    const now = new Date();

    return slides
      .filter((slide) => computeEffectiveSlideStatus(slide, now) === SlideStatus.ACTIVE)
      .map(mapSlideToPublicDto);
  }

  async listAdmin(query: ListAdminSlidesQuery) {
    await this.refreshExpiredSlides();
    const result = await sliderRepository.listAdmin(query);
    return {
      items: result.items.map(mapSlideToDto),
      meta: result.meta,
    };
  }

  async getById(id: string) {
    await this.refreshExpiredSlides();
    const slide = await sliderRepository.findById(id);
    if (!slide) throw ApiError.notFound('Slide not found');
    return mapSlideToDto(slide);
  }

  async create(input: CreateSlideInput, userId: string) {
    const startDate = input.startDate ? new Date(input.startDate) : null;
    const endDate = input.endDate ? new Date(input.endDate) : null;
    const status = resolveStatusOnSave(input.status, startDate, endDate);
    const maxOrder = await sliderRepository.getMaxDisplayOrder(input.sliderKey ?? GLOBAL_SLIDER_KEY);

    const slide = await sliderRepository.create({
      sliderKey: input.sliderKey ?? GLOBAL_SLIDER_KEY,
      title: input.title ?? null,
      description: input.description ?? null,
      imageUrl: input.imageUrl,
      imageKey: input.imageKey,
      redirectUrl: input.redirectUrl ?? null,
      displayOrder: maxOrder + 1,
      status,
      startDate,
      endDate,
      notes: input.notes ?? null,
      createdBy: { connect: { id: userId } },
      updatedBy: { connect: { id: userId } },
    });

    return mapSlideToDto(slide);
  }

  async update(id: string, input: UpdateSlideInput, userId: string) {
    const existing = await sliderRepository.findById(id);
    if (!existing) throw ApiError.notFound('Slide not found');

    const startDate =
      input.startDate !== undefined
        ? input.startDate
          ? new Date(input.startDate)
          : null
        : existing.startDate;
    const endDate =
      input.endDate !== undefined
        ? input.endDate
          ? new Date(input.endDate)
          : null
        : existing.endDate;

    const status =
      input.status !== undefined
        ? resolveStatusOnSave(input.status, startDate, endDate)
        : resolveStatusOnSave(existing.status, startDate, endDate);

    const oldKey = existing.imageKey;
    const newKey = input.imageKey ?? existing.imageKey;

    const slide = await sliderRepository.update(id, {
      ...(input.sliderKey !== undefined && { sliderKey: input.sliderKey }),
      ...(input.title !== undefined && { title: input.title ?? null }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(input.imageKey !== undefined && { imageKey: input.imageKey }),
      ...(input.redirectUrl !== undefined && { redirectUrl: input.redirectUrl ?? null }),
      ...(input.notes !== undefined && { notes: input.notes ?? null }),
      status,
      startDate,
      endDate,
      updatedBy: { connect: { id: userId } },
    });

    if (newKey !== oldKey && oldKey) {
      await storageService.deleteObject(oldKey).catch(() => undefined);
    }

    return mapSlideToDto(slide);
  }

  async delete(id: string) {
    const existing = await sliderRepository.findById(id);
    if (!existing) throw ApiError.notFound('Slide not found');

    await sliderRepository.delete(id);
    await storageService.deleteObject(existing.imageKey).catch(() => undefined);
  }

  async duplicate(id: string, userId: string) {
    const existing = await sliderRepository.findById(id);
    if (!existing) throw ApiError.notFound('Slide not found');

    const maxOrder = await sliderRepository.getMaxDisplayOrder(existing.sliderKey);

    const slide = await sliderRepository.create({
      sliderKey: existing.sliderKey,
      title: existing.title ? `${existing.title} (Copy)` : null,
      description: existing.description,
      imageUrl: existing.imageUrl,
      imageKey: existing.imageKey,
      redirectUrl: existing.redirectUrl,
      displayOrder: maxOrder + 1,
      status: SlideStatus.INACTIVE,
      startDate: existing.startDate,
      endDate: existing.endDate,
      notes: existing.notes,
      createdBy: { connect: { id: userId } },
      updatedBy: { connect: { id: userId } },
    });

    return mapSlideToDto(slide);
  }

  async reorder(input: ReorderSlidesInput, userId: string) {
    const allForKey = await sliderRepository.listAdmin({
      page: 1,
      limit: 500,
      sliderKey: input.sliderKey,
      sortBy: 'displayOrder',
      sortOrder: 'asc',
    });

    const validIds = new Set(allForKey.items.map((s) => s.id));
    for (const id of input.orderedIds) {
      if (!validIds.has(id)) {
        throw ApiError.badRequest('Invalid slide id in reorder list');
      }
    }

    await sliderRepository.reorder(input.sliderKey, input.orderedIds);

    await Promise.all(
      input.orderedIds.map((id) =>
        sliderRepository.update(id, { updatedBy: { connect: { id: userId } } }),
      ),
    );

    return { orderedIds: input.orderedIds };
  }

  async updateStatus(id: string, status: SlideStatus, userId: string) {
    const existing = await sliderRepository.findById(id);
    if (!existing) throw ApiError.notFound('Slide not found');

    let resolved = status;
    if (status !== SlideStatus.INACTIVE) {
      resolved = resolveStatusOnSave(SlideStatus.ACTIVE, existing.startDate, existing.endDate);
    }

    const slide = await sliderRepository.updateStatus(id, resolved, userId);
    return mapSlideToDto(slide);
  }

  async bulkUpdateStatus(input: BulkSlideStatusInput, userId: string) {
    await sliderRepository.bulkUpdateStatus(input.ids, input.status, userId);
    if (input.status !== SlideStatus.INACTIVE) {
      await this.refreshExpiredSlides();
      const slides = await Promise.all(
        input.ids.map((id) => sliderRepository.findById(id)),
      );
      await Promise.all(
        slides
          .filter(Boolean)
          .map((slide) => {
            if (!slide) return Promise.resolve();
            const resolved = resolveStatusOnSave(
              SlideStatus.ACTIVE,
              slide.startDate,
              slide.endDate,
            );
            return sliderRepository.updateStatus(slide.id, resolved, userId);
          }),
      );
    }
    return { updated: input.ids.length };
  }
}

export const sliderService = new SliderService();
