"use client";

import type { ModuleId } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";
import { ModuleGateSkeleton, ModuleUnavailable } from "@/components/ModuleUnavailable";

export function ModuleGate({
  moduleId,
  anyOf,
  children,
}: {
  /** Single required module (default). Ignored when `anyOf` is set. */
  moduleId?: ModuleId;
  /** Pass if any listed module is effective. */
  anyOf?: ModuleId[];
  children: React.ReactNode;
}) {
  const { status, effective, refreshModules } = useModules();
  const required = anyOf?.length ? anyOf : moduleId ? [moduleId] : [];
  const primaryId = required[0];

  if (status === "loading") {
    return <ModuleGateSkeleton />;
  }

  if (status === "error") {
    return (
      <ModuleUnavailable
        variant="api-error"
        moduleId={primaryId}
        onRetry={refreshModules}
      />
    );
  }

  if (required.length === 0 || !required.some((id) => effective(id))) {
    return <ModuleUnavailable variant="not-effective" moduleId={primaryId} />;
  }

  return <>{children}</>;
}
