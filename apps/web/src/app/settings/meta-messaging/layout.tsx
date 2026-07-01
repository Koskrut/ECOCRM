"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function SettingsMetaMessagingLayout({ children }: { children: React.ReactNode }) {
  return <ModuleSection moduleId={ModuleIds.IntegrationsMetaMessaging}>{children}</ModuleSection>;
}
