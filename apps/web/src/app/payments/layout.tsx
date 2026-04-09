"use client";

import { ModuleGate } from "@/components/ModuleGate";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate moduleId={ModuleIds.Finance}>{children}</ModuleGate>;
}
