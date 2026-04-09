import test from "node:test";
import assert from "node:assert/strict";
import { Reflector } from "@nestjs/core";
import { NotFoundException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { ModuleStateService } from "../module-state.service";
import { ModuleAccessGuard } from "../gating/module-access.guard";
import { RequireModule } from "../gating/require-module.decorator";
import { ModuleIds } from "../module-ids";

class ModulesStub {
  constructor(private readonly effective: boolean) {}
  async isEffective() {
    return this.effective;
  }
}

test("ModuleAccessGuard: no-op when MODULE_GATING_ENABLED=false", async () => {
  process.env.MODULE_GATING_ENABLED = "false";
  const guard = new ModuleAccessGuard(
    new Reflector(),
    new ModulesStub(false) as unknown as ModuleStateService,
  );
  const ctx: Pick<ExecutionContext, "getHandler" | "getClass"> = {
    getHandler: () => (() => undefined) as unknown as (...args: unknown[]) => unknown,
    getClass: () => class X {} as unknown as new (...args: unknown[]) => unknown,
  };
  assert.equal(await guard.canActivate(ctx as unknown as ExecutionContext), true);
});

test("ModuleAccessGuard: throws 404 when module is ineffective", async () => {
  process.env.MODULE_GATING_ENABLED = "true";

  class C {
    @RequireModule(ModuleIds.Finance)
    handler() {}
  }
  const instance = new C();
  const handler = instance.handler;

  const guard = new ModuleAccessGuard(
    new Reflector(),
    new ModulesStub(false) as unknown as ModuleStateService,
  );
  const ctx: Pick<ExecutionContext, "getHandler" | "getClass"> = {
    getHandler: () => handler,
    getClass: () => C,
  };

  await assert.rejects(
    () => guard.canActivate(ctx as unknown as ExecutionContext),
    (err) => err instanceof NotFoundException,
  );
});
