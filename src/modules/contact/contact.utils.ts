import { ContactSubject, type ContactInquiry } from '@prisma/client';
import type { CreateContactInquiryInput } from './contact.validation.js';

const SUBJECT_TO_DB: Record<CreateContactInquiryInput['subject'], ContactSubject> = {
  quote: ContactSubject.QUOTE,
  order: ContactSubject.ORDER,
  partnership: ContactSubject.PARTNERSHIP,
  support: ContactSubject.SUPPORT,
  other: ContactSubject.OTHER,
};

const SUBJECT_FROM_DB: Record<ContactSubject, CreateContactInquiryInput['subject']> = {
  [ContactSubject.QUOTE]: 'quote',
  [ContactSubject.ORDER]: 'order',
  [ContactSubject.PARTNERSHIP]: 'partnership',
  [ContactSubject.SUPPORT]: 'support',
  [ContactSubject.OTHER]: 'other',
};

export function mapSubjectToDb(subject: CreateContactInquiryInput['subject']): ContactSubject {
  return SUBJECT_TO_DB[subject];
}

export function mapContactInquiry(inquiry: ContactInquiry) {
  return {
    id: inquiry.id,
    name: inquiry.name,
    email: inquiry.email,
    phone: inquiry.phone,
    company: inquiry.company,
    subject: SUBJECT_FROM_DB[inquiry.subject],
    message: inquiry.message,
    status: inquiry.status,
    ipAddress: inquiry.ipAddress,
    readAt: inquiry.readAt,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
  };
}
