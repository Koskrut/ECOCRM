import type { SalesHistoryUpload } from "@prisma/client";

export type SalesFreshness = {
  uploadId: string | null;
  postedAt: Date | null;
  ageDays: number | null;
  maxAgeDays: number;
  isFresh: boolean;
  warning: string | null;
};

export function evaluateSalesFreshness(
  upload: Pick<SalesHistoryUpload, "id" | "postedAt"> | null | undefined,
  maxAgeDays: number,
  now = new Date(),
): SalesFreshness {
  if (!upload?.postedAt) {
    return {
      uploadId: null,
      postedAt: null,
      ageDays: null,
      maxAgeDays,
      isFresh: false,
      warning: "No POSTED sales history. Upload and publish an XLS sales file first.",
    };
  }
  const ageMs = Math.max(0, now.getTime() - upload.postedAt.getTime());
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const isFresh = ageDays <= maxAgeDays;
  return {
    uploadId: upload.id,
    postedAt: upload.postedAt,
    ageDays: Math.round(ageDays * 10) / 10,
    maxAgeDays,
    isFresh,
    warning: isFresh
      ? null
      : `Sales history is ${ageDays.toFixed(1)} days old (max ${maxAgeDays}). Refresh from XLS before MRP.`,
  };
}
