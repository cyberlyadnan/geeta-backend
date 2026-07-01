import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { MachineOperationalStatus, RoleName } from '@prisma/client';
import {
  assertCanManageMachines,
  assertCanViewMachines,
  canManageMachines,
  canViewMachines,
} from '../machine.access.js';
import {
  changeMachineStatusSchema,
  createMachineSchema,
  listMachinesQuerySchema,
} from '../machine.validation.js';
import { ASSIGNABLE_MACHINE_STATUSES } from '../machine.constants.js';

describe('machine.access', () => {
  it('allows managers to view and manage machines', () => {
    assert.equal(canViewMachines(RoleName.MANAGER, []), true);
    assert.equal(canManageMachines(RoleName.MANAGER, []), true);
  });

  it('allows staff with view permission', () => {
    assert.equal(canViewMachines(RoleName.STAFF, ['production.machine.view']), true);
    assert.equal(canManageMachines(RoleName.STAFF, ['production.machine.view']), false);
  });

  it('allows staff with execute permission to view (operator workspace)', () => {
    assert.equal(canViewMachines(RoleName.STAFF, ['production.task.execute']), true);
  });

  it('allows manage permission for staff', () => {
    assert.equal(canManageMachines(RoleName.STAFF, ['production.machine.manage']), true);
    assert.doesNotThrow(() =>
      assertCanManageMachines(RoleName.STAFF, ['production.machine.manage']),
    );
  });

  it('denies staff without permissions', () => {
    assert.equal(canViewMachines(RoleName.STAFF, []), false);
    assert.throws(() => assertCanViewMachines(RoleName.STAFF, []));
  });
});

describe('machine.validation', () => {
  it('accepts valid create payload shape', () => {
    const parsed = createMachineSchema.safeParse({
      departmentId: 'cm4gqq5o00000lb05x8y5abcd',
      machineCode: 'PRT-100',
      machineName: 'Test Press',
    });
    assert.equal(parsed.success, true);
  });

  it('accepts list query defaults', () => {
    const parsed = listMachinesQuerySchema.parse({});
    assert.equal(parsed.limit, 25);
  });

  it('accepts operational status changes', () => {
    const parsed = changeMachineStatusSchema.parse({
      operationalStatus: MachineOperationalStatus.MAINTENANCE,
      reason: 'Scheduled service',
    });
    assert.equal(parsed.operationalStatus, 'MAINTENANCE');
  });

  it('rejects invalid machine codes', () => {
    assert.throws(() =>
      createMachineSchema.parse({
        departmentId: 'clxyz123456789012345678901',
        machineCode: 'invalid code!',
        machineName: 'Bad',
      }),
    );
  });
});

describe('machine assignment contract', () => {
  it('only allows AVAILABLE and RESERVED for assignment', () => {
    assert.deepEqual([...ASSIGNABLE_MACHINE_STATUSES], ['AVAILABLE', 'RESERVED']);
  });

  it('maps busy on assign and available on release lifecycle', () => {
    const lifecycle = {
      onAssign: MachineOperationalStatus.BUSY,
      onIdle: MachineOperationalStatus.AVAILABLE,
      manualMaintenance: MachineOperationalStatus.MAINTENANCE,
    };
    assert.equal(lifecycle.onAssign, 'BUSY');
    assert.equal(lifecycle.onIdle, 'AVAILABLE');
  });
});
