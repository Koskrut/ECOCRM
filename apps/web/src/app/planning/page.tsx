"use client";

import { useEffect, useState } from "react";
import { planningApi } from "@/lib/api/resources/planning";

type DashboardData = {
  rules: { hardStages: string[]; softStages: string[] };
  snapshotsCount: number;
  latestSnapshotDate: string | null;
  qcCount: number;
  packingCount: number;
  launchCount: number;
};

export default function PlanningPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [rules, snapshots, latest, qc, packing, launch] = await Promise.all([
          planningApi.getDemandRules(),
          planningApi.listSnapshots(50),
          planningApi.getLatestPostedSnapshot(),
          planningApi.getQcQueue(),
          planningApi.getPackingQueue(),
          planningApi.getLaunchRecommendations(1),
        ]);
        if (!active) return;
        setData({
          rules,
          snapshotsCount: Array.isArray(snapshots) ? snapshots.length : 0,
          latestSnapshotDate: latest?.postedAt ?? null,
          qcCount: Array.isArray(qc) ? qc.length : 0,
          packingCount: Array.isArray(packing) ? packing.length : 0,
          launchCount: Array.isArray(launch?.recommendations) ? launch.recommendations.length : 0,
        });
      } catch (e: unknown) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load planning dashboard");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Production Planning</h1>
      {loading && <div className="rounded border border-zinc-200 bg-white p-4">Loading...</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {!loading && !error && data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card title="Demand rules">
            <p>Hard: {data.rules.hardStages.join(", ") || "—"}</p>
            <p>Soft: {data.rules.softStages.join(", ") || "—"}</p>
          </Card>
          <Card title="Inventory snapshots">
            <p>Total snapshots: {data.snapshotsCount}</p>
            <p>
              Latest POSTED:{" "}
              {data.latestSnapshotDate ? new Date(data.latestSnapshotDate).toLocaleString() : "none"}
            </p>
          </Card>
          <Card title="Weekly queues">
            <p>QC queue: {data.qcCount}</p>
            <p>Packing queue: {data.packingCount}</p>
            <p>Launch recommendations: {data.launchCount}</p>
          </Card>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-medium text-zinc-600">{title}</h2>
      <div className="space-y-1 text-sm text-zinc-900">{children}</div>
    </div>
  );
}

