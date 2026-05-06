"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function SettingsRingostatLayout({ children }: { children: React.ReactNode }) {
  return <ModuleSection moduleId={ModuleIds.Ringostat}>{children}</ModuleSection>;
}
