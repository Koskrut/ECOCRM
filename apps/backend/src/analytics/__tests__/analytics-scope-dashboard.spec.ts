import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { AnalyticsScopeService } from "../analytics-scope.service";

function admin(): AuthUser {
  return { id: "admin-1", email: "a@test.local", fullName: "Admin", role: UserRole.ADMIN };
}

function manager(): AuthUser {
  return { id: "mgr-1", email: "m@test.local", fullName: "Manager", role: UserRole.MANAGER };
}

test("resolveDashboardScope: MANAGER is self-scoped", async () => {
  const prisma = { user: { findMany: async () => [] } };
  const service = new AnalyticsScopeService(prisma as never);
  const scope = await service.resolveDashboardScope(manager());
  assert.equal(scope.orderScope.managerId, "mgr-1");
  assert.deepEqual(scope.allowedAssigneeIds, ["mgr-1"]);
});

test("resolveDashboardScope: ADMIN without filter is company-wide", async () => {
  const prisma = { user: { findMany: async () => [] } };
  const service = new AnalyticsScopeService(prisma as never);
  const scope = await service.resolveDashboardScope(admin());
  assert.equal(scope.orderScope.managerId, undefined);
  assert.equal(scope.orderScope.allowedOwnerIds, undefined);
});
