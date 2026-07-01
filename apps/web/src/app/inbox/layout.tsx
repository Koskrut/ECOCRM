"use client";

import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";
import { usePathname } from "next/navigation";

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const moduleId =
    pathname?.startsWith("/inbox/telegram")
      ? ModuleIds.IntegrationsTelegram
      : ModuleIds.IntegrationsMetaMessaging;

  return <ModuleSection moduleId={moduleId}>{children}</ModuleSection>;
}
