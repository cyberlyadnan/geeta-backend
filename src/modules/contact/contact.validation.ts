import { ContactInquiryPriority, ContactInquiryStatus } from '@prisma/client';
import { z } from 'zod';

export const contactSubjectValues = [
  'quote',
  'order',
  'partnership',
  'support',
  'other',
] as const;

export const createContactInquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(10).max(15),
  company: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  subject: z.enum(contactSubjectValues),
  message: z.string().trim().min(10).max(2000),
});

export const listContactInquiriesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.nativeEnum(ContactInquiryStatus).optional(),
  priority: z.nativeEnum(ContactInquiryPriority).optional(),
  subject: z.enum(contactSubjectValues).optional(),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const updateContactInquiryStatusSchema = z.object({
  status: z.nativeEnum(ContactInquiryStatus),
});

export const updateContactInquirySchema = z
  .object({
    status: z.nativeEnum(ContactInquiryStatus).optional(),
    priority: z.nativeEnum(ContactInquiryPriority).optional(),
    assignedToId: z.string().cuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.priority !== undefined ||
      value.assignedToId !== undefined,
    { message: 'At least one field must be provided' },
  );

export const addContactInquiryNoteSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

export const contactInquiryIdParamSchema = z.object({
  id: z.string().cuid(),
});

export type CreateContactInquiryInput = z.infer<typeof createContactInquirySchema>;
export type ListContactInquiriesInput = z.infer<typeof listContactInquiriesSchema>;
export type UpdateContactInquiryStatusInput = z.infer<typeof updateContactInquiryStatusSchema>;
export type UpdateContactInquiryInput = z.infer<typeof updateContactInquirySchema>;
export type AddContactInquiryNoteInput = z.infer<typeof addContactInquiryNoteSchema>;
