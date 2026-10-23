"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiHttp } from "@/lib/api/client";
import { PageShell } from "@/components/PageShell";
import { ModuleSection } from "@/components/ModuleSection";
import { ModuleIds } from "@/lib/modules/module-ids";
import { strings } from "@/locales";

type MeResponse = { user?: { role?: string } };

export default function MarketingSettingsLayout({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const t = strings.marketing;

  useEffect(() => {
    apiHttp
      .get<MeResponse>("/auth/me")
      .then((res) => setRole(res.data?.user?.role ?? null))
      .catch(() => setRole(null))
      .finally(() => setLoading(false));
  }, []);

  const canAccess = useMemo(() => role === "ADMIN" || role === "LEAD", [role]);
  if (loading) {
    return (
      <PageShell>
        <div className="text-sm text-zinc-500">{t.loading}</div>
      </PageShell>
    );
  }
  if (!canAccess) {
    return (
      <PageShell>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h1 className="text-xl font-semibold">{t.accessDeniedTitle}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t.accessDeniedHint}</p>
        </div>
      </PageShell>
    );
  }
  return (
    <ModuleSection moduleId={ModuleIds.Marketing} title={t.settingsTitle} subtitle={t.settingsHint}>
      {children}
    </ModuleSection>
  );
}
