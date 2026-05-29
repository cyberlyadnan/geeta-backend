import { ContactInquiryStatus, type Prisma } from '@prisma/client';

export function generateInquiryReferenceCode(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INQ-${datePart}-${randomPart}`;
}

export const INQUIRY_INCLUDE = {
  assignedTo: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  resolvedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} satisfies Prisma.ContactInquiryInclude;

export const INQUIRY_DETAIL_INCLUDE = {
  ...INQUIRY_INCLUDE,
  notes: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
  activities: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      actor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.ContactInquiryInclude;

export function isClosedStatus(status: ContactInquiryStatus): boolean {
  return status === ContactInquiryStatus.RESOLVED || status === ContactInquiryStatus.ARCHIVED;
}
