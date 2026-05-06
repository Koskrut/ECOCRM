"use client";

import { PhoneCall } from "lucide-react";
import { ModuleSection, type ModuleSectionTab } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";
import { strings } from "@/locales";

const TABS: ModuleSectionTab[] = [
  { label: "Campaigns", href: "/outbound/campaigns" },
  { label: "Attempts", href: "/outbound/attempts" },
  { label: "Review", href: "/outbound/review" },
];

export default function OutboundLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleSection
      moduleId={ModuleIds.ManualCalling}
      title={strings.nav.aiCalls}
      icon={PhoneCall}
      tabs={TABS}
    >
      {children}
    </ModuleSection>
  );
}
