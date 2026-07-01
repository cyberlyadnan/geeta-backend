import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoleName } from '@prisma/client';
import { canAssignTasks, canViewOperatorTasks } from '../assignment.access.js';

describe('assignment.access', () => {
  it('allows managers to assign tasks', () => {
    assert.equal(canAssignTasks(RoleName.MANAGER, []), true);
    assert.equal(canAssignTasks(RoleName.ADMIN, []), true);
  });

  it('allows production.task.assign permission', () => {
    assert.equal(canAssignTasks(RoleName.STAFF, ['production.task.assign']), true);
  });

  it('denies staff without assign permission', () => {
    assert.equal(canAssignTasks(RoleName.STAFF, ['production.task.view.own']), false);
  });

  it('allows operators to view own tasks', () => {
    assert.equal(canViewOperatorTasks('u1', 'u1', RoleName.STAFF, []), true);
  });

  it('denies viewing other operator tasks for staff', () => {
    assert.equal(canViewOperatorTasks('u2', 'u1', RoleName.STAFF, []), false);
  });
});
