import React from "react";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { t } from "@/lib/i18n";

export type WorkSegment = "orders" | "calls" | "catalog";

type Props = {
  value: WorkSegment;
  onChange: (v: WorkSegment) => void;
  showCalls?: boolean;
  badges?: Partial<Record<WorkSegment, number>>;
};

export function WorkSegmentControl({ value, onChange, showCalls = true, badges }: Props) {
  const callsCount = badges?.calls ?? 0;

  const options = (
    [
      { value: "orders" as const, label: t("work.orders") },
      showCalls
        ? {
            value: "calls" as const,
            label: callsCount > 0 ? `${t("work.calls")} (${callsCount})` : t("work.calls"),
          }
        : null,
      { value: "catalog" as const, label: t("work.catalog") },
    ] as const
  ).filter(Boolean) as { value: WorkSegment; label: string }[];

  return <SegmentedControl options={options} value={value} onChange={onChange} />;
}
