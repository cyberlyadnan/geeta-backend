import type { SlideStatus } from '@prisma/client';

export interface SliderSlideDto {
  id: string;
  sliderKey: string;
  title: string | null;
  description: string | null;
  imageUrl: string;
  imageKey: string;
  redirectUrl: string | null;
  displayOrder: number;
  status: SlideStatus;
  effectiveStatus: SlideStatus;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  updatedById: string | null;
}

export interface PublicSliderSlideDto {
  id: string;
  title: string | null;
  description: string | null;
  imageUrl: string;
  redirectUrl: string | null;
  displayOrder: number;
}
