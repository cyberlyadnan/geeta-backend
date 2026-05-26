import { ContactInquiryStatus } from '@prisma/client';
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
  subject: z.enum(contactSubjectValues).optional(),
  search: z.string().trim().max(100).optional(),
});

export const updateContactInquiryStatusSchema = z.object({
  status: z.nativeEnum(ContactInquiryStatus),
});

export type CreateContactInquiryInput = z.infer<typeof createContactInquirySchema>;
export type ListContactInquiriesInput = z.infer<typeof listContactInquiriesSchema>;
export type UpdateContactInquiryStatusInput = z.infer<typeof updateContactInquiryStatusSchema>;
