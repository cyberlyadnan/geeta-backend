import { DepartmentStaffRole } from '@prisma/client';
import { assignmentRepository } from './assignment.repository.js';

export type AssignmentStrategyName =
  | 'round_robin'
  | 'least_active'
  | 'least_workload'
  | 'priority_operator'
  | 'department_default';

/**
 * Picks the next operator for auto-assignment.
 * Default: round-robin across active OPERATOR staff in the department.
 * Strategy is extensible per department (future: department.settings.assignmentStrategy).
 */
export class AssignmentStrategyService {
  async pickOperator(
    departmentId: string,
    strategy: AssignmentStrategyName = 'round_robin',
  ): Promise<string | null> {
    const operators = await assignmentRepository.listEligibleOperators(departmentId);
    if (operators.length === 0) return null;
    if (operators.length === 1) return operators[0]!.id;

    switch (strategy) {
      case 'round_robin':
      default:
        return this.pickRoundRobin(departmentId, operators.map((o) => o.id));
    }
  }

  private async pickRoundRobin(departmentId: string, operatorIds: string[]): Promise<string> {
    const lastOperatorId =
      await assignmentRepository.getLastAssignmentOperatorInDepartment(departmentId);
    if (!lastOperatorId) return operatorIds[0]!;

    const currentIndex = operatorIds.indexOf(lastOperatorId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % operatorIds.length : 0;
    return operatorIds[nextIndex]!;
  }
}

export const assignmentStrategyService = new AssignmentStrategyService();

/** Eligible auto-assign staff role — supervisors may be added later per department config. */
export const AUTO_ASSIGN_STAFF_ROLES: DepartmentStaffRole[] = [DepartmentStaffRole.OPERATOR];
