"use client";

import { strings } from "@/locales";
import { HelpHint } from "@/components/help/HelpHint";
import { KitBoardPanel } from "./KitBoardPanel";

export default function PlanningPage() {
  const t = strings.planning;
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{t.pageTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">{t.pageSubtitle}</p>
        </div>
        <HelpHint routeKey="planning" />
      </div>
      <KitBoardPanel />
    </div>
  );
}
