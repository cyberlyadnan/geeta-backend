export { supportSettingsService, SupportSettingsService } from './support-settings.service.js';
export { allocateTicketNumber } from './ticket-number.service.js';
export {
  evaluateReprintWindow,
  daysBetween,
  DAY_MS,
  type ReprintWindow,
} from './reprint-window.js';
export {
  reprintEligibilityService,
  ReprintEligibilityService,
  type ReprintEligibility,
  type ReprintIneligibleReason,
} from './reprint-eligibility.service.js';
export { reprintOrderService, ReprintOrderService, type CreateReprintOrderInput } from './reprint-order.service.js';
export {
  supportAttachmentService,
  SupportAttachmentService,
  kindForMimeType,
  SUPPORT_IMAGE_MIME_TYPES,
  SUPPORT_VIDEO_MIME_TYPES,
  SUPPORT_DOCUMENT_MIME_TYPES,
  type SupportUploadTicket,
} from './support-attachment.service.js';
export { supportTicketService, SupportTicketService } from './support-ticket.service.js';
export { SUPPORT_EVENTS, SUPPORT_NOTIFICATIONS } from './support.constants.js';
