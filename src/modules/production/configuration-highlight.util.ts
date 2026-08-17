import type { WorkflowStepType } from '@prisma/client';

/** Slim shape — callers select only what's needed from ConfigurationField + its options. */
export interface HighlightableConfigField {
  code: string;
  label: string;
  relevantStepTypes: WorkflowStepType[];
  options: Array<{ value: string; label: string }>;
}

export interface ConfigurationEntry {
  code: string;
  label: string;
  /** Human label for the selected value when it matches a known option; falls back to the raw
   *  stored value for free-text fields (TEXT/NUMBER) or values that predate an option rename. */
  value: string;
  /** True when this field is tagged relevant to the task's current production step — the signal
   *  the UI uses to visually call it out (e.g. a lamination field on a LAMINATION task). */
  highlighted: boolean;
}

/**
 * Turns a raw `{ fieldCode: rawValue }` selection blob into a labeled, step-aware list.
 *
 * This is the single place that decides "is this attribute relevant to what the operator in
 * front of this task is doing" — every department gets it for free from data (ConfigurationField
 * .relevantStepTypes) rather than a per-department branch here. A brand new department only needs
 * its step type tagged onto the relevant fields; this function never changes.
 *
 * Highlighted entries sort first so the operator sees what matters without scrolling.
 */
export function buildConfigurationEntries(
  fields: HighlightableConfigField[],
  selections: Record<string, unknown> | null | undefined,
  currentStepType: WorkflowStepType | null | undefined,
): ConfigurationEntry[] {
  if (!selections || typeof selections !== 'object') return [];

  const entries: ConfigurationEntry[] = [];
  for (const field of fields) {
    const raw = selections[field.code];
    if (raw == null || raw === '') continue;

    const rawValue = String(raw);
    const option = field.options.find((o) => o.value === rawValue);

    entries.push({
      code: field.code,
      label: field.label,
      value: option?.label ?? rawValue,
      highlighted: currentStepType != null && field.relevantStepTypes.includes(currentStepType),
    });
  }

  return entries.sort((a, b) => Number(b.highlighted) - Number(a.highlighted));
}
