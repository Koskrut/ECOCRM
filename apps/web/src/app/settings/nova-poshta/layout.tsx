"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function SettingsNovaPoshtaLayout({ children }: { children: React.ReactNode }) {
  return <ModuleSection moduleId={ModuleIds.NovaPoshta}>{children}</ModuleSection>;
}
