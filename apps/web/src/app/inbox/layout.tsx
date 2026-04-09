"use client";

import { ModuleGate } from "@/components/ModuleGate";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate moduleId={ModuleIds.IntegrationsTelegram}>{children}</ModuleGate>;
}
