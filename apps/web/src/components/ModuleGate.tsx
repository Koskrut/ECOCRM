"use client";

import type { ModuleId } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";
import { ModuleGateSkeleton, ModuleUnavailable } from "@/components/ModuleUnavailable";

export function ModuleGate({
  moduleId,
  children,
}: {
  moduleId: ModuleId;
  children: React.ReactNode;
}) {
  const { status, effective, refreshModules } = useModules();

  if (status === "loading") {
    return <ModuleGateSkeleton />;
  }

  if (status === "error") {
    return <ModuleUnavailable variant="api-error" moduleId={moduleId} onRetry={refreshModules} />;
  }

  if (!effective(moduleId)) {
    return <ModuleUnavailable variant="not-effective" moduleId={moduleId} />;
  }

  return <>{children}</>;
}
