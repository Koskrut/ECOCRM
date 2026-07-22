"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import {
  dashboardApi,
  type DashboardV2Response,
} from "@/lib/api/resources/dashboard";
import { DashboardAttentionPanel } from "@/components/dashboard/DashboardAttentionPanel";
import { DashboardExecutiveKpis } from "@/components/dashboard/DashboardExecutiveKpis";
import { DashboardHeroKpis } from "@/components/dashboard/DashboardHeroKpis";
import { DashboardManagersTable } from "@/components/dashboard/DashboardManagersTable";
import { DashboardMyWorkSection } from "@/components/dashboard/DashboardMyWorkSection";
import { DashboardQualityFlags } from "@/components/dashboard/DashboardQualityFlags";
import {
  DashboardReceivablesPanel,
  type DashboardReceivablesData,
} from "@/components/dashboard/DashboardReceivablesPanel";
import { DashboardSalesCharts } from "@/components/dashboard/DashboardSalesCharts";
import {
  DashboardTabBar,
  type DashboardLeadershipTab,
} from "@/components/dashboard/DashboardTabBar";
import { DashboardTeamPulse } from "@/components/dashboard/DashboardTeamPulse";
import { ManagerDashboardView } from "@/components/dashboard/manager/ManagerDashboardView";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import type { BaseCurrency } from "@/lib/base-currency";
import { todayYmdInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { ModuleIds } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";
import { receivablesApi } from "@/lib/api/resources/receivables";

type ManagerOption = { id: string; fullName: string };

function parseLeadershipTab(raw: string | null): DashboardLeadershipTab {
  if (raw === "team" || raw === "sales") return raw;
  return "today";
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [period, setPeriod] = useState<"week" | "month">("month");
  const [activityDate, setActivityDate] = useState(() => todayYmdInKyiv());
  const [compare, setCompare] = useState(false);
  const [managerId, setManagerId] = useState("");
  const [data, setData] = useState<DashboardV2Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [morningOpen, setMorningOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [receivables, setReceivables] = useState<DashboardReceivablesData | null>(null);
  const [receivablesLoading, setReceivablesLoading] = useState(false);

  const { effective: moduleEffective } = useModules();
  const financeEnabled = moduleEffective(ModuleIds.Finance);

  const tab = parseLeadershipTab(searchParams.get("tab"));
  const lt = strings.dashboard.leadership;

  const setTab = useCallback(
    (next: DashboardLeadershipTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "today") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    void apiGet<{ user?: { role?: string; name?: string } }>("/auth/me")
      .then((me) => {
        setUserRole(me.user?.role ?? null);
        setUserName(me.user?.name ?? null);
      })
      .catch(() => {
        setUserRole(null);
        setUserName(null);
      })
      .finally(() => setRoleLoaded(true));
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
    if (userRole === "MANAGER") {
      setLoading(false);
      return;
    }
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
  }, [period, activityDate, compare, managerId, refreshKey, userRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadReceivables = useCallback(async () => {
    if (!financeEnabled || userRole === "MANAGER") {
      setReceivables(null);
      return;
    }
    setReceivablesLoading(true);
    try {
      const res = await receivablesApi.workSummary(managerId || undefined);
      setReceivables({
        currency: res.data.currency,
        reconciliation: res.data.reconciliation,
      });
    } catch {
      setReceivables(null);
    } finally {
      setReceivablesLoading(false);
    }
  }, [financeEnabled, managerId, userRole]);

  useEffect(() => {
    void loadReceivables();
  }, [loadReceivables, refreshKey]);

  useEffect(() => {
    if (userRole === "LEAD" && data?.myWork.agenda?.plan?.status !== "COMMITTED") {
      setMorningOpen(true);
    }
  }, [userRole, data?.myWork.agenda?.plan?.status]);

  const currency = (data?.currency === "EUR" ? "EUR" : "USD") as BaseCurrency;
  const showTeamDayPlan = (data?.teamPulse.rows.length ?? 0) > 1;
  const isLeadership = userRole === "ADMIN" || userRole === "LEAD";

  const filteredManagers = useMemo(() => {
    if (!data?.managers) return [];
    if (!managerId) return data.managers;
    return data.managers.filter((m) => m.id === managerId);
  }, [data?.managers, managerId]);

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
        <option value="">{lt.allTeam}</option>
        {managers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.fullName}
          </option>
        ))}
      </select>
    );
  }, [isLeadership, managerId, managers, lt.allTeam]);

  if (!roleLoaded) {
    return <PageLoading />;
  }

  if (userRole === "MANAGER") {
    return <ManagerDashboardView userName={userName} userRole={userRole} />;
  }

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
          <LayoutDashboard className="h-7 w-7 text-zinc-600" />
          {lt.pageTitle}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "week" | "month")}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          >
            <option value="week">{lt.periodWeek}</option>
            <option value="month">{lt.periodMonth}</option>
          </select>
          {managerFilter}
          <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="rounded border-zinc-300"
            />
            {lt.compareToggle}
          </label>
        </div>
      </div>

      <DashboardTabBar tab={tab} onTabChange={setTab} />

      <p className="text-sm text-zinc-500">{lt.tabHints[tab]}</p>

      {managerId && tab === "team" ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-sky-900">
          {lt.teamFilteredHint}
        </p>
      ) : null}

      {tab === "today" ? (
        <div className="space-y-8">
          <DashboardHeroKpis sales={data.sales} currency={currency} compareEnabled={compare} />
          <DashboardAttentionPanel
            attention={data.attention}
            currency={currency}
            showAnalyticsLink={isLeadership}
          />
          {financeEnabled ? (
            <DashboardReceivablesPanel
              data={receivables}
              loading={receivablesLoading}
              currency={currency}
            />
          ) : null}
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
          <DashboardQualityFlags quality={data.quality} />
        </div>
      ) : null}

      {tab === "team" ? (
        <div className="space-y-8">
          <DashboardTeamPulse
            date={activityDate}
            currency={data.teamPulse.currency}
            rows={data.teamPulse.rows}
            showTeamDayPlan={showTeamDayPlan}
            onDateChange={(d) => {
              setActivityDate(d);
            }}
          />
          {data.showTeamView && filteredManagers.length > 0 ? (
            <DashboardManagersTable
              managers={filteredManagers}
              currency={currency}
              activityDate={data.activityDate}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "sales" ? (
        <div className="space-y-8">
          <DashboardExecutiveKpis
            sales={data.sales}
            currency={currency}
            compareEnabled={compare}
            showAnalyticsLink={isLeadership}
          />
          <DashboardSalesCharts charts={data.sales.charts} currency={currency} />
        </div>
      ) : null}
    </div>
  );
}
