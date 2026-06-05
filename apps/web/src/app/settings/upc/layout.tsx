"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function SettingsUpcLayout({ children }: { children: React.ReactNode }) {
  return <ModuleSection moduleId={ModuleIds.Upc}>{children}</ModuleSection>;
}
