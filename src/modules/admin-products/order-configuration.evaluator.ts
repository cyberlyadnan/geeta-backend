/**
 * Lightweight Order Configuration evaluator.
 * Uses existing ConfigurationRule rows — no new tables.
 *
 * Condition JSON (simple):
 * { "field": "print_side", "equals": "both" }
 * { "field": "uv", "in": ["front", "both"] }
 * { "and": [ ... ] } | { "or": [ ... ] }
 */

export type OrderConfigCondition =
  | { field: string; equals?: string; in?: string[]; notEquals?: string }
  | { and: OrderConfigCondition[] }
  | { or: OrderConfigCondition[] };

export type OrderConfigRule = {
  id: string;
  targetFieldCode: string;
  targetFieldId: string;
  ruleType: 'SHOW' | 'HIDE' | 'REQUIRE' | 'DISABLE';
  condition: OrderConfigCondition | Record<string, unknown>;
  sortOrder: number;
};

export type ResolvedQuestionState = {
  code: string;
  visible: boolean;
  required: boolean;
  disabled: boolean;
};

function asCondition(raw: unknown): OrderConfigCondition | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as OrderConfigCondition;
}

function evalCondition(
  condition: OrderConfigCondition | null,
  selections: Record<string, string>,
): boolean {
  if (!condition) return true;

  if ('and' in condition && Array.isArray(condition.and)) {
    return condition.and.every((c) => evalCondition(c, selections));
  }
  if ('or' in condition && Array.isArray(condition.or)) {
    return condition.or.some((c) => evalCondition(c, selections));
  }
  if ('field' in condition && typeof condition.field === 'string') {
    const value = selections[condition.field] ?? '';
    if (condition.equals !== undefined) return value === condition.equals;
    if (condition.notEquals !== undefined) return value !== condition.notEquals;
    if (condition.in) return condition.in.includes(value);
    return Boolean(value);
  }
  return true;
}

/**
 * Evaluates a raw stored condition against selections. Exported so anything conditional on a
 * vendor's answers — questions, artwork slots — shares one implementation and one JSON dialect
 * rather than growing a second, subtly different rules language.
 */
export function evaluateOrderCondition(
  raw: unknown,
  selections: Record<string, string>,
): boolean {
  return evalCondition(asCondition(raw), selections);
}

/**
 * Resolve visibility / required / disabled flags for each question given current selections.
 * Default: use field.isVisible / field.isRequired when no matching rules apply.
 */
export function resolveOrderQuestions(
  questions: Array<{ code: string; id?: string; isVisible?: boolean; isRequired?: boolean }>,
  rules: OrderConfigRule[],
  selections: Record<string, string>,
): ResolvedQuestionState[] {
  return questions.map((q) => {
    let visible = q.isVisible !== false;
    let required = Boolean(q.isRequired);
    let disabled = false;

    const matching = rules
      .filter((r) => r.targetFieldCode === q.code || r.targetFieldId === q.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const rule of matching) {
      const ok = evalCondition(asCondition(rule.condition), selections);
      if (!ok) continue;
      switch (rule.ruleType) {
        case 'SHOW':
          visible = true;
          break;
        case 'HIDE':
          visible = false;
          break;
        case 'REQUIRE':
          required = true;
          break;
        case 'DISABLE':
          disabled = true;
          break;
      }
    }

    return { code: q.code, visible, required, disabled };
  });
}

export function filterVisibleSelections(
  selections: Record<string, string>,
  resolved: ResolvedQuestionState[],
): Record<string, string> {
  const byCode = new Map(resolved.map((r) => [r.code, r]));
  const next: Record<string, string> = {};
  for (const [code, value] of Object.entries(selections)) {
    const state = byCode.get(code);
    if (!state || state.visible) next[code] = value;
  }
  return next;
}
