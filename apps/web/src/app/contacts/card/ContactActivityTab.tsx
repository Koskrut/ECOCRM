"use client";

import { EntityCallRecordingsPanel } from "@/components/calls/EntityCallRecordingsPanel";
import { EntityTasksList } from "@/components/EntityTasksList";
import { EntitySection } from "@/components/sections/EntitySection";
import { strings } from "@/locales";
import { ContactTimeline } from "../ContactTimeline";

const t = strings.contacts.card;

type Props = {
  apiBaseUrl: string;
  contactId: string;
  isCreate: boolean;
};

export function ContactActivityTab({ apiBaseUrl, contactId, isCreate }: Props) {
  if (isCreate) {
    return <p className="text-sm text-zinc-500">{t.saveContactFirst}</p>;
  }

  return (
    <div className="space-y-3">
      <EntityCallRecordingsPanel contactId={contactId} />
      <EntitySection title={t.activity.timeline}>
        <ContactTimeline apiBaseUrl={apiBaseUrl} contactId={contactId} showActivityButtons />
      </EntitySection>
      <EntitySection title={t.activity.tasks}>
        <EntityTasksList contactId={contactId} />
      </EntitySection>
    </div>
  );
}
