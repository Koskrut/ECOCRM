/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest DI tokens must be value imports */
import { Injectable } from "@nestjs/common";
import type { ActivityType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  TimelineEntityType,
  TimelineItem,
  TimelineKind,
  TimelineMeta,
} from "../timeline.types";
import type { TimelineAdapter, TimelineFetchArgs } from "./timeline-adapter";

type ActivityRow = Prisma.ActivityGetPayload<{
  include: { call: true };
}>;

const ACTIVITY_TYPE_TO_KIND: Record<ActivityType, TimelineKind> = {
  CALL: "call",
  COMMENT: "comment",
  MEETING: "meeting",
  MANUAL_CALL: "manual_call",
};

const TITLE_FALLBACKS: Record<ActivityType, string> = {
  CALL: "Звонок",
  COMMENT: "Комментарий",
  MEETING: "Встреча",
  MANUAL_CALL: "Ручной звонок",
};

const ENTITY_TO_FIELD: Record<TimelineEntityType, "orderId" | "contactId" | "leadId" | "companyId"> = {
  order: "orderId",
  contact: "contactId",
  lead: "leadId",
  company: "companyId",
};

@Injectable()
export class ActivityTimelineAdapter implements TimelineAdapter {
  constructor(private readonly prisma: PrismaService) {}

  supports(): boolean {
    return true;
  }

  async fetch(args: TimelineFetchArgs): Promise<TimelineItem[]> {
    const { entityType, entityId, cursorAt, limit } = args;
    const field = ENTITY_TO_FIELD[entityType];
    const where: Prisma.ActivityWhereInput = { [field]: entityId };
    if (cursorAt) {
      where.OR = [
        { occurredAt: { lt: cursorAt } },
        { occurredAt: null, createdAt: { lt: cursorAt } },
      ];
    }
    const rows = (await this.prisma.activity.findMany({
      where,
      take: limit,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      include: { call: true },
    })) as unknown as ActivityRow[];

    if (rows.length === 0) return [];
    const items = rows.map((row) => this.mapRow(row, entityType, entityId));
    return this.attachActorNames(items, rows);
  }

  private mapRow(row: ActivityRow, entityType: TimelineEntityType, entityId: string): TimelineItem {
    const occurredAt = row.occurredAt ?? row.createdAt;
    const kind = ACTIVITY_TYPE_TO_KIND[row.type] ?? "system_note";
    const title = row.title?.trim() || TITLE_FALLBACKS[row.type] || row.type;
    const meta: TimelineMeta = row.call
      ? {
          kind: "call",
          data: {
            direction: row.call.direction ?? undefined,
            status: row.call.status ?? undefined,
            durationSec: typeof row.call.durationSec === "number" ? row.call.durationSec : undefined,
            talkSec: extractCallNumber(row.call.meta, "talkSec"),
            waitingSec: extractCallNumber(row.call.meta, "waitingSec"),
            recordingStatus: row.call.recordingStatus ?? undefined,
            recordingUrl: row.call.recordingUrl ?? undefined,
            startedAt: row.call.startedAt?.toISOString(),
            from: row.call.from ?? undefined,
            to: row.call.to ?? undefined,
          },
        }
      : { kind: "raw", data: {} };

    return {
      id: `activity:${row.id}`,
      source: "activity",
      kind,
      entity: { type: entityType, id: entityId },
      title,
      body: row.body ?? "",
      at: occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
      actor: { id: row.createdBy ?? null, name: row.createdBy ?? "system" },
      canEdit: true,
      canDelete: true,
      canPin: kind === "comment" || kind === "meeting" || kind === "manual_call",
      meta,
    };
  }

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------

  private async attachActorNames(items: TimelineItem[], rows: ActivityRow[]): Promise<TimelineItem[]> {
    const ids = [...new Set(rows.map((r) => r.createdBy).filter((v): v is string => Boolean(v)))];
    if (ids.length === 0) return items;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.fullName] as const));
    return items.map((item) => ({
      ...item,
      actor: {
        id: item.actor.id,
        name: item.actor.id ? (nameById.get(item.actor.id) ?? item.actor.name) : item.actor.name,
      },
    }));
  }
}

function extractCallNumber(meta: unknown, key: "talkSec" | "waitingSec"): number | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
