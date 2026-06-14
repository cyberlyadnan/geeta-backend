import type { ProductSelection } from './pricing.types.js';

export type RuleCondition =
  | { field: string; operator: '==' | '!=' | '>' | '<' | '>=' | '<='; value: string | number }
  | { and: RuleCondition[] }
  | { or: RuleCondition[] };

export function evaluateCondition(
  condition: unknown,
  selections: ProductSelection,
  quantity: number,
): boolean {
  if (!condition || typeof condition !== 'object') return true;

  const c = condition as RuleCondition;

  if ('and' in c && Array.isArray(c.and)) {
    return c.and.every((child) => evaluateCondition(child, selections, quantity));
  }
  if ('or' in c && Array.isArray(c.or)) {
    return c.or.some((child) => evaluateCondition(child, selections, quantity));
  }
  if ('field' in c && 'operator' in c) {
    const field = c.field;
    const left = field === 'quantity' ? quantity : selections[field];
    const right = c.value;
    switch (c.operator) {
      case '==':
        return String(left) === String(right);
      case '!=':
        return String(left) !== String(right);
      case '>':
        return Number(left) > Number(right);
      case '<':
        return Number(left) < Number(right);
      case '>=':
        return Number(left) >= Number(right);
      case '<=':
        return Number(left) <= Number(right);
      default:
        return false;
    }
  }
  return true;
}

export function applyAdjustment(
  base: number,
  type: 'FIXED' | 'PERCENTAGE',
  value: number,
): number {
  if (type === 'PERCENTAGE') {
    return Math.round((base * (value / 100)) * 100) / 100;
  }
  return value;
}
