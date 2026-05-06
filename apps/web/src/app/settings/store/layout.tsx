"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";

export default function SettingsStoreLayout({ children }: { children: React.ReactNode }) {
  return <ModuleSection moduleId={ModuleIds.Store}>{children}</ModuleSection>;
}
