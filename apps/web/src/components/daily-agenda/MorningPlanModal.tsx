"use client";

import { useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import type { DailyAgendaPayload } from "@/lib/api/resources/daily-agenda";
import { dailyAgendaApi } from "@/lib/api/resources/daily-agenda";
import { DailyAgendaEditor } from "./DailyAgendaEditor";
import { strings } from "@/locales";

const t = strings.dailyAgenda;

type MorningPlanModalProps = {
  open: boolean;
  agenda: DailyAgendaPayload;
  onClose: () => void;
  onUpdated: (agenda: DailyAgendaPayload) => void;
};

export function MorningPlanModal({ open, agenda, onClose, onUpdated }: MorningPlanModalProps) {
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const initialItems =
    agenda.plan?.items.filter((i) => i.status !== "DISMISSED").map(({ id: _id, completedAt: _c, completedBy: _b, ...rest }) => rest) ??
    agenda.defaultProposal ??
    [];

  async function saveDraft(items: Parameters<typeof dailyAgendaApi.saveDraft>[0]["items"]) {
    setSaving(true);
    try {
      const data = await dailyAgendaApi.saveDraft({ date: agenda.date, items });
      onUpdated(data);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function commit(items: Parameters<typeof dailyAgendaApi.commit>[0]["items"]) {
    setSaving(true);
    try {
      const data = await dailyAgendaApi.commit({ date: agenda.date, items });
      onUpdated(data);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <EntityModalShell
      size="default"
      title={t.morningTitle}
      subtitle={t.morningSubtitle}
      onClose={onClose}
      canClose={!saving}
      left={
        <DailyAgendaEditor
          date={agenda.date}
          profile={agenda.profile}
          initialItems={initialItems}
          availableSuggestions={agenda.availableSuggestions}
          committedItems={agenda.plan?.items}
          saving={saving}
          onSaveDraft={saveDraft}
          onCommit={commit}
          onLater={saveDraft}
        />
      }
      footer={null}
    />
  );
}
