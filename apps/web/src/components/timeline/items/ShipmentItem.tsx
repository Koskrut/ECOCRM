"use client";

import { Truck } from "lucide-react";
import { formatDateTime } from "@/lib/crmDatetime";
import type { TimelineItem } from "../types";

type Props = {
  item: TimelineItem;
};

export function ShipmentItem({ item }: Props) {
  const meta = item.meta.kind === "shipment" ? item.meta.data : null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 items-center pt-0.5 text-amber-600">
          <Truck className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
            <span>{item.title}</span>
            {meta?.statusCode ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                {meta.statusCode}
              </span>
            ) : null}
            {meta?.carrier ? (
              <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                {meta.carrier}
              </span>
            ) : null}
          </div>
          {meta?.statusText ? (
            <div className="text-sm text-zinc-700 whitespace-pre-wrap">{meta.statusText}</div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{formatDateTime(item.at)}</span>
            {typeof meta?.cost === "number" ? (
              <>
                <span>·</span>
                <span>Стоимость: {meta.cost}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
