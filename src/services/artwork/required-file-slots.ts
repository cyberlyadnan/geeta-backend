import { evaluateOrderCondition } from '../../modules/admin-products/order-configuration.evaluator.js';

/** One page inside a slot's file, optionally only present for certain selections. */
export interface SlotPageSpec {
  label: string;
  condition?: unknown;
}

/** The subset of a file requirement this resolver needs — keeps it usable from any caller. */
export interface ConditionalFileSlot {
  code: string;
  label: string;
  /** Widened to string: callers pass DTOs whose enum has already been serialised. */
  requirementType: string;
  condition?: unknown;
  pages?: unknown;
  groupLabel?: string | null;
}

/** A slot with its page list already resolved for the selections in hand. */
export interface ResolvedFileSlot extends ConditionalFileSlot {
  /** Labels of the pages the uploaded file must contain, in order. */
  pageLabels: string[];
  /** How many pages that file should have — 1 for an ordinary single-page upload. */
  requiredPages: number;
}

function parsePages(raw: unknown): SlotPageSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const label = (entry as { label?: unknown }).label;
    if (typeof label !== 'string' || label.trim() === '') return [];
    return [{ label, condition: (entry as { condition?: unknown }).condition }];
  });
}

/**
 * Resolves a slot's page list for the given selections.
 *
 * A both-sides job asks for one file containing two pages rather than a second upload box, which
 * is how print shops actually take artwork — and it means toggling between single and both sides
 * does not throw away a file the vendor already uploaded.
 */
export function resolveSlotPages(
  slot: ConditionalFileSlot,
  selections: Record<string, string>,
): { pageLabels: string[]; requiredPages: number } {
  const applicable = parsePages(slot.pages).filter((page) =>
    evaluateOrderCondition(page.condition, selections),
  );
  if (applicable.length === 0) return { pageLabels: [], requiredPages: 1 };
  return { pageLabels: applicable.map((p) => p.label), requiredPages: applicable.length };
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

/** Applicable slots with their page lists resolved — what both the wizard and validation read. */
export function resolveFileSlots<T extends ConditionalFileSlot>(
  slots: T[],
  selections: Record<string, string>,
): (T & ResolvedFileSlot)[] {
  return resolveApplicableSlots(slots, selections).map((slot) => ({
    ...slot,
    ...resolveSlotPages(slot, selections),
  }));
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
