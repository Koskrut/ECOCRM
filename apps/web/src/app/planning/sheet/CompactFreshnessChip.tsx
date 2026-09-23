"use client";

import { strings } from "@/locales";
import { formatDateTime } from "@/lib/crmDatetime";
import type { SalesFreshness, SnapshotFreshness } from "@/lib/api/resources/planning";

type Props = {
  snapshot: SnapshotFreshness | null;
  sales: SalesFreshness | null;
  mrpStale?: boolean;
  mrpStaleWarning?: string | null;
};

export function CompactFreshnessChip({
  snapshot,
  sales,
  mrpStale,
  mrpStaleWarning,
}: Props) {
  const t = strings.planning;
  const sh = t.sheet;
  if (!snapshot && !sales && !mrpStale) return null;

  const stockOk = snapshot?.isFresh !== false;
  const demandOk = sales?.isFresh !== false;
  const ok = stockOk && demandOk && !mrpStale;

  const parts: string[] = [];
  if (snapshot) {
    const msg = stockOk
      ? t.messages.freshnessOk
      : snapshot.warning ?? t.messages.freshnessWarn;
    const age =
      snapshot.postedAt != null
        ? ` (${formatDateTime(snapshot.postedAt)}${
            snapshot.ageDays != null ? `, ${t.labels.ageDays(snapshot.ageDays)}` : ""
          })`
        : "";
    parts.push(`${sh.freshnessStockShort}: ${msg}${age}`);
  }
  if (sales) {
    const msg = demandOk
      ? t.messages.salesFreshnessOk
      : sales.warning ?? t.messages.salesFreshnessWarn;
    const age =
      sales.postedAt != null
        ? ` (${formatDateTime(sales.postedAt)}${
            sales.ageDays != null ? `, ${t.labels.ageDays(sales.ageDays)}` : ""
          })`
        : "";
    parts.push(`${sh.freshnessDemandShort}: ${msg}${age}`);
  }
  if (mrpStale) {
    parts.push(`${sh.freshnessMrpShort}: ${mrpStaleWarning ?? t.messages.mrpStaleWarn}`);
  }

  const shortBits = [
    snapshot ? sh.freshnessStockShort : null,
    sales ? sh.freshnessDemandShort : null,
    mrpStale ? sh.freshnessMrpShort : null,
  ].filter(Boolean);

  return (
    <span
      title={parts.join(" · ")}
      className={
        ok
          ? "inline-flex max-w-[16rem] items-center truncate rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
          : "inline-flex max-w-[16rem] items-center truncate rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900"
      }
    >
      {ok ? sh.freshnessCompactOk : `${sh.freshnessCompactWarn}: ${shortBits.join(" · ")}`}
    </span>
  );
}
