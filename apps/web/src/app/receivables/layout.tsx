"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function ReceivablesLayout({ children }: { children: React.ReactNode }) {
  return <ModuleSection moduleId={ModuleIds.Finance}>{children}</ModuleSection>;
}
