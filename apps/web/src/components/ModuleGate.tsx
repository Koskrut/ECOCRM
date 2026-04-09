"use client";

import type { ModuleId } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";

export function ModuleGate({
  moduleId,
  children,
}: {
  moduleId: ModuleId;
  children: React.ReactNode;
}) {
  const { status, effective } = useModules();

  // Phase 1: fail-open on loading/error to preserve current behavior.
  if (status !== "ready") return <>{children}</>;

  if (!effective(moduleId)) {
    return <div className="p-6 text-sm text-zinc-600">Not found</div>;
  }

  return <>{children}</>;
}
