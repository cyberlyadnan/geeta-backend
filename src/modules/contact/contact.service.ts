import { ContactInquiryStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { mapContactInquiry, mapSubjectToDb } from './contact.utils.js';
import type {
  CreateContactInquiryInput,
  ListContactInquiriesInput,
  UpdateContactInquiryStatusInput,
} from './contact.validation.js';

export class ContactService {
  async create(
    input: CreateContactInquiryInput,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const inquiry = await prisma.contactInquiry.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone,
        company: input.company ?? null,
        subject: mapSubjectToDb(input.subject),
        message: input.message,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    });

    return mapContactInquiry(inquiry);
  }

  async findAll(query: ListContactInquiriesInput) {
    const { page, limit, status, subject, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ContactInquiryWhereInput = {
      ...(status && { status }),
      ...(subject && { subject: mapSubjectToDb(subject) }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.contactInquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
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

  async findById(id: string) {
    const inquiry = await prisma.contactInquiry.findUnique({ where: { id } });

    if (!inquiry) {
      throw ApiError.notFound('Contact inquiry not found');
    }

    if (inquiry.status === ContactInquiryStatus.NEW) {
      const updated = await prisma.contactInquiry.update({
        where: { id },
        data: {
          status: ContactInquiryStatus.READ,
          readAt: new Date(),
        },
      });
      return mapContactInquiry(updated);
    }

    return mapContactInquiry(inquiry);
  }

  async updateStatus(id: string, input: UpdateContactInquiryStatusInput) {
    try {
      const inquiry = await prisma.contactInquiry.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.status === ContactInquiryStatus.READ && { readAt: new Date() }),
        },
      });
      return mapContactInquiry(inquiry);
    } catch {
      throw ApiError.notFound('Contact inquiry not found');
    }
  }
}

export const contactService = new ContactService();
