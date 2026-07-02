import bcrypt from 'bcryptjs';
import { ActivityAction, Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import type {
  AssignDepartmentsInput,
  CreateSystemUserInput,
  ListSystemUsersQuery,
  ResetPasswordInput,
  UpdateSystemUserInput,
} from './system-admin.validation.js';

const USER_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true, displayName: true } },
  departmentAssignments: {
    where: { isActive: true },
    select: {
      id: true,
      roleCode: true,
      isPrimary: true,
      department: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.UserSelect;

export class SystemUsersService {
  async list(query: ListSystemUsersQuery) {
    const limit = query.limit;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: { name: query.role } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId
        ? { departmentAssignments: { some: { departmentId: query.departmentId, isActive: true } } }
        : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { email: { contains: query.search.trim(), mode: 'insensitive' } },
              { firstName: { contains: query.search.trim(), mode: 'insensitive' } },
              { lastName: { contains: query.search.trim(), mode: 'insensitive' } },
              { phone: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await prisma.user.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: USER_LIST_SELECT,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      meta: { nextCursor: hasMore ? items[items.length - 1]?.id : undefined, hasMore, limit },
    };
  }

  async getById(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        ...USER_LIST_SELECT,
        emailVerifiedAt: true,
        vendorProfile: { select: { id: true, businessName: true, vendorCode: true } },
        departmentAssignments: {
          select: {
            id: true,
            roleCode: true,
            isPrimary: true,
            isActive: true,
            department: { select: { id: true, code: true, name: true, facilityId: true } },
          },
        },
      },
    });
    if (!user) throw ApiError.notFound('User not found');

    const [activity, loginSessions] = await Promise.all([
      prisma.activityLog.findMany({
        where: { actorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          metadata: true,
        },
      }),
      prisma.refreshToken.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, createdAt: true, expiresAt: true, revokedAt: true },
      }),
    ]);

    return { user, activity, loginSessions };
  }

  async create(input: CreateSystemUserInput, actorId: string) {
    const role = await prisma.role.findUnique({ where: { name: input.roleName } });
    if (!role) throw ApiError.badRequest('Invalid role');

    const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) throw ApiError.conflict('Email already registered');

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        roleId: role.id,
        status: input.status,
        emailVerifiedAt: input.status === UserStatus.ACTIVE ? new Date() : null,
        departmentAssignments: input.departmentAssignments?.length
          ? {
              create: input.departmentAssignments.map((a) => ({
                departmentId: a.departmentId,
                roleCode: a.roleCode,
                isPrimary: a.isPrimary ?? false,
                assignedById: actorId,
              })),
            }
          : undefined,
      },
      select: USER_LIST_SELECT,
    });

    await prisma.activityLog.create({
      data: {
        actorId,
        action: ActivityAction.USER_CREATED,
        entityType: 'USER',
        entityId: user.id,
        metadata: { email: user.email, role: input.roleName },
      },
    });

    return user;
  }

  async update(userId: string, input: UpdateSystemUserInput, actorId: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw ApiError.notFound('User not found');

    let roleId: string | undefined;
    if (input.roleName) {
      const role = await prisma.role.findUnique({ where: { name: input.roleName } });
      if (!role) throw ApiError.badRequest('Invalid role');
      roleId = role.id;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(roleId ? { roleId } : {}),
      },
      select: USER_LIST_SELECT,
    });

    await prisma.activityLog.create({
      data: {
        actorId,
        action: ActivityAction.ADMIN_NOTE_ADDED,
        entityType: 'USER',
        entityId: userId,
        metadata: input as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  async deactivate(userId: string, actorId: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw ApiError.notFound('User not found');

    await prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.SUSPENDED },
    });

    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await prisma.activityLog.create({
      data: {
        actorId,
        action: ActivityAction.ADMIN_NOTE_ADDED,
        entityType: 'USER',
        entityId: userId,
        metadata: { status: UserStatus.SUSPENDED },
      },
    });

    return { success: true };
  }

  async resetPassword(userId: string, input: ResetPasswordInput, actorId: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw ApiError.notFound('User not found');

    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    await prisma.activityLog.create({
      data: {
        actorId,
        action: ActivityAction.ADMIN_NOTE_ADDED,
        entityType: 'USER',
        entityId: userId,
        metadata: { passwordReset: true },
      },
    });

    return { success: true };
  }

  async assignDepartments(userId: string, input: AssignDepartmentsInput, actorId: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw ApiError.notFound('User not found');

    for (const assignment of input.assignments) {
      await prisma.userDepartmentAssignment.upsert({
        where: { userId_departmentId: { userId, departmentId: assignment.departmentId } },
        update: {
          roleCode: assignment.roleCode,
          isPrimary: assignment.isPrimary ?? false,
          isActive: assignment.isActive ?? true,
          assignedById: actorId,
        },
        create: {
          userId,
          departmentId: assignment.departmentId,
          roleCode: assignment.roleCode,
          isPrimary: assignment.isPrimary ?? false,
          isActive: assignment.isActive ?? true,
          assignedById: actorId,
        },
      });
    }

    return this.getById(userId);
  }
}

export const systemUsersService = new SystemUsersService();
