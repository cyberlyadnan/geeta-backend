import {
  ProductionOrderStatus,
  RoleName,
  UserStatus,
  VendorAccountStatus,
  WorkflowHistoryAction,
  WorkflowPriority,
  WorkflowTaskAssignmentStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';
import { DEFAULT_TEST_USER_PASSWORD } from './production.constants.js';

interface TestUserDef {
  email: string;
  firstName: string;
  lastName: string;
  role: RoleName;
  phone: string;
  departments?: Array<{ code: string; roleCode: 'OPERATOR' | 'SUPERVISOR'; isPrimary?: boolean }>;
  vendor?: {
    businessName: string;
    vendorCode: string;
    walletBalance: number;
  };
}

const TEST_USERS: TestUserDef[] = [
  {
    email: 'production.manager@geetaprint.com',
    firstName: 'Rajesh',
    lastName: 'Mehta',
    role: RoleName.MANAGER,
    phone: '9900001001',
    departments: [{ code: 'PRODUCTION_PLANNING', roleCode: 'SUPERVISOR', isPrimary: true }],
  },
  {
    email: 'dept.manager@geetaprint.com',
    firstName: 'Priya',
    lastName: 'Shah',
    role: RoleName.MANAGER,
    phone: '9900001002',
    departments: [
      { code: 'DIGITAL_PRINT', roleCode: 'SUPERVISOR', isPrimary: true },
      { code: 'QC', roleCode: 'SUPERVISOR' },
    ],
  },
  { email: 'artwork@geetaprint.com', firstName: 'Amit', lastName: 'Patel', role: RoleName.STAFF, phone: '9900002001', departments: [{ code: 'ARTWORK', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'digital@geetaprint.com', firstName: 'Suresh', lastName: 'Kumar', role: RoleName.STAFF, phone: '9900002002', departments: [{ code: 'DIGITAL_PRINT', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'offset@geetaprint.com', firstName: 'Vikram', lastName: 'Singh', role: RoleName.STAFF, phone: '9900002003', departments: [{ code: 'OFFSET_PRINT', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'uv@geetaprint.com', firstName: 'Neha', lastName: 'Desai', role: RoleName.STAFF, phone: '9900002004', departments: [{ code: 'UV_PRINT', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'foiling@geetaprint.com', firstName: 'Kiran', lastName: 'Joshi', role: RoleName.STAFF, phone: '9900002005', departments: [{ code: 'FOILING', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'lamination@geetaprint.com', firstName: 'Deepa', lastName: 'Rao', role: RoleName.STAFF, phone: '9900002006', departments: [{ code: 'LAMINATION', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'cutting@geetaprint.com', firstName: 'Manoj', lastName: 'Verma', role: RoleName.STAFF, phone: '9900002007', departments: [{ code: 'CUTTING', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'binding@geetaprint.com', firstName: 'Anita', lastName: 'Nair', role: RoleName.STAFF, phone: '9900002008', departments: [{ code: 'BINDING', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'qc@geetaprint.com', firstName: 'Ravi', lastName: 'Iyer', role: RoleName.STAFF, phone: '9900002009', departments: [{ code: 'QC', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'packing@geetaprint.com', firstName: 'Sunita', lastName: 'Gupta', role: RoleName.STAFF, phone: '9900002010', departments: [{ code: 'PACKING', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'dispatch@geetaprint.com', firstName: 'Arun', lastName: 'Pillai', role: RoleName.STAFF, phone: '9900002011', departments: [{ code: 'DISPATCH', roleCode: 'OPERATOR', isPrimary: true }] },
  { email: 'support@geetaprint.com', firstName: 'Meera', lastName: 'Kapoor', role: RoleName.STAFF, phone: '9900002012', departments: [{ code: 'CUSTOMER_SUPPORT', roleCode: 'OPERATOR', isPrimary: true }] },
  {
    email: 'vendor@geetaprint.com',
    firstName: 'Demo',
    lastName: 'Vendor',
    role: RoleName.VENDOR,
    phone: '9900003001',
    vendor: {
      businessName: 'Shree Krishna Printers',
      vendorCode: 'VND-DEMO-001',
      walletBalance: 500_000,
    },
  },
];

export async function seedUsers(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('users');
  const { prisma, registry, actorId } = ctx;

  const passwordHash = await bcrypt.hash(DEFAULT_TEST_USER_PASSWORD, 12);
  let count = 0;

  for (const userDef of TEST_USERS) {
    const role = await prisma.role.findUnique({ where: { name: userDef.role } });
    if (!role) continue;

    const user = await prisma.user.upsert({
      where: { email: userDef.email },
      update: {
        passwordHash,
        firstName: userDef.firstName,
        lastName: userDef.lastName,
        phone: userDef.phone,
        roleId: role.id,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: userDef.email,
        passwordHash,
        firstName: userDef.firstName,
        lastName: userDef.lastName,
        phone: userDef.phone,
        roleId: role.id,
        status: UserStatus.ACTIVE,
      },
    });

    if (userDef.departments) {
      for (const dept of userDef.departments) {
        const departmentId = registry.departments.get(dept.code);
        if (!departmentId) continue;
        await prisma.userDepartmentAssignment.upsert({
          where: { userId_departmentId: { userId: user.id, departmentId } },
          update: { isActive: true, roleCode: dept.roleCode, assignedById: actorId },
          create: {
            userId: user.id,
            departmentId,
            roleCode: dept.roleCode,
            isPrimary: dept.isPrimary ?? false,
            assignedById: actorId,
          },
        });
      }
    }

    if (userDef.vendor) {
      await prisma.vendorProfile.upsert({
        where: { userId: user.id },
        update: {
          businessName: userDef.vendor.businessName,
          ownerName: `${userDef.firstName} ${userDef.lastName}`,
          vendorCode: userDef.vendor.vendorCode,
          accountStatus: VendorAccountStatus.VERIFIED,
          country: 'India',
          state: 'Gujarat',
          city: 'Ahmedabad',
          pinCode: '380001',
          fullAddress: 'Shop 14, CG Road, Ahmedabad',
          verifiedAt: new Date(),
          verifiedById: actorId,
        },
        create: {
          userId: user.id,
          businessName: userDef.vendor.businessName,
          ownerName: `${userDef.firstName} ${userDef.lastName}`,
          vendorCode: userDef.vendor.vendorCode,
          accountStatus: VendorAccountStatus.VERIFIED,
          country: 'India',
          state: 'Gujarat',
          city: 'Ahmedabad',
          pinCode: '380001',
          fullAddress: 'Shop 14, CG Road, Ahmedabad',
          verifiedAt: new Date(),
          verifiedById: actorId,
        },
      });

      await prisma.wallet.upsert({
        where: { userId: user.id },
        update: {
          currentBalance: userDef.vendor.walletBalance,
          totalAdded: userDef.vendor.walletBalance,
          isActive: true,
        },
        create: {
          userId: user.id,
          currentBalance: userDef.vendor.walletBalance,
          totalAdded: userDef.vendor.walletBalance,
          currency: 'INR',
          isActive: true,
        },
      });
    }

    count += 1;
  }

  log.info(`Seeded ${count} test users (password: ${DEFAULT_TEST_USER_PASSWORD})`);
}

/** Lookup seeded user id by email — used by orders seed */
export async function findSeededUserId(prisma: SeedContext['prisma'], email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user?.id ?? null;
}

export async function assignTaskToOperator(
  prisma: SeedContext['prisma'],
  taskId: string,
  operatorEmail: string,
  options?: { priority?: WorkflowPriority; machineCode?: string; actorId?: string },
): Promise<void> {
  const operator = await prisma.user.findUnique({ where: { email: operatorEmail } });
  if (!operator) return;

  const task = await prisma.workflowTask.findUnique({
    where: { id: taskId },
    select: { id: true, departmentId: true, estimatedMinutes: true, remarks: true, priority: true, dueAt: true },
  });
  if (!task) return;

  let machineId: string | null = null;
  if (options?.machineCode) {
    const machine = await prisma.machine.findUnique({ where: { machineCode: options.machineCode } });
    machineId = machine?.id ?? null;
  }

  const now = new Date();
  const priority = options?.priority ?? task.priority;

  await prisma.workflowTaskAssignment.deleteMany({
    where: { workflowTaskId: taskId, status: WorkflowTaskAssignmentStatus.ACTIVE },
  });

  await prisma.workflowTaskAssignment.create({
    data: {
      workflowTaskId: taskId,
      operatorId: operator.id,
      departmentId: task.departmentId,
      machineId,
      assignedById: options?.actorId ?? operator.id,
      priority,
      dueAt: task.dueAt,
      estimatedMinutes: task.estimatedMinutes,
      status: WorkflowTaskAssignmentStatus.ACTIVE,
    },
  });

  await prisma.workflowTask.update({
    where: { id: taskId },
    data: {
      status: WorkflowTaskStatus.ASSIGNED,
      assignedToId: operator.id,
      assignedMachineId: machineId,
      assignedAt: now,
      priority,
    },
  });
}

export async function completeTask(
  prisma: SeedContext['prisma'],
  taskId: string,
  actorId?: string,
): Promise<void> {
  const now = new Date();
  await prisma.workflowTask.update({
    where: { id: taskId },
    data: { status: WorkflowTaskStatus.COMPLETED, completedAt: now },
  });
  await prisma.workflowTaskHistory.create({
    data: { taskId, action: WorkflowHistoryAction.COMPLETED, performedById: actorId },
  });
}

export async function setTaskInProgress(
  prisma: SeedContext['prisma'],
  taskId: string,
  operatorEmail: string,
): Promise<void> {
  const operator = await prisma.user.findUnique({ where: { email: operatorEmail } });
  if (!operator) return;
  await prisma.workflowTask.update({
    where: { id: taskId },
    data: {
      status: WorkflowTaskStatus.IN_PROGRESS,
      assignedToId: operator.id,
      startedAt: new Date(),
    },
  });
}

export type OrderSeedScenario = {
  orderNumber: string;
  orderName: string;
  productSlug: string;
  quantity: number;
  status: ProductionOrderStatus;
  priority?: WorkflowPriority;
  scenario: 'artwork' | 'in_production' | 'qc' | 'packing' | 'dispatch_ready' | 'completed' | 'on_hold' | 'rework' | 'rush_delayed';
};
