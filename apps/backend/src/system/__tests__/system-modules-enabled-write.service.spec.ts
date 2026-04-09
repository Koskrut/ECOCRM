import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { ModuleIds } from "../../modules/module-ids";
import { MODULES_ENABLED_V1_KEY } from "../../modules/enabled/modules-enabled.constants";
import { SystemModulesEnabledWriteService } from "../system-modules-enabled-write.service";

describe("SystemModulesEnabledWriteService", () => {
  it("upserts sorted pilot-only enabled list", async () => {
    const calls: unknown[] = [];
    const prisma = {
      systemSetting: {
        upsert: async (args: unknown) => {
          calls.push(args);
        },
      },
    } as unknown as import("../../prisma/prisma.service").PrismaService;

    const svc = new SystemModulesEnabledWriteService(prisma);
    await svc.setPilotExtensionsEnabled([
      ModuleIds.IntegrationsTelegram,
      ModuleIds.VoiceOutbound,
    ]);

    assert.equal(calls.length, 1);
    const arg = calls[0] as {
      where: { id: string };
      create: { id: string; value: { enabled: string[] } };
      update: { value: { enabled: string[] } };
    };
    assert.equal(arg.where.id, MODULES_ENABLED_V1_KEY);
    assert.deepEqual(arg.create.value.enabled, arg.update.value.enabled);
    assert.deepEqual(arg.create.value.enabled, [ModuleIds.IntegrationsTelegram, ModuleIds.VoiceOutbound].sort());
  });

  it("throws BadRequest on invalid id", async () => {
    const prisma = {
      systemSetting: { upsert: async () => {} },
    } as unknown as import("../../prisma/prisma.service").PrismaService;

    const svc = new SystemModulesEnabledWriteService(prisma);
    await assert.rejects(() => svc.setPilotExtensionsEnabled(["bad"]), BadRequestException);
  });
});
