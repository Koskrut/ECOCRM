import { Injectable, Logger } from "@nestjs/common";
import type { OrderKanbanGroup, OrderStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildDefaultPipelineRows,
  DEFAULT_ALLOWED_TRANSITIONS,
  DEFAULT_FINAL_STAGE_ORDER,
  DEFAULT_MAIN_STAGE_ORDER,
} from "./order-pipeline.defaults";
import type { OrderPipelineResponseDto, OrderPipelineStageResponseDto } from "../dto/order-pipeline.dto";

const ALL_STAGES: OrderStage[] = [...DEFAULT_MAIN_STAGE_ORDER, ...DEFAULT_FINAL_STAGE_ORDER];

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
}
