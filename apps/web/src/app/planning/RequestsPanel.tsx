"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { strings } from "@/locales";
import { FactoryPanel, PackingPanel } from "./PlanningOpsPanels";

function RequestsPanelInner({
  onError,
  forcedKind,
}: {
  onError: (msg: string) => void;
  forcedKind?: "pack" | "factory";
}) {
  const t = strings.planning;
  const kindParam = (useSearchParams().get("kind") ?? "pack").toLowerCase();
  const activeKind =
    forcedKind ?? (kindParam === "factory" ? "factory" : "pack");
  const showTabs = forcedKind == null;

  return (
    <div className="space-y-4">
      {showTabs ? (
        <div className="flex flex-wrap gap-2">
          <a
            href="/planning?tab=requests&kind=pack"
            className={
              activeKind === "pack"
                ? "rounded-full bg-cyan-600 px-4 py-2 text-sm font-medium text-white"
                : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            }
          >
            {t.requests.packingTab}
          </a>
          <a
            href="/planning?tab=requests&kind=factory"
            className={
              activeKind === "factory"
                ? "rounded-full bg-cyan-600 px-4 py-2 text-sm font-medium text-white"
                : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            }
          >
            {t.requests.factoryTab}
          </a>
        </div>
      ) : null}

      {activeKind === "pack" ? <PackingPanel onError={onError} /> : <FactoryPanel onError={onError} />}
    </div>
  );
}

export function RequestsPanel({
  onError,
  forcedKind,
}: {
  onError: (msg: string) => void;
  forcedKind?: "pack" | "factory";
}) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">{strings.common.loading}</p>}>
      <RequestsPanelInner onError={onError} forcedKind={forcedKind} />
    </Suspense>
  );
}
