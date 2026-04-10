import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import type { LeadStatus } from "@prisma/client";
import { buildDefaultPipelineRows, deriveUiStepKey } from "../lead-pipeline.defaults";
import { LeadsPipelineConfigService } from "../leads-pipeline-config.service";
import type { PutLeadPipelineDto } from "../../dto/put-lead-pipeline.dto";

type PrismaSvc = import("../../../prisma/prisma.service").PrismaService;

function toPutDto(rows: ReturnType<typeof buildDefaultPipelineRows>): PutLeadPipelineDto {
  return {
    stages: rows.map((r) => ({
      status: r.status,
      sortOrder: r.sortOrder,
      label: r.label,
      color: r.color,
      visible: r.visible,
      allowedNext: r.allowedNext,
    })),
  };
}

describe("LeadsPipelineConfigService.putPipelineSnapshot", () => {
  it("rejects wrong stage count", async () => {
    const prisma = {
      $transaction: async () => {
        throw new Error("should not run");
      },
    } as unknown as PrismaSvc;
    const svc = new LeadsPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    dto.stages.pop();
    await assert.rejects(() => svc.putPipelineSnapshot(dto), (e: unknown) => {
      assert.ok(e instanceof BadRequestException);
      return true;
    });
  });

  it("rejects duplicate sortOrder", async () => {
    const prisma = { $transaction: async () => {} } as unknown as PrismaSvc;
    const svc = new LeadsPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    dto.stages[0]!.sortOrder = dto.stages[1]!.sortOrder;
    await assert.rejects(() => svc.putPipelineSnapshot(dto), BadRequestException);
  });

  it("rejects duplicate allowedNext target", async () => {
    const prisma = { $transaction: async () => {} } as unknown as PrismaSvc;
    const svc = new LeadsPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    const first = dto.stages.find((s) => s.status === "NEW")!;
    first.allowedNext = ["IN_PROGRESS", "IN_PROGRESS"];
    await assert.rejects(() => svc.putPipelineSnapshot(dto), BadRequestException);
  });

  it("rejects invalid allowedNext target", async () => {
    const prisma = { $transaction: async () => {} } as unknown as PrismaSvc;
    const svc = new LeadsPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    const first = dto.stages.find((s) => s.status === "NEW")!;
    first.allowedNext = ["NOT_A_STATUS" as LeadStatus];
    await assert.rejects(() => svc.putPipelineSnapshot(dto), BadRequestException);
  });

  it("rejects duplicate status key", async () => {
    const prisma = { $transaction: async () => {} } as unknown as PrismaSvc;
    const svc = new LeadsPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    dto.stages[1] = { ...dto.stages[0]! };
    await assert.rejects(() => svc.putPipelineSnapshot(dto), BadRequestException);
  });

  it("rejects missing status", async () => {
    const prisma = { $transaction: async () => {} } as unknown as PrismaSvc;
    const svc = new LeadsPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    dto.stages = dto.stages.filter((s) => s.status !== "SPAM");
    await assert.rejects(() => svc.putPipelineSnapshot(dto), BadRequestException);
  });

  it("valid snapshot runs 6 updates; GET reflects label; uiStepKey written from deriveUiStepKey, not client", async () => {
    let txLen = 0;
    const base = buildDefaultPipelineRows();
    let lastWonUiStep: string | null = null;
    const mem = base.map((r) => ({
      status: r.status,
      sortOrder: r.sortOrder,
      label: r.label,
      color: r.color,
      visible: r.visible,
      uiStepKey: "NEW" as const,
      allowedNext: r.allowedNext as unknown as object,
    }));

    const prisma = {
      $transaction: async (ops: Array<Promise<unknown>>) => {
        txLen = ops.length;
        await Promise.all(ops);
      },
      leadPipelineStage: {
        update: (args: {
          where: { status: LeadStatus };
          data: {
            sortOrder: number;
            label: string;
            color: string | null;
            visible: boolean;
            allowedNext: unknown;
            uiStepKey: string;
          };
        }) => {
          if (args.where.status === "WON") {
            lastWonUiStep = args.data.uiStepKey;
          }
          const idx = mem.findIndex((m) => m.status === args.where.status);
          if (idx >= 0) {
            mem[idx] = {
              ...mem[idx]!,
              sortOrder: args.data.sortOrder,
              label: args.data.label,
              color: args.data.color,
              visible: args.data.visible,
              allowedNext: args.data.allowedNext as object,
              uiStepKey: args.data.uiStepKey as "NEW",
            };
          }
          return Promise.resolve({});
        },
        findMany: async () => [...mem],
      },
    } as unknown as PrismaSvc;

    const svc = new LeadsPipelineConfigService(prisma);
    const dto = toPutDto(base);
    const newRow = dto.stages.find((s) => s.status === "NEW")!;
    newRow.label = "Renamed NEW";

    const out = await svc.putPipelineSnapshot(dto);
    assert.equal(txLen, 6);
    assert.equal(out.stages.find((s) => s.status === "NEW")?.label, "Renamed NEW");
    assert.equal(lastWonUiStep, deriveUiStepKey("WON"));
    assert.equal(out.stages.find((s) => s.status === "WON")?.uiStepKey, "PROCESSED");
  });
});
