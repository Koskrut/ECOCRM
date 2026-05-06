import { Transform, Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { TIMELINE_MAX_LIMIT, TIMELINE_PAGE_SIZE } from "@crm/contracts/timeline";
import type { TimelineKind, TimelineSource } from "../timeline.types";

const SOURCE_VALUES: readonly TimelineSource[] = [
  "activity",
  "order_status",
  "ttn",
  "visit",
  "call",
  "system",
];

const KIND_VALUES: readonly TimelineKind[] = [
  "comment",
  "call",
  "meeting",
  "manual_call",
  "status_change",
  "shipment",
  "visit",
  "system_note",
];

const splitCsv = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return value.flatMap((v) => (typeof v === "string" ? v.split(",") : [])).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : undefined;
  }
  return undefined;
};

export class TimelineQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limit must be an integer" })
  @Min(1, { message: "limit must be ≥ 1" })
  @Max(TIMELINE_MAX_LIMIT, { message: `limit must be ≤ ${TIMELINE_MAX_LIMIT}` })
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray()
  @IsEnum(SOURCE_VALUES, { each: true, message: "invalid source" })
  source?: TimelineSource[];

  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray()
  @IsEnum(KIND_VALUES, { each: true, message: "invalid kind" })
  kind?: TimelineKind[];

  resolveLimit(): number {
    const raw = this.limit;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return TIMELINE_PAGE_SIZE;
    return Math.min(Math.max(Math.floor(raw), 1), TIMELINE_MAX_LIMIT);
  }
}
