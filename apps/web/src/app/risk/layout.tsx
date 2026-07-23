"use client";

import { ModuleGate } from "@/components/ModuleGate";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function RiskLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate moduleId={ModuleIds.RiskManagement}>{children}</ModuleGate>;
}
