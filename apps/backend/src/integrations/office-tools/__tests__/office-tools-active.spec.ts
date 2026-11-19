import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictException } from "@nestjs/common";
import {
  assertOfficeToolsInactiveForLegacyWrite,
  OFFICE_TOOLS_LEGACY_BLOCKED_MESSAGE,
} from "../office-tools-active";
import type { OfficeToolsConfigService } from "../office-tools-config.service";

describe("office-tools legacy gate", () => {
  test("allows write when OT inactive", async () => {
    const config = {
      isActive: async () => false,
    } as unknown as OfficeToolsConfigService;
    await assertOfficeToolsInactiveForLegacyWrite(config);
  });

  test("blocks write when OT active", async () => {
    const config = {
      isActive: async () => true,
    } as unknown as OfficeToolsConfigService;
    await assert.rejects(
      () => assertOfficeToolsInactiveForLegacyWrite(config),
      (err: unknown) =>
        err instanceof ConflictException &&
        String((err as ConflictException).message).includes("Office Tools"),
    );
    assert.ok(OFFICE_TOOLS_LEGACY_BLOCKED_MESSAGE.includes("Office Tools"));
  });
});
