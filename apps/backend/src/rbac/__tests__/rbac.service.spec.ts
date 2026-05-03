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

test("RbacService default mapping gives manager metadata read+write (operational custom field values)", () => {
  const svc = new RbacService({} as never);
  const permissions = svc.getDefaultPermissionsForLegacyRole(UserRole.MANAGER);
  assert.equal(permissions.has(PermissionKeys.MetadataRead), true);
  assert.equal(permissions.has(PermissionKeys.MetadataWrite), true);
  assert.equal(permissions.has(PermissionKeys.LayoutsManage), false);
});
