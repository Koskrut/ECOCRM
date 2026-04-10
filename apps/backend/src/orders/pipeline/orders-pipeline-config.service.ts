import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { OrderKanbanGroup, OrderStage } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthUser } from "../../auth/auth.types";
import type { PutOrderPipelineDto, PutOrderPipelineStageDto } from "../dto/put-order-pipeline.dto";
import {
  ALL_ORDER_STAGES,
  buildDefaultPipelineRows,
  DEFAULT_ALLOWED_TRANSITIONS,
} from "./order-pipeline.defaults";
import type { OrderPipelineResponseDto, OrderPipelineStageResponseDto } from "../dto/order-pipeline.dto";

const ALL_STAGES: OrderStage[] = ALL_ORDER_STAGES;
const PIPELINE_HISTORY_ENTITY_TYPE = "ORDER_PIPELINE";

const VALID_STAGE_SET = new Set<string>(ALL_STAGES);

function parseAllowedNext(raw: unknown): OrderStage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: OrderStage[] = [];
  for (const x of raw) {
    if (typeof x !== "string" || !VALID_STAGE_SET.has(x)) return null;
    out.push(x as OrderStage);
  }
  return out;
}

@Injectable()
export class OrdersPipelineConfigService {
  private readonly logger = new Logger(OrdersPipelineConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full transition graph for validation. Falls back to DEFAULT_ALLOWED_TRANSITIONS if DB is incomplete/invalid.
   */
  async getEffectiveTransitionGraph(): Promise<Record<OrderStage, OrderStage[]>> {
    const parsed = await this.loadAndValidateGraph();
    if (!parsed) {
      this.logger.warn("Order pipeline DB config invalid or incomplete; using code defaults for transitions");
      return { ...DEFAULT_ALLOWED_TRANSITIONS };
    }
    return parsed;
  }

  /**
   * Pipeline for UI (kanban). Falls back to default rows if DB invalid.
   */
  async getPipelineForApi(): Promise<OrderPipelineResponseDto> {
    const rows = await this.prisma.orderPipelineStage.findMany({
      orderBy: { sortOrder: "asc" },
    });

    if (!this.rowsAreComplete(rows)) {
      this.logger.warn("Order pipeline DB config invalid or incomplete; returning default pipeline DTO");
      return {
        stages: buildDefaultPipelineRows().map((r) => ({
          stage: r.stage,
          sortOrder: r.sortOrder,
          label: r.label,
          color: r.color,
          kanbanGroup: r.kanbanGroup as OrderKanbanGroup,
          allowedNext: r.allowedNext,
        })),
      };
    }

    const stages: OrderPipelineStageResponseDto[] = [];
    for (const row of rows.sort((a, b) => a.sortOrder - b.sortOrder)) {
      const next = parseAllowedNext(row.allowedNext);
      if (!next) {
        this.logger.warn(`Invalid allowedNext for stage ${row.stage}; falling back to full default pipeline DTO`);
        return {
          stages: buildDefaultPipelineRows().map((r) => ({
            stage: r.stage,
            sortOrder: r.sortOrder,
            label: r.label,
            color: r.color,
            kanbanGroup: r.kanbanGroup as OrderKanbanGroup,
            allowedNext: r.allowedNext,
          })),
        };
      }
      stages.push({
        stage: row.stage,
        sortOrder: row.sortOrder,
        label: row.label,
        color: row.color,
        kanbanGroup: row.kanbanGroup,
        allowedNext: next,
      });
    }
    return { stages };
  }

  private async loadAndValidateGraph(): Promise<Record<OrderStage, OrderStage[]> | null> {
    const rows = await this.prisma.orderPipelineStage.findMany();
    if (!this.rowsAreComplete(rows)) return null;

    const graph = {} as Record<OrderStage, OrderStage[]>;
    for (const row of rows) {
      const next = parseAllowedNext(row.allowedNext);
      if (!next) return null;
      graph[row.stage] = next;
    }
    for (const s of ALL_STAGES) {
      if (!Array.isArray(graph[s])) return null;
    }
    return graph;
  }

  private rowsAreComplete(rows: { stage: OrderStage }[]): boolean {
    if (rows.length !== ALL_STAGES.length) return false;
    const seen = new Set(rows.map((r) => r.stage));
    return ALL_STAGES.every((s) => seen.has(s));
  }

  /**
   * Full snapshot replace (ADMIN only — enforced on controller). Validates strictly; all-or-nothing transaction.
   */
  async putPipelineSnapshot(dto: PutOrderPipelineDto, actor?: AuthUser): Promise<OrderPipelineResponseDto> {
    this.assertPutPayloadValid(dto.stages);
    const before = normalizeOrderSnapshot(await this.getPipelineForApi());
    const after = normalizeOrderSnapshot({ stages: dto.stages });
    const changed = !snapshotsEqual(before, after);

    await this.prisma.$transaction(
      [
        ...dto.stages.map((row) =>
          this.prisma.orderPipelineStage.update({
            where: { stage: row.stage },
            data: {
              sortOrder: row.sortOrder,
              label: row.label.trim(),
              color:
                row.color != null && String(row.color).trim() !== "" ? String(row.color).trim().slice(0, 500) : null,
              kanbanGroup: row.kanbanGroup,
              allowedNext: row.allowedNext as unknown as Prisma.InputJsonValue,
            },
          }),
        ),
        ...(changed
          ? [
              this.prisma.pipelineConfigHistory.create({
                data: {
                  entityType: PIPELINE_HISTORY_ENTITY_TYPE,
                  actorUserId: actor?.id ?? null,
                  actorEmail: actor?.email ?? null,
                  actorRole: actor?.role ?? null,
                  summary: buildOrderSummary(before, after),
                  beforeSnapshot: before as unknown as Prisma.InputJsonValue,
                  afterSnapshot: after as unknown as Prisma.InputJsonValue,
                },
              }),
            ]
          : []),
      ],
    );
    return this.getPipelineForApi();
  }

  async getHistory(params?: { page?: number; pageSize?: number }) {
    const page = Math.max(1, Math.trunc(Number(params?.page ?? 1) || 1));
    const pageSizeRaw = Math.trunc(Number(params?.pageSize ?? 20) || 20);
    const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.pipelineConfigHistory.findMany({
        where: { entityType: PIPELINE_HISTORY_ENTITY_TYPE },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.pipelineConfigHistory.count({
        where: { entityType: PIPELINE_HISTORY_ENTITY_TYPE },
      }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
    };
  }
  private assertPutPayloadValid(rows: PutOrderPipelineStageDto[]): void {
    const n = ALL_STAGES.length;
    if (rows.length !== n) {
      throw new BadRequestException(`Expected exactly ${n} stages`);
    }
    const stageKeys = new Set<OrderStage>();
    const expected = new Set<OrderStage>(ALL_STAGES);
    const sortOrders: number[] = [];
    let mainCount = 0;
    let finalCount = 0;

    for (const r of rows) {
      if (stageKeys.has(r.stage)) {
        throw new BadRequestException(`Duplicate stage: ${r.stage}`);
      }
      stageKeys.add(r.stage);
      if (!expected.has(r.stage)) {
        throw new BadRequestException(`Unknown stage: ${r.stage}`);
      }
      sortOrders.push(r.sortOrder);
      if (r.kanbanGroup === "MAIN") mainCount += 1;
      else finalCount += 1;

      const label = r.label?.trim() ?? "";
      if (!label) {
        throw new BadRequestException(`Empty label for stage ${r.stage}`);
      }

      const seenNext = new Set<OrderStage>();
      for (const t of r.allowedNext) {
        if (!expected.has(t)) {
          throw new BadRequestException(`Invalid allowedNext target ${t} from ${r.stage}`);
        }
        if (seenNext.has(t)) {
          throw new BadRequestException(`Duplicate allowedNext ${t} from ${r.stage}`);
        }
        seenNext.add(t);
      }
    }

    for (const s of ALL_STAGES) {
      if (!stageKeys.has(s)) {
        throw new BadRequestException(`Missing stage: ${s}`);
      }
    }

    const uniqueOrd = new Set(sortOrders);
    if (uniqueOrd.size !== n) {
      throw new BadRequestException("sortOrder values must be unique");
    }
    const sortedOrd = [...sortOrders].sort((a, b) => a - b);
    for (let i = 0; i < n; i++) {
      if (sortedOrd[i] !== i) {
        throw new BadRequestException(`sortOrder must be dense integers 0..${n - 1}`);
      }
    }

    if (mainCount < 1 || finalCount < 1) {
      throw new BadRequestException("At least one MAIN and one FINAL stage required");
    }
  }
}

type NormalizedOrderStage = {
  stage: OrderStage;
  sortOrder: number;
  label: string;
  color: string | null;
  kanbanGroup: OrderKanbanGroup;
  allowedNext: OrderStage[];
};

type NormalizedOrderSnapshot = { stages: NormalizedOrderStage[] };

function normalizeOrderSnapshot(input: {
  stages: Array<{
    stage: OrderStage;
    sortOrder: number;
    label: string;
    color?: string | null;
    kanbanGroup: OrderKanbanGroup;
    allowedNext: OrderStage[];
  }>;
}): NormalizedOrderSnapshot {
  return {
    stages: [...input.stages]
      .map((s) => ({
        stage: s.stage,
        sortOrder: s.sortOrder,
        label: (s.label ?? "").trim(),
        color: s.color != null && String(s.color).trim() !== "" ? String(s.color).trim().slice(0, 500) : null,
        kanbanGroup: s.kanbanGroup,
        allowedNext: [...s.allowedNext].sort(),
      }))
      .sort((a, b) => a.stage.localeCompare(b.stage)),
  };
}

function snapshotsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildOrderSummary(before: NormalizedOrderSnapshot, after: NormalizedOrderSnapshot): string {
  const beforeMap = new Map(before.stages.map((s) => [s.stage, s]));
  const changed: Array<{ stage: OrderStage; fields: string[] }> = [];
  for (const row of after.stages) {
    const prev = beforeMap.get(row.stage);
    if (!prev) continue;
    const fields: string[] = [];
    if (prev.label !== row.label) fields.push("label");
    if (prev.sortOrder !== row.sortOrder) fields.push("sortOrder");
    if ((prev.color ?? null) !== (row.color ?? null)) fields.push("color");
    if (prev.kanbanGroup !== row.kanbanGroup) fields.push("kanbanGroup");
    if (JSON.stringify(prev.allowedNext) !== JSON.stringify(row.allowedNext)) fields.push("allowedNext");
    if (fields.length) changed.push({ stage: row.stage, fields });
  }
  if (changed.length === 0) return "No changes";
  const preview = changed
    .slice(0, 3)
    .map((c) => `${c.stage}(${c.fields.join(",")})`)
    .join("; ");
  return changed.length > 3 ? `Updated ${changed.length} stages: ${preview}; ...` : `Updated ${changed.length} stages: ${preview}`;
}
