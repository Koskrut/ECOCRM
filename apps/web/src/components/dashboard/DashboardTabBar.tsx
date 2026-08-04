"use client";

import { strings } from "@/locales";

export type DashboardLeadershipTab = "today" | "team" | "sales" | "activity";

type Props = {
  tab: DashboardLeadershipTab;
  onTabChange: (tab: DashboardLeadershipTab) => void;
};

const TABS: DashboardLeadershipTab[] = ["today", "team", "sales", "activity"];

export function DashboardTabBar({ tab, onTabChange }: Props) {
  const t = strings.dashboard.leadership.tabs;

  return (
    <div className="sticky top-0 z-10 -mx-1 border-b border-zinc-200 bg-zinc-50/95 px-1 pb-3 pt-1 backdrop-blur-sm">
      <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition sm:flex-none sm:px-4 ${
              tab === key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {t[key]}
          </button>
        ))}
      </div>
    </div>
  );
}
