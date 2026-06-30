"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import {
  dashboardApi,
  type DashboardV2Response,
} from "@/lib/api/resources/dashboard";
import { DashboardAttentionPanel } from "@/components/dashboard/DashboardAttentionPanel";
import { DashboardExecutiveKpis } from "@/components/dashboard/DashboardExecutiveKpis";
import { DashboardManagersTable } from "@/components/dashboard/DashboardManagersTable";
import { DashboardMyWorkSection } from "@/components/dashboard/DashboardMyWorkSection";
import { DashboardQualityPanel } from "@/components/dashboard/DashboardQualityPanel";
import { DashboardSalesCharts } from "@/components/dashboard/DashboardSalesCharts";
import { DashboardTeamPulse } from "@/components/dashboard/DashboardTeamPulse";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import type { BaseCurrency } from "@/lib/base-currency";
import { todayYmdInKyiv } from "@/lib/crmDatetime";

type ManagerOption = { id: string; fullName: string };

export default function DashboardPage() {
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [activityDate, setActivityDate] = useState(() => todayYmdInKyiv());
  const [compare, setCompare] = useState(false);
  const [managerId, setManagerId] = useState("");
  const [data, setData] = useState<DashboardV2Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [morningOpen, setMorningOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void apiGet<{ user?: { role?: string } }>("/auth/me")
      .then((me) => setUserRole(me.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  useEffect(() => {
    if (userRole !== "ADMIN" && userRole !== "LEAD") return;
    void apiGet<{ items?: { id: string; fullName?: string | null }[] }>("/users", {
      role: "MANAGER",
      pageSize: 200,
    })
      .then((res) => {
        setManagers(
          (res.items ?? []).map((u) => ({
            id: u.id,
            fullName: u.fullName?.trim() || u.id,
          })),
        );
      })
      .catch(() => setManagers([]));
  }, [userRole]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.getV2({
        period,
        activityDate,
        compare,
        managerId: managerId || undefined,
      });
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, activityDate, compare, managerId, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (userRole === "MANAGER" && data?.myWork.agenda?.plan?.status !== "COMMITTED") {
      setMorningOpen(true);
    }
  }, [userRole, data?.myWork.agenda?.plan?.status]);

  const currency = (data?.currency === "EUR" ? "EUR" : "USD") as BaseCurrency;
  const showTeamDayPlan = (data?.teamPulse.rows.length ?? 0) > 1;
  const isLeadership = userRole === "ADMIN" || userRole === "LEAD";

  const handleAgendaUpdated = useCallback(
    (agenda: DashboardV2Response["myWork"]["agenda"]) => {
      setData((prev) =>
        prev ? { ...prev, myWork: { ...prev.myWork, agenda } } : prev,
      );
    },
    [],
  );

  const handleTaskCompleted = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const managerFilter = useMemo(() => {
    if (!isLeadership) return null;
    return (
      <select
        value={managerId}
        onChange={(e) => setManagerId(e.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
      >
        <option value="">Уся команда</option>
        {managers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.fullName}
          </option>
        ))}
      </select>
    );
  }, [isLeadership, managerId, managers]);

  if (loading && !data) {
    return <PageLoading />;
  }

  if (error && !data) {
    return <ErrorPanel message={error} onRetry={() => void load()} />;
  }

  if (!data) {
    return <ErrorPanel message="Немає даних" onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
          <LayoutDashboard className="h-7 w-7 text-zinc-600" />
          Dashboard
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "week" | "month")}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          >
            <option value="week">Тиждень</option>
            <option value="month">Місяць</option>
          </select>
          {managerFilter}
          <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Порівняти з попереднім
          </label>
        </div>
      </div>

      {userRole === "MANAGER" ? (
        <DashboardMyWorkSection
          myWork={data.myWork}
          userRole={userRole}
          morningOpen={morningOpen}
          onMorningOpenChange={setMorningOpen}
          onAgendaUpdated={handleAgendaUpdated}
          onTaskCompleted={handleTaskCompleted}
        />
      ) : null}

      <DashboardExecutiveKpis
        sales={data.sales}
        currency={currency}
        compareEnabled={compare}
        showAnalyticsLink={isLeadership}
      />

      <DashboardAttentionPanel
        attention={data.attention}
        currency={currency}
        showAnalyticsLink={isLeadership}
      />

      <DashboardTeamPulse
        date={activityDate}
        currency={data.teamPulse.currency}
        rows={data.teamPulse.rows}
        showTeamDayPlan={showTeamDayPlan}
        onDateChange={(d) => {
          setActivityDate(d);
        }}
      />

      {data.showTeamView && data.managers && data.managers.length > 0 ? (
        <DashboardManagersTable
          managers={data.managers}
          currency={currency}
          activityDate={data.activityDate}
        />
      ) : null}

      <DashboardQualityPanel quality={data.quality} />

      <DashboardSalesCharts charts={data.sales.charts} currency={currency} />

      {isLeadership ? (
        <DashboardMyWorkSection
          myWork={data.myWork}
          userRole={userRole}
          morningOpen={morningOpen}
          onMorningOpenChange={setMorningOpen}
          onAgendaUpdated={handleAgendaUpdated}
          onTaskCompleted={handleTaskCompleted}
        />
      ) : null}
    </div>
  );
}
