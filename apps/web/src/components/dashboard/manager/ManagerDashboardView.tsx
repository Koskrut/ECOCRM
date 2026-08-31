"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CreateLeadModal } from "@/app/leads/CreateLeadModal";
import { LeadModal } from "@/app/leads/LeadModal";
import { ContactModal } from "@/app/contacts/ContactModal";
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
import { ManagerInboxPanel } from "./ManagerInboxPanel";
import { ManagerWorkQueueTeaser } from "./ManagerWorkQueueTeaser";
import { ManagerScorecard } from "./ManagerScorecard";
import { ManagerLeadPipeline } from "./ManagerLeadPipeline";
import { ManagerTasksPanel } from "./ManagerTasksPanel";

type Props = {
  userName: string | null;
  userRole: string | null;
};

const QUEUE_SIZE = 7;

function formatPeriodLabel(period: { from: string; to: string }): string {
  const from = DateTime.fromISO(period.from, { setZone: true }).setZone(CRM_TIME_ZONE).setLocale(CRM_LOCALE);
  const to = DateTime.fromISO(period.to, { setZone: true }).setZone(CRM_TIME_ZONE).setLocale(CRM_LOCALE);
  if (!from.isValid || !to.isValid) return "";
  return `${from.toLocaleString({ day: "numeric", month: "short" })} – ${to.toLocaleString({ day: "numeric", month: "short" })}`;
}

export function ManagerDashboardView({ userName, userRole }: Props) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [compare, setCompare] = useState(false);
  const activityDate = useMemo(() => todayYmdInKyiv(), []);

  const [inbox, setInbox] = useState<ManagerInboxResponse | null>(null);
  const [scorecard, setScorecard] = useState<ManagerScorecardResponse | null>(null);
  const [queue, setQueue] = useState<ContactWorkQueueItem[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlanPayload | null>(null);
  const [agenda, setAgenda] = useState<DailyAgendaPayload | null>(null);

  const [loading, setLoading] = useState(true);
  const [scorecardLoading, setScorecardLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [morningOpen, setMorningOpen] = useState(false);

  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [scorecardExpanded, setScorecardExpanded] = useState(false);
  const [receivables, setReceivables] = useState<DashboardReceivablesData | null>(null);
  const [receivablesLoading, setReceivablesLoading] = useState(false);

  const { pushToast } = useToast();
  const { effective: moduleEffective } = useModules();
  const financeEnabled = moduleEffective(ModuleIds.Finance);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inboxRes, dayPlanRes, agendaRes] = await Promise.all([
        dashboardApi.getManagerInbox({ period }),
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
  }, [period, activityDate]);

  const loadScorecard = useCallback(async () => {
    setScorecardLoading(true);
    try {
      setScorecard(await dashboardApi.getManagerScorecard({ period, compare }));
    } catch {
      setScorecard(null);
    } finally {
      setScorecardLoading(false);
    }
  }, [period, compare]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await contactsApi.getWorkQueue({ preset: "attention", pageSize: QUEUE_SIZE });
      setQueue(res.items);
    } catch {
      setQueue([]);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadScorecard();
  }, [loadScorecard]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const loadReceivables = useCallback(async () => {
    if (!financeEnabled) {
      setReceivables(null);
      return;
    }
    setReceivablesLoading(true);
    try {
      const res = await receivablesApi.workSummary();
      setReceivables({
        currency: res.data.currency,
        reconciliation: res.data.reconciliation,
      });
    } catch {
      setReceivables(null);
    } finally {
      setReceivablesLoading(false);
    }
  }, [financeEnabled]);

  useEffect(() => {
    void loadReceivables();
  }, [loadReceivables]);

  useEffect(() => {
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
        pushToast(
          e instanceof Error ? e.message : strings.tasks.errors.completeFailed,
          "error",
        );
      }
    },
    [loadCore, pushToast],
  );

  const currency = (scorecard?.currency === "EUR" ? "EUR" : "USD") as BaseCurrency;
  const periodLabel = scorecard ? formatPeriodLabel(scorecard.period) : "";

  const scorecardControls = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as "week" | "month")}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
      >
        <option value="week">{strings.tasks.period.thisWeek}</option>
        <option value="month">{strings.dashboard.leadership.periodMonth}</option>
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
    return <ErrorPanel message="Немає даних" onRetry={() => void loadCore()} />;
  }

  return (
    <div className="space-y-6">
      <ManagerDashboardHeader userName={userName} onNewLead={() => setCreateLeadOpen(true)} />

      <ManagerInboxPanel tiles={inbox.tiles} />

      {financeEnabled ? (
        <DashboardReceivablesPanel
          data={receivables}
          loading={receivablesLoading}
          currency={currency}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ManagerWorkQueueTeaser
            items={queue}
            loading={queueLoading}
            onOpenContact={setOpenContactId}
          />
        </div>
        <div className="space-y-4">
          <DayPlanWidget plan={dayPlan} loading={false} error={null} detailHref="/work/day-plan" />
          <DailyAgendaWidget
            agenda={agenda}
            loading={false}
            error={null}
            onCompose={() => setMorningOpen(true)}
          />
        </div>
      </div>

      {scorecardLoading && !scorecard ? (
        <ScorecardSkeleton />
      ) : scorecard ? (
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setScorecardExpanded((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div>
              <h2 className="text-base font-semibold text-zinc-900">
                {strings.dashboard.manager.scorecard.title}
              </h2>
              {periodLabel ? (
                <p className="mt-0.5 text-sm text-zinc-500">{periodLabel}</p>
              ) : null}
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600">
              {scorecardExpanded
                ? strings.dashboard.manager.scorecard.collapse
                : strings.dashboard.manager.scorecard.expand}
              {scorecardExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </button>
          {scorecardExpanded ? (
            <div
              className={`border-t border-zinc-100 px-4 pb-4 pt-2 ${
                scorecardLoading ? "opacity-60 transition-opacity" : "transition-opacity"
              }`}
            >
              <ManagerScorecard
                scorecard={scorecard}
                currency={currency}
                compareEnabled={compare}
                controls={scorecardControls}
                hideHeader
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <ManagerLeadPipeline
        pipelineCounts={inbox.pipelineCounts}
        hotLeads={inbox.hotLeads}
        onOpenLead={setOpenLeadId}
      />

      <ManagerTasksPanel tasks={inbox.tasks} onComplete={completeTask} />

      {morningOpen && agenda ? (
        <MorningPlanModal
          open={morningOpen}
          agenda={agenda}
          onClose={() => setMorningOpen(false)}
          onUpdated={(data) => {
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
    </div>
  );
}

function ScorecardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 animate-pulse rounded bg-zinc-100" />
      {Array.from({ length: 2 }).map((_, group) => (
        <div key={group} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
