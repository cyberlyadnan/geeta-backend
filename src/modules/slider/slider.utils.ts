import { SlideStatus } from '@prisma/client';
import type { SliderSlide } from '@prisma/client';

export interface SlideScheduleInput {
  status: SlideStatus;
  startDate: Date | null;
  endDate: Date | null;
}

export function computeEffectiveSlideStatus(
  slide: SlideScheduleInput,
  now: Date = new Date(),
): SlideStatus {
  if (slide.status === SlideStatus.INACTIVE) {
    return SlideStatus.INACTIVE;
  }

  if (slide.endDate && slide.endDate < now) {
    return SlideStatus.EXPIRED;
  }

  if (slide.startDate && slide.startDate > now) {
    return SlideStatus.SCHEDULED;
  }

  return SlideStatus.ACTIVE;
}

export function resolveStatusOnSave(
  manualStatus: SlideStatus | undefined,
  startDate: Date | null,
  endDate: Date | null,
  now: Date = new Date(),
): SlideStatus {
  if (manualStatus === SlideStatus.INACTIVE) {
    return SlideStatus.INACTIVE;
  }

  return computeEffectiveSlideStatus(
    { status: SlideStatus.ACTIVE, startDate, endDate },
    now,
  );
}

export function mapSlideToDto(slide: SliderSlide) {
  const effectiveStatus = computeEffectiveSlideStatus(slide);
  return {
    id: slide.id,
    sliderKey: slide.sliderKey,
    title: slide.title,
    description: slide.description,
    imageUrl: slide.imageUrl,
    imageKey: slide.imageKey,
    redirectUrl: slide.redirectUrl,
    displayOrder: slide.displayOrder,
    status: slide.status,
    effectiveStatus,
    startDate: slide.startDate?.toISOString() ?? null,
    endDate: slide.endDate?.toISOString() ?? null,
    notes: slide.notes,
    createdAt: slide.createdAt.toISOString(),
    updatedAt: slide.updatedAt.toISOString(),
    createdById: slide.createdById,
    updatedById: slide.updatedById,
  };
}

export function mapSlideToPublicDto(slide: SliderSlide) {
  return {
    id: slide.id,
    title: slide.title,
    description: slide.description,
    imageUrl: slide.imageUrl,
    redirectUrl: slide.redirectUrl,
    displayOrder: slide.displayOrder,
  };
}
