"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function SettingsPrivat24Layout({ children }: { children: React.ReactNode }) {
  return <ModuleSection moduleId={ModuleIds.Privat24}>{children}</ModuleSection>;
}
