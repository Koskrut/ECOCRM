"use client";

import { useState } from "react";
import { EntityTasksList } from "@/components/EntityTasksList";
import { strings } from "@/locales";
import { ContactTimeline } from "../ContactTimeline";

const t = strings.contacts.card;

type ActivitySubTab = "timeline" | "tasks";

type Props = {
  apiBaseUrl: string;
  contactId: string;
  isCreate: boolean;
};

export function ContactActivityTab({ apiBaseUrl, contactId, isCreate }: Props) {
  const [subTab, setSubTab] = useState<ActivitySubTab>("timeline");

  if (isCreate) {
    return <p className="text-sm text-zinc-500">{t.saveContactFirst}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 pb-2 whitespace-nowrap">
        {(["timeline", "tasks"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSubTab(tab)}
            className={`shrink-0 rounded px-2 py-1.5 text-sm font-medium ${
              subTab === tab ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {t.activity[tab]}
          </button>
        ))}
      </div>

      {subTab === "timeline" ? (
        <ContactTimeline apiBaseUrl={apiBaseUrl} contactId={contactId} showActivityButtons />
      ) : (
        <EntityTasksList contactId={contactId} />
      )}
    </div>
  );
}
