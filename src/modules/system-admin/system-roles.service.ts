import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import type { UpdateRolePermissionsInput } from './system-admin.validation.js';

export class SystemRolesService {
  async list() {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        permissions: true,
        isSystem: true,
        _count: { select: { users: true } },
      },
    });

    return {
      items: roles.map((r) => ({
        ...r,
        userCount: r._count.users,
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
      })),
    };
  }

  async getPermissionMatrix() {
    const roles = await this.list();
    const allPermissions = new Set<string>();
    for (const role of roles.items) {
      for (const p of role.permissions as string[]) allPermissions.add(p);
    }

    const productionPrefixes = [
      'production.queue',
      'production.task',
      'production.qc',
      'production.machine',
      'production.order',
      'production.control',
      'workflow',
    ];

    const grouped = [...allPermissions].sort().reduce<Record<string, string[]>>((acc, perm) => {
      const prefix = productionPrefixes.find((p) => perm.startsWith(p)) ?? 'other';
      const key = prefix.split('.')[0] ?? 'other';
      acc[key] = acc[key] ?? [];
      acc[key].push(perm);
      return acc;
    }, {});

    return { roles: roles.items, permissions: grouped };
  }

  async update(roleId: string, input: UpdateRolePermissionsInput) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw ApiError.notFound('Role not found');

    const updated = await prisma.role.update({
      where: { id: roleId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.permissions !== undefined
          ? { permissions: input.permissions as Prisma.InputJsonValue }
          : {}),
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        permissions: true,
        isSystem: true,
      },
    });

    return {
      ...updated,
      permissions: Array.isArray(updated.permissions) ? updated.permissions : [],
    };
  }
}

export const systemRolesService = new SystemRolesService();
