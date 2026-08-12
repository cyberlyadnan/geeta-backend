/**
 * Evaluates skip conditions on workflow template steps against order configuration selections.
 *
 * A skip condition tells the workflow engine: "if the vendor chose X for field Y, this step
 * is not needed." For example, if lamination = "not_required", skip the lamination step.
 *
 * Condition format (single):
 *   { "field": "lamination", "operator": "in", "values": ["not_required", "none"] }
 *
 * Array format (AND — all must match to skip):
 *   [{ "field": "lamination", "operator": "eq", "values": ["none"] },
 *    { "field": "uv", "operator": "eq", "values": ["none"] }]
 *
 * Supported operators:
 *   - "in"     — selected value is one of the listed values → skip
 *   - "eq"     — shorthand for "in" with a single value
 *   - "not_in" — selected value is NOT one of the listed values → skip
 *   - "neq"    — shorthand for "not_in" with a single value
 *   - "empty"  — field is absent or empty string → skip
 *   - "not_empty" — field is present and non-empty → skip
 */

export interface SkipCondition {
  field: string;
  operator: 'in' | 'eq' | 'not_in' | 'neq' | 'empty' | 'not_empty';
  values?: string[];
}

function evaluateSingle(
  condition: SkipCondition,
  selections: Record<string, string>,
): boolean {
  const selected = selections[condition.field]?.trim() ?? '';

  switch (condition.operator) {
    case 'eq':
    case 'in': {
      const targets = condition.values ?? [];
      return targets.some((v) => v.toLowerCase() === selected.toLowerCase());
    }
    case 'neq':
    case 'not_in': {
      const targets = condition.values ?? [];
      if (!selected) return false;
      return !targets.some((v) => v.toLowerCase() === selected.toLowerCase());
    }
    case 'empty':
      return !selected;
    case 'not_empty':
      return Boolean(selected);
    default:
      return false;
  }
}

function parseConditions(skipWhen: unknown): SkipCondition[] | null {
  if (skipWhen == null) return null;
  if (Array.isArray(skipWhen)) {
    if (skipWhen.length === 0) return null;
    return skipWhen as SkipCondition[];
  }
  if (typeof skipWhen === 'object' && 'field' in (skipWhen as Record<string, unknown>)) {
    return [skipWhen as SkipCondition];
  }
  return null;
}

export function shouldSkipStep(
  skipWhen: unknown,
  selections: Record<string, string>,
): boolean {
  const conditions = parseConditions(skipWhen);
  if (!conditions) return false;
  return conditions.every((c) => evaluateSingle(c, selections));
}

export function resolveSkippedStepIds(
  steps: Array<{ id: string; skipWhen: unknown }>,
  selections: Record<string, string>,
): Set<string> {
  const skipped = new Set<string>();
  for (const step of steps) {
    if (shouldSkipStep(step.skipWhen, selections)) {
      skipped.add(step.id);
    }
  }
  return skipped;
}
