"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import { EriGauge, RiskBandBadge } from "@/components/risk/RiskBandBadge";
import { riskApi, type RiskHub } from "@/lib/api/resources/risk";
import { strings } from "@/locales";
import { apiGet } from "@/lib/api/client";

export default function RiskHubPage() {
  const t = strings.risk;
  const [hub, setHub] = useState<RiskHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [canRecompute, setCanRecompute] = useState(false);
  const [activeDomain, setActiveDomain] = useState<string>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await apiGet<{ user?: { id?: string; role?: string } }>("/auth/me").catch(() => ({
        user: undefined,
      }));
      const data = await riskApi.getHub();
      setHub(data);

      if (me.user?.id) {
        const effective = await apiGet<{ permissions?: string[] }>(
          `/rbac/users/${me.user.id}/effective`,
        ).catch(() => ({ permissions: [] }));
        const permissions = effective.permissions ?? [];
        setCanManage(
          permissions.includes("risk.credit.manage") || permissions.includes("risk.manage"),
        );
        setCanRecompute(permissions.includes("risk.manage"));
      } else {
        setCanManage(false);
        setCanRecompute(false);
      }
    } catch {
      setHub(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleDomains = useMemo(
    () =>
      (hub?.domainHeatmap ?? []).filter(
        (d) => d.avgScore > 0 || d.criticalCount > 0 || d.highCount > 0,
      ),
    [hub?.domainHeatmap],
  );

  const domains =
    activeDomain === "ALL"
      ? visibleDomains
      : visibleDomains.filter((d) => d.domain === activeDomain);

  const trendMax = Math.max(...(hub?.eri.trend7d ?? [0]), 1);

  return (
    <PageShell title={t.pageTitle} subtitle={t.pageSubtitle} icon={ShieldAlert} helpRouteKey="risk">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveDomain("ALL")}
              className={`rounded-lg px-3 py-1.5 text-sm ${activeDomain === "ALL" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}
            >
              {t.tabAll}
            </button>
            {visibleDomains.map((d) => (
              <button
                key={d.domain}
                type="button"
                onClick={() => setActiveDomain(d.domain)}
                className={`rounded-lg px-3 py-1.5 text-sm ${activeDomain === d.domain ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}
              >
                {d.labelUk}
              </button>
            ))}
          </div>
          {canRecompute ? (
            <button
              type="button"
              onClick={() => void riskApi.recompute().then(() => load())}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <RefreshCw className="h-4 w-4" />
              {t.recompute}
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">{strings.common.loading}</p>
        ) : !hub ? (
          <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-medium text-zinc-500">{t.eriTitle}</h2>
                <EriGauge score={hub.eri.score} band={hub.eri.band} />
                {hub.eri.computedAt ? (
                  <p className="mt-3 text-center text-xs text-zinc-400">
                    {t.updatedAt}: {new Date(hub.eri.computedAt).toLocaleString()}
                  </p>
                ) : null}
                {hub.eri.trend7d.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-zinc-500">{t.trend7d}</p>
                    <div className="flex h-16 items-end gap-1">
                      {hub.eri.trend7d.map((value, index) => (
                        <div
                          key={`eri-trend-${index}`}
                          className="flex-1 rounded-sm bg-zinc-200"
                          style={{ height: `${Math.max(8, (value / trendMax) * 100)}%` }}
                          title={String(value)}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
                      <span>{hub.eri.trend7d[0]}</span>
                      <span>{hub.eri.trend7d[hub.eri.trend7d.length - 1]}</span>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="md:col-span-2 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-medium text-zinc-500">{t.domainHeatmap}</h2>
                {domains.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t.emptyDescription}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {domains.map((d) => (
                      <div key={d.domain} className="rounded-lg border border-zinc-100 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-zinc-800">{d.labelUk}</span>
                          <RiskBandBadge band={d.band} />
                        </div>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{d.avgScore}</p>
                        <p className="text-xs text-zinc-500">
                          {t.bandCritical} {d.criticalCount} · {t.bandHigh} {d.highCount}
                        </p>
                        {d.deepLink ? (
                          <Link href={d.deepLink} className="mt-2 inline-block text-xs text-blue-600 hover:underline">
                            {t.openQueue}
                          </Link>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(hub.pendingApprovals.length > 0 || hub.criticalSubjects.length > 0) && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-sm font-medium text-zinc-500">{t.approvalQueue}</h2>
                  {hub.pendingApprovals.length === 0 ? (
                    <p className="text-sm text-zinc-500">{t.noApprovals}</p>
                  ) : (
                    <ul className="space-y-3">
                      {hub.pendingApprovals.map((a) => (
                        <li key={a.id} className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-sm">
                          <div className="font-medium">{a.gatePoint}</div>
                          <div className="text-zinc-600">{a.domain}</div>
                          {canManage ? (
                            <button
                              type="button"
                              className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                              onClick={() => void riskApi.approveDecision(a.id).then(() => load())}
                            >
                              {t.approve}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-sm font-medium text-zinc-500">{t.criticalSubjects}</h2>
                  <ul className="max-h-80 space-y-2 overflow-y-auto">
                    {hub.criticalSubjects.map((s) => (
                      <li
                        key={`${s.domain}-${s.subjectType}-${s.subjectId}`}
                        className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm"
                      >
                        <span>
                          {s.domain} · {s.subjectType}:{s.subjectLabel ?? s.subjectId.slice(0, 8)}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{s.score}</span>
                          <RiskBandBadge band={s.band} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-medium text-zinc-500">{t.quickLinks}</h2>
              <div className="flex flex-wrap gap-3">
                {hub.deepLinks.map((l) => (
                  <Link key={l.href} href={l.href} className="text-sm text-blue-600 hover:underline">
                    {l.labelUk}
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
