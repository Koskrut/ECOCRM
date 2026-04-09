import { Injectable, Logger } from "@nestjs/common";
import type { LeadPipelineStage, LeadStatus, LeadUiStepKey } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { LeadPipelineConfigResponseDto, LeadPipelineStageDto } from "../dto/lead-pipeline.dto";
import {
  ALL_LEAD_STATUSES,
  STEPPER_COLOR_BY_UI_STEP_KEY,
  STEPPER_LABEL_BY_UI_STEP_KEY,
  STEPPER_UI_KEY_ORDER,
  buildDefaultPipelineRows,
  buildFullAllowedTransitions,
} from "./lead-pipeline.defaults";

@Injectable()
export class LeadsPipelineConfigService {
  private readonly logger = new Logger(LeadsPipelineConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Effective transition graph: config if valid, else code defaults. */
  async getEffectiveTransitionGraph(): Promise<Record<LeadStatus, LeadStatus[]>> {
    const rows = await this.prisma.leadPipelineStage.findMany({
      orderBy: { sortOrder: "asc" },
    });
    const parsed = this.tryParseStages(rows);
    if (!parsed) {
      this.logger.warn("Lead pipeline DB config invalid or incomplete; using code defaults for transitions");
      return buildFullAllowedTransitions();
    }
    const graph = {} as Record<LeadStatus, LeadStatus[]>;
    for (const s of parsed) {
      graph[s.status] = s.allowedNext;
    }
    return graph;
  }

  async getPipelineForApi(): Promise<LeadPipelineConfigResponseDto> {
    const rows = await this.prisma.leadPipelineStage.findMany({
      orderBy: { sortOrder: "asc" },
    });
    const parsed = this.tryParseStages(rows);
    if (!parsed) {
      this.logger.warn("Lead pipeline DB config invalid or incomplete; using code defaults for API");
      return this.buildResponseFromRows(buildDefaultPipelineRows());
    }
    return this.buildResponseFromRows(parsed);
  }

  private buildResponseFromRows(rows: LeadPipelineStageDto[]): LeadPipelineConfigResponseDto {
    const stages = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
    const byStep = new Map<LeadUiStepKey, LeadStatus[]>();
    for (const k of STEPPER_UI_KEY_ORDER) {
      byStep.set(k, []);
    }
    for (const r of stages) {
      if (!r.visible) continue;
      const list = byStep.get(r.uiStepKey);
      if (list) list.push(r.status);
    }
    for (const list of byStep.values()) {
      list.sort((a, b) => {
        const oa = stages.find((s) => s.status === a)?.sortOrder ?? 0;
        const ob = stages.find((s) => s.status === b)?.sortOrder ?? 0;
        return oa - ob;
      });
    }
    const uiSteps = STEPPER_UI_KEY_ORDER.map((key) => ({
      key,
      label: STEPPER_LABEL_BY_UI_STEP_KEY[key],
      color: STEPPER_COLOR_BY_UI_STEP_KEY[key],
      memberStatuses: byStep.get(key) ?? [],
    }));
    return { stages, uiSteps };
  }

  private tryParseStages(rows: LeadPipelineStage[]): LeadPipelineStageDto[] | null {
    if (rows.length !== ALL_LEAD_STATUSES.length) return null;
    const seen = new Set<LeadStatus>();
    const out: LeadPipelineStageDto[] = [];
    const allSet = new Set<LeadStatus>(ALL_LEAD_STATUSES);

    for (const row of rows) {
      if (seen.has(row.status)) return null;
      seen.add(row.status);
      const allowed = this.parseAllowedNext(row.allowedNext, allSet);
      if (!allowed) return null;
      out.push({
        status: row.status,
        sortOrder: row.sortOrder,
        label: row.label,
        color: row.color,
        visible: row.visible,
        uiStepKey: row.uiStepKey,
        allowedNext: allowed,
      });
    }

    if (seen.size !== ALL_LEAD_STATUSES.length) return null;
    for (const s of ALL_LEAD_STATUSES) {
      if (!seen.has(s)) return null;
    }
    return out;
  }

  private parseAllowedNext(raw: unknown, allSet: Set<LeadStatus>): LeadStatus[] | null {
    if (!Array.isArray(raw)) return null;
    const out: LeadStatus[] = [];
    for (const x of raw) {
      if (typeof x !== "string" || !allSet.has(x as LeadStatus)) return null;
      out.push(x as LeadStatus);
    }
    return out;
  }
}
