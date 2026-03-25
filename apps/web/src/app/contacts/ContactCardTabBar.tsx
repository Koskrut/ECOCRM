"use client";

import type { ContactModalStrings } from "./contact-modal-strings";

export type ContactLeftTabId = "main" | "orders" | "delivery-profiles" | "tasks" | "change-history";

const TABS: ContactLeftTabId[] = ["main", "orders", "delivery-profiles", "tasks", "change-history"];

type Props = {
  leftTab: ContactLeftTabId;
  onTabChange: (tab: ContactLeftTabId) => void;
  labels: ContactModalStrings;
};

export function ContactCardTabBar({ leftTab, onTabChange, labels }: Props) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto py-2">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onTabChange(tab)}
          className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
            leftTab === tab ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {tab === "main"
            ? labels.tabMain
            : tab === "orders"
              ? labels.tabOrders
              : tab === "delivery-profiles"
                ? labels.tabDelivery
                : tab === "tasks"
                  ? labels.tabTasks
                  : labels.tabHistory}
        </button>
      ))}
    </div>
  );
}
