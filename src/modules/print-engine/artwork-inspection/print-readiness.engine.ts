import type { ValidationLevel } from '@prisma/client';
import type { ValidationCheck } from '../types/print-engine.types.js';
import type { PrintReadinessDto } from './artwork-inspection.types.js';

const FACTOR_WEIGHTS: Record<string, number> = {
  DIMENSIONS: 20,
  DPI: 18,
  BLEED: 12,
  SAFE_AREA: 10,
  PAGE_COUNT: 12,
  COLOR_MODE: 8,
  FILE_SIZE: 6,
  FORMAT: 6,
  ASPECT_RATIO: 5,
  TRANSPARENCY: 3,
};

const FACTOR_LABELS: Record<string, string> = {
  DIMENSIONS: 'Dimensions',
  DPI: 'Resolution',
  BLEED: 'Bleed',
  SAFE_AREA: 'Safe area',
  PAGE_COUNT: 'Pages',
  COLOR_MODE: 'Color mode',
  FILE_SIZE: 'File size',
  FORMAT: 'File format',
  ASPECT_RATIO: 'Aspect ratio',
  TRANSPARENCY: 'Transparency',
  ORIENTATION: 'Orientation',
};

function levelScore(level: ValidationLevel): number {
  if (level === 'SUCCESS') return 100;
  if (level === 'WARNING') return 55;
  return 0;
}

function gradeFromScore(score: number): PrintReadinessDto['grade'] {
  if (score >= 95) return 'EXCELLENT';
  if (score >= 85) return 'GOOD';
  if (score >= 70) return 'FAIR';
  if (score >= 50) return 'POOR';
  return 'CRITICAL';
}

function labelFromGrade(grade: PrintReadinessDto['grade']): string {
  switch (grade) {
    case 'EXCELLENT':
      return 'Excellent';
    case 'GOOD':
      return 'Good';
    case 'FAIR':
      return 'Acceptable with warnings';
    case 'POOR':
      return 'Needs attention';
    case 'CRITICAL':
      return 'Not print ready';
  }
}

function starsFromScore(score: number): number {
  if (score >= 96) return 5;
  if (score >= 85) return 4;
  if (score >= 70) return 3;
  if (score >= 50) return 2;
  return 1;
}

export class PrintReadinessEngine {
  calculate(checks: ValidationCheck[]): PrintReadinessDto {
    const grouped = new Map<string, ValidationCheck>();

    for (const check of checks) {
      const existing = grouped.get(check.code);
      if (!existing) {
        grouped.set(check.code, check);
        continue;
      }
      const order: ValidationLevel[] = ['ERROR', 'WARNING', 'SUCCESS'];
      if (order.indexOf(check.level) < order.indexOf(existing.level)) {
        grouped.set(check.code, check);
      }
    }

    const factors: PrintReadinessDto['factors'] = [];
    let weightedTotal = 0;
    let weightSum = 0;

    for (const [code, check] of grouped) {
      const weight = FACTOR_WEIGHTS[code] ?? 4;
      const score = levelScore(check.level);
      factors.push({
        code,
        label: FACTOR_LABELS[code] ?? code.replace(/_/g, ' '),
        weight,
        score,
        level: check.level,
      });
      weightedTotal += score * weight;
      weightSum += weight;
    }

    if (weightSum === 0) {
      return {
        score: 100,
        grade: 'EXCELLENT',
        stars: 5,
        label: 'Excellent',
        factors: [],
      };
    }

    const score = Math.round(weightedTotal / weightSum);
    const grade = gradeFromScore(score);

    return {
      score,
      grade,
      stars: starsFromScore(score),
      label: labelFromGrade(grade),
      factors: factors.sort((a, b) => b.weight - a.weight),
    };
  }
}

export const printReadinessEngine = new PrintReadinessEngine();
