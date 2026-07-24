import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import type { OrderKanbanGroup, OrderStage } from "@prisma/client";
import { buildDefaultPipelineRows } from "../order-pipeline.defaults";
import { OrdersPipelineConfigService } from "../orders-pipeline-config.service";
import type { PutOrderPipelineDto } from "../../dto/put-order-pipeline.dto";

type PrismaSvc = import("../../../prisma/prisma.service").PrismaService;

function toPutDto(
  rows: ReturnType<typeof buildDefaultPipelineRows>,
): PutOrderPipelineDto {
  return {
    stages: rows.map((r) => ({
      stage: r.stage,
      sortOrder: r.sortOrder,
      label: r.label,
      color: r.color,
      kanbanGroup: r.kanbanGroup as OrderKanbanGroup,
      allowedNext: r.allowedNext,
    })),
  };
}

describe("OrdersPipelineConfigService.putPipelineSnapshot", () => {
  it("rejects wrong stage count", async () => {
    const prisma = {
      $transaction: async () => {
        throw new Error("should not run");
      },
    } as unknown as PrismaSvc;
    const svc = new OrdersPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    dto.stages.pop();
    await assert.rejects(() => svc.putPipelineSnapshot(dto), (e: unknown) => {
      assert.ok(e instanceof BadRequestException);
      return true;
    });
  });

  it("rejects duplicate sortOrder", async () => {
    const prisma = { $transaction: async () => {} } as unknown as PrismaSvc;
    const svc = new OrdersPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    dto.stages[0]!.sortOrder = dto.stages[1]!.sortOrder;
    await assert.rejects(() => svc.putPipelineSnapshot(dto), BadRequestException);
  });

  it("rejects duplicate allowedNext target", async () => {
    const prisma = { $transaction: async () => {} } as unknown as PrismaSvc;
    const svc = new OrdersPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    const first = dto.stages.find((s) => s.stage === "NEW")!;
    first.allowedNext = ["CANCELED", "CANCELED"];
    await assert.rejects(() => svc.putPipelineSnapshot(dto), BadRequestException);
  });

  it("rejects invalid allowedNext target", async () => {
    const prisma = { $transaction: async () => {} } as unknown as PrismaSvc;
    const svc = new OrdersPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    const first = dto.stages.find((s) => s.stage === "NEW")!;
    first.allowedNext = ["NOT_A_STAGE" as OrderStage];
    await assert.rejects(() => svc.putPipelineSnapshot(dto), BadRequestException);
  });

  it("rejects duplicate stage key", async () => {
    const prisma = { $transaction: async () => {} } as unknown as PrismaSvc;
    const svc = new OrdersPipelineConfigService(prisma);
    const dto = toPutDto(buildDefaultPipelineRows());
    dto.stages[1] = { ...dto.stages[0]! };
    await assert.rejects(() => svc.putPipelineSnapshot(dto), BadRequestException);
  });

  it("valid snapshot runs stage updates and GET shape reflects label change", async () => {
    let txLen = 0;
    let historyCreates = 0;
    const base = buildDefaultPipelineRows();
    let mem = base.map((r) => ({
      stage: r.stage,
      sortOrder: r.sortOrder,
      label: r.label,
      color: r.color,
      kanbanGroup: r.kanbanGroup as OrderKanbanGroup,
      allowedNext: r.allowedNext as unknown as object,
    }));

    const prisma = {
      $transaction: async (ops: Array<Promise<unknown>>) => {
        txLen = ops.length;
        await Promise.all(ops);
      },
      orderPipelineStage: {
        update: (args: {
          where: { stage: OrderStage };
          data: {
            sortOrder: number;
            label: string;
            color: string | null;
            kanbanGroup: OrderKanbanGroup;
            allowedNext: unknown;
          };
        }) => {
          mem = mem.map((row) =>
            row.stage === args.where.stage
              ? {
                  ...row,
                  sortOrder: args.data.sortOrder,
                  label: args.data.label,
                  color: args.data.color,
                  kanbanGroup: args.data.kanbanGroup,
                  allowedNext: args.data.allowedNext as object,
                }
              : row,
          );
          return Promise.resolve({});
        },
        findMany: async () => [...mem],
      },
      pipelineConfigHistory: {
        create: async () => {
          historyCreates += 1;
          return {};
        },
      },
    } as unknown as PrismaSvc;

    const svc = new OrdersPipelineConfigService(prisma);
    const dto = toPutDto(base);
    const newRow = dto.stages.find((s) => s.stage === "NEW")!;
    newRow.label = "Перейменовано";

    const out = await svc.putPipelineSnapshot(dto);
    // One update per stage + history row.
    assert.equal(txLen, base.length + 1);
    assert.equal(historyCreates, 1);
    assert.equal(out.stages.find((s) => s.stage === "NEW")?.label, "Перейменовано");
  });

  it("no-op snapshot does not create history row", async () => {
    let historyCreates = 0;
    const base = buildDefaultPipelineRows();
    const mem = base.map((r) => ({
      stage: r.stage,
      sortOrder: r.sortOrder,
      label: r.label,
      color: r.color,
      kanbanGroup: r.kanbanGroup as OrderKanbanGroup,
      allowedNext: r.allowedNext as unknown as object,
    }));
    const prisma = {
      $transaction: async (ops: Array<Promise<unknown>>) => {
        await Promise.all(ops);
      },
      orderPipelineStage: {
        update: async () => ({}),
        findMany: async () => [...mem],
      },
      pipelineConfigHistory: {
        create: async () => {
          historyCreates += 1;
          return {};
        },
      },
    } as unknown as PrismaSvc;
    const svc = new OrdersPipelineConfigService(prisma);
    await svc.putPipelineSnapshot(toPutDto(base));
    assert.equal(historyCreates, 0);
  });
});
