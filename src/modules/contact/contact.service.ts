import {
  ContactInquiryActivityType,
  ContactInquiryPriority,
  ContactInquiryStatus,
  RoleName,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  generateInquiryReferenceCode,
  INQUIRY_DETAIL_INCLUDE,
  INQUIRY_INCLUDE,
  isClosedStatus,
} from './contact.constants.js';
import { mapContactInquiry, mapSubjectToDb } from './contact.utils.js';
import type {
  AddContactInquiryNoteInput,
  CreateContactInquiryInput,
  ListContactInquiriesInput,
  UpdateContactInquiryInput,
  UpdateContactInquiryStatusInput,
} from './contact.validation.js';
import { TtlCache } from '../../common/cache/ttl-cache.js';

interface ContactStatsSummary {
  total: number;
  new: number;
  open: number;
  inProgress: number;
  resolved: number;
  archived: number;
  byStatus: Partial<Record<ContactInquiryStatus, number>>;
  byPriority: Partial<Record<ContactInquiryPriority, number>>;
  bySubject: Record<string, number>;
}

const contactStatsCache = new TtlCache<ContactStatsSummary>(
  Number(process.env['CONTACT_STATS_CACHE_TTL_MS'] ?? 30_000),
);

export class ContactService {
  private async logActivity(
    tx: Prisma.TransactionClient,
    input: {
      inquiryId: string;
      actorId?: string;
      type: ContactInquiryActivityType;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    await tx.contactInquiryActivity.create({
      data: {
        inquiryId: input.inquiryId,
        actorId: input.actorId,
        type: input.type,
        metadata: input.metadata ?? {},
      },
    });
  }

  private async ensureAssignee(assigneeId: string) {
    const user = await prisma.user.findFirst({
      where: {
        id: assigneeId,
        deletedAt: null,
        role: { name: { in: [RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER] } },
      },
      select: { id: true },
    });

    if (!user) {
      throw ApiError.badRequest('Assignee must be an active admin or manager');
    }
  }

  async create(
    input: CreateContactInquiryInput,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const inquiry = await prisma.$transaction(async (tx) => {
      const created = await tx.contactInquiry.create({
        data: {
          referenceCode: generateInquiryReferenceCode(),
          name: input.name,
          email: input.email.toLowerCase(),
          phone: input.phone,
          company: input.company ?? null,
          subject: mapSubjectToDb(input.subject),
          message: input.message,
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        },
        include: INQUIRY_INCLUDE,
      });

      await this.logActivity(tx, {
        inquiryId: created.id,
        type: ContactInquiryActivityType.CREATED,
        metadata: {
          subject: created.subject,
          referenceCode: created.referenceCode,
        },
      });

      return created;
    });

    return mapContactInquiry(inquiry);
  }

  async getStats(): Promise<ContactStatsSummary> {
    return contactStatsCache.getOrLoad(async () => {
      const [statusGroups, priorityGroups, subjectGroups] = await Promise.all([
        prisma.contactInquiry.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        prisma.contactInquiry.groupBy({
          by: ['priority'],
          _count: { _all: true },
        }),
        prisma.contactInquiry.groupBy({
          by: ['subject'],
          _count: { _all: true },
        }),
      ]);

      const byStatus = Object.fromEntries(
        statusGroups.map((row) => [row.status, row._count._all]),
      ) as Partial<Record<ContactInquiryStatus, number>>;

      const total = statusGroups.reduce((sum, row) => sum + row._count._all, 0);
      const newCount = byStatus.NEW ?? 0;

      const byPriority = Object.fromEntries(
        priorityGroups.map((row) => [row.priority, row._count._all]),
      ) as Partial<Record<ContactInquiryPriority, number>>;

      const bySubject = Object.fromEntries(
        subjectGroups.map((row) => [row.subject, row._count._all]),
      );

      return {
        total,
        new: newCount,
        open:
          (byStatus.NEW ?? 0) +
          (byStatus.READ ?? 0) +
          (byStatus.IN_PROGRESS ?? 0),
        inProgress: byStatus.IN_PROGRESS ?? 0,
        resolved: byStatus.RESOLVED ?? 0,
        archived: byStatus.ARCHIVED ?? 0,
        byStatus,
        byPriority,
        bySubject,
      };
    });
  }

  async findAll(query: ListContactInquiriesInput) {
    const { page, limit, status, priority, subject, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ContactInquiryWhereInput = {
      ...(status && { status }),
      ...(priority && { priority }),
      ...(subject && { subject: mapSubjectToDb(subject) }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
          { referenceCode: { contains: search, mode: 'insensitive' } },
          { message: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const orderBy: Prisma.ContactInquiryOrderByWithRelationInput =
      sortBy === 'priority'
        ? { priority: sortOrder }
        : sortBy === 'status'
          ? { status: sortOrder }
          : sortBy === 'updatedAt'
            ? { updatedAt: sortOrder }
            : { createdAt: sortOrder };

    const [items, total] = await Promise.all([
      prisma.contactInquiry.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: INQUIRY_INCLUDE,
      }),
      prisma.contactInquiry.count({ where }),
    ]);

    return {
      items: items.map(mapContactInquiry),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string, actorId?: string) {
    const inquiry = await prisma.contactInquiry.findUnique({
      where: { id },
      include: INQUIRY_DETAIL_INCLUDE,
    });

    if (!inquiry) {
      throw ApiError.notFound('Contact inquiry not found');
    }

    if (inquiry.status === ContactInquiryStatus.NEW) {
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.contactInquiry.update({
          where: { id },
          data: {
            status: ContactInquiryStatus.READ,
            readAt: new Date(),
          },
          include: INQUIRY_DETAIL_INCLUDE,
        });

        await this.logActivity(tx, {
          inquiryId: id,
          actorId,
          type: ContactInquiryActivityType.READ,
          metadata: { from: ContactInquiryStatus.NEW, to: ContactInquiryStatus.READ },
        });

        return next;
      });

      return mapContactInquiry(updated);
    }

    return mapContactInquiry(inquiry);
  }

  async updateStatus(id: string, input: UpdateContactInquiryStatusInput, actorId?: string) {
    return this.update(id, { status: input.status }, actorId);
  }

  async update(id: string, input: UpdateContactInquiryInput, actorId?: string) {
    const existing = await prisma.contactInquiry.findUnique({ where: { id } });
    if (!existing) {
      throw ApiError.notFound('Contact inquiry not found');
    }

    if (input.assignedToId) {
      await this.ensureAssignee(input.assignedToId);
    }

    const inquiry = await prisma.$transaction(async (tx) => {
      const data: Prisma.ContactInquiryUpdateInput = {};

      if (input.status !== undefined && input.status !== existing.status) {
        data.status = input.status;

        if (input.status === ContactInquiryStatus.READ && !existing.readAt) {
          data.readAt = new Date();
        }

        if (isClosedStatus(input.status)) {
          data.resolvedAt = new Date();
          if (actorId) {
            data.resolvedBy = { connect: { id: actorId } };
          }
        } else if (isClosedStatus(existing.status)) {
          data.resolvedAt = null;
          data.resolvedBy = { disconnect: true };
        }
      }

      if (input.priority !== undefined && input.priority !== existing.priority) {
        data.priority = input.priority;
      }

      if (input.assignedToId !== undefined) {
        if (input.assignedToId === null) {
          data.assignedTo = { disconnect: true };
        } else {
          data.assignedTo = { connect: { id: input.assignedToId } };
        }
      }

      const updated = await tx.contactInquiry.update({
        where: { id },
        data,
        include: INQUIRY_DETAIL_INCLUDE,
      });

      if (input.status !== undefined && input.status !== existing.status) {
        await this.logActivity(tx, {
          inquiryId: id,
          actorId,
          type: ContactInquiryActivityType.STATUS_CHANGED,
          metadata: { from: existing.status, to: input.status },
        });
      }

      if (input.priority !== undefined && input.priority !== existing.priority) {
        await this.logActivity(tx, {
          inquiryId: id,
          actorId,
          type: ContactInquiryActivityType.PRIORITY_CHANGED,
          metadata: { from: existing.priority, to: input.priority },
        });
      }

      if (input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId) {
        await this.logActivity(tx, {
          inquiryId: id,
          actorId,
          type:
            input.assignedToId === null
              ? ContactInquiryActivityType.UNASSIGNED
              : ContactInquiryActivityType.ASSIGNED,
          metadata: {
            from: existing.assignedToId,
            to: input.assignedToId,
          },
        });
      }

      return updated;
    });

    return mapContactInquiry(inquiry);
  }

  async addNote(id: string, input: AddContactInquiryNoteInput, authorId: string) {
    const existing = await prisma.contactInquiry.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw ApiError.notFound('Contact inquiry not found');
    }

    await prisma.$transaction(async (tx) => {
      await tx.contactInquiryNote.create({
        data: {
          inquiryId: id,
          authorId,
          content: input.content,
        },
      });

      await this.logActivity(tx, {
        inquiryId: id,
        actorId: authorId,
        type: ContactInquiryActivityType.NOTE_ADDED,
        metadata: { preview: input.content.slice(0, 120) },
      });
    });

    return this.findById(id, authorId);
  }

  async listAssignees() {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        role: { name: { in: [RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER] } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
    }));
  }
}

export const contactService = new ContactService();
