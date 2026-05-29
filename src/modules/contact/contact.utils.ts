import {
  ContactInquiryActivityType,
  ContactSubject,
  type ContactInquiry,
  type ContactInquiryActivity,
  type ContactInquiryNote,
  type User,
} from '@prisma/client';
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

type UserSummary = Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;

type NoteWithAuthor = ContactInquiryNote & { author: UserSummary };
type ActivityWithActor = ContactInquiryActivity & { actor: UserSummary | null };

type InquiryWithRelations = ContactInquiry & {
  assignedTo?: UserSummary | null;
  resolvedBy?: UserSummary | null;
  notes?: NoteWithAuthor[];
  activities?: ActivityWithActor[];
};

export function mapSubjectToDb(subject: CreateContactInquiryInput['subject']): ContactSubject {
  return SUBJECT_TO_DB[subject];
}

function mapUserSummary(user: UserSummary | null | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
  };
}

export function mapContactInquiryNote(note: NoteWithAuthor) {
  return {
    id: note.id,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    author: mapUserSummary(note.author),
  };
}

export function mapContactInquiryActivity(activity: ActivityWithActor) {
  return {
    id: activity.id,
    type: activity.type,
    metadata: activity.metadata,
    createdAt: activity.createdAt,
    actor: mapUserSummary(activity.actor),
  };
}

export function mapContactInquiry(inquiry: InquiryWithRelations) {
  return {
    id: inquiry.id,
    referenceCode: inquiry.referenceCode,
    name: inquiry.name,
    email: inquiry.email,
    phone: inquiry.phone,
    company: inquiry.company,
    subject: SUBJECT_FROM_DB[inquiry.subject],
    message: inquiry.message,
    status: inquiry.status,
    priority: inquiry.priority,
    assignedTo: mapUserSummary(inquiry.assignedTo),
    resolvedBy: mapUserSummary(inquiry.resolvedBy),
    resolvedAt: inquiry.resolvedAt,
    ipAddress: inquiry.ipAddress,
    readAt: inquiry.readAt,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
    notes: inquiry.notes?.map(mapContactInquiryNote),
    activities: inquiry.activities?.map(mapContactInquiryActivity),
  };
}

export function mapActivityLabel(type: ContactInquiryActivityType): string {
  const labels: Record<ContactInquiryActivityType, string> = {
    [ContactInquiryActivityType.CREATED]: 'Inquiry submitted',
    [ContactInquiryActivityType.STATUS_CHANGED]: 'Status updated',
    [ContactInquiryActivityType.PRIORITY_CHANGED]: 'Priority updated',
    [ContactInquiryActivityType.ASSIGNED]: 'Assigned',
    [ContactInquiryActivityType.UNASSIGNED]: 'Unassigned',
    [ContactInquiryActivityType.NOTE_ADDED]: 'Internal note added',
    [ContactInquiryActivityType.READ]: 'Marked as read',
  };
  return labels[type];
}
