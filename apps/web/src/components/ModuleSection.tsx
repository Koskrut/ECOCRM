"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ModuleId } from "@/lib/modules/module-ids";
import { ModuleGate } from "@/components/ModuleGate";
import { PageShell, type PageShellTab } from "@/components/PageShell";

export type ModuleSectionTab = PageShellTab;

type ModuleSectionProps = {
  /** Module id used for licensing/enabled gating. */
  moduleId: ModuleId;
  /** Optional page header rendered inside a max-width container. */
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Optional tabs row rendered under the title. */
  tabs?: ModuleSectionTab[];
  /** Wrap children in a centered max-width container. Defaults to true when title or tabs are provided, false otherwise. */
  container?: boolean;
  /** Inline content rendered to the right of the title (e.g. action buttons). */
  actions?: ReactNode;
  children: ReactNode;
};

export function ModuleSection({
  moduleId,
  title,
  subtitle,
  icon,
  tabs,
  container,
  actions,
  children,
}: ModuleSectionProps) {
  return (
    <ModuleGate moduleId={moduleId}>
      <PageShell
        title={title}
        subtitle={subtitle}
        icon={icon}
        tabs={tabs}
        container={container}
        actions={actions}
      >
        {children}
      </PageShell>
    </ModuleGate>
  );
}
