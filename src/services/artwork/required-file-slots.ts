import { evaluateOrderCondition } from '../../modules/admin-products/order-configuration.evaluator.js';

/** The subset of a file requirement this resolver needs — keeps it usable from any caller. */
export interface ConditionalFileSlot {
  code: string;
  label: string;
  /** Widened to string: callers pass DTOs whose enum has already been serialised. */
  requirementType: string;
  condition?: unknown;
}

/**
 * Which artwork slots a given configuration actually asks for.
 *
 * Slots are plain data with an optional condition, so a product that prints both sides asks for a
 * back file, and a UV option adds its own slots, purely from admin configuration — no field code
 * such as "print_side" or "uv" appears anywhere in code, which is what lets a future attribute
 * bring its own file slots without a release.
 */
export function resolveApplicableSlots<T extends ConditionalFileSlot>(
  slots: T[],
  selections: Record<string, string>,
): T[] {
  return slots.filter((slot) => evaluateOrderCondition(slot.condition, selections));
}

/** Codes of slots that must carry a file for this configuration. */
export function resolveRequiredSlotCodes(
  slots: ConditionalFileSlot[],
  selections: Record<string, string>,
): string[] {
  return resolveApplicableSlots(slots, selections)
    .filter((slot) => slot.requirementType === 'REQUIRED')
    .map((slot) => slot.code);
}
