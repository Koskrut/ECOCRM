"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { UnifiedInboxPage } from "@/components/inbox/UnifiedInboxPage";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function InboxPage() {
  return (
    <ModuleSection
      anyOf={[ModuleIds.IntegrationsTelegram, ModuleIds.IntegrationsMetaMessaging]}
    >
      <UnifiedInboxPage />
    </ModuleSection>
  );
}
