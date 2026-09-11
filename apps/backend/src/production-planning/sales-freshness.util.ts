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
  /** Primary demand source used for freshness judgment. */
  demandSource?: "crm_orders" | "sales_history" | "mixed" | "none";
  gapSkuMonths?: number | null;
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
    warning: `Demand covers only ${distinctMonths} of ${requiredMonths} months in lookback. Upload 1C sales for the missing months.`,
  };
}

/**
 * CRM-first freshness: adequate CRM month coverage makes demand fresh even without XLS.
 * XLS upload age matters only when CRM coverage is inadequate and we rely on gap-fill.
 */
export function evaluateSalesFreshness(
  upload: Pick<SalesHistoryUpload, "id" | "postedAt"> | null | undefined,
  maxAgeDays: number,
  now = new Date(),
  coverage?: {
    distinctMonths: number;
    requiredMonths: number;
    demandSource?: SalesFreshness["demandSource"];
    gapSkuMonths?: number | null;
  },
): SalesFreshness {
  const demandSource = coverage?.demandSource ?? (upload?.postedAt ? "sales_history" : "none");
  const coverageMonths = coverage?.distinctMonths ?? null;
  const requiredCoverageMonths = coverage?.requiredMonths ?? null;
  const gapSkuMonths = coverage?.gapSkuMonths ?? null;

  if (coverage) {
    const cov = evaluateSalesCoverage(coverage.distinctMonths, coverage.requiredMonths);
    if (cov.isAdequate) {
      return {
        uploadId: upload?.id ?? null,
        postedAt: upload?.postedAt ?? null,
        ageDays: upload?.postedAt
          ? Math.round(
              (Math.max(0, now.getTime() - upload.postedAt.getTime()) / (24 * 60 * 60 * 1000)) *
                10,
            ) / 10
          : null,
        maxAgeDays,
        isFresh: true,
        warning: null,
        coverageMonths,
        requiredCoverageMonths,
        demandSource,
        gapSkuMonths,
      };
    }

    // CRM holes — XLS is optional gap-fill, not a mandatory ritual when absent.
    if (!upload?.postedAt) {
      return {
        uploadId: null,
        postedAt: null,
        ageDays: null,
        maxAgeDays,
        isFresh: false,
        warning:
          cov.warning ??
          "CRM order history does not cover the lookback. Upload 1C monthly sales for the gaps.",
        coverageMonths,
        requiredCoverageMonths,
        demandSource: demandSource === "none" ? "none" : demandSource,
        gapSkuMonths,
      };
    }
  }

  if (!upload?.postedAt) {
    return {
      uploadId: null,
      postedAt: null,
      ageDays: null,
      maxAgeDays,
      isFresh: coverage ? false : true,
      warning: coverage
        ? "CRM coverage is incomplete and no POSTED 1C sales file is available for gap-fill."
        : null,
      coverageMonths,
      requiredCoverageMonths,
      demandSource,
      gapSkuMonths,
    };
  }

  const ageMs = Math.max(0, now.getTime() - upload.postedAt.getTime());
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  let isFresh = ageDays <= maxAgeDays;
  let warning: string | null = isFresh
    ? null
    : `1C sales gap-fill is ${ageDays.toFixed(1)} days old (max ${maxAgeDays}). Refresh XLS for uncovered months.`;

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
    coverageMonths,
    requiredCoverageMonths,
    demandSource,
    gapSkuMonths,
  };
}
