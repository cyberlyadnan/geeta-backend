import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoleName, WorkflowTaskStatus } from '@prisma/client';
import {
  assertDepartmentAccess,
  canViewAllDepartments,
  getAllowedDepartmentCodes,
} from '../queue.access.js';
import { buildQueueOrderBy, buildQueueTaskWhere } from '../queue.filters.js';
import { ApiError } from '../../../../common/errors/ApiError.js';

describe('queue.access', () => {
  it('allows admin roles to view all departments', () => {
    assert.equal(canViewAllDepartments(RoleName.ADMIN, []), true);
    assert.equal(canViewAllDepartments(RoleName.MANAGER, []), true);
  });

  it('allows wildcard production queue permission', () => {
    assert.equal(canViewAllDepartments(RoleName.STAFF, ['production.queue:*']), true);
  });

  it('extracts allowed department codes from permissions', () => {
    const codes = getAllowedDepartmentCodes([
      'production.queue.dept:ARTWORK',
      'production.queue.dept:print',
    ]);
    assert.deepEqual(codes, ['ARTWORK', 'PRINT']);
  });

  it('blocks staff from unauthorized department', () => {
    assert.throws(
      () =>
        assertDepartmentAccess('QC', RoleName.STAFF, ['production.queue.dept:ARTWORK']),
      (error: unknown) => error instanceof ApiError,
    );
  });

  it('allows staff with matching department permission', () => {
    assert.doesNotThrow(() =>
      assertDepartmentAccess('ARTWORK', RoleName.STAFF, ['production.queue.dept:ARTWORK']),
    );
  });
});

describe('queue.filters', () => {
  const departmentId = 'dept_123';

  it('scopes queries to department', () => {
    const where = buildQueueTaskWhere(departmentId, {
      limit: 50,
      sortBy: 'stepOrder',
      sortDir: 'asc',
    });

    assert.equal((where.AND as unknown[]).length >= 1, true);
    assert.deepEqual((where.AND as Array<{ departmentId?: string }>)[0], { departmentId });
  });

  it('applies blocked lens filter', () => {
    const where = buildQueueTaskWhere(departmentId, {
      limit: 50,
      sortBy: 'stepOrder',
      sortDir: 'asc',
      lens: 'blocked',
    });

    const hasBlocked = (where.AND as Array<{ status?: WorkflowTaskStatus }>).some(
      (clause) => clause.status === WorkflowTaskStatus.BLOCKED,
    );
    assert.equal(hasBlocked, true);
  });

  it('builds priority sort order', () => {
    const orderBy = buildQueueOrderBy({
      limit: 50,
      sortBy: 'priority',
      sortDir: 'desc',
    });

    assert.equal(orderBy[0]?.priority, 'desc');
  });

  it('includes search OR clause', () => {
    const where = buildQueueTaskWhere(departmentId, {
      limit: 50,
      sortBy: 'stepOrder',
      sortDir: 'asc',
      search: 'ORD-1001',
    });

    const hasOr = (where.AND as Array<{ OR?: unknown[] }>).some((clause) => Array.isArray(clause.OR));
    assert.equal(hasOr, true);
  });
});
