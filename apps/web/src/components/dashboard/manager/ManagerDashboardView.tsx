"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { CreateLeadModal } from "@/app/leads/CreateLeadModal";
import { LeadModal } from "@/app/leads/LeadModal";
import { ContactModal } from "@/app/contacts/ContactModal";
import { OrderModal } from "@/app/orders/OrderModal";
import { DayPlanWidget } from "@/components/day-plan/DayPlanWidget";
import { DailyAgendaWidget } from "@/components/daily-agenda/DailyAgendaWidget";
import { MorningPlanModal } from "@/components/daily-agenda/MorningPlanModal";
import { ErrorPanel, PageLoading, useToast } from "@/components/feedback";
import {
  dashboardApi,
  type ManagerInboxResponse,
  type ManagerScorecardResponse,
} from "@/lib/api/resources/dashboard";
import { contactsApi, type ContactWorkQueueItem } from "@/lib/api/resources/contacts";
import { dayPlanApi, type DayPlanPayload } from "@/lib/api/resources/day-plan";
import { dailyAgendaApi, type DailyAgendaPayload } from "@/lib/api/resources/daily-agenda";
import { apiHttp } from "@/lib/api/client";
import { tasksApi } from "@/lib/api/resources/tasks";
import {
  DashboardReceivablesPanel,
  type DashboardReceivablesData,
} from "@/components/dashboard/DashboardReceivablesPanel";
import { ModuleIds } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";
import { receivablesApi } from "@/lib/api/resources/receivables";
import type { BaseCurrency } from "@/lib/base-currency";
import { CRM_LOCALE, CRM_TIME_ZONE, todayYmdInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { ManagerDashboardHeader } from "./ManagerDashboardHeader";
import { ManagerDormantClientsPanel } from "./ManagerDormantClientsPanel";
import { ManagerInboxPanel } from "./ManagerInboxPanel";
import { ManagerWorkQueueTeaser } from "./ManagerWorkQueueTeaser";
import { ManagerScorecard } from "./ManagerScorecard";
import { ManagerLeadPipeline } from "./ManagerLeadPipeline";
import { ManagerTasksPanel } from "./ManagerTasksPanel";
import { ManagerMonthPulse } from "./ManagerMonthPulse";
import { ManagerGrowthLevers } from "./ManagerGrowthLevers";
import { ManagerPerformanceTrend } from "./ManagerPerformanceTrend";
import { ManagerPotentialPanel } from "./ManagerPotentialPanel";
import {
  ManagerReadyStockOrdersPanel,
  type ManagerReadyStockOrder,
} from "./ManagerReadyStockOrdersPanel";
import { ManagerSalesPulse, type ManagerDebtSummary } from "./ManagerSalesPulse";
import { PayrollCard } from "@/components/dashboard/PayrollCard";

type Props = {
  userName: string | null;
  userRole: string | null;
};

const QUEUE_SIZE = 7;
const DORMANT_LIST_SIZE = 10;
const READY_STOCK_LIST_SIZE = 10;
const READY_STOCK_FETCH_SIZE = 100;

function formatPeriodLabel(period: { from: string; to: string }): string {
  const from = DateTime.fromISO(period.from, { setZone: true })
    .setZone(CRM_TIME_ZONE)
    .setLocale(CRM_LOCALE);
  const to = DateTime.fromISO(period.to, { setZone: true })
    .setZone(CRM_TIME_ZONE)
    .setLocale(CRM_LOCALE);
  if (!from.isValid || !to.isValid) return "";
  return `${from.toLocaleString({ day: "numeric", month: "short" })} – ${to.toLocaleString({ day: "numeric", month: "short" })}`;
}

export function ManagerDashboardView({ userName, userRole }: Props) {
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [compare, setCompare] = useState(true);
  const activityDate = useMemo(() => todayYmdInKyiv(), []);

  const [inbox, setInbox] = useState<ManagerInboxResponse | null>(null);
  const [scorecard, setScorecard] = useState<ManagerScorecardResponse | null>(null);
  const [queue, setQueue] = useState<ContactWorkQueueItem[]>([]);
  const [dormantItems, setDormantItems] = useState<ContactWorkQueueItem[]>([]);
  const [dormantTotal, setDormantTotal] = useState(0);
  const [readyStockItems, setReadyStockItems] = useState<ManagerReadyStockOrder[]>([]);
  const [readyStockTotal, setReadyStockTotal] = useState(0);
  const [dayPlan, setDayPlan] = useState<DayPlanPayload | null>(null);
  const [agenda, setAgenda] = useState<DailyAgendaPayload | null>(null);

  const [loading, setLoading] = useState(true);
  const [scorecardLoading, setScorecardLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(true);
  const [dormantLoading, setDormantLoading] = useState(true);
  const [readyStockLoading, setReadyStockLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scorecardError, setScorecardError] = useState<string | null>(null);
  const [morningOpen, setMorningOpen] = useState(false);
  const morningDismissedRef = useRef(false);

  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [receivables, setReceivables] = useState<DashboardReceivablesData | null>(null);
  const [debtSummary, setDebtSummary] = useState<ManagerDebtSummary | null>(null);
  const [receivablesLoading, setReceivablesLoading] = useState(false);

  const { pushToast } = useToast();
  const { effective: moduleEffective } = useModules();
  const financeEnabled = moduleEffective(ModuleIds.Finance);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inboxRes, dayPlanRes, agendaRes] = await Promise.all([
        dashboardApi.getManagerInbox(),
        dayPlanApi.get({ date: activityDate }).catch(() => null),
        dailyAgendaApi.get({ date: activityDate }).catch(() => null),
      ]);
      setInbox(inboxRes);
      setDayPlan(dayPlanRes);
      setAgenda(agendaRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activityDate]);

  const loadScorecard = useCallback(async () => {
    setScorecardLoading(true);
    setScorecardError(null);
    try {
      setScorecard(await dashboardApi.getManagerScorecard({ period, compare }));
    } catch (e) {
      setScorecard(null);
      setScorecardError(e instanceof Error ? e.message : String(e));
    } finally {
      setScorecardLoading(false);
    }
  }, [period, compare]);

  const loadQueue = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setQueueLoading(true);
    try {
      const res = await contactsApi.getWorkQueue({
        preset: "attention",
        horizon: "today",
        pageSize: QUEUE_SIZE,
      });
      setQueue(res.items);
    } catch {
      if (mode === "initial") setQueue([]);
    } finally {
      if (mode === "initial") setQueueLoading(false);
    }
  }, []);

  const loadDormant = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setDormantLoading(true);
    try {
      const res = await contactsApi.getWorkQueue({
        reasons: ["DORMANT"],
        sortBy: "daysSinceLastOrder",
        pageSize: DORMANT_LIST_SIZE,
      });
      setDormantItems(res.items);
      setDormantTotal(res.total);
    } catch {
      if (mode === "initial") {
        setDormantItems([]);
        setDormantTotal(0);
      }
    } finally {
      if (mode === "initial") setDormantLoading(false);
    }
  }, []);

  const loadReadyStock = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setReadyStockLoading(true);
    try {
      const res = await apiHttp.get<{ items?: ManagerReadyStockOrder[] }>("/orders", {
        params: {
          orderStage: "AWAITING_STOCK",
          page: 1,
          pageSize: READY_STOCK_FETCH_SIZE,
          withCompanyClient: true,
          sortBy: "createdAt",
          sortDir: "desc",
        },
      });
      const ready = (res.data?.items ?? []).filter((o) => o.stockReadiness === "FULL");
      setReadyStockTotal(ready.length);
      setReadyStockItems(ready.slice(0, READY_STOCK_LIST_SIZE));
    } catch {
      if (mode === "initial") {
        setReadyStockItems([]);
        setReadyStockTotal(0);
      }
    } finally {
      if (mode === "initial") setReadyStockLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadScorecard();
  }, [loadScorecard]);

  useEffect(() => {
    void loadQueue("initial");
  }, [loadQueue]);

  useEffect(() => {
    void loadDormant("initial");
  }, [loadDormant]);

  useEffect(() => {
    void loadReadyStock("initial");
  }, [loadReadyStock]);

  useEffect(() => {
    const onFocus = () => {
      void loadQueue("refresh");
      void loadDormant("refresh");
      void loadReadyStock("refresh");
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadQueue, loadDormant, loadReadyStock]);

  const loadReceivables = useCallback(async () => {
    if (!financeEnabled) {
      setReceivables(null);
      setDebtSummary(null);
      return;
    }
    setReceivablesLoading(true);
    try {
      const res = await receivablesApi.workSummary();
      setReceivables({
        currency: res.data.currency,
        reconciliation: res.data.reconciliation,
      });
      setDebtSummary({
        debtTotal: res.data.kpi.debtTotal,
        overdueDebt: res.data.kpi.overdueDebt,
        clientsWithDebtCount: res.data.kpi.clientsWithDebtCount,
      });
    } catch {
      setReceivables(null);
      setDebtSummary(null);
    } finally {
      setReceivablesLoading(false);
    }
  }, [financeEnabled]);

  useEffect(() => {
    void loadReceivables();
  }, [loadReceivables]);

  useEffect(() => {
    if (morningDismissedRef.current) return;
    if (agenda && agenda.plan?.status !== "COMMITTED") {
      setMorningOpen(true);
    }
  }, [agenda]);

  const completeTask = useCallback(
    async (id: string) => {
      try {
        await tasksApi.complete(id);
        pushToast(strings.dashboard.manager.tasks.completedToast, "success");
        void loadCore();
      } catch (e) {
        pushToast(e instanceof Error ? e.message : strings.tasks.errors.completeFailed, "error");
      }
    },
    [loadCore, pushToast],
  );

  const currency = (scorecard?.currency === "EUR" ? "EUR" : "USD") as BaseCurrency;
  const periodLabel = scorecard ? formatPeriodLabel(scorecard.period) : "";
  const compareLabel =
    compare && scorecard?.comparePeriod ? formatPeriodLabel(scorecard.comparePeriod) : "";

  const hasMonthPulse = Boolean(scorecard?.monthPulse);
  const hasGrowthLevers = Array.isArray(scorecard?.growthLevers);
  const hasTrend = Boolean(scorecard?.trend);
  const hasPotential = Boolean(scorecard?.potential);

  const scorecardControls = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as "week" | "month")}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        aria-label={strings.dashboard.manager.scorecard.activityPeriodLabel}
      >
        <option value="week">{strings.dashboard.manager.scorecard.rollingWeek}</option>
        <option value="month">{strings.dashboard.manager.scorecard.rollingMonth}</option>
      </select>
      <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={compare}
          onChange={(e) => setCompare(e.target.checked)}
          className="rounded border-zinc-300"
        />
        {strings.dashboard.manager.scorecard.compareToggle}
      </label>
    </div>
  );

  if (loading && !inbox) {
    return <PageLoading />;
  }

  if (error && !inbox) {
    return <ErrorPanel message={error} onRetry={() => void loadCore()} />;
  }

  if (!inbox) {
    return (
      <ErrorPanel message={strings.dashboard.manager.noData} onRetry={() => void loadCore()} />
    );
  }

  const activityPeriodLabel = [
    periodLabel
      ? `${strings.dashboard.manager.scorecard.activityDetailTitle}: ${periodLabel}`
      : strings.dashboard.manager.scorecard.activityDetailTitle,
    compareLabel ? `${strings.dashboard.manager.scorecard.compareLabel}: ${compareLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <ManagerDashboardHeader userName={userName} onNewLead={() => setCreateLeadOpen(true)} />

      <PayrollCard />

      {scorecardLoading && !scorecard ? (
        <div className="h-28 animate-pulse rounded-xl bg-zinc-100" />
      ) : scorecard && hasMonthPulse ? (
        <div className={scorecardLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <ManagerSalesPulse
            scorecard={scorecard}
            currency={currency}
            financeEnabled={financeEnabled}
            debt={debtSummary}
            debtLoading={receivablesLoading}
          />
        </div>
      ) : null}

      <ManagerDormantClientsPanel
        items={dormantItems}
        total={dormantTotal}
        loading={dormantLoading}
        onOpenContact={setOpenContactId}
      />

      <ManagerReadyStockOrdersPanel
        items={readyStockItems}
        total={readyStockTotal}
        loading={readyStockLoading}
        currency={currency}
        onOpenOrder={setOpenOrderId}
      />

      {scorecardLoading && !scorecard ? (
        <PulseSkeleton />
      ) : scorecard ? (
        <div className={scorecardLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="space-y-6">
            {hasMonthPulse ? (
              <ManagerMonthPulse pulse={scorecard.monthPulse} currency={currency} />
            ) : null}
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
              <ManagerScorecard
                scorecard={scorecard}
                currency={currency}
                compareEnabled={compare}
                periodLabel={activityPeriodLabel}
                controls={scorecardControls}
                compact={hasMonthPulse}
              />
            </section>
            {hasMonthPulse && hasGrowthLevers && hasPotential ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <ManagerGrowthLevers
                  levers={scorecard.growthLevers}
                  currency={currency}
                  financeEnabled={financeEnabled}
                />
                <ManagerPotentialPanel
                  potential={scorecard.potential}
                  currency={currency}
                  financeEnabled={financeEnabled}
                />
              </div>
            ) : null}
            {hasMonthPulse && hasTrend ? (
              <ManagerPerformanceTrend trend={scorecard.trend} currency={currency} />
            ) : null}
          </div>
        </div>
      ) : scorecardError ? (
        <ErrorPanel message={scorecardError} onRetry={() => void loadScorecard()} />
      ) : null}

      <ManagerInboxPanel tiles={inbox.tiles} financeEnabled={financeEnabled} />

      <ManagerWorkQueueTeaser
        items={queue}
        loading={queueLoading}
        onOpenContact={setOpenContactId}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ManagerTasksPanel tasks={inbox.tasks} onComplete={completeTask} />
        <ManagerLeadPipeline
          pipelineCounts={inbox.pipelineCounts}
          hotLeads={inbox.hotLeads}
          onOpenLead={setOpenLeadId}
        />
      </div>

      <section>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DailyAgendaWidget
              agenda={agenda}
              loading={false}
              error={null}
              onCompose={() => setMorningOpen(true)}
            />
          </div>
          <DayPlanWidget plan={dayPlan} loading={false} error={null} detailHref="/work/day-plan" />
        </div>
      </section>

      {financeEnabled ? (
        <DashboardReceivablesPanel
          data={receivables}
          loading={receivablesLoading}
          currency={currency}
        />
      ) : null}

      {morningOpen && agenda ? (
        <MorningPlanModal
          open={morningOpen}
          agenda={agenda}
          onClose={() => {
            morningDismissedRef.current = true;
            setMorningOpen(false);
          }}
          onUpdated={(data) => {
            morningDismissedRef.current = true;
            setAgenda(data);
            setMorningOpen(false);
          }}
        />
      ) : null}

      {createLeadOpen ? (
        <CreateLeadModal
          onClose={() => setCreateLeadOpen(false)}
          onCreated={() => {
            setCreateLeadOpen(false);
            void loadCore();
          }}
        />
      ) : null}

      {openContactId ? (
        <ContactModal
          apiBaseUrl="/api"
          contactId={openContactId}
          userRole={userRole}
          onClose={() => setOpenContactId(null)}
          onUpdate={() => {
            void loadQueue();
            void loadDormant();
            void loadCore();
          }}
        />
      ) : null}

      {openLeadId ? (
        <LeadModal
          apiBaseUrl="/api"
          leadId={openLeadId}
          userRole={userRole}
          onClose={() => setOpenLeadId(null)}
          onUpdated={() => void loadCore()}
        />
      ) : null}

      {openOrderId ? (
        <OrderModal
          apiBaseUrl="/api"
          orderId={openOrderId}
          userRole={userRole}
          onClose={() => setOpenOrderId(null)}
          onSaved={() => {
            void loadReadyStock("refresh");
            void loadScorecard();
            void loadCore();
          }}
          onOpenOrder={(id) => setOpenOrderId(id)}
        />
      ) : null}
    </div>
  );
}

function PulseSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-40 animate-pulse rounded-xl bg-zinc-100" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-xl bg-zinc-100" />
        <div className="h-56 animate-pulse rounded-xl bg-zinc-100" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-zinc-100" />
    </div>
  );
}
