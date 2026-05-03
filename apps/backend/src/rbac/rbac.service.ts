import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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

  async createCustomRole(input: { key: string; name: string; description?: string | null; permissionKeys: string[] }) {
    const key = input.key.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key || key.startsWith("legacy.")) {
      throw new BadRequestException("Invalid role key");
    }
    const name = input.name.trim();
    if (!name) throw new BadRequestException("name is required");

    const existing = await this.prisma.rbacRole.findFirst({ where: { key, deletedAt: null } });
    if (existing) throw new ConflictException("Role key already exists");

    const permissions = await this.prisma.rbacPermission.findMany({
      where: { key: { in: input.permissionKeys }, deletedAt: null, isActive: true },
    });
    if (permissions.length !== input.permissionKeys.length) {
      throw new BadRequestException("One or more permission keys are invalid");
    }

    const role = await this.prisma.rbacRole.create({
      data: {
        key,
        name,
        description: input.description?.trim() || null,
        system: false,
        isActive: true,
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
    return { role };
  }

  async updateCustomRole(
    id: string,
    input: { name?: string; description?: string | null; isActive?: boolean; permissionKeys?: string[] },
  ) {
    const role = await this.prisma.rbacRole.findFirst({ where: { id, deletedAt: null } });
    if (!role) throw new NotFoundException("Role not found");
    if (role.system && Object.keys(input).some((k) => k === "permissionKeys")) {
      throw new BadRequestException("Cannot replace permissions on system roles via this endpoint");
    }

    const data: { name?: string; description?: string | null; isActive?: boolean } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException("name cannot be empty");
      data.name = name;
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    if (input.permissionKeys !== undefined && !role.system) {
      const permissions = await this.prisma.rbacPermission.findMany({
        where: { key: { in: input.permissionKeys }, deletedAt: null, isActive: true },
      });
      if (permissions.length !== input.permissionKeys.length) {
        throw new BadRequestException("One or more permission keys are invalid");
      }
      await this.prisma.rbacRolePermission.deleteMany({ where: { roleId: role.id } });
      await this.prisma.rbacRolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }

    const updated = await this.prisma.rbacRole.update({
      where: { id: role.id },
      data,
      include: { permissions: { include: { permission: true } } },
    });
    return { role: updated };
  }

  async softDeleteCustomRole(id: string) {
    const role = await this.prisma.rbacRole.findFirst({ where: { id, deletedAt: null } });
    if (!role) throw new NotFoundException("Role not found");
    if (role.system) throw new BadRequestException("Cannot delete system role");
    await this.prisma.rbacUserRoleAssignment.deleteMany({ where: { roleId: id } });
    await this.prisma.rbacRole.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { ok: true };
  }

  async assignRoleToUser(userId: string, roleId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("User not found");
    const role = await this.prisma.rbacRole.findFirst({
      where: { id: roleId, deletedAt: null, isActive: true },
    });
    if (!role) throw new NotFoundException("Role not found");
    await this.prisma.rbacUserRoleAssignment.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
    return { ok: true };
  }

  async removeRoleFromUser(userId: string, roleId: string) {
    await this.prisma.rbacUserRoleAssignment.deleteMany({ where: { userId, roleId } });
    return { ok: true };
  }

  async listAssignmentsForUser(userId: string) {
    const items = await this.prisma.rbacUserRoleAssignment.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    return { items };
  }

  async effectiveForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) throw new NotFoundException("User not found");
    const permissions = await this.listPermissionsForUser(user);
    return { userId, legacyRole: user.role, permissions: Array.from(permissions).sort() };
  }
}
