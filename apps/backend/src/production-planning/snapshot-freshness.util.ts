import { BadRequestException } from "@nestjs/common";
import type { InventorySnapshot } from "@prisma/client";

export type SnapshotFreshness = {
  snapshotId: string | null;
  postedAt: Date | null;
  ageDays: number | null;
  maxAgeDays: number;
  isFresh: boolean;
  warning: string | null;
};

export function evaluateSnapshotFreshness(
  snapshot: Pick<InventorySnapshot, "id" | "postedAt"> | null | undefined,
  maxAgeDays: number,
  now = new Date(),
): SnapshotFreshness {
  if (!snapshot?.postedAt) {
    return {
      snapshotId: null,
      postedAt: null,
      ageDays: null,
      maxAgeDays,
      isFresh: false,
      warning: "No POSTED inventory snapshot. Upload and publish a 1C stock file first.",
    };
  }
  const ageMs = Math.max(0, now.getTime() - snapshot.postedAt.getTime());
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const isFresh = ageDays <= maxAgeDays;
  return {
    snapshotId: snapshot.id,
    postedAt: snapshot.postedAt,
    ageDays: Math.round(ageDays * 10) / 10,
    maxAgeDays,
    isFresh,
    warning: isFresh
      ? null
      : `Inventory snapshot is ${ageDays.toFixed(1)} days old (max ${maxAgeDays}). Refresh from 1C before packing/factory planning.`,
  };
}

export function assertFreshSnapshot(freshness: SnapshotFreshness): void {
  if (!freshness.isFresh) {
    throw new BadRequestException(freshness.warning ?? "Inventory snapshot is not fresh");
  }
}
