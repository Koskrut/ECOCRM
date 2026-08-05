import type { SalesHistoryUpload } from "@prisma/client";

export type SalesFreshness = {
  uploadId: string | null;
  postedAt: Date | null;
  ageDays: number | null;
  maxAgeDays: number;
  isFresh: boolean;
  warning: string | null;
  coverageMonths?: number | null;
  requiredCoverageMonths?: number | null;
};

export function evaluateSalesCoverage(
  distinctMonths: number,
  requiredMonths: number,
): { isAdequate: boolean; warning: string | null } {
  if (requiredMonths <= 0 || distinctMonths >= requiredMonths) {
    return { isAdequate: true, warning: null };
  }
  return {
    isAdequate: false,
    warning: `Sales cover only ${distinctMonths} of ${requiredMonths} months in lookback. Upload fuller XLS history.`,
  };
}

export function evaluateSalesFreshness(
  upload: Pick<SalesHistoryUpload, "id" | "postedAt"> | null | undefined,
  maxAgeDays: number,
  now = new Date(),
  coverage?: { distinctMonths: number; requiredMonths: number },
): SalesFreshness {
  if (!upload?.postedAt) {
    return {
      uploadId: null,
      postedAt: null,
      ageDays: null,
      maxAgeDays,
      isFresh: false,
      warning: "No POSTED sales history. Upload and publish an XLS sales file first.",
      coverageMonths: coverage?.distinctMonths ?? null,
      requiredCoverageMonths: coverage?.requiredMonths ?? null,
    };
  }
  const ageMs = Math.max(0, now.getTime() - upload.postedAt.getTime());
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  let isFresh = ageDays <= maxAgeDays;
  let warning: string | null = isFresh
    ? null
    : `Sales history is ${ageDays.toFixed(1)} days old (max ${maxAgeDays}). Refresh from XLS before MRP.`;

  if (coverage) {
    const cov = evaluateSalesCoverage(coverage.distinctMonths, coverage.requiredMonths);
    if (!cov.isAdequate) {
      isFresh = false;
      warning = cov.warning ?? warning;
    }
  }

  return {
    uploadId: upload.id,
    postedAt: upload.postedAt,
    ageDays: Math.round(ageDays * 10) / 10,
    maxAgeDays,
    isFresh,
    warning,
    coverageMonths: coverage?.distinctMonths ?? null,
    requiredCoverageMonths: coverage?.requiredMonths ?? null,
  };
}
