import test from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { PermissionKeys } from "../rbac.constants";
import { RbacService } from "../rbac.service";

test("RbacService default mapping gives ADMIN all platform permissions", () => {
  const svc = new RbacService({} as never);
  const permissions = svc.getDefaultPermissionsForLegacyRole(UserRole.ADMIN);
  assert.equal(permissions.has(PermissionKeys.SystemManage), true);
  assert.equal(permissions.has(PermissionKeys.LayoutsManage), true);
  assert.equal(permissions.has(PermissionKeys.CustomFieldsManage), true);
});

test("RbacService default mapping keeps manager metadata read-only", () => {
  const svc = new RbacService({} as never);
  const permissions = svc.getDefaultPermissionsForLegacyRole(UserRole.MANAGER);
  assert.equal(permissions.has(PermissionKeys.MetadataRead), true);
  assert.equal(permissions.has(PermissionKeys.MetadataWrite), false);
  assert.equal(permissions.has(PermissionKeys.LayoutsManage), false);
});
