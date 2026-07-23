"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { riskApi, type RiskHub } from "@/lib/api/resources/risk";
import { ModuleIds } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";
import { EriGauge } from "@/components/risk/RiskBandBadge";
import { strings } from "@/locales";

export function DashboardRiskPanel() {
  const { effective: moduleEffective } = useModules();
  const enabled = moduleEffective(ModuleIds.RiskManagement);
  const t = strings.risk;
  const [hub, setHub] = useState<RiskHub | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void riskApi.getHub().then(setHub).catch(() => setHub(null));
  }, [enabled]);

  if (!enabled) return null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <ShieldAlert className="h-4 w-4 text-orange-600" />
          {t.dashboardTitle}
        </h2>
        <Link href="/risk" className="text-xs font-medium text-blue-600 hover:underline">
          {t.openTower}
        </Link>
      </div>
      {hub ? (
        <div className="flex items-center gap-6">
          <EriGauge score={hub.eri.score} band={hub.eri.band} />
          <div className="text-sm text-zinc-600">
            <p>
              {t.criticalCount}:{" "}
              <span className="font-semibold text-zinc-900">
                {hub.domainHeatmap.reduce((s, d) => s + d.criticalCount, 0)}
              </span>
            </p>
            <p>
              {t.approvalPending}: <span className="font-semibold text-zinc-900">{hub.pendingApprovals.length}</span>
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      )}
    </section>
  );
}
