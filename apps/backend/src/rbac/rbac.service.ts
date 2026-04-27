import { Injectable } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_LEGACY_ROLE_PERMISSIONS,
  DEFAULT_RBAC_PERMISSIONS,
  LEGACY_RBAC_ROLE_KEYS,
  type PermissionKey,
} from "./rbac.constants";

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  getDefaultPermissionsForLegacyRole(role: UserRole): Set<string> {
    return new Set(DEFAULT_LEGACY_ROLE_PERMISSIONS[role] ?? []);
  }

  async listPermissionsForUser(user: { id: string; role: UserRole }): Promise<Set<string>> {
    const permissions = this.getDefaultPermissionsForLegacyRole(user.role);
    const assignments = await this.prisma.rbacUserRoleAssignment.findMany({
      where: {
        userId: user.id,
        role: { isActive: true, deletedAt: null },
      },
      select: {
        role: {
          select: {
            permissions: {
              where: { permission: { isActive: true, deletedAt: null } },
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    });

    for (const assignment of assignments) {
      for (const rolePermission of assignment.role.permissions) {
        permissions.add(rolePermission.permission.key);
      }
    }
    return permissions;
  }

  async hasAllPermissions(user: { id: string; role: UserRole }, required: PermissionKey[]): Promise<boolean> {
    if (required.length === 0) return true;
    const permissions = await this.listPermissionsForUser(user);
    return required.every((permission) => permissions.has(permission));
  }

  async listCatalog() {
    const [roles, permissions] = await Promise.all([
      this.prisma.rbacRole.findMany({
        where: { deletedAt: null },
        include: { permissions: { include: { permission: true } } },
        orderBy: { key: "asc" },
      }),
      this.prisma.rbacPermission.findMany({
        where: { deletedAt: null },
        orderBy: [{ category: "asc" }, { key: "asc" }],
      }),
    ]);
    return { roles, permissions };
  }

  async syncDefaultCatalog() {
    const permissionsByKey = new Map<string, { id: string }>();
    for (const permission of DEFAULT_RBAC_PERMISSIONS) {
      const row = await this.prisma.rbacPermission.upsert({
        where: { key: permission.key },
        create: {
          key: permission.key,
          name: permission.name,
          category: permission.category,
          system: true,
        },
        update: {
          name: permission.name,
          category: permission.category,
          system: true,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, key: true },
      });
      permissionsByKey.set(row.key, row);
    }

    for (const [legacyRole, key] of Object.entries(LEGACY_RBAC_ROLE_KEYS) as Array<[UserRole, string]>) {
      const role = await this.prisma.rbacRole.upsert({
        where: { key },
        create: {
          key,
          name: legacyRole,
          description: `Default RBAC bridge role for legacy ${legacyRole}`,
          system: true,
        },
        update: {
          name: legacyRole,
          description: `Default RBAC bridge role for legacy ${legacyRole}`,
          system: true,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });

      for (const permissionKey of DEFAULT_LEGACY_ROLE_PERMISSIONS[legacyRole]) {
        const permission = permissionsByKey.get(permissionKey);
        if (!permission) continue;
        await this.prisma.rbacRolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          create: { roleId: role.id, permissionId: permission.id },
          update: {},
        });
      }
    }

    return this.listCatalog();
  }
}
