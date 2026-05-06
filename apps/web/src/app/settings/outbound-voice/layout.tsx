"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function SettingsOutboundVoiceLayout({ children }: { children: React.ReactNode }) {
  return <ModuleSection moduleId={ModuleIds.ManualCalling}>{children}</ModuleSection>;
}
