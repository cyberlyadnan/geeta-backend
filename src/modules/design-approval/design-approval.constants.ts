/**
 * Step codes the wedding-card template uses. The design-approval service matches on these to
 * tell the two VENDOR_APPROVAL gates apart, so a template must use these codes for its gates.
 */
export const DESIGN_STEP_CODES = {
  DESIGN: 'DESIGN',
  PROOF_APPROVAL: 'PROOF_APPROVAL',
  SAMPLE_PRODUCTION: 'SAMPLE_PRODUCTION',
  SAMPLE_APPROVAL: 'SAMPLE_APPROVAL',
  FULL_PRODUCTION: 'FULL_PRODUCTION',
} as const;

export const DESIGN_DEPARTMENT_CODE = 'DESIGN';

export const CATALOG_DESIGN_APPROVAL_PROFILE_KEY = 'CATALOG_DESIGN_APPROVAL';

export const WEDDING_CARD_WORKFLOW_CODE = 'WEDDING_CARD_DESIGN_APPROVAL';

/**
 * Revision rounds allowed before the vendor must talk to staff.
 *
 * OPEN QUESTION FOR THE CLIENT — they never specified a limit, so nothing is enforced: this is
 * null and `revisionCount` is merely recorded. Set it to a number to turn the cap on; the check
 * is already written in `design-approval.service.ts` and covered by a test. No schema change is
 * needed either way.
 */
export const MAX_REVISION_ROUNDS: number | null = null;

export const DESIGN_NOTIFICATION_TYPES = {
  PROOF_READY: 'DESIGN_PROOF_READY',
  SAMPLE_READY: 'DESIGN_SAMPLE_READY',
  REVISION_REQUESTED: 'DESIGN_REVISION_REQUESTED',
  APPROVED: 'DESIGN_APPROVED',
} as const;
