"use client";

import { useSearchParams } from "next/navigation";
import { strings } from "@/locales";
import { FactoryPanel, PackingPanel } from "./PlanningOpsPanels";

export function RequestsPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const kind = (useSearchParams().get("kind") ?? "pack").toLowerCase();
  const activeKind = kind === "factory" ? "factory" : "pack";

  return (
    <div className="space-y-4">
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

      {activeKind === "pack" ? <PackingPanel onError={onError} /> : <FactoryPanel onError={onError} />}
    </div>
  );
}
