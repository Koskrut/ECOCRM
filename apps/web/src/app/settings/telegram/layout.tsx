"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function SettingsTelegramLayout({ children }: { children: React.ReactNode }) {
  return <ModuleSection moduleId={ModuleIds.IntegrationsTelegram}>{children}</ModuleSection>;
}
