import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { LeadPipelineStage, LeadStatus, LeadUiStepKey } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthUser } from "../../auth/auth.types";
import type { LeadPipelineConfigResponseDto, LeadPipelineStageDto } from "../dto/lead-pipeline.dto";
import type { PutLeadPipelineDto, PutLeadPipelineStageDto } from "../dto/put-lead-pipeline.dto";
import {
  ALL_LEAD_STATUSES,
  STEPPER_COLOR_BY_UI_STEP_KEY,
  STEPPER_LABEL_BY_UI_STEP_KEY,
  STEPPER_UI_KEY_ORDER,
  buildDefaultPipelineRows,
  buildFullAllowedTransitions,
  deriveUiStepKey,
} from "./lead-pipeline.defaults";

const PIPELINE_HISTORY_ENTITY_TYPE = "LEAD_PIPELINE";

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

  /**
   * Full snapshot replace (ADMIN only — enforced on controller). Validates strictly; all-or-nothing transaction.
   * Persists uiStepKey = deriveUiStepKey(status) so DB always matches canonical mapping.
   */
  async putPipelineSnapshot(dto: PutLeadPipelineDto, actor?: AuthUser): Promise<LeadPipelineConfigResponseDto> {
    this.assertPutPayloadValid(dto.stages);
    const before = normalizeLeadSnapshot(await this.getPipelineForApi());
    const after = normalizeLeadSnapshot({ stages: dto.stages });
    const changed = !snapshotsEqual(before, after);

    await this.prisma.$transaction(
      [
        ...dto.stages.map((row) =>
          this.prisma.leadPipelineStage.update({
            where: { status: row.status },
            data: {
              sortOrder: row.sortOrder,
              label: row.label.trim(),
              color:
                row.color != null && String(row.color).trim() !== ""
                  ? String(row.color).trim().slice(0, 500)
                  : null,
              visible: row.visible,
              allowedNext: row.allowedNext as unknown as Prisma.InputJsonValue,
              uiStepKey: deriveUiStepKey(row.status),
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
                  summary: buildLeadSummary(before, after),
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
        uiStepKey: deriveUiStepKey(row.status),
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
    const seen = new Set<LeadStatus>();
    for (const x of raw) {
      if (typeof x !== "string" || !allSet.has(x as LeadStatus)) return null;
      const s = x as LeadStatus;
      if (seen.has(s)) return null;
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  private assertPutPayloadValid(rows: PutLeadPipelineStageDto[]): void {
    const n = ALL_LEAD_STATUSES.length;
    if (rows.length !== n) {
      throw new BadRequestException(`Expected exactly ${n} stages`);
    }
    const statusKeys = new Set<LeadStatus>();
    const expected = new Set<LeadStatus>(ALL_LEAD_STATUSES);
    const sortOrders: number[] = [];

    for (const r of rows) {
      if (statusKeys.has(r.status)) {
        throw new BadRequestException(`Duplicate status: ${r.status}`);
      }
      statusKeys.add(r.status);
      if (!expected.has(r.status)) {
        throw new BadRequestException(`Unknown status: ${r.status}`);
      }
      sortOrders.push(r.sortOrder);

      const label = r.label?.trim() ?? "";
      if (!label) {
        throw new BadRequestException(`Empty label for status ${r.status}`);
      }

      const seenNext = new Set<LeadStatus>();
      for (const t of r.allowedNext) {
        if (!expected.has(t)) {
          throw new BadRequestException(`Invalid allowedNext target ${t} from ${r.status}`);
        }
        if (seenNext.has(t)) {
          throw new BadRequestException(`Duplicate allowedNext ${t} from ${r.status}`);
        }
        seenNext.add(t);
      }
    }

    for (const s of ALL_LEAD_STATUSES) {
      if (!statusKeys.has(s)) {
        throw new BadRequestException(`Missing status: ${s}`);
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
  }
}

type NormalizedLeadStage = {
  status: LeadStatus;
  sortOrder: number;
  label: string;
  color: string | null;
  visible: boolean;
  uiStepKey: LeadUiStepKey;
  allowedNext: LeadStatus[];
};

type NormalizedLeadSnapshot = { stages: NormalizedLeadStage[] };

function normalizeLeadSnapshot(input: {
  stages: Array<{
    status: LeadStatus;
    sortOrder: number;
    label: string;
    color?: string | null;
    visible: boolean;
    uiStepKey?: LeadUiStepKey;
    allowedNext: LeadStatus[];
  }>;
}): NormalizedLeadSnapshot {
  return {
    stages: [...input.stages]
      .map((s) => ({
        status: s.status,
        sortOrder: s.sortOrder,
        label: (s.label ?? "").trim(),
        color: s.color != null && String(s.color).trim() !== "" ? String(s.color).trim().slice(0, 500) : null,
        visible: Boolean(s.visible),
        // Always canonical; client-provided uiStepKey is ignored for normalization and comparison.
        uiStepKey: deriveUiStepKey(s.status),
        allowedNext: [...s.allowedNext].sort(),
      }))
      .sort((a, b) => a.status.localeCompare(b.status)),
  };
}

function snapshotsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildLeadSummary(before: NormalizedLeadSnapshot, after: NormalizedLeadSnapshot): string {
  const beforeMap = new Map(before.stages.map((s) => [s.status, s]));
  const changed: Array<{ status: LeadStatus; fields: string[] }> = [];
  for (const row of after.stages) {
    const prev = beforeMap.get(row.status);
    if (!prev) continue;
    const fields: string[] = [];
    if (prev.label !== row.label) fields.push("label");
    if (prev.sortOrder !== row.sortOrder) fields.push("sortOrder");
    if ((prev.color ?? null) !== (row.color ?? null)) fields.push("color");
    if (prev.visible !== row.visible) fields.push("visible");
    if (JSON.stringify(prev.allowedNext) !== JSON.stringify(row.allowedNext)) fields.push("allowedNext");
    if (fields.length) changed.push({ status: row.status, fields });
  }
  if (changed.length === 0) return "No changes";
  const preview = changed
    .slice(0, 3)
    .map((c) => `${c.status}(${c.fields.join(",")})`)
    .join("; ");
  return changed.length > 3 ? `Updated ${changed.length} statuses: ${preview}; ...` : `Updated ${changed.length} statuses: ${preview}`;
}
